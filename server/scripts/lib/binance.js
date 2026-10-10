// Descarga de velas diarias de Binance, compartida por los scripts de calibración.
const axios = require('axios');

// Mismas 10 monedas del scanner, en su par USDT de Binance
const SYMBOLS = {
    BTCUSDT: 'bitcoin', ETHUSDT: 'ethereum', SOLUSDT: 'solana',
    BNBUSDT: 'binancecoin', XRPUSDT: 'ripple', ADAUSDT: 'cardano',
    AVAXUSDT: 'avalanche-2', LINKUSDT: 'chainlink', DOTUSDT: 'polkadot',
    DOGEUSDT: 'dogecoin'
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Devuelve [{ t, price }] con el cierre diario de los últimos `years` años
const fetchKlines = async (symbol, years = 5) => {
    let cursor = Date.now() - years * 365 * DAY_MS;
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

module.exports = { SYMBOLS, HOSTS, DAY_MS, sleep, fetchKlines };
