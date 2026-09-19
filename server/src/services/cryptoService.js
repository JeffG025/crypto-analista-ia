const axios = require('axios');

const BASE_URL = 'https://api.coingecko.com/api/v3';

// ===== CACHÉ TTL EN MEMORIA =====
// Evita saturar CoinGecko cuando varios usuarios piden lo mismo:
// cada respuesta se reutiliza durante su TTL en vez de pedirla de nuevo.
const cache = new Map(); // key -> { data, expiresAt }

const cacheGet = (key) => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
    return entry.data;
};

const cacheSet = (key, data, ttlSeconds) => {
    cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
    // Limpieza ocasional para que no crezca sin límite
    if (cache.size > 500) {
        const now = Date.now();
        for (const [k, v] of cache.entries()) if (now > v.expiresAt) cache.delete(k);
    }
};

const TTL_MARKET = 60;        // precios: 1 min
const TTL_CHART = 300;        // gráficas: 5 min
const TTL_FEAR_GREED = 600;   // índice miedo/codicia: 10 min (se actualiza 1 vez al día)

// Agrega la API key a headers Y params (CoinGecko acepta ambos formatos)
const withApiKey = (params = {}) => {
    const key = process.env.COINGECKO_API_KEY;
    return {
        headers: key ? { 'x-cg-demo-api-key': key } : {},
        params: key ? { ...params, x_cg_demo_api_key: key } : params
    };
};

// 🗺️ DICCIONARIO DE TRADUCCIÓN (Sigla -> ID de CoinGecko)
const ID_MAP = {
    'btc': 'bitcoin',
    'eth': 'ethereum',
    'sol': 'solana',
    'bnb': 'binancecoin',
    'xrp': 'ripple',
    'ada': 'cardano',
    'doge': 'dogecoin',
    'dot': 'polkadot',
    'ltc': 'litecoin',
    'shib': 'shiba-inu',
    'avax': 'avalanche-2',
    'matic': 'matic-network',
    'usdt': 'tether',
    'link': 'chainlink',
    'uni': 'uniswap',
    'atom': 'cosmos',
    'etc': 'ethereum-classic',
    'xlm': 'stellar',
    'bch': 'bitcoin-cash',
    'algo': 'algorand',
    'near': 'near',
    'qnt': 'quant-network',
    'fil': 'filecoin',
    'hed': 'hedera-hashgraph'
};

// Función auxiliar para traducir
const resolveId = (symbol) => {
    if (!symbol) return 'bitcoin';
    const clean = symbol.toLowerCase().trim();
    return ID_MAP[clean] || clean; 
};

// 1. Obtener datos de mercado (Precio, cambio 24h, etc)
const getMarketData = async (coins, currency = 'usd') => {
    try {
        const ids = coins.map(c => resolveId(c)).join(',');

        const cacheKey = `market:${ids}:${currency}`;
        const cached = cacheGet(cacheKey);
        if (cached) return cached;

        console.log(`🔍 Buscando precios para: ${ids} en ${currency}`);

        const { headers, params } = withApiKey({
            vs_currency: currency,
            ids: ids,
            order: 'market_cap_desc',
            sparkline: false
        });
        const response = await axios.get(`${BASE_URL}/coins/markets`, { headers, params });

        if (response.data.length === 0) return [];

        const result = response.data.map(coin => ({
            id: coin.id,
            name: coin.name,
            symbol: coin.symbol,
            current_price: coin.current_price,
            price_change_24h: coin.price_change_percentage_24h,
            market_cap: coin.market_cap,
            image: coin.image,
            high_24h: coin.high_24h,
            low_24h: coin.low_24h
        }));

        cacheSet(`market:${coins.map(c => resolveId(c)).join(',')}:${currency}`, result, TTL_MARKET);
        return result;

    } catch (error) {
        console.error("Error en CoinGecko:", error.message);
        return []; // Retornar array vacío en vez de romper (no se cachean errores)
    }
};

// 2. Obtener historial para gráficas
const getChartHistory = async (coinId, days = 7, currency = 'usd') => {
    const realId = resolveId(coinId);
    const MAX_RETRIES = 3;

    const cacheKey = `chart:${realId}:${days}:${currency}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    console.log(`📊 Obteniendo gráfica para: ${realId} (${days} días)`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const { headers, params } = withApiKey({ vs_currency: currency, days });
            const response = await axios.get(`${BASE_URL}/coins/${realId}/market_chart`, { headers, params });

            const prices = response.data.prices.map(item => ({
                date: new Date(item[0]).toLocaleDateString(),
                price: item[1]
            }));

            const result = { labels: prices.map(p => p.date), data: prices.map(p => p.price) };
            if (result.data.length > 0) cacheSet(cacheKey, result, TTL_CHART);
            return result;

        } catch (error) {
            const is429 = error.response?.status === 429;

            if (is429 && attempt < MAX_RETRIES) {
                const waitSec = 15 * attempt; // 15s, 30s entre reintentos
                console.warn(`⏳ Rate limit CoinGecko (${realId}). Esperando ${waitSec}s... (intento ${attempt}/${MAX_RETRIES})`);
                await new Promise(r => setTimeout(r, waitSec * 1000));
            } else {
                console.error(`Error en gráfica para ${coinId}:`, error.message);
                return { labels: [], data: [] };
            }
        }
    }

    return { labels: [], data: [] };
};

// 2b. Serie histórica cruda [{ t, price }] — con timestamps, para leer el precio de una fecha concreta
const getPriceSeries = async (coinId, days = 200, currency = 'usd') => {
    const realId = resolveId(coinId);

    const cacheKey = `series:${realId}:${days}:${currency}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        const { headers, params } = withApiKey({ vs_currency: currency, days });
        const response = await axios.get(`${BASE_URL}/coins/${realId}/market_chart`, { headers, params });

        const series = response.data.prices.map(([t, price]) => ({ t, price }));
        if (series.length > 0) cacheSet(cacheKey, series, TTL_CHART);
        return series;

    } catch (error) {
        console.error(`Error en serie histórica de ${coinId}:`, error.message);
        return [];
    }
};

// Precio del punto más cercano a un instante dado. null si no hay dato suficientemente cerca
// (la serie no llega tan atrás, o falta el tramo).
// Granularidad de CoinGecko: 2-90 días → horaria | >90 días → diaria. Ajusta la tolerancia
// a la granularidad que hayas pedido; si no, aceptarás un precio de otro día como válido.
const priceAt = (series, timestamp, toleranceMs = 3 * 60 * 60 * 1000) => {
    let best = null, bestDiff = Infinity;
    for (const p of series) {
        const diff = Math.abs(p.t - timestamp);
        if (diff < bestDiff) { bestDiff = diff; best = p; }
    }
    return best && bestDiff <= toleranceMs ? best.price : null;
};

// 3. 🔥 FUNCIÓN RESTAURADA: Índice de Miedo y Codicia
const getFearAndGreed = async () => {
    const cached = cacheGet('feargreed');
    if (cached) return cached;

    try {
        const response = await axios.get('https://api.alternative.me/fng/');
        const result = response.data.data[0];
        cacheSet('feargreed', result, TTL_FEAR_GREED);
        return result;
    } catch (error) {
        console.error("Error obteniendo Fear & Greed:", error.message);
        return { value: 50, value_classification: "Neutral" }; // Valor por defecto si falla
    }
};

module.exports = { getMarketData, getChartHistory, getPriceSeries, priceAt, getFearAndGreed };