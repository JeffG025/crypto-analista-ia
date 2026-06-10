const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant"
];

const buildSystemPrompt = (lang = 'es') => `Eres el cerebro de una app financiera de criptomonedas.
Tu única función es responder en JSON válido con uno de estos cuatro formatos:

1. Gráfica de precio: { "type": "chart", "coins": ["bitcoin"], "days": 30, "reply": "descripción breve" }
2. Comparación: { "type": "comparison", "coins": ["bitcoin", "ethereum"], "days": 30, "reply": "descripción breve" }
3. Predicción o señal de trading: { "type": "prediction", "coins": ["bitcoin"], "reply": "Analizando indicadores técnicos..." }
4. Texto: { "type": "text", "reply": "respuesta completa aquí" }

Reglas:
- Responde SIEMPRE en JSON. Nunca texto plano.
- Para gráficas o precios históricos usa type "chart" o "comparison".
- Para preguntas como "¿subirá?", "¿es buen momento para comprar?", "señal de trading", "predicción" usa type "prediction".
- Los nombres de coins deben ser IDs de CoinGecko (bitcoin, ethereum, solana, etc.).
- ${lang === 'en' ? 'Write all "reply" texts in English.' : 'Escribe todos los textos de "reply" en español.'}`;

// Detecta la intención del usuario y devuelve el tipo de respuesta
const analyzeIntent = async (userMessage, history = [], lang = 'es') => {
    const messages = [
        { role: "system", content: buildSystemPrompt(lang) },
        ...history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        })),
        { role: "user", content: userMessage }
    ];

    let lastError = null;

    for (const model of MODELS) {
        try {
            const completion = await groq.chat.completions.create({
                model,
                messages,
                response_format: { type: "json_object" },
                temperature: 0.3,
                max_tokens: 1024
            });

            const text = completion.choices[0].message.content;
            console.log(`✅ Groq (${model}) respondió correctamente`);
            return JSON.parse(text);

        } catch (error) {
            console.warn(`⚠️  ${model} falló: ${error.message}`);
            lastError = error;
        }
    }

    console.error('❌ Groq no disponible:', lastError?.message);
    return { type: "text", reply: "Error de conexión con la IA. Intenta de nuevo en unos segundos." };
};

// Genera un análisis en lenguaje natural a partir de los datos técnicos calculados
const generatePrediction = async (technicalData, lang = 'es') => {
    const langInstruction = lang === 'en'
        ? 'Write 3-4 sentences in English: explain what the most relevant indicators say and what they suggest for the short term. Be direct and specific with the numbers. Always end with: "⚠️ This is not financial advice."'
        : 'Escribe 3-4 oraciones en español: explica qué dicen los indicadores más relevantes y qué sugieren para el corto plazo. Sé directo y específico con los números. Termina siempre con: "⚠️ Esto no es consejo financiero."';

    const prompt = `Analiza estos indicadores técnicos de ${technicalData.coinId.toUpperCase()} y da una predicción clara para las próximas 24-72 horas.

Datos:
- Precio actual: $${technicalData.currentPrice}
- Cambio 24h: ${technicalData.priceChange24h}%
- Cambio 7d: ${technicalData.priceChange7d}%
- RSI (14): ${technicalData.rsi}
- MACD: valor=${technicalData.macd?.value}, señal=${technicalData.macd?.signal}, histograma=${technicalData.macd?.histogram}
- Bollinger Bands: superior=$${technicalData.bollingerBands?.upper}, media=$${technicalData.bollingerBands?.middle}, inferior=$${technicalData.bollingerBands?.lower} (posición: ${technicalData.bollingerBands?.position}%)
- SMA20: $${technicalData.sma20}
- SMA50: $${technicalData.sma50}
- Señales detectadas: ${technicalData.signals.join(' | ')}
- Puntuación técnica: ${technicalData.score} → ${technicalData.signal}

${langInstruction}`;

    const messages = [
        { role: "system", content: lang === 'en'
            ? "You are an expert cryptocurrency technical analyst. Reply in English, concisely and directly with the provided data."
            : "Eres un analista técnico de criptomonedas experto. Responde en español, de forma concisa y directa con los datos proporcionados." },
        { role: "user", content: prompt }
    ];

    for (const model of MODELS) {
        try {
            const completion = await groq.chat.completions.create({
                model,
                messages,
                temperature: 0.4,
                max_tokens: 512
            });
            return completion.choices[0].message.content;
        } catch (error) {
            console.warn(`⚠️  ${model} falló en predicción: ${error.message}`);
        }
    }

    return "No se pudo generar el análisis. Intenta de nuevo.";
};

module.exports = { analyzeIntent, generatePrediction };
