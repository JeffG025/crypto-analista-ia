const express = require('express');
const cors = require('cors');
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

const userRepo = require('./src/db/userRepo');
const alertRepo = require('./src/db/alertRepo');
const usageRepo = require('./src/db/usageRepo');
const linkRepo = require('./src/db/linkRepo');

const app = express();
const PORT = process.env.PORT || 3001;
// Sin barra final: el header Origin del navegador nunca la incluye y CORS exige match exacto
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

// Límites por rol
const FREE_CHAT_PER_DAY = 10;
const FREE_MAX_ALERTS = 3;

app.use(cors({ origin: FRONTEND_URL, credentials: true }));

// ⚠️ El webhook de Stripe necesita el body CRUDO — se registra antes de express.json()
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);

app.use(express.json());

// ===== AUTH =====
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.get('/api/auth/me', authMiddleware, authController.validate);
app.get('/api/auth/google', authController.googleRedirect);
app.get('/api/auth/google/callback', authController.googleCallback);

// ===== ADMIN =====
app.get('/api/admin/users', authMiddleware, requireAdmin, authController.getUsers);
app.patch('/api/admin/users/:id/role', authMiddleware, requireAdmin, authController.updateRole);
app.get('/api/admin/stats', authMiddleware, requireAdmin, authController.getStats);

// ===== CHAT (auth + límite diario para Free) =====
app.post('/api/chat', authMiddleware, async (req, res, next) => {
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
}, chatController.handleChat);

// ===== MERCADO =====
app.get('/api/sentiment', async (req, res) => {
    const data = await cryptoService.getFearAndGreed();
    res.json(data);
});

app.get('/api/market', async (req, res) => {
    const coins = ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple', 'cardano', 'avalanche-2', 'chainlink', 'dogecoin', 'polkadot'];
    const data = await cryptoService.getMarketData(coins, req.query.currency || 'usd');
    res.json(data);
});

// ===== ANÁLISIS TÉCNICO (auth; predicción IA solo Premium/Admin) =====
app.get('/api/analysis', authMiddleware, async (req, res) => {
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
app.get('/api/alerts', authMiddleware, async (req, res) => {
    const list = await alertRepo.listForUser(req.user.id, req.user.telegramId);
    res.json(list);
});

app.post('/api/alerts', authMiddleware, async (req, res) => {
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
});

app.delete('/api/alerts/:id', authMiddleware, async (req, res) => {
    const ok = await alertRepo.remove(parseInt(req.params.id), req.user.id, req.user.telegramId);
    if (!ok) return res.status(404).json({ error: 'Alerta no encontrada' });
    res.json({ success: true });
});

// ===== VINCULACIÓN TELEGRAM =====
app.post('/api/telegram/link', authMiddleware, async (req, res) => {
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
});

app.post('/api/telegram/unlink', authMiddleware, async (req, res) => {
    const updated = await userRepo.update(req.user.id, { telegram_id: null, telegram_username: null });
    res.json({ success: true, user: authController.safeUser(updated) });
});

// ===== PAGOS =====
app.get('/api/payments/config', paymentController.getConfig);
app.post('/api/payments/checkout', authMiddleware, paymentController.createCheckout);

app.get('/', (req, res) => res.send('Servidor CryptoBot funcionando 🚀'));

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
const bot = createBot();
if (bot) {
    const crypto = require('crypto');
    const WEBHOOK_PATH = '/telegram-webhook';
    const isProduction = (process.env.BACKEND_URL || '').startsWith('https');

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
        })
        .catch(err => console.error('❌ Error iniciando bot:', err.message));

    process.once('SIGINT', () => { try { bot.stop('SIGINT'); } catch { /* no estaba en polling */ } });
    process.once('SIGTERM', () => { try { bot.stop('SIGTERM'); } catch { /* no estaba en polling */ } });
}
