// Genera la tabla de calibración que alimenta el "% de fiabilidad" de la app.
// Mide cuántas veces acertó cada tipo de señal sobre 5 años de datos diarios de Binance,
// replicando exactamente lo que hace producción: ventana móvil de 200 días, sin look-ahead.
// NO busca una estrategia mejor — mide el acierto de la señal que ya se publica.
// Uso: node scripts/calibrate.js
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { scoreFromPrices, DAYS_FOR_ANALYSIS } = require('../src/services/technicalService');

// Clase de activo: `node scripts/calibrate.js --asset=equity` (por defecto crypto)
const ASSET = (process.argv.find(a => a.startsWith('--asset=')) || '--asset=crypto').split('=')[1];
const provider = ASSET === 'equity' ? require('./lib/equities') : require('./lib/binance');
const { SYMBOLS, sleep } = provider;
const fetchSeries = provider.fetchSeries || provider.fetchKlines;

// En bolsa el horizonte se mide en sesiones bursátiles, no en días naturales
const UNIT = ASSET === 'equity' ? 'sesiones' : 'días';

const YEARS = 5;
const HORIZONS = [1, 7, 30];
const LOOKBACK = DAYS_FOR_ANALYSIS;   // producción analiza siempre los últimos 200 días

const BUCKETS = ['ALCISTA FUERTE', 'ALCISTA', 'NEUTRAL', 'BAJISTA', 'BAJISTA FUERTE'];
const isBullish = (b) => b === 'ALCISTA' || b === 'ALCISTA FUERTE';
const isBearish = (b) => b === 'BAJISTA' || b === 'BAJISTA FUERTE';
const directionOf = (b) => isBullish(b) ? 'UP' : isBearish(b) ? 'DOWN' : 'FLAT';

// Una observación por día evaluable: qué señal dio y qué pasó después
const collectObservations = (coinId, candles) => {
    const prices = candles.map(c => c.price);
    const observations = [];

    for (let i = LOOKBACK - 1; i < prices.length - 1; i++) {
        const window = prices.slice(i - LOOKBACK + 1, i + 1);   // ventana móvil idéntica a producción
        const result = scoreFromPrices(window);
        const entry = prices[i];

        const forward = {};
        for (const h of HORIZONS) {
            if (i + h < prices.length) forward[h] = ((prices[i + h] - entry) / entry) * 100;
        }
        if (Object.keys(forward).length === 0) continue;

        observations.push({ coinId, bucket: result.signal, forward });
    }

    return observations;
};

// Intervalo de confianza al 95% de una proporción, en puntos porcentuales
const ci95 = (p, n) => n === 0 ? null : 1.96 * Math.sqrt((p / 100) * (1 - p / 100) / n) * 100;

const upRateOf = (obs, h) => {
    const withData = obs.filter(o => o.forward[h] !== undefined);
    if (withData.length === 0) return null;
    const up = withData.filter(o => o.forward[h] > 0).length;
    return { n: withData.length, upRate: (up / withData.length) * 100 };
};

const run = async () => {
    const symbols = Object.keys(SYMBOLS);
    console.log(`\n  CALIBRACIÓN DIRECCIONAL [${ASSET}] — ${symbols.length} activos · ${YEARS} años · ventana ${LOOKBACK} ${UNIT}\n`);

    let all = [];
    for (const symbol of symbols) {
        process.stdout.write(`  ${symbol}... `);
        try {
            const candles = await fetchSeries(symbol, YEARS);
            const obs = collectObservations(SYMBOLS[symbol], candles);
            console.log(`${candles.length} velas → ${obs.length} observaciones`);
            all = all.concat(obs);
        } catch (err) {
            console.log(`falló (${err.message})`);
        }
        await sleep(200);
    }

    if (all.length === 0) {
        console.error('\n  No se obtuvo ningún dato. ¿Sin conexión o Binance bloqueado?');
        process.exit(1);
    }

    console.log(`\n  Total: ${all.length} observaciones\n`);

    const horizons = {};

    for (const h of HORIZONS) {
        const base = upRateOf(all, h);
        const buckets = {};

        for (const bucket of BUCKETS) {
            const subset = all.filter(o => o.bucket === bucket);
            const s = upRateOf(subset, h);
            if (!s) continue;

            const direction = directionOf(bucket);
            let hitRate = null, edge = null;

            if (direction === 'UP') {
                hitRate = s.upRate;
                edge = s.upRate - base.upRate;
            } else if (direction === 'DOWN') {
                hitRate = 100 - s.upRate;
                edge = (100 - s.upRate) - (100 - base.upRate);
            }

            buckets[bucket] = {
                direction,
                n: s.n,
                hitRate: hitRate === null ? null : +hitRate.toFixed(1),
                ci95: hitRate === null ? null : +ci95(hitRate, s.n).toFixed(1),
                edge: edge === null ? null : +edge.toFixed(1)
            };
        }

        horizons[h] = {
            baselineUpRate: +base.upRate.toFixed(1),
            n: base.n,
            buckets
        };

        // Resumen legible en consola
        console.log(`  ── Horizonte ${h} ${UNIT} · baseline sube ${base.upRate.toFixed(1)}% (n=${base.n})`);
        console.log(`     ${'Señal'.padEnd(16)} ${'N'.padStart(6)} ${'Acierto'.padStart(9)} ${'±IC95'.padStart(7)} ${'vs base'.padStart(8)}`);
        for (const [name, b] of Object.entries(buckets)) {
            const hit = b.hitRate === null ? 'n/a'.padStart(9) : `${b.hitRate}%`.padStart(9);
            const ci = b.ci95 === null ? 'n/a'.padStart(7) : `${b.ci95}`.padStart(7);
            const ed = b.edge === null ? 'n/a'.padStart(8) : `${b.edge >= 0 ? '+' : ''}${b.edge}`.padStart(8);
            console.log(`     ${name.padEnd(16)} ${String(b.n).padStart(6)} ${hit} ${ci} ${ed}`);
        }
        console.log('');
    }

    const dir = path.join(__dirname, '..', 'data');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'calibration.json');

    // Merge: calibrar una clase de activo no debe borrar la de las demás
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* primera vez */ }

    const output = {
        generatedAt: new Date().toISOString().slice(0, 10),
        lookbackDays: LOOKBACK,
        assetClasses: {
            ...(existing.assetClasses || {}),
            [ASSET]: {
                source: ASSET === 'equity' ? `yahoo-adjusted-daily-${YEARS}y` : `binance-daily-${YEARS}y`,
                horizonUnit: UNIT,
                symbols: Object.values(SYMBOLS),
                horizons
            }
        }
    };

    fs.writeFileSync(file, JSON.stringify(output, null, 2) + '\n');

    console.log(`  Escrito: ${path.relative(process.cwd(), file)}\n`);
};

run().catch(err => { console.error(err); process.exit(1); });
