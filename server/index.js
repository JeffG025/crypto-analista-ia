// Render no tiene salida IPv6: forzar resolución IPv4 primero
// (sin esto, SMTP a Gmail falla con ENETUNREACH a direcciones 2607:f8b0...)
require('dns').setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
dotenv.config();

const chatController = require('./src/controllers/chatController');
const authController = require('./src/controllers/authController');
const paymentController = require('./src/controllers/paymentController');
const authMiddleware = require('./src/middleware/authMiddleware');
const { requireAdmin } = require('./src/middleware/roleMiddleware');
const cryptoService = require('./src/services/cryptoService');
const { analyzeTechnicals } = require('./src/services/technicalService');
const { generatePrediction } = require('./src/services/aiService');
const { createBot } = require('./src/services/telegramService');
const { startScheduler } = require('./src/jobs/signalScheduler');
const { startDailySummary } = require('./src/jobs/dailySummary');
const { startAlertChecker } = require('./src/services/alertService');
const { startMarketingScheduler } = require('./src/jobs/marketingScheduler');

const userRepo = require('./src/db/userRepo');
const alertRepo = require('./src/db/alertRepo');
const usageRepo = require('./src/db/usageRepo');
const linkRepo = require('./src/db/linkRepo');
const signalRepo = require('./src/db/signalRepo');

const app = express();
const PORT = process.env.PORT || 3001;
// Sin barra final: el header Origin del navegador nunca la incluye y CORS exige match exacto
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

// Límites por rol
const FREE_CHAT_PER_DAY = 10;
const FREE_MAX_ALERTS = 3;

// Render mete un proxy delante: sin esto req.ip sería siempre el del proxy
// y el rate limit trataría a todos los usuarios como una sola IP.
// El 1 = un solo salto de confianza (poner `true` permitiría falsear X-Forwarded-For).
app.set('trust proxy', 1);

app.use(cors({ origin: FRONTEND_URL, credentials: true }));

// ⚠️ El webhook de Stripe necesita el body CRUDO — se registra antes de express.json()
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);

app.use(express.json());

// ===== RATE LIMIT =====
// Sin esto, /login y /forgot aceptan intentos ilimitados: fuerza bruta y spam de correos.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,                      // por IP y ventana
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});

// Crear cuenta y pedir recuperación son más caros (escriben en BD, mandan correo)
const strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes desde esta conexión. Inténtalo más tarde.' },
});

// Endpoints públicos sin auth: evita que un script agote la cuota de CoinGecko
const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones. Baja el ritmo.' },
});

// Express 4 no atrapa promesas rechazadas: sin esto, un fallo de Supabase deja la
// petición colgada hasta el timeout del navegador en vez de responder un 500.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ===== AUTH =====
app.post('/api/auth/register', strictLimiter, wrap(authController.register));
app.post('/api/auth/login', authLimiter, wrap(authController.login));
app.get('/api/auth/me', wrap(authMiddleware), wrap(authController.validate));
app.get('/api/auth/google', authController.googleRedirect);
app.get('/api/auth/google/callback', wrap(authController.googleCallback));
app.post('/api/auth/forgot', strictLimiter, wrap(authController.forgotPassword));
app.post('/api/auth/reset', authLimiter, wrap(authController.resetPassword));

// ===== PERFIL =====
app.patch('/api/profile', wrap(authMiddleware), wrap(authController.updateProfile));
app.post('/api/profile/password', wrap(authMiddleware), wrap(authController.changePassword));

// ===== ADMIN =====
app.get('/api/admin/users', wrap(authMiddleware), requireAdmin, wrap(authController.getUsers));
app.patch('/api/admin/users/:id/role', wrap(authMiddleware), requireAdmin, wrap(authController.updateRole));
app.get('/api/admin/stats', wrap(authMiddleware), requireAdmin, wrap(authController.getStats));

