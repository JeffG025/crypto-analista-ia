// Validación definitiva de la señal técnica con ~5 años de datos diarios de Binance.
//
// REGLA FIJADA ANTES DE CORRER (no se cambia después de ver resultados):
//   1. El periodo se parte en dos por fecha. IN-SAMPLE = 70% antiguo, OUT-OF-SAMPLE = 30% reciente.
//   2. El mejor filtro se elige SOLO mirando in-sample.
//   3. Ese filtro se prueba UNA vez en out-of-sample, con ventanas NO solapadas (independientes).
//   4. Si la ventaja out-of-sample no es positiva y significativa (z > 2), la conclusión es NO.
//
// Uso: node scripts/backtest-binance.js
require('dotenv').config();

const axios = require('axios');
const { SMA } = require('technicalindicators');
const { scoreFromPrices, DAYS_FOR_ANALYSIS } = require('../src/services/technicalService');

// Mismas 10 monedas del scanner, en su par USDT de Binance
const SYMBOLS = {
    BTCUSDT: 'bitcoin', ETHUSDT: 'ethereum', SOLUSDT: 'solana',
    BNBUSDT: 'binancecoin', XRPUSDT: 'ripple', ADAUSDT: 'cardano',
    AVAXUSDT: 'avalanche-2', LINKUSDT: 'chainlink', DOTUSDT: 'polkadot',
    DOGEUSDT: 'dogecoin'
};

const YEARS = 5;
const HORIZON = 7;                    // horizonte principal de evaluación
const ROUND_TRIP_FEE = 0.2;
const IS_FRACTION = 0.70;             // 70% antiguo para selección, 30% reciente intacto
const LOOKBACK = DAYS_FOR_ANALYSIS;   // producción analiza siempre los últimos 200 días
const DAY_MS = 24 * 60 * 60 * 1000;

const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const isBullish = (b) => b === 'ALCISTA' || b === 'ALCISTA FUERTE';

const lastSMA = (values, period) => {
    if (values.length < period) return null;
    const out = SMA.calculate({ period, values });
    return out[out.length - 1];
};

// Descarga velas diarias paginando de 1000 en 1000 desde hace YEARS años
const fetchKlines = async (symbol) => {
    const startTime = Date.now() - YEARS * 365 * DAY_MS;
    let cursor = startTime;
    const candles = [];

    for (let page = 0; page < 10; page++) {
        let data = null;
        let lastErr = null;

        for (const host of HOSTS) {
            try {
                const res = await axios.get(`${host}/api/v3/klines`, {
                    params: { symbol, interval: '1d', startTime: cursor, limit: 1000 },
                    timeout: 20000
                });
                data = res.data;
                break;
            } catch (err) {
                lastErr = err;
            }
        }

        if (!data) throw new Error(`${symbol}: ${lastErr?.message || 'sin respuesta'}`);
        if (data.length === 0) break;

        for (const k of data) candles.push({ t: k[0], price: parseFloat(k[4]) });
        if (data.length < 1000) break;

        cursor = data[data.length - 1][0] + DAY_MS;
        await sleep(300);
    }

    return candles;
};

const FILTERS = [
    { key: 'ninguno', label: 'Sin filtro', test: () => true },
    { key: 'p>sma100', label: 'Precio > SMA100', test: (c) => c.price > c.sma100 },
    { key: 'p>sma200', label: 'Precio > SMA200', test: (c) => c.sma200 && c.price > c.sma200 },
    { key: 'sma50>sma100', label: 'SMA50 > SMA100', test: (c) => c.sma50 > c.sma100 },
    { key: 'sma50-sube', label: 'SMA50 subiendo (10d)', test: (c) => c.sma50 > c.sma50Prev10 },
    { key: 'btc-alcista', label: 'BTC > su SMA200', test: (c) => c.btcBull },
    { key: 'doble', label: 'Precio>SMA100 Y BTC alcista', test: (c) => c.price > c.sma100 && c.btcBull },
];

// Régimen de BTC por fecha: alcista si su precio está sobre la SMA200
const buildBtcRegime = (candles) => {
    const regime = new Map();
    for (let i = 0; i < candles.length; i++) {
        const window = candles.slice(Math.max(0, i - 250), i + 1).map(c => c.price);
        const sma200 = lastSMA(window, 200);
        regime.set(candles[i].t, sma200 ? candles[i].price > sma200 : null);
    }
    return regime;
};

