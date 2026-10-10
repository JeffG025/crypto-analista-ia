// Backtest de la señal técnica de CryptoMind sobre datos históricos reales.
// Recorre la serie de precios día por día, calcula la señal con SOLO los datos
// disponibles hasta ese día (sin look-ahead) y la compara contra lo que pasó después.
// Uso: node scripts/backtest.js
require('dotenv').config();

const cryptoService = require('../src/services/cryptoService');
const { scoreFromPrices, MIN_PRICES, DAYS_FOR_ANALYSIS } = require('../src/services/technicalService');

// Las mismas 10 monedas que escanea el bot en producción
const COINS = [
    'bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple',
    'cardano', 'avalanche-2', 'chainlink', 'polkadot', 'dogecoin'
];

const HORIZONS = [1, 7, 30];          // días hacia adelante que evaluamos
const ROUND_TRIP_FEE = 0.2;           // % de comisión ida y vuelta (0.1% por lado, taker típico)
const DELAY_MS = 2500;                // pausa entre monedas para no chocar con el rate limit

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

// Agrupa las señales en las 5 categorías que muestra la app
const BUCKETS = ['ALCISTA FUERTE', 'ALCISTA', 'NEUTRAL', 'BAJISTA', 'BAJISTA FUERTE'];
const isBullish = (b) => b === 'ALCISTA' || b === 'ALCISTA FUERTE';
const isBearish = (b) => b === 'BAJISTA' || b === 'BAJISTA FUERTE';

// Recorre una moneda y devuelve una observación por cada día evaluable
const backtestCoin = async (coinId) => {
    const history = await cryptoService.getChartHistory(coinId, DAYS_FOR_ANALYSIS);
    const prices = history.data;

    if (!prices || prices.length < MIN_PRICES + Math.max(...HORIZONS)) {
        console.warn(`   ⚠️  ${coinId}: serie insuficiente (${prices?.length || 0} puntos). Se omite.`);
        return [];
    }

    const observations = [];

    for (let i = MIN_PRICES - 1; i < prices.length - 1; i++) {
        const window = prices.slice(0, i + 1);           // solo el pasado: sin look-ahead
        const result = scoreFromPrices(window);
        const entryPrice = prices[i];

        const forward = {};
        for (const h of HORIZONS) {
            if (i + h < prices.length) {
                forward[h] = ((prices[i + h] - entryPrice) / entryPrice) * 100;
            }
        }

        observations.push({
            coinId,
            dayIndex: i,
            bucket: result.signal,
            score: result.score,
            agreement: result.agreement,
            forward
        });
    }

    return observations;
};

// Métricas de un conjunto de observaciones para un horizonte dado
const summarize = (observations, horizon) => {
    const withData = observations.filter(o => o.forward[horizon] !== undefined);
    if (withData.length === 0) return null;

    const returns = withData.map(o => o.forward[horizon]);
    const upCount = returns.filter(r => r > 0).length;
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;

    return {
        n: withData.length,
        upRate: (upCount / withData.length) * 100,
        avgReturn: avg,
        avgNetReturn: avg - ROUND_TRIP_FEE
    };
};

