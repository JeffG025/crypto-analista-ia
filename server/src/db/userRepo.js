const crypto = require('crypto');
const { supabase, enabled } = require('./supabase');

// ===== Fallback en memoria =====
const memUsers = new Map(); // id -> user (snake_case, igual que la DB)

// Normaliza la fila de DB a un objeto de dominio
const toUser = (row) => row ? ({
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    googleId: row.google_id,
    picture: row.picture,
    role: row.role,
    telegramId: row.telegram_id,
    telegramUsername: row.telegram_username,
    stripeCustomerId: row.stripe_customer_id,
    createdAt: row.created_at,
}) : null;

const findByEmail = async (email) => {
    const key = email.toLowerCase();
    if (!enabled) {
        return toUser([...memUsers.values()].find(u => u.email === key) || null);
    }
    const { data } = await supabase.from('users').select('*').eq('email', key).maybeSingle();
    return toUser(data);
};

const findById = async (id) => {
    if (!enabled) return toUser(memUsers.get(id) || null);
    const { data } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
    return toUser(data);
};

const findByTelegramId = async (telegramId) => {
    if (!enabled) {
        return toUser([...memUsers.values()].find(u => u.telegram_id === telegramId) || null);
    }
    const { data } = await supabase.from('users').select('*').eq('telegram_id', telegramId).maybeSingle();
    return toUser(data);
};

const findByStripeCustomer = async (customerId) => {
    if (!enabled) {
        return toUser([...memUsers.values()].find(u => u.stripe_customer_id === customerId) || null);
    }
    const { data } = await supabase.from('users').select('*').eq('stripe_customer_id', customerId).maybeSingle();
    return toUser(data);
};

const count = async () => {
    if (!enabled) return memUsers.size;
    const { count: n } = await supabase.from('users').select('*', { count: 'exact', head: true });
    return n || 0;
};

const create = async ({ name, email, passwordHash = null, googleId = null, picture = null, role = 'free' }) => {
    const row = {
        name,
        email: email.toLowerCase(),
        password_hash: passwordHash,
        google_id: googleId,
        picture,
        role,
    };
    if (!enabled) {
        const id = crypto.randomUUID();
        const mem = { id, ...row, telegram_id: null, telegram_username: null, stripe_customer_id: null, created_at: new Date().toISOString() };
        memUsers.set(id, mem);
        return toUser(mem);
    }
    const { data, error } = await supabase.from('users').insert(row).select().single();
    if (error) throw new Error(error.message);
    return toUser(data);
};

const update = async (id, patch) => {
    // patch en snake_case: { role, telegram_id, telegram_username, google_id, picture, stripe_customer_id }
    if (!enabled) {
        const u = memUsers.get(id);
        if (!u) return null;
        Object.assign(u, patch);
        return toUser(u);
    }
    const { data, error } = await supabase.from('users').update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return toUser(data);
};

const list = async () => {
    if (!enabled) return [...memUsers.values()].map(toUser);
    const { data } = await supabase.from('users').select('*').order('created_at', { ascending: true });
    return (data || []).map(toUser);
};

module.exports = { findByEmail, findById, findByTelegramId, findByStripeCustomer, count, create, update, list };