const collectObservations = (coinId, candles, btcRegime) => {
    const prices = candles.map(c => c.price);
    const observations = [];

    for (let i = LOOKBACK; i < prices.length - HORIZON; i++) {
        const window = prices.slice(i - LOOKBACK + 1, i + 1);   // ventana móvil igual a producción
        const result = scoreFromPrices(window);

        const sma100 = lastSMA(window, 100);
        const sma50 = lastSMA(window, 50);
        const sma200 = lastSMA(window, 200);
        const sma50Prev10 = lastSMA(prices.slice(Math.max(0, i - LOOKBACK - 9), i - 9), 50);
        const btcBull = btcRegime.get(candles[i].t);
        if (!sma100 || !sma50 || !sma50Prev10 || btcBull === undefined || btcBull === null) continue;

        const entry = prices[i];
        observations.push({
            coinId,
            t: candles[i].t,
            dayIndex: i,
            bucket: result.signal,
            ctx: { price: entry, sma100, sma50, sma200, sma50Prev10, btcBull },
            btcBull,
            ret: ((prices[i + HORIZON] - entry) / entry) * 100
        });
    }

    return observations;
};

const stats = (obs) => {
    if (obs.length === 0) return null;
    const up = obs.filter(o => o.ret > 0).length;
    const avg = obs.reduce((a, o) => a + o.ret, 0) / obs.length;
    return { n: obs.length, upRate: (up / obs.length) * 100, netReturn: avg - ROUND_TRIP_FEE };
};

// Error estándar de la diferencia de dos proporciones -> z. |z| > 2 ≈ significativo al 95%
const zScore = (s1, s2) => {
    const p1 = s1.upRate / 100, p2 = s2.upRate / 100;
    const se = Math.sqrt((p1 * (1 - p1)) / s1.n + (p2 * (1 - p2)) / s2.n);
    return se === 0 ? 0 : (p1 - p2) / se;
};

const evaluate = (obs, filter) => {
    const allowed = obs.filter(o => filter.test(o.ctx));
    const traded = allowed.filter(o => isBullish(o.bucket));
    const sSignal = stats(traded), sBase = stats(allowed);
    if (!sSignal || !sBase || sSignal.n < 20) return null;
    return { sSignal, sBase, edge: sSignal.upRate - sBase.upRate, z: zScore(sSignal, sBase) };
};

// Se queda con una observación cada HORIZON días por moneda -> ventanas sin solape
const nonOverlapping = (obs) => {
    const byCoin = new Map();
    for (const o of obs) {
        if (!byCoin.has(o.coinId)) byCoin.set(o.coinId, []);
        byCoin.get(o.coinId).push(o);
    }
    const out = [];
    for (const list of byCoin.values()) {
        list.sort((a, b) => a.dayIndex - b.dayIndex);
        let lastUsed = -Infinity;
        for (const o of list) {
            if (o.dayIndex - lastUsed >= HORIZON) { out.push(o); lastUsed = o.dayIndex; }
        }
    }
    return out;
};

