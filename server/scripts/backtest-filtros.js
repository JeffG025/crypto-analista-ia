// Backtest con filtro de tendencia: ¿mejora la señal si solo operamos en régimen alcista?
// Clave metodológica: cada filtro se compara contra "comprar siempre EN LOS MISMOS DÍAS
// que el filtro permite". Así se separa lo que aporta la señal de lo que aporta el filtro.
// Uso: node scripts/backtest-filtros.js
require('dotenv').config();

const { SMA } = require('technicalindicators');
const cryptoService = require('../src/services/cryptoService');
const { scoreFromPrices, DAYS_FOR_ANALYSIS } = require('../src/services/technicalService');

const COINS = [
    'bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple',
    'cardano', 'avalanche-2', 'chainlink', 'polkadot', 'dogecoin'
];

const HORIZONS = [7, 30];
const ROUND_TRIP_FEE = 0.2;
const START_INDEX = 100;              // necesitamos 100 precios para la SMA100
const DELAY_MS = 2500;
const DAYS = Number(process.env.BACKTEST_DAYS) || DAYS_FOR_ANALYSIS;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const isBullish = (b) => b === 'ALCISTA' || b === 'ALCISTA FUERTE';

const lastSMA = (values, period) => {
    if (values.length < period) return null;
    const out = SMA.calculate({ period, values });
    return out[out.length - 1];
};

// Cada filtro decide si el día es "operable". ctx trae el contexto de tendencia ya calculado.
const FILTERS = [
    { key: 'ninguno', label: 'Sin filtro (actual)', test: () => true },
    { key: 'p>sma100', label: 'Precio > SMA100', test: (c) => c.price > c.sma100 },
    { key: 'sma50>sma100', label: 'SMA50 > SMA100', test: (c) => c.sma50 > c.sma100 },
    { key: 'sma50-sube', label: 'SMA50 subiendo (10d)', test: (c) => c.sma50 > c.sma50Prev10 },
    { key: 'btc-alcista', label: 'BTC > su SMA100', test: (c) => c.btcPrice > c.btcSma100 },
    { key: 'doble', label: 'Precio>SMA100 Y BTC alcista', test: (c) => c.price > c.sma100 && c.btcPrice > c.btcSma100 },
];

// Contexto de tendencia de BTC por índice, para usarlo como filtro de régimen del mercado
const buildBtcRegime = (btcPrices) => {
    const regime = [];
    for (let i = 0; i < btcPrices.length; i++) {
        const window = btcPrices.slice(0, i + 1);
        regime[i] = { price: btcPrices[i], sma100: lastSMA(window, 100) };
    }
    return regime;
};

const collectObservations = async (coinId, btcRegime) => {
    const history = await cryptoService.getChartHistory(coinId, DAYS);
    const prices = history.data;
    if (!prices || prices.length < START_INDEX + Math.max(...HORIZONS)) return [];

    const observations = [];

    for (let i = START_INDEX; i < prices.length - 1; i++) {
        const window = prices.slice(0, i + 1);
        const result = scoreFromPrices(window);

        const sma100 = lastSMA(window, 100);
        const sma50 = lastSMA(window, 50);
        const sma50Prev10 = lastSMA(prices.slice(0, i - 9), 50);
        const btc = btcRegime[i];
        if (!sma100 || !sma50 || !sma50Prev10 || !btc?.sma100) continue;

        const entryPrice = prices[i];
        const forward = {};
        for (const h of HORIZONS) {
            if (i + h < prices.length) forward[h] = ((prices[i + h] - entryPrice) / entryPrice) * 100;
        }

        observations.push({
            coinId,
            bucket: result.signal,
            ctx: { price: entryPrice, sma100, sma50, sma50Prev10, btcPrice: btc.price, btcSma100: btc.sma100 },
            forward
        });
    }

    return observations;
};

const stats = (obs, horizon) => {
    const withData = obs.filter(o => o.forward[horizon] !== undefined);
    if (withData.length === 0) return null;
    const returns = withData.map(o => o.forward[horizon]);
    const up = returns.filter(r => r > 0).length;
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    return {
        n: withData.length,
        upRate: (up / withData.length) * 100,
        netReturn: avg - ROUND_TRIP_FEE
    };
};

