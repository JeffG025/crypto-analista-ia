// Calibra las bandas de precio ("estará entre X e Y con 80% de confianza") y mide su cobertura real.
//
// Método: de cada día se toma la volatilidad realizada de los últimos VOL_WINDOW días y se
// estandariza el movimiento futuro:  z = ln(P[t+h]/P[t]) / (sigma * sqrt(h)).
// La banda del nivel c es el cuantil empírico de |z| — NO la curva normal, porque cripto tiene
// colas gordas y la normal subestimaría el ancho.
//
// Honestidad del número: k se calibra sobre el 70% ANTIGUO y la cobertura se mide sobre el 30%
// RECIENTE, que nunca participó en la calibración. VOL_WINDOW se fija de antemano: no se prueban
// varias ventanas para quedarse con la que mejor salga.
//
// Uso: node scripts/calibrate-intervals.js
require('dotenv').config();

const fs = require('fs');
const path = require('path');
// Clase de activo: `node scripts/calibrate-intervals.js --asset=equity` (por defecto crypto)
const ASSET = (process.argv.find(a => a.startsWith('--asset=')) || '--asset=crypto').split('=')[1];
const provider = ASSET === 'equity' ? require('./lib/equities') : require('./lib/binance');
const { SYMBOLS, sleep } = provider;
const fetchSeries = provider.fetchSeries || provider.fetchKlines;

// En bolsa el horizonte se mide en sesiones bursátiles, no en días naturales
const UNIT = ASSET === 'equity' ? 'sesiones' : 'días';

const YEARS = 5;
const VOL_WINDOW = 30;                // días de retornos para estimar la volatilidad. FIJO a priori.
const HORIZONS = [1, 7, 30];
const LEVELS = [50, 80, 95];          // niveles de confianza a calibrar
const IS_FRACTION = 0.70;             // 70% antiguo calibra, 30% reciente valida

// Cuantil de la normal para cobertura bilateral, como referencia de cuánto engordan las colas
const NORMAL_K = { 50: 0.6745, 80: 1.2816, 95: 1.9600 };

const std = (xs) => {
    if (xs.length < 2) return null;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
    return Math.sqrt(variance);
};

const quantile = (sorted, p) => {
    if (sorted.length === 0) return null;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[idx];
};

// Una observación por día evaluable y horizonte: el movimiento futuro en unidades de sigma
const collect = (coinId, candles) => {
    const prices = candles.map(c => c.price);
    const times = candles.map(c => c.t);
    const out = [];

    const logRet = [];
    for (let i = 1; i < prices.length; i++) logRet.push(Math.log(prices[i] / prices[i - 1]));

    // logRet[j] corresponde al día j+1 de `prices`
    for (let i = VOL_WINDOW; i < prices.length - 1; i++) {
        const sigma = std(logRet.slice(i - VOL_WINDOW, i));   // solo el pasado: sin look-ahead
        if (!sigma || !isFinite(sigma) || sigma === 0) continue;

        for (const h of HORIZONS) {
            if (i + h >= prices.length) continue;
            const z = Math.log(prices[i + h] / prices[i]) / (sigma * Math.sqrt(h));
            if (!isFinite(z)) continue;
            out.push({ coinId, t: times[i], dayIndex: i, h, z });
        }
    }

    return out;
};

// Submuestra sin solapamiento: una observación cada h días por moneda
const nonOverlapping = (obs, h) => {
    const byCoin = new Map();
    for (const o of obs) {
        if (!byCoin.has(o.coinId)) byCoin.set(o.coinId, []);
        byCoin.get(o.coinId).push(o);
    }
    const out = [];
    for (const list of byCoin.values()) {
        list.sort((a, b) => a.dayIndex - b.dayIndex);
        for (let i = 0; i < list.length; i += h) out.push(list[i]);
    }
    return out;
};