// ===== CHAT (auth + límite diario para Free) =====
app.post('/api/chat', wrap(authMiddleware), wrap(async (req, res, next) => {
    // Solo cuentan los mensajes reales a la IA, no las recargas de gráficas (isUpdate)
    if (req.body.message && req.user.role === 'free') {
        const used = await usageRepo.getCount(req.user.id, 'chat');
        if (used >= FREE_CHAT_PER_DAY) {
            return res.status(403).json({
                type: 'text',
                error: `Alcanzaste el límite de ${FREE_CHAT_PER_DAY} consultas diarias del plan Free. Vuelve mañana o actualiza a Premium para chat ilimitado. ✨`,
                limitReached: true,
            });
        }
        await usageRepo.increment(req.user.id, 'chat');
    }
    next();
}), wrap(chatController.handleChat));

// ===== MERCADO =====
app.get('/api/sentiment', publicLimiter, wrap(async (req, res) => {
    const data = await cryptoService.getFearAndGreed();
    res.json(data);
}));

const DEFAULT_MARKET_COINS = ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple', 'cardano', 'avalanche-2', 'chainlink', 'dogecoin', 'polkadot'];

app.get('/api/market', publicLimiter, wrap(async (req, res) => {
    // Permite watchlist personalizada: ?coins=bitcoin,solana,pepe (máx 12, ids saneados)
    let coins = DEFAULT_MARKET_COINS;
    if (req.query.coins) {
        const requested = String(req.query.coins)
            .split(',')
            .map(c => c.trim().toLowerCase())
            .filter(c => /^[a-z0-9-]{2,50}$/.test(c))
            .slice(0, 12);
        if (requested.length > 0) coins = requested;
    }
    const data = await cryptoService.getMarketData(coins, req.query.currency || 'usd');
    res.json(data);
}));

// ===== ANÁLISIS TÉCNICO (auth; predicción IA solo Premium/Admin) =====
app.get('/api/analysis', wrap(authMiddleware), async (req, res) => {
    const coin = req.query.coin;
    const lang = req.query.lang === 'en' ? 'en' : 'es';
    if (!coin) return res.status(400).json({ error: 'Parámetro coin requerido' });

    try {
        const data = await analyzeTechnicals(coin);

        if (req.user.role === 'free') {
            data.predictionLocked = true; // el frontend muestra el candado + upsell
        } else {
            try {
                data.prediction = await generatePrediction(data, lang);
            } catch { /* continúa sin predicción */ }
        }

        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message || 'Error en análisis técnico' });
    }
});

// ===== ALERTAS (unificadas web + telegram) =====
app.get('/api/alerts', wrap(authMiddleware), wrap(async (req, res) => {
    const list = await alertRepo.listForUser(req.user.id, req.user.telegramId);
    res.json(list);
}));

app.post('/api/alerts', wrap(authMiddleware), wrap(async (req, res) => {
    const { coinId, coinName, coinSymbol, condition, targetPrice } = req.body;
    if (!coinId || !condition || !targetPrice)
        return res.status(400).json({ error: 'coinId, condition y targetPrice son requeridos' });
    if (!['above', 'below'].includes(condition))
        return res.status(400).json({ error: 'condition debe ser "above" o "below"' });
    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0)
        return res.status(400).json({ error: 'targetPrice debe ser un número positivo' });

    if (req.user.role === 'free') {
        const count = await alertRepo.countActiveForUser(req.user.id, req.user.telegramId);
        if (count >= FREE_MAX_ALERTS)
            return res.status(403).json({ error: `El plan Free permite ${FREE_MAX_ALERTS} alertas. Actualiza a Premium para alertas ilimitadas. ✨` });
    }

    const alert = await alertRepo.create({
        userId: req.user.id,
        telegramId: req.user.telegramId || null,
        coinId, coinName, coinSymbol,
        condition, targetPrice: price,
        source: 'web',
    });
    res.status(201).json(alert);
}));

