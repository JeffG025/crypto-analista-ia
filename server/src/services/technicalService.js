const { RSI, MACD, BollingerBands, SMA } = require('technicalindicators');
const providers = require('../providers');
const calibrationService = require('./calibrationService');
const forecastService = require('./forecastService');

// Usamos 200 días para obtener datos diarios de CoinGecko (>90 días = granularidad diaria)
const DAYS_FOR_ANALYSIS = 200;
const MIN_PRICES = 60;

// Calcula la señal técnica sobre una serie de precios ya obtenida. Pura: mismo input, mismo output.
// La usan analyzeTechnicals (último punto de la serie) y el backtest (cada punto histórico).
const scoreFromPrices = (prices) => {
    const currentPrice = prices[prices.length - 1];

    // --- INDICADORES ---

    // RSI 14 períodos: > 70 sobrecomprado, < 30 sobrevendido
    const rsiValues = RSI.calculate({ values: prices, period: 14 });
    const rsi = rsiValues[rsiValues.length - 1];

    // MACD (12, 26, 9): cruce de señal indica cambio de tendencia
    const macdResult = MACD.calculate({
        values: prices,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });
    const macd = macdResult[macdResult.length - 1];

    // Bandas de Bollinger (20, 2): precio cerca de los extremos indica reversión
    const bbValues = BollingerBands.calculate({ period: 20, values: prices, stdDev: 2 });
    const bb = bbValues[bbValues.length - 1];
    const bbPosition = bb ? (currentPrice - bb.lower) / (bb.upper - bb.lower) : 0.5;

    // Medias móviles: SMA20 y SMA50 (golden cross / death cross)
    const sma20Values = SMA.calculate({ period: 20, values: prices });
    const sma50Values = SMA.calculate({ period: 50, values: prices });
    const sma20 = sma20Values[sma20Values.length - 1];
    const sma50 = sma50Values[sma50Values.length - 1];

    // Cambio de precio últimas 24h (aproximado con datos diarios)
    const priceChange24h = prices.length > 1
        ? ((prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2]) * 100
        : 0;

    // Cambio de precio últimos 7 días
    const priceChange7d = prices.length > 7
        ? ((prices[prices.length - 1] - prices[prices.length - 8]) / prices[prices.length - 8]) * 100
        : 0;

    // --- SISTEMA DE PUNTUACIÓN ---
    let score = 0;
    const signals = [];

    // RSI
    if (rsi < 30) {
        score += 2;
        signals.push(`RSI ${rsi.toFixed(1)}: Sobrevendido — posible rebote alcista`);
    } else if (rsi < 45) {
        score += 1;
        signals.push(`RSI ${rsi.toFixed(1)}: Zona baja, presión compradora`);
    } else if (rsi > 70) {
        score -= 2;
        signals.push(`RSI ${rsi.toFixed(1)}: Sobrecomprado — posible corrección`);
    } else if (rsi > 55) {
        score -= 1;
        signals.push(`RSI ${rsi.toFixed(1)}: Zona alta, presión vendedora`);
    } else {
        signals.push(`RSI ${rsi.toFixed(1)}: Zona neutral`);
    }

    // MACD
    if (macd) {
        if (macd.MACD > macd.signal) {
            score += 1;
            signals.push('MACD por encima de señal: momentum alcista');
        } else if (macd.MACD < macd.signal) {
            score -= 1;
            signals.push('MACD por debajo de señal: momentum bajista');
        }
        if (macd.histogram > 0 && macd.histogram > macdResult[macdResult.length - 2]?.histogram) {
            score += 1;
            signals.push('Histograma MACD creciendo: fuerza alcista');
        } else if (macd.histogram < 0 && macd.histogram < macdResult[macdResult.length - 2]?.histogram) {
            score -= 1;
            signals.push('Histograma MACD cayendo: fuerza bajista');
        }
    }

    // Precio vs Medias Móviles
    if (currentPrice > sma20 && currentPrice > sma50) {
        score += 1;
        signals.push('Precio sobre SMA20 y SMA50: tendencia alcista confirmada');
    } else if (currentPrice < sma20 && currentPrice < sma50) {
        score -= 1;
        signals.push('Precio bajo SMA20 y SMA50: tendencia bajista');
    }

    // Golden/Death Cross (SMA20 vs SMA50)
    if (sma20 > sma50) {
        score += 1;
        signals.push('SMA20 > SMA50: Golden Cross activo (alcista)');
    } else {
        score -= 1;
        signals.push('SMA20 < SMA50: Death Cross activo (bajista)');
    }

    // Bandas de Bollinger
    if (bb) {
        if (bbPosition < 0.15) {
            score += 2;
            signals.push('Precio en banda inferior de Bollinger: zona de compra');
        } else if (bbPosition < 0.3) {
            score += 1;
            signals.push('Precio cerca de banda inferior: posible rebote');
        } else if (bbPosition > 0.85) {
            score -= 2;
            signals.push('Precio en banda superior de Bollinger: zona de sobrecompra');
        } else if (bbPosition > 0.7) {
            score -= 1;
            signals.push('Precio cerca de banda superior: posible corrección');
        }
    }

    // --- SEÑAL FINAL ---
    // Describen lo que dicen los indicadores, no lo que el usuario debería hacer:
    // el backtest (server/scripts/) no encontró ventaja predictiva en esta regla.
    let signal, emoji, verdict;
    if (score >= 3) {
        signal = 'ALCISTA FUERTE'; emoji = '🟢';
        verdict = '📈 Lectura alcista fuerte — la mayoría de los indicadores apuntan al alza.';
    } else if (score >= 1) {
        signal = 'ALCISTA'; emoji = '🟢';
        verdict = '📈 Lectura alcista — predominan los indicadores positivos.';
    } else if (score <= -3) {
        signal = 'BAJISTA FUERTE'; emoji = '🔴';
        verdict = '📉 Lectura bajista fuerte — la mayoría de los indicadores apuntan a la baja.';
    } else if (score <= -1) {
        signal = 'BAJISTA'; emoji = '🔴';
        verdict = '📉 Lectura bajista — predomina la presión vendedora.';
    } else {
        signal = 'NEUTRAL'; emoji = '🟡';
        verdict = '↔️ Sin lectura clara — los indicadores están mixtos.';
    }

    // Qué tan de acuerdo están los indicadores entre sí. NO es una tasa de acierto:
    // no sale de ningún historial, sale solo de |score|. La tasa de acierto real y
    // medida está en /api/signals (stats.hitRate).
    const MAX_SCORE = 8;
    const agreement = Math.round(Math.min(40 + (Math.abs(score) / MAX_SCORE) * 40, 80));

    return {
        currentPrice,
        priceChange24h: priceChange24h.toFixed(2),
        priceChange7d: priceChange7d.toFixed(2),
        rsi: rsi.toFixed(2),
        macd: macd ? {
            value: macd.MACD?.toFixed(4),
            signal: macd.signal?.toFixed(4),
            histogram: macd.histogram?.toFixed(4)
        } : null,
        bollingerBands: bb ? {
            upper: bb.upper?.toFixed(2),
            middle: bb.middle?.toFixed(2),
            lower: bb.lower?.toFixed(2),
            position: (bbPosition * 100).toFixed(1)
        } : null,
        sma20: sma20?.toFixed(2),
        sma50: sma50?.toFixed(2),
        signals,
        score,
        signal,
        emoji,
        verdict,
        agreement
    };
};

