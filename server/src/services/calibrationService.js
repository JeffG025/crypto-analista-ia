// Lee la tabla de calibración generada por scripts/calibrate.js.
// Es la única fuente del "% de fiabilidad": acierto histórico medido, nunca calculado a partir del score.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'calibration.json');
const DEFAULT_HORIZON = 7;

let table = null;

const load = () => {
    if (table !== null) return table;
    try {
        table = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {
        console.warn('⚠️  Sin tabla de calibración: no se mostrará fiabilidad. Corre `node scripts/calibrate.js`.');
        table = false;
    }
    return table;
};

// Devuelve la fiabilidad medida de un tipo de señal, o null si no hay dato para ese bucket.
// null es un resultado legítimo: NEUTRAL no anuncia dirección, así que no tiene acierto que medir.
const lookup = (assetClass, signal, horizon = DEFAULT_HORIZON) => {
    const t = load();
    if (!t) return null;

    const h = t.assetClasses?.[assetClass]?.horizons?.[horizon];
    const bucket = h?.buckets?.[signal];
    if (!bucket || bucket.hitRate === null) return null;

    const result = {
        direction: bucket.direction,
        horizonDays: Number(horizon),
        reliability: bucket.hitRate,
        ci95: bucket.ci95,
        baseline: bucket.direction === 'DOWN' ? +(100 - h.baselineUpRate).toFixed(1) : h.baselineUpRate,
        edge: bucket.edge,
        sampleSize: bucket.n,
        calibratedAt: t.generatedAt,
        source: t.source
    };

    result.verdict = verdictOf(result);
    return result;
};

// Dictamen: compara la ventaja contra su propio margen de error.
// Es una regla, no una opinión: si una clase de activo calibra mejor, el veredicto cambia solo.
const verdictOf = (entry) => {
    if (!entry || entry.edge === null || entry.ci95 === null) return null;
    if (entry.edge > entry.ci95) return 'EDGE';        // supera al mercado más allá del ruido
    if (entry.edge < -entry.ci95) return 'WORSE';      // queda por debajo más allá del ruido
    return 'NO_EDGE';                                  // indistinguible del mercado
};

const isAvailable = () => load() !== false;

module.exports = { lookup, verdictOf, isAvailable, DEFAULT_HORIZON };
