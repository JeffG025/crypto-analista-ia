// Produce la banda de precio ("estará entre X e Y con N% de confianza") a partir de la
// volatilidad reciente y del multiplicador k calibrado por scripts/calibrate-intervals.js.
//
// El nivel que se muestra al usuario NO es una promesa teórica: es la cobertura medida
// out-of-sample que viene en la tabla. Si la banda del 80% cubrió el 79.4% de los casos,
// eso es lo que se reporta.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'interval-calibration.json');
const DEFAULT_HORIZON = 7;
const DEFAULT_LEVEL = 80;

let table = null;

const load = () => {
    if (table !== null) return table;
    try {
        table = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {
        console.warn('⚠️  Sin calibración de bandas. Corre `node scripts/calibrate-intervals.js`.');
        table = false;
    }
    return table;
};

// Desviación estándar muestral de los últimos `window` retornos logarítmicos
const realizedVol = (prices, window) => {
    if (!prices || prices.length < window + 1) return null;

    const recent = prices.slice(-(window + 1));
    const logRet = [];
    for (let i = 1; i < recent.length; i++) logRet.push(Math.log(recent[i] / recent[i - 1]));

    const mean = logRet.reduce((a, b) => a + b, 0) / logRet.length;
    const variance = logRet.reduce((a, b) => a + (b - mean) ** 2, 0) / (logRet.length - 1);
    const sigma = Math.sqrt(variance);

    return isFinite(sigma) && sigma > 0 ? sigma : null;
};

// Devuelve la banda para el horizonte y nivel pedidos, o null si falta calibración o datos
const forecast = (prices, { assetClass = 'crypto', horizonDays = DEFAULT_HORIZON, level = DEFAULT_LEVEL } = {}) => {
    const t = load();
    if (!t) return null;

    const klass = t.assetClasses?.[assetClass];
    const entry = klass?.horizons?.[horizonDays]?.levels?.[level];
    if (!entry) return null;

    const sigma = realizedVol(prices, t.volWindowDays);
    if (sigma === null) return null;

    const price = prices[prices.length - 1];
    const spread = entry.k * sigma * Math.sqrt(horizonDays);

    return {
        horizonDays,
        level,                                  // nivel nominal pedido
        coverage: entry.coverageOOS,            // cobertura REAL medida fuera de muestra
        coverageNonOverlap: entry.coverageOOSNonOverlap,
        low: +(price * Math.exp(-spread)).toFixed(price >= 100 ? 2 : 6),
        high: +(price * Math.exp(spread)).toFixed(price >= 100 ? 2 : 6),
        price,
        widthPct: +((Math.exp(spread) - Math.exp(-spread)) * 100).toFixed(1),
        dailyVolPct: +(sigma * 100).toFixed(2),
        volWindowDays: t.volWindowDays,
        calibratedAt: t.generatedAt,
        horizonUnit: klass.horizonUnit || 'días',
        source: klass.source || t.source
    };
};

const isAvailable = () => load() !== false;
const levelsFor = (assetClass = 'crypto', horizonDays = DEFAULT_HORIZON) => {
    const t = load();
    if (!t) return [];
    return Object.keys(t.assetClasses?.[assetClass]?.horizons?.[horizonDays]?.levels || {}).map(Number);
};

module.exports = { forecast, realizedVol, isAvailable, levelsFor, DEFAULT_HORIZON, DEFAULT_LEVEL };
