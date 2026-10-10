// Fuente de datos de criptomonedas: envuelve el cryptoService existente (CoinGecko).
// No cambia comportamiento: usa el mismo getChartHistory que ya usaba technicalService.
const cryptoService = require('../services/cryptoService');

const meta = {
    assetClass: 'crypto',
    tradingCalendar: '24/7',        // cripto no cierra: los períodos son días naturales
    horizonUnit: 'días'
};

// 10 monedas del scanner. Los ids son de CoinGecko.
const UNIVERSE = [
    { symbol: 'bitcoin', name: 'Bitcoin' },
    { symbol: 'ethereum', name: 'Ethereum' },
    { symbol: 'solana', name: 'Solana' },
    { symbol: 'binancecoin', name: 'BNB' },
    { symbol: 'ripple', name: 'XRP' },
    { symbol: 'cardano', name: 'Cardano' },
    { symbol: 'avalanche-2', name: 'Avalanche' },
    { symbol: 'chainlink', name: 'Chainlink' },
    { symbol: 'polkadot', name: 'Polkadot' },
    { symbol: 'dogecoin', name: 'Dogecoin' }
];

const getPriceSeries = async (symbol, periods = 200) => {
    const history = await cryptoService.getChartHistory(symbol, periods);
    return history?.data || [];
};

const listUniverse = () => UNIVERSE;

// CoinGecko funciona sin key (con límites más bajos), así que siempre está disponible
const isConfigured = () => true;

module.exports = { meta, getPriceSeries, listUniverse, isConfigured };
