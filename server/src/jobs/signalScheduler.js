const cron = require('node-cron');
const technicalService = require('../services/technicalService');
const signalRepo = require('../db/signalRepo');

const COINS_TO_SCAN = [
    'bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple',
    'cardano', 'avalanche-2', 'chainlink', 'polkadot', 'dogecoin'
];

const SYMBOLS = {
    bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', binancecoin: 'BNB',
    ripple: 'XRP', cardano: 'ADA', 'avalanche-2': 'AVAX', chainlink: 'LINK',
    polkadot: 'DOT', dogecoin: 'DOGE'
};

const MIN_SCORE_TO_NOTIFY = 1;
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutos

let lastScanTime = null;
let lastPublishedMsgId = null;

const escapeHTML = (text) => {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

const getChannelUrl = () => {
    if (process.env.TELEGRAM_CHANNEL_URL) return process.env.TELEGRAM_CHANNEL_URL;
    const channelId = process.env.TELEGRAM_CHANNEL_ID;
    if (channelId?.startsWith('@')) return `https://t.me/${channelId.slice(1)}`;
    return null;
};

const getLastMessageUrl = () => {
    const base = getChannelUrl();
    if (!base || !lastPublishedMsgId) return base;
    return `${base}/${lastPublishedMsgId}`;
};

const isOnCooldown = () => lastScanTime && (Date.now() - lastScanTime) < COOLDOWN_MS;

const minutesUntilReady = () => {
    if (!lastScanTime) return 0;
    return Math.ceil((COOLDOWN_MS - (Date.now() - lastScanTime)) / 60000);
};

const buildMessage = (results) => {
    const now = new Date().toLocaleString('es-MX', {
        timeZone: process.env.TIMEZONE || 'America/Mexico_City',
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    let message = `🔍 <b>Scanner de Mercado — CryptoMind</b>\n`;
    message += `🕐 <i>${now}</i>\n`;
    message += `━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const ta of results) {
        const changeEmoji = parseFloat(ta.priceChange24h) >= 0 ? '📈' : '📉';
        const price = parseFloat(ta.currentPrice).toLocaleString('es-MX', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        message += `${ta.emoji} <b>${ta.coinId.toUpperCase()} — ${escapeHTML(ta.signal)}</b>\n`;
        message += `💰 <code>$${price}</code>  ${changeEmoji} <code>${ta.priceChange24h}%</code>\n`;
        message += `📌 ${escapeHTML(ta.verdict)}\n`;
        message += `📡 Fiabilidad: <b>${ta.reliability}%</b>\n\n`;
    }

    message += `━━━━━━━━━━━━━━━━━━━\n`;
    message += `<i>⚠️ Esto no es consejo financiero. Invierte solo lo que estés dispuesto a perder.</i>`;
    return message;
};

const runScanner = async (bot) => {
    const channelId = process.env.TELEGRAM_CHANNEL_ID;

    if (!channelId) {
        console.warn('⚠️  TELEGRAM_CHANNEL_ID no configurado. Scanner desactivado.');
        return;
    }

    lastScanTime = Date.now();
    console.log('🔍 Scanner iniciado — analizando top 10 criptos...');

    const results = [];

    for (const coin of COINS_TO_SCAN) {
        try {
            const ta = await technicalService.analyzeTechnicals(coin);
            if (Math.abs(ta.score) >= MIN_SCORE_TO_NOTIFY) results.push(ta);
            console.log(`   ${ta.emoji} ${coin}: score ${ta.score}`);
            const delay = process.env.COINGECKO_API_KEY ? 2000 : 7000;
            await new Promise(r => setTimeout(r, delay));
        } catch (err) {
            console.warn(`   ⚠️  Error analizando ${coin}: ${err.message}`);
        }
    }

    console.log(`🏁 Scanner terminado. Señales encontradas: ${results.length}`);

    if (results.length === 0) {
        console.log('ℹ️  Sin señales fuertes esta ronda. No se publicó nada.');
        return;
    }

    results.sort((a, b) => b.score - a.score);
    const message = buildMessage(results);

    try {
        const sent = await bot.telegram.sendMessage(channelId, message, { parse_mode: 'HTML' });
        lastPublishedMsgId = sent.message_id;
        console.log(`✅ Señales publicadas en el canal (${results.length} alertas)`);

        // Registrar en el historial público de señales (solo las publicadas)
        for (const ta of results) {
            try {
                await signalRepo.create({
                    coinId: ta.coinId,
                    coinSymbol: SYMBOLS[ta.coinId] || ta.coinId.toUpperCase(),
                    signal: ta.signal,
                    emoji: ta.emoji,
                    score: ta.score,
                    reliability: ta.reliability,
                    priceAtSignal: parseFloat(ta.currentPrice),
                    verdict: ta.verdict,
                });
            } catch (err) {
                console.warn(`⚠️  No se pudo guardar señal de ${ta.coinId}: ${err.message}`);
            }
        }
    } catch (err) {
        console.error('❌ Error enviando al canal:', err.message);
    }
};

const startScheduler = (bot) => {
    const cronExpression = process.env.SIGNAL_CRON || '0 */6 * * *';

    if (!cron.validate(cronExpression)) {
        console.error(`❌ SIGNAL_CRON inválido: "${cronExpression}".`);
    }

    cron.schedule(cronExpression, () => {
        runScanner(bot).catch(err => console.error('❌ Error en scanner:', err.message));
    });

    console.log(`⏰ Scanner automático activo (cron: "${cronExpression}")`);
};

module.exports = { startScheduler, runScanner, getLastMessageUrl, getChannelUrl, isOnCooldown, minutesUntilReady };
