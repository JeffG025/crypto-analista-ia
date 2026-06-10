const { supabase, enabled } = require('./supabase');

// ===== Fallback en memoria =====
const memUsage = new Map(); // `${userId}:${action}:${day}` -> count

const today = () => new Date().toISOString().slice(0, 10);

// Incrementa el contador del día y devuelve el nuevo total
const increment = async (userId, action) => {
    if (!enabled) {
        const key = `${userId}:${action}:${today()}`;
        const next = (memUsage.get(key) || 0) + 1;
        memUsage.set(key, next);
        return next;
    }
    const { data, error } = await supabase.rpc('increment_usage', { p_user_id: userId, p_action: action });
    if (error) {
        console.error('Error increment_usage:', error.message);
        return 0; // no bloquear al usuario por un error de contador
    }
    return data;
};

const getCount = async (userId, action) => {
    if (!enabled) {
        return memUsage.get(`${userId}:${action}:${today()}`) || 0;
    }
    const { data } = await supabase.from('usage').select('count')
        .eq('user_id', userId).eq('action', action).eq('day', today())
        .maybeSingle();
    return data?.count || 0;
};

module.exports = { increment, getCount };
