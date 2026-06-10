const { supabase, enabled } = require('./supabase');

// ===== Fallback en memoria =====
const memAlerts = new Map(); // id -> alert row
let memSeq = 1;

const toAlert = (row) => row ? ({
    id: row.id,
    userId: row.user_id,
    telegramId: row.telegram_id,
    telegramChatId: row.telegram_chat_id,
    coinId: row.coin_id,
    coinName: row.coin_name,
    coinSymbol: row.coin_symbol,
    condition: row.condition,
    targetPrice: parseFloat(row.target_price),
    source: row.source,
    triggeredAt: row.triggered_at,
    createdAt: row.created_at,
}) : null;

const create = async ({ userId = null, telegramId = null, telegramChatId = null, coinId, coinName, coinSymbol, condition, targetPrice, source = 'web' }) => {
    const row = {
        user_id: userId,
        telegram_id: telegramId,
        telegram_chat_id: telegramChatId,
        coin_id: coinId,
        coin_name: coinName || coinId,
        coin_symbol: coinSymbol || '',
        condition,
        target_price: targetPrice,
        source,
    };
    if (!enabled) {
        const mem = { id: memSeq++, ...row, triggered_at: null, created_at: new Date().toISOString() };
        memAlerts.set(mem.id, mem);
        return toAlert(mem);
    }
    const { data, error } = await supabase.from('alerts').insert(row).select().single();
    if (error) throw new Error(error.message);
    return toAlert(data);
};

// Alertas activas de un usuario web (incluye las del telegram vinculado)
const listForUser = async (userId, telegramId = null) => {
    if (!enabled) {
        return [...memAlerts.values()]
            .filter(a => !a.triggered_at && (a.user_id === userId || (telegramId && a.telegram_id === telegramId)))
            .map(toAlert);
    }
    let query = supabase.from('alerts').select('*').is('triggered_at', null);
    if (telegramId) query = query.or(`user_id.eq.${userId},telegram_id.eq.${telegramId}`);
    else query = query.eq('user_id', userId);
    const { data } = await query.order('created_at', { ascending: false });
    return (data || []).map(toAlert);
};

const listForTelegram = async (telegramId) => {
    if (!enabled) {
        return [...memAlerts.values()]
            .filter(a => !a.triggered_at && a.telegram_id === telegramId)
            .map(toAlert);
    }
    const { data } = await supabase.from('alerts').select('*')
        .is('triggered_at', null).eq('telegram_id', telegramId)
        .order('created_at', { ascending: false });
    return (data || []).map(toAlert);
};

const countActiveForUser = async (userId, telegramId = null) => {
    const list = await listForUser(userId, telegramId);
    return list.length;
};

const listAllActive = async () => {
    if (!enabled) {
        return [...memAlerts.values()].filter(a => !a.triggered_at).map(toAlert);
    }
    const { data } = await supabase.from('alerts').select('*').is('triggered_at', null);
    return (data || []).map(toAlert);
};

const markTriggered = async (id) => {
    if (!enabled) {
        const a = memAlerts.get(id);
        if (a) a.triggered_at = new Date().toISOString();
        return;
    }
    await supabase.from('alerts').update({ triggered_at: new Date().toISOString() }).eq('id', id);
};

const remove = async (id, userId = null, telegramId = null) => {
    if (!enabled) {
        const a = memAlerts.get(id);
        if (!a) return false;
        const owns = (userId && a.user_id === userId) || (telegramId && a.telegram_id === telegramId);
        if (!owns) return false;
        memAlerts.delete(id);
        return true;
    }
    let query = supabase.from('alerts').delete().eq('id', id);
    if (userId && telegramId) query = query.or(`user_id.eq.${userId},telegram_id.eq.${telegramId}`);
    else if (userId) query = query.eq('user_id', userId);
    else if (telegramId) query = query.eq('telegram_id', telegramId);
    const { data } = await query.select();
    return (data || []).length > 0;
};

// Al vincular Telegram: adopta las alertas del bot al usuario web
const attachTelegramAlertsToUser = async (telegramId, userId) => {
    if (!enabled) {
        for (const a of memAlerts.values()) {
            if (a.telegram_id === telegramId && !a.user_id) a.user_id = userId;
        }
        return;
    }
    await supabase.from('alerts').update({ user_id: userId }).eq('telegram_id', telegramId).is('user_id', null);
};

module.exports = { create, listForUser, listForTelegram, countActiveForUser, listAllActive, markTriggered, remove, attachTelegramAlertsToUser };
