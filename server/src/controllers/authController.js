const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const userRepo = require('../db/userRepo');
const resetRepo = require('../db/resetRepo');
const emailService = require('../services/emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'cryptomind-dev-secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/+$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

const VALID_ROLES = ['free', 'premium', 'admin'];

const makeToken = (user) =>
    jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '30d' });

const safeUser = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    picture: u.picture || null,
    telegramId: u.telegramId || null,
    telegramUsername: u.telegramUsername || null,
    watchlist: u.watchlist || null,
    hasPassword: Boolean(u.passwordHash),
    createdAt: u.createdAt,
});

const MAX_WATCHLIST = 12;
const COIN_ID_REGEX = /^[a-z0-9-]{2,50}$/;

// ===== REGISTER =====
const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        if (password.length < 6)
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

        const existing = await userRepo.findByEmail(email);
        if (existing)
            return res.status(400).json({ error: 'Este email ya está registrado' });

        const passwordHash = await bcrypt.hash(password, 10);
        const role = (await userRepo.count()) === 0 ? 'admin' : 'free'; // primer usuario = admin
        const user = await userRepo.create({ name, email, passwordHash, role });

        res.json({ token: makeToken(user), user: safeUser(user) });
    } catch (e) {
        console.error('Error en register:', e.message);
        res.status(500).json({ error: 'Error al crear la cuenta' });
    }
};

// ===== LOGIN =====
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ error: 'Email y contraseña requeridos' });

        const user = await userRepo.findByEmail(email);
        if (!user) return res.status(401).json({ error: 'Email o contraseña incorrectos' });
        if (!user.passwordHash) return res.status(401).json({ error: 'Esta cuenta usa Google. Inicia sesión con Google.' });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

        res.json({ token: makeToken(user), user: safeUser(user) });
    } catch (e) {
        console.error('Error en login:', e.message);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
};

// ===== VALIDATE (sesión activa) =====
const validate = async (req, res) => {
    const live = await userRepo.findById(req.user.id);
    if (!live) return res.status(401).json({ error: 'Usuario no encontrado' });
    res.json({ user: safeUser(live) });
};