const run = async () => {
    console.log('\n════════════════════════════════════════════════════════════════════');
    console.log('  VALIDACIÓN CON DATOS LARGOS DE BINANCE');
    console.log(`  ${Object.keys(SYMBOLS).length} monedas · ~${YEARS} años · horizonte ${HORIZON}d`);
    console.log('  Selección in-sample → validación out-of-sample (una sola vez)');
    console.log('════════════════════════════════════════════════════════════════════\n');

    process.stdout.write('📥 BTCUSDT (régimen de mercado)... ');
    const btcCandles = await fetchKlines('BTCUSDT');
    const btcRegime = buildBtcRegime(btcCandles);
    const from = new Date(btcCandles[0].t).toISOString().slice(0, 10);
    const to = new Date(btcCandles[btcCandles.length - 1].t).toISOString().slice(0, 10);
    console.log(`${btcCandles.length} velas (${from} → ${to})`);

    let all = [];
    for (const [symbol, coinId] of Object.entries(SYMBOLS)) {
        process.stdout.write(`📥 ${symbol}... `);
        try {
            const candles = await fetchKlines(symbol);
            const obs = collectObservations(coinId, candles, btcRegime);
            console.log(`${candles.length} velas → ${obs.length} señales`);
            all = all.concat(obs);
        } catch (err) {
            console.log(`⚠️  ${err.message}`);
        }
        await sleep(300);
    }

    if (all.length === 0) {
        console.error('\n❌ Sin datos. ¿Binance bloqueado desde esta red?');
        process.exit(1);
    }

    all.sort((a, b) => a.t - b.t);
    const splitIdx = Math.floor(all.length * IS_FRACTION);
    const splitDate = new Date(all[splitIdx].t).toISOString().slice(0, 10);
    const inSample = all.slice(0, splitIdx);
    const outSample = all.slice(splitIdx);

    console.log(`\n✅ ${all.length} observaciones totales`);
    console.log(`   IN-SAMPLE      : ${inSample.length}  (hasta ${splitDate})`);
    console.log(`   OUT-OF-SAMPLE  : ${outSample.length}  (desde ${splitDate}) — intacto\n`);

    // ===== PASO 1: elegir el mejor filtro mirando SOLO in-sample =====
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('  PASO 1 · SELECCIÓN (solo in-sample)');
    console.log('════════════════════════════════════════════════════════════════════\n');
    console.log(`  ${'Filtro'.padEnd(28)} ${'Ops'.padStart(6)} ${'Señal'.padStart(8)} ${'Base'.padStart(8)} ${'Ventaja'.padStart(9)}`);
    console.log(`  ${'─'.repeat(64)}`);

    let best = null;
    for (const filter of FILTERS) {
        const r = evaluate(inSample, filter);
        if (!r) continue;
        console.log(`  ${filter.label.padEnd(28)} ${String(r.sSignal.n).padStart(6)} ${`${r.sSignal.upRate.toFixed(1)}%`.padStart(8)} ${`${r.sBase.upRate.toFixed(1)}%`.padStart(8)} ${pct(r.edge).padStart(9)}`);
        if (!best || r.edge > best.r.edge) best = { filter, r };
    }

    console.log(`\n  🏆 Filtro elegido: "${best.filter.label}" (ventaja in-sample ${pct(best.r.edge)})\n`);

    // ===== PASO 2: probarlo UNA vez out-of-sample, sin solape =====
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('  PASO 2 · VALIDACIÓN OUT-OF-SAMPLE (ventanas no solapadas)');
    console.log('════════════════════════════════════════════════════════════════════\n');

    const oosClean = nonOverlapping(outSample);
    const final = evaluate(oosClean, best.filter);

    if (!final) {
        console.log('  ⚠️  Muestra out-of-sample insuficiente para validar.\n');
    } else {
        console.log(`  Filtro          : ${best.filter.label}`);
        console.log(`  Operaciones     : ${final.sSignal.n} (independientes)`);
        console.log(`  Acierto señal   : ${final.sSignal.upRate.toFixed(1)}%`);
        console.log(`  Acierto base    : ${final.sBase.upRate.toFixed(1)}%  (comprar siempre esos días)`);
        console.log(`  Ventaja         : ${pct(final.edge)}`);
        console.log(`  z               : ${final.z.toFixed(2)}  ${Math.abs(final.z) > 2 ? '(significativo)' : '(NO significativo)'}`);
        console.log(`  Retorno neto/op : ${pct(final.sSignal.netReturn)}  vs base ${pct(final.sBase.netReturn)}`);

        const pass = final.edge > 0 && final.z > 2;
        console.log(`\n  ${pass ? '✅ PASA' : '❌ NO PASA'} el criterio fijado de antemano (ventaja > 0 y z > 2)\n`);
    }

    // ===== Contexto: qué hicieron TODOS los filtros out-of-sample =====
    console.log('  Transparencia — todos los filtros out-of-sample (no se usaron para elegir):');
    console.log(`  ${'Filtro'.padEnd(28)} ${'Ops'.padStart(6)} ${'Ventaja'.padStart(9)} ${'z'.padStart(7)}`);
    console.log(`  ${'─'.repeat(54)}`);
    for (const filter of FILTERS) {
        const r = evaluate(oosClean, filter);
        if (!r) continue;
        console.log(`  ${filter.label.padEnd(28)} ${String(r.sSignal.n).padStart(6)} ${pct(r.edge).padStart(9)} ${r.z.toFixed(2).padStart(7)}`);
    }

    // ===== La pregunta de fondo: ¿funciona en mercado alcista? =====
    console.log('\n════════════════════════════════════════════════════════════════════');
    console.log('  ¿LA SEÑAL SIRVE EN MERCADO ALCISTA? (historia completa)');
    console.log('════════════════════════════════════════════════════════════════════\n');
    console.log(`  ${'Régimen'.padEnd(20)} ${'Ops'.padStart(6)} ${'Señal'.padStart(8)} ${'Base'.padStart(8)} ${'Ventaja'.padStart(9)} ${'z'.padStart(7)}`);
    console.log(`  ${'─'.repeat(62)}`);

    const cleanAll = nonOverlapping(all);
    for (const [label, subset] of [
        ['BTC alcista', cleanAll.filter(o => o.btcBull)],
        ['BTC bajista', cleanAll.filter(o => !o.btcBull)]
    ]) {
        const r = evaluate(subset, FILTERS[0]);
        if (!r) continue;
        console.log(`  ${label.padEnd(20)} ${String(r.sSignal.n).padStart(6)} ${`${r.sSignal.upRate.toFixed(1)}%`.padStart(8)} ${`${r.sBase.upRate.toFixed(1)}%`.padStart(8)} ${pct(r.edge).padStart(9)} ${r.z.toFixed(2).padStart(7)}`);
    }

    console.log('\n════════════════════════════════════════════════════════════════════\n');
};

run().catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});
