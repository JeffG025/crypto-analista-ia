// Fuente de datos de acciones: EODHD (https://eodhd.com/financial-apis/api-for-historical-data-and-volumes)
//
// Requiere EODHD_API_TOKEN. El plan gratuito de la mayoría de proveedores de datos de mercado
// PROHÍBE el uso comercial, y CryptoMind cobra suscripción — hace falta un plan de pago.
// Ver docs/ADR-001 para la comparativa y el coste.
//
// Usa SIEMPRE `adjusted_close`: sin ajustar, un split de 4:1 aparece como una caída del 75%
// y destruye todos los indicadores técnicos.
const axios = require('axios');

const BASE = 'https://eodhd.com/api/eod';
const DAY_MS = 24 * 60 * 60 * 1000;

// Un año bursátil son ~252 sesiones en ~365 días naturales. Pedimos margen de sobra
// para que festivos y fines de semana no dejen la serie corta.
const CALENDAR_MARGIN = 1.6;

const meta = {
    assetClass: 'equity',
    tradingCalendar: 'US (NYSE/Nasdaq)',   // no cotiza fines de semana ni festivos
    horizonUnit: 'sesiones'
};

// Universo inicial: large caps líquidas y diversificadas por sector.
// EODHD usa sufijo de mercado: AAPL.US
const UNIVERSE = [
    { symbol: 'AAPL.US', name: 'Apple' },
    { symbol: 'MSFT.US', name: 'Microsoft' },
    { symbol: 'NVDA.US', name: 'NVIDIA' },
    { symbol: 'AMZN.US', name: 'Amazon' },
    { symbol: 'GOOGL.US', name: 'Alphabet' },
    { symbol: 'META.US', name: 'Meta' },
    { symbol: 'TSLA.US', name: 'Tesla' },
    { symbol: 'JPM.US', name: 'JPMorgan Chase' },
    { symbol: 'JNJ.US', name: 'Johnson & Johnson' },
    { symbol: 'XOM.US', name: 'Exxon Mobil' }
];

const isConfigured = () => Boolean(process.env.EODHD_API_TOKEN);

// Devuelve los cierres ajustados de las últimas `periods` SESIONES, en orden cronológico
const getPriceSeries = async (symbol, periods = 200) => {
    const token = process.env.EODHD_API_TOKEN;
    if (!token) {
        throw new Error('Falta EODHD_API_TOKEN. La vertical de acciones necesita un plan de pago: el tier gratuito de los proveedores de datos de mercado no permite uso comercial.');
    }

    const from = new Date(Date.now() - Math.ceil(periods * CALENDAR_MARGIN) * DAY_MS)
        .toISOString().slice(0, 10);

    const res = await axios.get(`${BASE}/${encodeURIComponent(symbol)}`, {
        params: { api_token: token, from, period: 'd', order: 'a', fmt: 'json' },
        timeout: 20000
    });

    if (!Array.isArray(res.data)) throw new Error(`${symbol}: respuesta inesperada de EODHD`);

    return res.data
        .map(r => r.adjusted_close)
        .filter(p => p !== null && p !== undefined && isFinite(p))
        .slice(-periods);
};

const listUniverse = () => UNIVERSE;

module.exports = { meta, getPriceSeries, listUniverse, isConfigured };
