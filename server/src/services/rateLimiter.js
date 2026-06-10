const LIMIT_PER_HOUR = 15;
const WINDOW_MS = 60 * 60 * 1000; // 1 hora

// userId -> { count, resetTime }
const userLimits = new Map();

const checkLimit = (userId) => {
    const now = Date.now();
    const user = userLimits.get(userId);

    // Primera consulta o ventana expirada — reiniciar contador
    if (!user || now > user.resetTime) {
        userLimits.set(userId, { count: 1, resetTime: now + WINDOW_MS });
        return { allowed: true, remaining: LIMIT_PER_HOUR - 1 };
    }

    // Límite alcanzado
    if (user.count >= LIMIT_PER_HOUR) {
        const minutesLeft = Math.ceil((user.resetTime - now) / 60000);
        return { allowed: false, minutesLeft };
    }

    user.count++;
    return { allowed: true, remaining: LIMIT_PER_HOUR - user.count };
};

module.exports = { checkLimit };