const analyzeTechnicals = async (coinId, assetClass = 'crypto') => {
    const provider = providers.get(assetClass);
    if (!provider) throw new Error(`Clase de activo desconocida: ${assetClass}`);

    const prices = await provider.getPriceSeries(coinId, DAYS_FOR_ANALYSIS);

    if (!prices || prices.length < MIN_PRICES) {
        throw new Error(`Datos insuficientes para analizar ${coinId}. Mínimo ${MIN_PRICES} días requeridos.`);
    }

    const ta = scoreFromPrices(prices);
    // La fiabilidad sale de la tabla de calibración, no del score: es acierto histórico medido.
    const directional = calibrationService.lookup(assetClass, ta.signal);
    // Banda de precio con cobertura verificada fuera de muestra
    const band = forecastService.forecast(prices, { assetClass });

    return { coinId, assetClass, ...ta, directional, band };
};

// Texto único de descargo, para que bot y web digan exactamente lo mismo
const DISCLAIMER = 'Herramienta de análisis, no de recomendación. Estos indicadores describen ' +
    'el comportamiento reciente del precio; no predicen el futuro. No es consejo financiero.';

module.exports = { analyzeTechnicals, scoreFromPrices, MIN_PRICES, DAYS_FOR_ANALYSIS, DISCLAIMER };
