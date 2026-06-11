const { supabase, enabled } = require('./supabase');

// ===== Fallback en memoria =====
const memCodes = new Map(); // code -> { telegram_id, telegram_username, telegram_chat_id, expires_at }

const EXPIRY_MINUTES = 10;

const generateCode = () => {
    // 6 caracteres legibles (sin 0/O, 1/I/L para evitar confusiones)
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
};

const createCode = async (telegramId, telegramUsername, telegramChatId) => {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString();

    if (!enabled) {
        memCodes.set(code, {
            telegram_id: telegramId,
            telegram_username: telegramUsername,
            telegram_chat_id: telegramChatId,
            expires_at: expiresAt,
        });
        return { code, expiresInMinutes: EXPIRY_MINUTES };
    }

    // Limpieza oportunista: borra códigos expirados para que la tabla no crezca
    await supabase.from('link_codes').delete().lt('expires_at', new Date().toISOString());

    const { error } = await supabase.from('link_codes').insert({
        code,
        telegram_id: telegramId,
        telegram_username: telegramUsername,
        telegram_chat_id: telegramChatId,
        expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);
    return { code, expiresInMinutes: EXPIRY_MINUTES };
};

// Valida y consume el código (un solo uso). Devuelve los datos de telegram o null.
const consumeCode = async (code) => {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return null;

    if (!enabled) {
        const entry = memCodes.get(normalized);
        if (!entry) return null;
        memCodes.delete(normalized);
        if (new Date(entry.expires_at) < new Date()) return null;
        return { telegramId: entry.telegram_id, telegramUsername: entry.telegram_username, telegramChatId: entry.telegram_chat_id };
    }

    const { data } = await supabase.from('link_codes').select('*').eq('code', normalized).maybeSingle();
    if (!data) return null;
    await supabase.from('link_codes').delete().eq('code', normalized);
    if (new Date(data.expires_at) < new Date()) return null;
    return { telegramId: data.telegram_id, telegramUsername: data.telegram_username, telegramChatId: data.telegram_chat_id };
};

module.exports = { createCode, consumeCode };