app.delete('/api/alerts/:id', wrap(authMiddleware), wrap(async (req, res) => {
    const ok = await alertRepo.remove(parseInt(req.params.id), req.user.id, req.user.telegramId);
    if (!ok) return res.status(404).json({ error: 'Alerta no encontrada' });
    res.json({ success: true });
}));

// ===== HISTORIAL DE SEÑALES =====
//
// Una señal se juzga por lo que hizo el precio en un plazo FIJO desde que se publicó,
// no por dónde está hoy. Comparar contra el precio actual sin horizonte hace que en un
// mercado alcista casi toda señal ALCISTA "acierte": mediría la tendencia general del
// mercado, no la calidad del scanner.
const EVAL_HORIZON_DAYS = 7;
const EVAL_HORIZON_MS = EVAL_HORIZON_DAYS * 24 * 60 * 60 * 1000;
// Movimientos por debajo de esto son ruido: ni acierto ni fallo
const FLAT_THRESHOLD_PCT = 1;
// Con menos señales evaluadas que esto, el porcentaje no significa nada y no se publica
const MIN_SAMPLE = 20;

const enrichSignals = async (signals) => {
    if (signals.length === 0) return [];
    const uniqueCoins = [...new Set(signals.map(s => s.coinId))];

    const market = await cryptoService.getMarketData(uniqueCoins, 'usd');
    const priceMap = {};
    for (const c of market) if (c.id) priceMap[c.id] = c.current_price;

    // Serie histórica por moneda: de ahí sale el precio en la fecha de vencimiento.
    // 90 días → CoinGecko devuelve puntos HORARIOS (con 200 serían diarios y el precio
    // de vencimiento podría estar hasta 12h desviado). Cubre de sobra la ventana de stats.
    const SERIES_DAYS = 90;
    const seriesMap = {};
    for (const coin of uniqueCoins) {
        seriesMap[coin] = await cryptoService.getPriceSeries(coin, SERIES_DAYS);
    }

    const now = Date.now();

    return signals.map(s => {
        const currentPrice = priceMap[s.coinId] ?? null;
        const changePct = currentPrice
            ? ((currentPrice - s.priceAtSignal) / s.priceAtSignal) * 100
            : null;

        const dueAt = new Date(s.createdAt).getTime() + EVAL_HORIZON_MS;

        // pending = aún no vence | unevaluable = venció pero no hay dato histórico
        let outcome = 'pending';
        let horizonPrice = null, horizonChangePct = null;

        if (now >= dueAt) {
            horizonPrice = cryptoService.priceAt(seriesMap[s.coinId] || [], dueAt);
            if (horizonPrice === null) {
                outcome = 'unevaluable';
            } else {
                horizonChangePct = ((horizonPrice - s.priceAtSignal) / s.priceAtSignal) * 100;
                if (Math.abs(horizonChangePct) < FLAT_THRESHOLD_PCT) {
                    outcome = 'flat';
                } else {
                    const bullish = s.signal.includes('ALCISTA');
                    const wentUp = horizonChangePct > 0;
                    outcome = bullish === wentUp ? 'hit' : 'miss';
                }
            }
        }

        return {
            ...s,
            currentPrice,
            changePct,
            horizonDays: EVAL_HORIZON_DAYS,
            horizonPrice,
            horizonChangePct,
            outcome,
            // Se mantiene por compatibilidad: true/false solo cuando hay veredicto real
            hit: outcome === 'hit' ? true : outcome === 'miss' ? false : null,
        };
    });
};

const isBullish = (s) => s.signal.includes('ALCISTA');

