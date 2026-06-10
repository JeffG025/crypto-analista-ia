const crypto = require('crypto');
const { supabase, enabled } = require('./supabase');

// ===== Fallback en memoria =====
const memResets = new Map(); // tokenHash -> { user_id, expires_at }

const EXPIRY_MINUTES = 30;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Crea un token de un solo uso. Se guarda HASHEADO (si alguien lee la DB, no puede usarlo)
const createToken = async (userId) => {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString();

    if (!enabled) {
        memResets.set(tokenHash, { user_id: userId, expires_at: expiresAt });
        return token;
    }

    const { error } = await supabase.from('password_resets').insert({
        token_hash: tokenHash,
        user_id: userId,
        expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);
    return token;
};

// Valida y consume el token. Devuelve userId o null.
const consumeToken = async (token) => {
    if (!token) return null;
    const tokenHash = hashToken(String(token).trim());

    if (!enabled) {
        const entry = memResets.get(tokenHash);
        if (!entry) return null;
        memResets.delete(tokenHash);
        if (new Date(entry.expires_at) < new Date()) return null;
        return entry.user_id;
    }

    const { data } = await supabase.from('password_resets').select('*').eq('token_hash', tokenHash).maybeSingle();
    if (!data) return null;
    await supabase.from('password_resets').delete().eq('token_hash', tokenHash);
    if (new Date(data.expires_at) < new Date()) return null;
    return data.user_id;
};

module.exports = { createToken, consumeToken, EXPIRY_MINUTES };