const run = async () => {
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  BACKTEST — Señal técnica de CryptoMind');
    console.log(`  ${COINS.length} monedas · ${DAYS_FOR_ANALYSIS} días · horizontes: ${HORIZONS.join('d, ')}d`);
    console.log('════════════════════════════════════════════════════════════\n');

    let all = [];

    for (const coin of COINS) {
        process.stdout.write(`📊 ${coin}... `);
        const obs = await backtestCoin(coin);
        console.log(`${obs.length} señales evaluadas`);
        all = all.concat(obs);
        await sleep(DELAY_MS);
    }

    if (all.length === 0) {
        console.error('\n❌ No se obtuvo ningún dato. ¿Rate limit de CoinGecko o sin conexión?');
        process.exit(1);
    }

    console.log(`\n✅ Total: ${all.length} observaciones\n`);

    for (const h of HORIZONS) {
        console.log('────────────────────────────────────────────────────────────');
        console.log(`  HORIZONTE: ${h} día${h > 1 ? 's' : ''}`);
        console.log('────────────────────────────────────────────────────────────');

        // BASELINE: qué habría pasado comprando en un día cualquiera, ignorando la señal
        const base = summarize(all, h);
        console.log(`\n  📎 BASELINE (comprar siempre, ignorando la señal)`);
        console.log(`     Veces que el precio subió : ${base.upRate.toFixed(1)}%`);
        console.log(`     Retorno promedio          : ${pct(base.avgReturn)}`);
        console.log(`     Retorno neto (−${ROUND_TRIP_FEE}% fee)  : ${pct(base.avgNetReturn)}`);

        console.log(`\n  🎯 POR TIPO DE SEÑAL`);
        console.log(`     ${'Señal'.padEnd(16)} ${'N'.padStart(5)} ${'Acierto'.padStart(9)} ${'vs base'.padStart(9)} ${'Ret.neto'.padStart(10)}`);

        for (const bucket of BUCKETS) {
            const subset = all.filter(o => o.bucket === bucket);
            const s = summarize(subset, h);
            if (!s) continue;

            // "Acierto" = la dirección que anunció la señal se cumplió
            let hitRate, edge;
            if (isBullish(bucket)) {
                hitRate = s.upRate;
                edge = s.upRate - base.upRate;
            } else if (isBearish(bucket)) {
                hitRate = 100 - s.upRate;                 // acertó si el precio bajó
                edge = (100 - s.upRate) - (100 - base.upRate);
            } else {
                hitRate = null;                            // NEUTRAL no anuncia dirección
                edge = null;
            }

            const hitStr = hitRate === null ? '    n/a' : `${hitRate.toFixed(1)}%`.padStart(9);
            const edgeStr = edge === null ? '    n/a' : `${pct(edge)}`.padStart(9);

            console.log(`     ${bucket.padEnd(16)} ${String(s.n).padStart(5)} ${hitStr} ${edgeStr} ${pct(s.avgNetReturn).padStart(10)}`);
        }

        // Estrategia completa: entrar solo en señales alcistas
        const bullish = all.filter(o => isBullish(o.bucket));
        const bs = summarize(bullish, h);
        if (bs) {
            console.log(`\n  💰 ESTRATEGIA "comprar en toda señal alcista"`);
            console.log(`     Operaciones     : ${bs.n}`);
            console.log(`     Aciertos        : ${bs.upRate.toFixed(1)}%  (baseline ${base.upRate.toFixed(1)}%)`);
            console.log(`     Retorno neto/op : ${pct(bs.avgNetReturn)}  (baseline ${pct(base.avgNetReturn)})`);
            const verdict = bs.avgNetReturn > base.avgNetReturn ? '✅ mejor que el baseline' : '❌ PEOR que comprar al azar';
            console.log(`     Veredicto       : ${verdict}`);
        }
        console.log('');
    }

    // Desglose por moneda para detectar si el resultado lo carga una sola
    console.log('────────────────────────────────────────────────────────────');
    console.log('  DESGLOSE POR MONEDA (señales alcistas, horizonte 7d)');
    console.log('────────────────────────────────────────────────────────────\n');
    console.log(`     ${'Moneda'.padEnd(16)} ${'N'.padStart(5)} ${'Acierto'.padStart(9)} ${'Ret.neto'.padStart(10)}`);

    for (const coin of COINS) {
        const subset = all.filter(o => o.coinId === coin && isBullish(o.bucket));
        const s = summarize(subset, 7);
        if (!s) continue;
        console.log(`     ${coin.padEnd(16)} ${String(s.n).padStart(5)} ${`${s.upRate.toFixed(1)}%`.padStart(9)} ${pct(s.avgNetReturn).padStart(10)}`);
    }

    // Contraste entre la concordancia que muestra la app y el acierto real
    console.log('\n────────────────────────────────────────────────────────────');
    console.log('  CONCORDANCIA QUE MUESTRA LA APP vs ACIERTO REAL (7d)');
    console.log('────────────────────────────────────────────────────────────\n');
    console.log(`     ${'Concordancia'.padEnd(14)} ${'N'.padStart(5)} ${'Acierto real'.padStart(14)}`);

    const byAgreement = new Map();
    for (const o of all.filter(x => isBullish(x.bucket) || isBearish(x.bucket))) {
        if (!byAgreement.has(o.agreement)) byAgreement.set(o.agreement, []);
        byAgreement.get(o.agreement).push(o);
    }

    for (const rel of [...byAgreement.keys()].sort((a, b) => a - b)) {
        const subset = byAgreement.get(rel);
        const s = summarize(subset, 7);
        if (!s) continue;
        const bullCount = subset.filter(o => isBullish(o.bucket)).length;
        const real = bullCount > subset.length / 2 ? s.upRate : 100 - s.upRate;
        console.log(`     ${`${rel}%`.padEnd(14)} ${String(s.n).padStart(5)} ${`${real.toFixed(1)}%`.padStart(14)}`);
    }

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  ⚠️  Ventanas diarias solapadas: la muestra efectiva es menor');
    console.log('     que N. Un solo régimen de mercado (~7 meses). No modela');
    console.log('     slippage. Esto NO es asesoría financiera.');
    console.log('════════════════════════════════════════════════════════════\n');
};

run().catch(err => {
    console.error('\n❌ Error en el backtest:', err.message);
    process.exit(1);
});
