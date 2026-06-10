const cron = require('node-cron');
const cryptoService = require('../services/cryptoService');

const TOP_COINS = ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple'];

const escapeHTML = (text) => {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

const sendDailySummary = async (bot) => {
    const channelId = process.env.TELEGRAM_CHANNEL_ID;
    if (!channelId) return;

    console.log('📋 Generando resumen diario...');

    const [coins, fearGreed] = await Promise.all([
        cryptoService.getMarketData(TOP_COINS),
        cryptoService.getFearAndGreed()
    ]);

    if (!coins || coins.length === 0) {
        console.warn('⚠️  No se pudo obtener datos para el resumen diario.');
        return;
    }

    // Ordenar por rendimiento 24h
    const sorted = [...coins].sort((a, b) => b.price_change_24h - a.price_change_24h);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    const fgValue = parseInt(fearGreed.value);
    let fgEmoji = '😐';
    if (fgValue <= 25) fgEmoji = '😱';
    else if (fgValue <= 45) fgEmoji = '😨';
    else if (fgValue >= 75) fgEmoji = '🤑';
    else if (fgValue >= 55) fgEmoji = '😏';

    const now = new Date().toLocaleDateString('es-MX', {
        timeZone: process.env.TIMEZONE || 'America/Mexico_City',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    let message = `🌅 <b>Resumen del Mercado — CryptoMind</b>\n`;
    message += `📅 <i>${now}</i>\n`;
    message += `━━━━━━━━━━━━━━━━━━━\n\n`;

    // Fear & Greed
    message += `${fgEmoji} <b>Sentimiento del mercado:</b>\n`;
    message += `Fear &amp; Greed: <code>${fearGreed.value}/100 — ${escapeHTML(fearGreed.value_classification)}</code>\n\n`;

    // Top coins
    message += `<b>📊 Mercado hoy:</b>\n`;
    for (const coin of coins) {
        const change = coin.price_change_24h;
        const emoji = change >= 0 ? '📈' : '📉';
        const sign = change >= 0 ? '+' : '';
        const price = coin.current_price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        message += `${emoji} <b>${escapeHTML(coin.symbol.toUpperCase())}</b> <code>$${price}</code> <code>${sign}${change?.toFixed(2)}%</code>\n`;
    }

    // Destacados del día
    message += `\n<b>🏆 Mejor del día:</b> ${escapeHTML(best.name)} <code>+${best.price_change_24h?.toFixed(2)}%</code>\n`;
    message += `<b>📉 Peor del día:</b> ${escapeHTML(worst.name)} <code>${worst.price_change_24h?.toFixed(2)}%</code>\n`;

    message += `\n━━━━━━━━━━━━━━━━━━━\n`;
    message += `<i>⚠️ Esto no es consejo financiero.</i>`;

    try {
        await bot.telegram.sendMessage(channelId, message, { parse_mode: 'HTML' });
        console.log('✅ Resumen diario publicado en el canal');
    } catch (err) {
        console.error('❌ Error enviando resumen diario:', err.message);
    }
};

const startDailySummary = (bot) => {
    // Cada día a las 9am (zona horaria configurada en el servidor)
    const cronExpression = process.env.DAILY_SUMMARY_CRON || '0 9 * * *';

    cron.schedule(cronExpression, () => {
        sendDailySummary(bot).catch(err => console.error('❌ Error en resumen diario:', err.message));
    }, {
        timezone: process.env.TIMEZONE || 'America/Mexico_City'
    });

    console.log(`🌅 Resumen diario activo (cron: "${cronExpression}")`);
};

module.exports = { startDailySummary, sendDailySummary };