// ===== GOOGLE OAUTH — redirección =====
const googleRedirect = (req, res) => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('TU_GOOGLE'))
        return res.status(500).json({ error: 'Google OAuth no configurado' });
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: `${BACKEND_URL}/api/auth/google/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

// ===== GOOGLE OAUTH — callback =====
const googleCallback = async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect(`${FRONTEND_URL}/auth?error=google_cancelled`);

    try {
        const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: `${BACKEND_URL}/api/auth/google/callback`,
            grant_type: 'authorization_code',
        });

        const { id_token } = tokenRes.data;
        // id_token viene directo de Google, es confiable
        const payload = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64').toString());
        const { sub: googleId, email, name, picture } = payload;

        let user = await userRepo.findByEmail(email);

        if (!user) {
            const role = (await userRepo.count()) === 0 ? 'admin' : 'free';
            user = await userRepo.create({ name, email, googleId, picture, role });
        } else if (!user.googleId) {
            user = await userRepo.update(user.id, { google_id: googleId, picture: picture || user.picture });
        }

        res.redirect(`${FRONTEND_URL}/?token=${makeToken(user)}`);
    } catch (e) {
        console.error('Google OAuth error:', e.message);
        res.redirect(`${FRONTEND_URL}/auth?error=google_failed`);
    }
};

// ===== OLVIDÉ MI CONTRASEÑA =====
// Siempre responde igual exista o no el email (evita enumerar cuentas)
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    const genericResponse = { success: true, message: 'Si el correo existe, recibirás un enlace de recuperación en unos minutos.' };

    if (!emailService.isConfigured())
        return res.status(503).json({ error: 'La recuperación de contraseña no está disponible por el momento.' });

    try {
        const user = await userRepo.findByEmail(email);

        // Solo cuentas con contraseña (las de Google entran con Google)
        if (user && user.passwordHash) {
            const token = await resetRepo.createToken(user.id);
            const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;
            await emailService.sendPasswordReset(user.email, resetUrl, resetRepo.EXPIRY_MINUTES);
            console.log(`📧 Email de recuperación enviado a ${user.email}`);
        }

        res.json(genericResponse);
    } catch (e) {
        console.error('Error en forgot password:', e.message);
        // Misma respuesta genérica: no revelar detalles internos
        res.json(genericResponse);
    }
};

// ===== RESTABLECER CONTRASEÑA =====
const resetPassword = async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password)
        return res.status(400).json({ error: 'Token y contraseña requeridos' });
    if (password.length < 6)
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

    const userId = await resetRepo.consumeToken(token);
    if (!userId)
        return res.status(400).json({ error: 'Enlace inválido o expirado. Solicita uno nuevo.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userRepo.update(userId, { password_hash: passwordHash });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Sesión directa con la nueva contraseña
    res.json({ token: makeToken(user), user: safeUser(user) });
};

// ===== PERFIL: actualizar nombre y/o watchlist =====
const updateProfile = async (req, res) => {
    const { name, watchlist } = req.body;
    const patch = {};

    if (name !== undefined) {
        const clean = String(name).trim();
        if (!clean || clean.length > 40)
            return res.status(400).json({ error: 'El nombre debe tener entre 1 y 40 caracteres' });
        patch.name = clean;
    }

    if (watchlist !== undefined) {
        if (!Array.isArray(watchlist))
            return res.status(400).json({ error: 'watchlist debe ser una lista' });
        const clean = [...new Set(watchlist.map(c => String(c).trim().toLowerCase()))]
            .filter(c => COIN_ID_REGEX.test(c));
        if (clean.length < 1 || clean.length > MAX_WATCHLIST)
            return res.status(400).json({ error: `Elige entre 1 y ${MAX_WATCHLIST} monedas` });
        patch.watchlist = clean;
    }

    if (Object.keys(patch).length === 0)
        return res.status(400).json({ error: 'Nada que actualizar' });

    const updated = await userRepo.update(req.user.id, patch);
    if (!updated) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ success: true, user: safeUser(updated) });
};

// ===== PERFIL: cambiar contraseña =====
// Las cuentas de Google sin contraseña pueden CREAR una (sin contraseña actual)
const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });

    const user = await userRepo.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (user.passwordHash) {
        if (!currentPassword)
            return res.status(400).json({ error: 'Ingresa tu contraseña actual' });
        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await userRepo.update(user.id, { password_hash: passwordHash });
    res.json({ success: true, user: safeUser(updated) });
};

// ===== ADMIN: listar usuarios =====
const getUsers = async (req, res) => {
    const users = await userRepo.list();
    res.json(users.map(safeUser));
};

// ===== ADMIN: cambiar rol =====
const updateRole = async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!VALID_ROLES.includes(role))
        return res.status(400).json({ error: `Rol inválido. Opciones: ${VALID_ROLES.join(', ')}` });

    const user = await userRepo.findById(id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (req.user.id === id && role !== 'admin') {
        const all = await userRepo.list();
        const adminCount = all.filter(u => u.role === 'admin').length;
        if (adminCount <= 1) return res.status(400).json({ error: 'No puedes quitarte el rol de admin si eres el único administrador' });
    }

    const updated = await userRepo.update(id, { role });
    res.json({ success: true, user: safeUser(updated) });
};

// ===== ADMIN: estadísticas =====
const getStats = async (req, res) => {
    const all = await userRepo.list();
    res.json({
        total: all.length,
        byRole: {
            admin: all.filter(u => u.role === 'admin').length,
            premium: all.filter(u => u.role === 'premium').length,
            free: all.filter(u => u.role === 'free').length,
        }
    });
};

module.exports = { register, login, validate, googleRedirect, googleCallback, forgotPassword, resetPassword, updateProfile, changePassword, getUsers, updateRole, getStats, safeUser };