const run = async () => {
    const symbols = Object.keys(SYMBOLS);
    console.log(`\n  CALIBRACIÓN DE BANDAS [${ASSET}] — ${symbols.length} activos · ${YEARS} años · volatilidad ${VOL_WINDOW} ${UNIT}\n`);

    let all = [];
    for (const symbol of symbols) {
        process.stdout.write(`  ${symbol}... `);
        try {
            const candles = await fetchSeries(symbol, YEARS);
            const obs = collect(SYMBOLS[symbol], candles);
            console.log(`${candles.length} velas → ${obs.length} observaciones`);
            all = all.concat(obs);
        } catch (err) {
            console.log(`falló (${err.message})`);
        }
        await sleep(200);
    }

    if (all.length === 0) {
        console.error('\n  No se obtuvo ningún dato.');
        process.exit(1);
    }

    // Corte temporal: el 70% más antiguo calibra, el 30% más reciente valida
    const times = [...new Set(all.map(o => o.t))].sort((a, b) => a - b);
    const cutoff = times[Math.floor(times.length * IS_FRACTION)];
    console.log(`\n  Total: ${all.length} observaciones`);
    console.log(`  Corte: ${new Date(cutoff).toISOString().slice(0, 10)} (antes calibra, después valida)\n`);

    const horizons = {};

    for (const h of HORIZONS) {
        const obsH = all.filter(o => o.h === h);
        const is = obsH.filter(o => o.t <= cutoff);
        const oos = obsH.filter(o => o.t > cutoff);
        const oosNO = nonOverlapping(oos, h);

        const isAbs = is.map(o => Math.abs(o.z)).sort((a, b) => a - b);
        const levels = {};

        console.log(`  ── Horizonte ${h} ${UNIT} · calibración n=${is.length} · validación n=${oos.length} (sin solape: ${oosNO.length})`);
        console.log(`     ${'Nivel'.padStart(6)} ${'k emp.'.padStart(8)} ${'k normal'.padStart(9)} ${'Cobertura OOS'.padStart(14)} ${'sin solape'.padStart(11)}`);

        for (const c of LEVELS) {
            const k = quantile(isAbs, c / 100);
            if (k === null) continue;

            const cov = (oos.filter(o => Math.abs(o.z) <= k).length / oos.length) * 100;
            const covNO = oosNO.length ? (oosNO.filter(o => Math.abs(o.z) <= k).length / oosNO.length) * 100 : null;

            levels[c] = {
                k: +k.toFixed(4),
                kNormal: NORMAL_K[c],
                coverageOOS: +cov.toFixed(1),
                coverageOOSNonOverlap: covNO === null ? null : +covNO.toFixed(1),
                nIS: is.length,
                nOOS: oos.length,
                nOOSNonOverlap: oosNO.length
            };

            console.log(`     ${`${c}%`.padStart(6)} ${k.toFixed(3).padStart(8)} ${NORMAL_K[c].toFixed(3).padStart(9)} ${`${cov.toFixed(1)}%`.padStart(14)} ${(covNO === null ? 'n/a' : `${covNO.toFixed(1)}%`).padStart(11)}`);
        }

        horizons[h] = { levels };
        console.log('');
    }

    const dir = path.join(__dirname, '..', 'data');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'interval-calibration.json');

    // Merge: calibrar una clase de activo no debe borrar la de las demás
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* primera vez */ }

    const output = {
        generatedAt: new Date().toISOString().slice(0, 10),
        volWindowDays: VOL_WINDOW,
        method: 'cuantil empírico de |ln(P[t+h]/P[t]) / (sigma*sqrt(h))|; k calibrado in-sample, cobertura medida out-of-sample',
        assetClasses: {
            ...(existing.assetClasses || {}),
            [ASSET]: {
                source: ASSET === 'equity' ? `yahoo-adjusted-daily-${YEARS}y` : `binance-daily-${YEARS}y`,
                horizonUnit: UNIT,
                splitDate: new Date(cutoff).toISOString().slice(0, 10),
                symbols: Object.values(SYMBOLS),
                horizons
            }
        }
    };

    fs.writeFileSync(file, JSON.stringify(output, null, 2) + '\n');

    console.log(`  Escrito: ${path.relative(process.cwd(), file)}\n`);
};

run().catch(err => { console.error(err); process.exit(1); });