const signalStats = (enriched, total) => {
    const evaluated = enriched.filter(s => s.outcome === 'hit' || s.outcome === 'miss');
    const hits = evaluated.filter(s => s.outcome === 'hit').length;

    // Desglose por dirección: un acierto global bajo puede venir de que el scanner
    // acierte en una dirección y falle sistemáticamente en la otra
    const split = (pred) => {
        const subset = evaluated.filter(pred);
        const subHits = subset.filter(s => s.outcome === 'hit').length;
        return {
            evaluated: subset.length,
            hits: subHits,
            hitRate: subset.length >= MIN_SAMPLE ? Math.round((subHits / subset.length) * 100) : null,
        };
    };

    return {
        total,
        evaluated: evaluated.length,
        hits,
        pending: enriched.filter(s => s.outcome === 'pending').length,
        flat: enriched.filter(s => s.outcome === 'flat').length,
        horizonDays: EVAL_HORIZON_DAYS,
        hitRate: evaluated.length >= MIN_SAMPLE ? Math.round((hits / evaluated.length) * 100) : null,
        bullish: split(isBullish),
        bearish: split(s => !isBullish(s)),
    };
};

// El scanner publica ~40 señales al día, así que las últimas 200 caben todas dentro
// del horizonte de 7 días y ninguna estaría vencida. La ventana de cálculo tiene que
// ser bastante mayor que el horizonte para que haya muestra que evaluar.
const STATS_WINDOW = 600;   // ~2 semanas de scanner
const DISPLAY_LIMIT = 100;  // cuántas se le mandan al cliente

// Recalcularlo pide una serie histórica por moneda, así que se cachea:
// solo cambia cuando entra una señal nueva o vence otra.
const SIGNALS_CACHE_MS = 5 * 60 * 1000;
let signalsCache = null;

const getSignalHistory = async () => {
    if (signalsCache && Date.now() < signalsCache.expiresAt) return signalsCache.value;

    const [all, total] = await Promise.all([signalRepo.list(STATS_WINDOW), signalRepo.count()]);
    const enriched = await enrichSignals(all);
    const value = {
        enriched: enriched.slice(0, DISPLAY_LIMIT),
        stats: signalStats(enriched, total),
    };

    signalsCache = { value, expiresAt: Date.now() + SIGNALS_CACHE_MS };
    return value;
};

// Público (para la landing): últimas 5 señales + estadísticas globales reales
app.get('/api/signals/public', publicLimiter, async (req, res) => {
    try {
        const { enriched, stats } = await getSignalHistory();
        res.json({ signals: enriched.slice(0, 5), stats });
    } catch (e) {
        res.status(500).json({ error: 'Error obteniendo señales' });
    }
});

// Autenticado: Free ve 5 con candado; Premium/Admin ven todo
app.get('/api/signals', wrap(authMiddleware), async (req, res) => {
    try {
        const { enriched, stats } = await getSignalHistory();

        if (req.user.role === 'free') {
            return res.json({ signals: enriched.slice(0, 5), stats, locked: enriched.length > 5 });
        }
        res.json({ signals: enriched, stats, locked: false });
    } catch (e) {
        res.status(500).json({ error: 'Error obteniendo señales' });
    }
});

// ===== VINCULACIÓN TELEGRAM =====
app.post('/api/telegram/link', wrap(authMiddleware), wrap(async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código requerido' });

    const link = await linkRepo.consumeCode(code);
    if (!link) return res.status(400).json({ error: 'Código inválido o expirado. Genera uno nuevo con /vincular en el bot.' });

    // ¿Este telegram ya está vinculado a otra cuenta?
    const existing = await userRepo.findByTelegramId(link.telegramId);
    if (existing && existing.id !== req.user.id)
        return res.status(400).json({ error: 'Este Telegram ya está vinculado a otra cuenta.' });

    const updated = await userRepo.update(req.user.id, {
        telegram_id: link.telegramId,
        telegram_username: link.telegramUsername,
    });

    // Las alertas creadas en el bot ahora aparecen en la web
    await alertRepo.attachTelegramAlertsToUser(link.telegramId, req.user.id);

    res.json({ success: true, user: authController.safeUser(updated) });
}));

app.post('/api/telegram/unlink', wrap(authMiddleware), wrap(async (req, res) => {
    const updated = await userRepo.update(req.user.id, { telegram_id: null, telegram_username: null });
    res.json({ success: true, user: authController.safeUser(updated) });
}));

