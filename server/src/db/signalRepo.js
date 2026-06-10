const { supabase, enabled } = require('./supabase');

// ===== Fallback en memoria =====
const memSignals = [];
let memSeq = 1;

const toSignal = (row) => row ? ({
    id: row.id,
    coinId: row.coin_id,
    coinSymbol: row.coin_symbol,
    signal: row.signal,
    emoji: row.emoji,
    score: row.score,
    reliability: row.reliability,
    priceAtSignal: parseFloat(row.price_at_signal),
    verdict: row.verdict,
    createdAt: row.created_at,
}) : null;

const create = async ({ coinId, coinSymbol, signal, emoji, score, reliability, priceAtSignal, verdict }) => {
    const row = {
        coin_id: coinId,
        coin_symbol: coinSymbol || coinId,
        signal, emoji,
        score, reliability,
        price_at_signal: priceAtSignal,
        verdict,
    };
    if (!enabled) {
        const mem = { id: memSeq++, ...row, created_at: new Date().toISOString() };
        memSignals.unshift(mem);
        if (memSignals.length > 200) memSignals.pop();
        return toSignal(mem);
    }
    const { data, error } = await supabase.from('signals').insert(row).select().single();
    if (error) throw new Error(error.message);
    return toSignal(data);
};

// Últimas señales, más recientes primero
const list = async (limit = 100) => {
    if (!enabled) return memSignals.slice(0, limit).map(toSignal);
    const { data } = await supabase.from('signals').select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    return (data || []).map(toSignal);
};

module.exports = { create, list };
