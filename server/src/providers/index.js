// Registro de fuentes de datos de mercado. Ver docs/ADR-001-plataforma-multiactivo.md
//
// Contrato que cumple todo provider (MarketDataProvider):
//   getPriceSeries(symbol, periods) -> Promise<number[]>   cierres AJUSTADOS, orden cronológico
//   listUniverse()                  -> Array<{ symbol, name }>
//   meta                            -> { assetClass, tradingCalendar, horizonUnit }
//
// `periods` se cuenta en la unidad del calendario del activo: días naturales en cripto,
// sesiones bursátiles en acciones. Por eso cada provider expone `meta.horizonUnit`.
const cryptoProvider = require('./cryptoProvider');
const equityProvider = require('./equityProvider');

const PROVIDERS = {
    crypto: cryptoProvider,
    equity: equityProvider
};

const get = (assetClass = 'crypto') => PROVIDERS[assetClass] || null;

const listAssetClasses = () => Object.keys(PROVIDERS);

// Una clase de activo está utilizable si su provider tiene lo que necesita (p. ej. API key)
const isReady = (assetClass) => {
    const p = get(assetClass);
    return p ? p.isConfigured() : false;
};

module.exports = { get, listAssetClasses, isReady };
