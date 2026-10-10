// Descarga de series diarias de acciones para los scripts de CALIBRACIÓN.
//
// ⚠️  SOLO INVESTIGACIÓN. Este endpoint de Yahoo Finance no es oficial ni está licenciado para
// uso comercial. Sirve para medir si la señal y las bandas calibran en bolsa; NO debe alimentar
// el producto en producción. Para eso hay que contratar un proveedor con API key y licencia
// (Financial Modeling Prep, Twelve Data, Finnhub, Polygon) e implementar `equityProvider`
// contra la interfaz MarketDataProvider descrita en docs/ADR-001.
//
// Usa SIEMPRE cierre ajustado: sin ajustar, un split de 4:1 aparece como una caída del 75%
// y destruye todos los indicadores técnicos.
const axios = require('axios');

// Universo de prueba: 10 large caps líquidas y diversificadas por sector.
// ⚠️ Sesgo de supervivencia: son las grandes de HOY, así que el baseline direccional queda
// inflado al alza. Afecta poco a la calibración de bandas (volatilidad), mucho al acierto direccional.
const SYMBOLS = {
    AAPL: 'apple', MSFT: 'microsoft', NVDA: 'nvidia', AMZN: 'amazon', GOOGL: 'alphabet',
    META: 'meta', TSLA: 'tesla', JPM: 'jpmorgan', JNJ: 'johnson-johnson', XOM: 'exxon'
};

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Devuelve [{ t, price }] con el cierre AJUSTADO de cada sesión bursátil
const fetchSeries = async (symbol, years = 5) => {
    const res = await axios.get(`${BASE}/${symbol}`, {
        params: { range: `${years}y`, interval: '1d', events: 'div,split' },
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const result = res.data?.chart?.result?.[0];
    if (!result) throw new Error(`${symbol}: respuesta sin datos`);

    const ts = result.timestamp || [];
    const adj = result.indicators?.adjclose?.[0]?.adjclose || [];
    if (adj.length === 0) throw new Error(`${symbol}: sin cierre ajustado`);

    const out = [];
    for (let i = 0; i < ts.length; i++) {
        const price = adj[i];
        if (price === null || price === undefined || !isFinite(price)) continue;   // sesiones sin dato
        out.push({ t: ts[i] * 1000, price });
    }

    return out;
};

module.exports = { SYMBOLS, sleep, fetchSeries };
