const cron = require('node-cron');
const { generateTweet } = require('../services/contentGenerator');
const twitterService = require('../services/twitterService');

// Genera el tweet del día y lo manda al admin por Telegram para aprobar con un tap.
// Si TWITTER_AUTO_PUBLISH=true, lo publica directo sin revisión.

const ADMIN_ID = process.env.BOT_ADMIN_ID;
const AUTO_PUBLISH = process.env.TWITTER_AUTO_PUBLISH === 'true';
const CRON = process.env.MARKETING_CRON || '0 13 * * *'; // 13:00 por defecto (zona del server, UTC en Render)
const TZ = process.env.TIMEZONE || 'America/Mexico_City';

// Tweets pendientes de aprobación: id -> texto
const pending = new Map();
let seq = 1;

const buildKeyboard = (id) => ({
    inline_keyboard: [[
        { text: '✅ Publicar', callback_data: `twpub:${id}` },
        { text: '🔄 Otra versión', callback_data: 'twgen' },
        { text: '❌ Descartar', callback_data: `twdis:${id}` },
    ]],
});

// Genera y enruta (auto-publica o manda a aprobar)
const runDailyContent = async (bot, dayIndex = null) => {
    const idx = dayIndex !== null ? dayIndex : new Date().getDay();
    const { text, angle } = await generateTweet(idx);

    if (AUTO_PUBLISH && twitterService.isConfigured()) {
        const res = await twitterService.postTweet(text);
        if (ADMIN_ID && bot) {
            await bot.telegram.sendMessage(ADMIN_ID,
                `🐦 <b>Publicado en X automáticamente</b> (${angle})\n\n${escapeHTML(text)}\n\n<a href="${res.url}">Ver en X</a>`,
                { parse_mode: 'HTML', disable_web_page_preview: true });
        }
        return { published: true, url: res.url };
    }

    // Modo aprobación: guardar y mandar al admin
    const id = seq++;
    pending.set(id, text);
    // No acumular pendientes viejos
    if (pending.size > 20) pending.delete([...pending.keys()][0]);

    if (ADMIN_ID && bot) {
        const chars = text.length;
        await bot.telegram.sendMessage(ADMIN_ID,
            `🐦 <b>Tweet del día</b> — ángulo: <i>${angle}</i> (${chars}/280)\n\n` +
            `${escapeHTML(text)}\n\n` +
            `${twitterService.isConfigured() ? 'Toca <b>Publicar</b> para enviarlo a X.' : '⚠️ X no está configurado: copia y publica manual.'}`,
            { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: buildKeyboard(id) });
    }
    return { published: false, id };
};

// Publica un pendiente por id (lo llama el botón de Telegram)
const publishPending = async (id) => {
    const text = pending.get(Number(id));
    if (!text) throw new Error('Ese contenido ya no está disponible (genera uno nuevo con /contenido).');
    const res = await twitterService.postTweet(text);
    pending.delete(Number(id));
    return res;
};

const discardPending = (id) => pending.delete(Number(id));

const escapeHTML = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const startMarketingScheduler = (bot) => {
    if (!cron.validate(CRON)) {
        console.error(`❌ MARKETING_CRON inválido: "${CRON}"`);
        return;
    }
    cron.schedule(CRON, () => {
        runDailyContent(bot).catch(err => console.error('❌ Error en contenido diario:', err.message));
    }, { timezone: TZ });

    console.log(`📣 Asistente de contenido activo (cron: "${CRON}" ${TZ}, ${AUTO_PUBLISH ? 'AUTO-publica' : 'requiere aprobación'})`);
};

module.exports = { startMarketingScheduler, runDailyContent, publishPending, discardPending };
