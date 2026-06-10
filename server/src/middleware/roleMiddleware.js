const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Acceso denegado' });
    next();
};

const requireAdmin   = requireRole('admin');
const requirePremium = requireRole('admin', 'premium');

module.exports = { requireRole, requireAdmin, requirePremium };
