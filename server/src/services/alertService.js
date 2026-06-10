const cron = require('node-cron');
const cryptoService = require('./cryptoService');
const alertRepo = require('../db/alertRepo');
const userRepo = require('../db/userRepo');

const fmt = (p) => p.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const checkAlerts = async (bot) => {
    const active = await alertRepo.listAllActive();
    if (active.length === 0) return;

    // Precios actuales de todas las coins con alertas (una sola petición)
    const coins = [...new Set(active.map(a => a.coinId))];
    const marketData = await cryptoService.getMarketData(coins);

    const priceMap = {};
    for (const coin of marketData) {
        if (coin.id) priceMap[coin.id] = coin.current_price;
        priceMap[coin.symbol?.toLowerCase()] = coin.current_price;
        priceMap[coin.name?.toLowerCase()] = coin.current_price;
    }

    for (const alert of active) {
        const currentPrice = priceMap[alert.coinId] ?? priceMap[alert.coinId?.toLowerCase()];
        if (!currentPrice) continue;

        const hit = alert.condition === 'above'
            ? currentPrice >= alert.targetPrice
            : currentPrice <= alert.targetPrice;

        if (!hit) continue;

        await alertRepo.markTriggered(alert.id);

        // Notificar por Telegram: directo si la alerta nació en el bot,
        // o vía cuenta vinculada si nació en la web
        let chatId = alert.telegramChatId || alert.telegramId;
        if (!chatId && alert.userId) {
            const owner = await userRepo.findById(alert.userId);
            chatId = owner?.telegramId || null;
        }

        if (chatId && bot) {
            const emoji = alert.condition === 'above' ? '🚀' : '📉';
            const dirText = alert.condition === 'above' ? 'subió a' : 'bajó a';
            const sourceTag = alert.source === 'web' ? '\n<i>(Alerta creada desde la web)</i>' : '';
            try {
                await bot.telegram.sendMessage(
                    chatId,
                    `${emoji} <b>¡Alerta activada!</b>\n\n` +
                    `<b>${(alert.coinSymbol || alert.coinId).toUpperCase()}</b> ${dirText} <code>$${fmt(currentPrice)}</code>\n` +
                    `Tu objetivo era: <code>$${fmt(alert.targetPrice)}</code>${sourceTag}`,
                    { parse_mode: 'HTML' }
                );
            } catch (err) {
                console.error(`❌ Error notificando alerta ${alert.id}:`, err.message);
            }
        }
    }
};

const startAlertChecker = (bot) => {
    cron.schedule('*/5 * * * *', () => {
        checkAlerts(bot).catch(err => console.error('❌ Error en check de alertas:', err.message));
    });
    console.log('🔔 Sistema de alertas activo (revisión cada 5 min, web + telegram unificadas)');
};

module.exports = { checkAlerts, startAlertChecker };
