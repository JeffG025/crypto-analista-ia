const jwt = require('jsonwebtoken');
const userRepo = require('../db/userRepo');

const JWT_SECRET = process.env.JWT_SECRET || 'cryptomind-dev-secret';

const authMiddleware = async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });

    try {
        const payload = jwt.verify(header.split(' ')[1], JWT_SECRET);
        req.user = payload;

        // Hidratar rol y telegram desde la DB: el JWT puede tener un rol viejo
        // (ej. el usuario pagó Premium después de iniciar sesión)
        const live = await userRepo.findById(payload.id);
        if (live) {
            req.user.role = live.role;
            req.user.telegramId = live.telegramId;
        }

        next();
    } catch {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

module.exports = authMiddleware;
