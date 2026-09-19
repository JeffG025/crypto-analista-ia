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
    agreement: row.reliability,   // la columna conserva el nombre viejo; el dato es concordancia
    priceAtSignal: parseFloat(row.price_at_signal),
    verdict: row.verdict,
    createdAt: row.created_at,
}) : null;

const create = async ({ coinId, coinSymbol, signal, emoji, score, agreement, priceAtSignal, verdict }) => {
    const row = {
        coin_id: coinId,
        coin_symbol: coinSymbol || coinId,
        signal, emoji,
        score, reliability: agreement,
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

// Total real de señales publicadas (no lo limita el `list`)
const count = async () => {
    if (!enabled) return memSignals.length;
    const { count: n } = await supabase.from('signals').select('*', { count: 'exact', head: true });
    return n || 0;
};

module.exports = { create, list, count };
