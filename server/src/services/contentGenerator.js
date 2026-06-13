const Groq = require('groq-sdk');
const cryptoService = require('./cryptoService');
const signalRepo = require('../db/signalRepo');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

const SITE = (process.env.FRONTEND_URL || 'https://crypto-analista-ia.vercel.app').replace(/\/+$/, '');
const CHANNEL = process.env.TELEGRAM_CHANNEL_URL || 'https://t.me/CryptAnalista';

const SYMBOLS = {
    bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', binancecoin: 'BNB', ripple: 'XRP',
    cardano: 'ADA', 'avalanche-2': 'AVAX', chainlink: 'LINK', polkadot: 'DOT', dogecoin: 'DOGE'
};

const fgLabel = (v) => {
    v = parseInt(v);
    if (v <= 25) return 'Miedo extremo';
    if (v <= 45) return 'Miedo';
    if (v <= 55) return 'Neutral';
    if (v <= 75) return 'Codicia';
    return 'Codicia extrema';
};

// 5 ángulos que rotan por día para que la cuenta no se sienta repetitiva
const ANGLES = [
    { key: 'analisis',    instr: 'Análisis técnico de UNA moneda con datos reales (RSI, tendencia). Termina invitando a ver el análisis completo gratis.' },
    { key: 'educativo',   instr: 'Tip educativo corto sobre trading/indicadores para principiantes. Aporta valor real, sin vender duro.' },
    { key: 'feargreed',   instr: 'Comenta el sentimiento del mercado (Fear & Greed de hoy) con una reflexión útil. Pregunta abierta al final para generar respuestas.' },
    { key: 'transparencia', instr: 'Habla de la transparencia: el historial de señales es público, incluso los fallos. Posiciona honestidad vs los "gurús".' },
    { key: 'resumen',     instr: 'Resumen del scanner: cuántas señales, efectividad. Enfatiza que todo queda registrado público.' },
];

// Reúne datos reales del día para alimentar a la IA
const gatherContext = async () => {
    const coins = ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'cardano'];
    const [market, fg, signals] = await Promise.all([
        cryptoService.getMarketData(coins, 'usd').catch(() => []),
        cryptoService.getFearAndGreed().catch(() => null),
        signalRepo.list(30).catch(() => []),
    ]);

    // Efectividad real de las señales registradas (vs precio actual)
    let evaluated = 0, hits = 0, best = null;
    if (signals.length) {
        const priceMap = {};
        for (const c of market) if (c.id) priceMap[c.id] = c.current_price;
        // completar precios faltantes con una segunda consulta puntual evitada por simplicidad
        for (const s of signals) {
            const cur = priceMap[s.coinId];
            if (!cur) continue;
            const chg = ((cur - s.priceAtSignal) / s.priceAtSignal) * 100;
            const bullish = s.signal.includes('ALCISTA');
            const hit = bullish ? chg > 0 : chg < 0;
            evaluated++;
            if (hit) hits++;
            if (!best || Math.abs(chg) > Math.abs(best.chg)) best = { sym: s.coinSymbol, chg };
        }
    }

    return {
        market: market.map(c => ({
            sym: c.symbol?.toUpperCase(),
            price: c.current_price,
            chg24: c.price_change_24h,
        })),
        fearGreed: fg ? { value: fg.value, label: fgLabel(fg.value) } : null,
        signals: {
            total: signals.length,
            hitRate: evaluated ? Math.round((hits / evaluated) * 100) : null,
            best,
        },
    };
};

const buildPrompt = (angle, ctx) => {
    const top = ctx.market.slice(0, 4)
        .map(c => `${c.sym}: $${c.price} (${c.chg24 >= 0 ? '+' : ''}${c.chg24?.toFixed(1)}% 24h)`)
        .join(', ');

    return `Eres el community manager de CryptoMind, una herramienta de análisis crypto con IA.
Escribe UN tweet en español de México para hoy.

ÁNGULO DE HOY: ${angle.instr}

DATOS REALES (úsalos, no inventes):
- Precios: ${top || 'no disponibles'}
- Fear & Greed: ${ctx.fearGreed ? `${ctx.fearGreed.value}/100 (${ctx.fearGreed.label})` : 'no disponible'}
- Señales registradas: ${ctx.signals.total}${ctx.signals.hitRate !== null ? `, efectividad ${ctx.signals.hitRate}%` : ''}
${ctx.signals.best ? `- Mejor señal reciente: ${ctx.signals.best.sym} ${ctx.signals.best.chg >= 0 ? '+' : ''}${ctx.signals.best.chg.toFixed(1)}%` : ''}

REGLAS ESTRICTAS:
- Máximo 240 caracteres (debe caber con un link de 23 chars).
- NUNCA prometas ganancias ni uses "vas a ganar", "seguro sube", "hazte rico". Es ilegal y rompe políticas.
- Usa máximo 2-3 emojis relevantes.
- Incluye 1-2 hashtags al final: elige entre #Bitcoin #CriptoEspañol #BitcoinMexico #Crypto #Trading.
- NO incluyas el link (se añade automáticamente después).
- Tono cercano, experto, honesto. Nada de mayúsculas gritadas.
- Devuelve SOLO el texto del tweet, sin comillas ni explicaciones.`;
};

// Genera el texto del tweet del día. dayIndex permite rotar el ángulo.
const generateTweet = async (dayIndex = 0) => {
    const angle = ANGLES[dayIndex % ANGLES.length];
    const ctx = await gatherContext();
    const prompt = buildPrompt(angle, ctx);

    let text = null;
    for (const model of MODELS) {
        try {
            const completion = await groq.chat.completions.create({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8,
                max_tokens: 160,
            });
            text = completion.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
            break;
        } catch (err) {
            console.warn(`⚠️  contentGenerator ${model} falló: ${err.message}`);
        }
    }

    if (!text) {
        // Fallback sin IA: plantilla con datos reales
        text = ctx.signals.hitRate !== null
            ? `📊 El scanner lleva ${ctx.signals.total} señales con ${ctx.signals.hitRate}% de efectividad — todas registradas en público, también los fallos. #CriptoEspañol`
            : `📊 Análisis técnico crypto con IA, gratis y en español. Historial de señales público. #Bitcoin #CriptoEspañol`;
    }

    // Añadir link (alterna entre web y canal según el ángulo)
    const link = angle.key === 'feargreed' || angle.key === 'resumen' ? CHANNEL : SITE;
    const full = `${text}\n${link}`;

    return { text: full, angle: angle.key };
};

module.exports = { generateTweet, ANGLES };