// ===== PAGOS =====
app.get('/api/payments/config', paymentController.getConfig);
app.post('/api/payments/checkout', wrap(authMiddleware), wrap(paymentController.createCheckout));

app.get('/', (req, res) => res.send('Servidor CryptoBot funcionando 🚀'));

// ===== MANEJADOR GLOBAL DE ERRORES =====
// Va después de TODAS las rutas. Los 4 argumentos son lo que hace que Express lo
// reconozca como error handler: quitar `next` lo convierte en middleware normal.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error(`❌ ${req.method} ${req.originalUrl}:`, err.message);
    if (res.headersSent) return;
    res.status(err.status || 500).json({ error: 'Error interno del servidor' });
});

// ===== SERVIDOR =====
const server = app.listen(PORT, () => {
    console.log(`🌐 Servidor web: http://localhost:${PORT}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Puerto ${PORT} en uso. Usa npm run kill.`);
        process.exit(1);
    }
});

// ===== BOT DE TELEGRAM =====
// Producción (https): modo WEBHOOK — Telegram envía los updates a nuestra URL.
//   Evita los 409 Conflict que causa el polling cuando Render solapa instancias en cada deploy.
// Desarrollo local: modo POLLING — no requiere URL pública.
//
// ⚠️ En local el bot y los jobs quedan APAGADOS por defecto. Dos razones:
//   1. bot.launch() en polling llama a deleteWebhook() → tumba el bot de producción
//      hasta el siguiente deploy de Render.
//   2. El .env local apunta a la Supabase y al canal reales: los jobs mandarían
//      mensajes de verdad a usuarios de verdad, duplicando los de producción.
// Para probar el bot en local a propósito: ENABLE_BOT=true en server/.env
const isProduction = (process.env.BACKEND_URL || '').startsWith('https');
const botEnabled = isProduction || process.env.ENABLE_BOT === 'true';

const bot = botEnabled ? createBot() : null;

if (!botEnabled) {
    console.log('🤖 Bot y jobs desactivados en local (usa ENABLE_BOT=true para activarlos). La web funciona normal.');
}

if (bot) {
    const crypto = require('crypto');
    const WEBHOOK_PATH = '/telegram-webhook';

    bot.telegram.getMe()
        .then(info => {
            console.log(`🤖 Bot: @${info.username}`);

            if (isProduction) {
                // Token secreto derivado del bot token: rechaza POSTs falsos al webhook
                const secret = crypto.createHash('sha256')
                    .update(process.env.TELEGRAM_BOT_TOKEN)
                    .digest('hex')
                    .slice(0, 64);

                app.use(bot.webhookCallback(WEBHOOK_PATH, { secretToken: secret }));

                return bot.telegram.setWebhook(`${process.env.BACKEND_URL}${WEBHOOK_PATH}`, { secret_token: secret })
                    .then(() => console.log(`🪝 Bot en modo webhook: ${process.env.BACKEND_URL}${WEBHOOK_PATH}`));
            }

            // Polling local: si otra instancia (Render) ya está conectada, avisar sin tumbar el servidor
            bot.launch().catch(err => {
                if (err.response?.error_code === 409) {
                    console.warn('⚠️  Bot 409: ya hay otra instancia corriendo (¿Render?). Bot local desactivado; el resto del servidor funciona normal.');
                } else {
                    console.error('❌ Error en polling del bot:', err.message);
                }
            });
            console.log('📡 Bot en modo polling (desarrollo local)');
        })
        .then(() => {
            startScheduler(bot);
            startDailySummary(bot);
            startAlertChecker(bot);
            startMarketingScheduler(bot);
        })
        .catch(err => console.error('❌ Error iniciando bot:', err.message));

    process.once('SIGINT', () => { try { bot.stop('SIGINT'); } catch { /* no estaba en polling */ } });
    process.once('SIGTERM', () => { try { bot.stop('SIGTERM'); } catch { /* no estaba en polling */ } });
}