const run = async () => {
    console.log('\n════════════════════════════════════════════════════════════════════');
    console.log('  BACKTEST CON FILTRO DE TENDENCIA');
    console.log(`  ${COINS.length} monedas · ${DAYS} días · ${FILTERS.length} filtros`);
    console.log('════════════════════════════════════════════════════════════════════\n');

    process.stdout.write('📊 Cargando régimen de BTC... ');
    const btcHistory = await cryptoService.getChartHistory('bitcoin', DAYS);
    const btcRegime = buildBtcRegime(btcHistory.data);
    console.log(`${btcHistory.data.length} puntos`);
    await sleep(DELAY_MS);

    let all = [];
    for (const coin of COINS) {
        process.stdout.write(`📊 ${coin}... `);
        const obs = await collectObservations(coin, btcRegime);
        console.log(`${obs.length} días evaluables`);
        all = all.concat(obs);
        await sleep(DELAY_MS);
    }

    console.log(`\n✅ Total: ${all.length} observaciones\n`);

    for (const h of HORIZONS) {
        console.log('════════════════════════════════════════════════════════════════════');
        console.log(`  HORIZONTE: ${h} días`);
        console.log('════════════════════════════════════════════════════════════════════\n');
        console.log(`  ${'Filtro'.padEnd(28)} ${'Ops'.padStart(5)} ${'Señal'.padStart(8)} ${'Base*'.padStart(8)} ${'Ventaja'.padStart(9)} ${'Ret.neto'.padStart(10)}`);
        console.log(`  ${'─'.repeat(72)}`);

        for (const filter of FILTERS) {
            const allowed = all.filter(o => filter.test(o.ctx));
            const traded = allowed.filter(o => isBullish(o.bucket));

            const sSignal = stats(traded, h);
            const sBase = stats(allowed, h);        // comprar siempre EN LOS MISMOS DÍAS permitidos
            if (!sSignal || !sBase) continue;

            const edge = sSignal.upRate - sBase.upRate;
            const flag = edge > 0 ? '' : '  ✗';

            console.log(
                `  ${filter.label.padEnd(28)} ${String(sSignal.n).padStart(5)} ` +
                `${`${sSignal.upRate.toFixed(1)}%`.padStart(8)} ${`${sBase.upRate.toFixed(1)}%`.padStart(8)} ` +
                `${pct(edge).padStart(9)} ${pct(sSignal.netReturn).padStart(10)}${flag}`
            );
        }

        console.log(`\n  * Base = comprar todos los días que el filtro permite, ignorando la señal.`);
        console.log(`    "Ventaja" positiva = la señal aporta algo por encima del filtro.\n`);
    }

    // ¿Y si el filtro por sí solo es mejor que el filtro + señal?
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('  ¿QUIÉN HACE EL TRABAJO: EL FILTRO O LA SEÑAL? (7 días)');
    console.log('════════════════════════════════════════════════════════════════════\n');
    console.log(`  ${'Filtro'.padEnd(28)} ${'Solo filtro'.padStart(13)} ${'Filtro+señal'.padStart(14)}`);
    console.log(`  ${'─'.repeat(58)}`);

    for (const filter of FILTERS) {
        const allowed = all.filter(o => filter.test(o.ctx));
        const traded = allowed.filter(o => isBullish(o.bucket));
        const sBase = stats(allowed, 7);
        const sSignal = stats(traded, 7);
        if (!sBase || !sSignal) continue;
        console.log(`  ${filter.label.padEnd(28)} ${pct(sBase.netReturn).padStart(13)} ${pct(sSignal.netReturn).padStart(14)}`);
    }

    console.log('\n════════════════════════════════════════════════════════════════════');
    console.log('  ⚠️  6 filtros probados sobre el MISMO periodo: el mejor puede serlo');
    console.log('     por azar. Sin validación fuera de muestra esto no es evidencia.');
    console.log('════════════════════════════════════════════════════════════════════\n');
};

run().catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});

