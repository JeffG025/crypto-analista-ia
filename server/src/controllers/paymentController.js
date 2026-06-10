require('dotenv').config();
const userRepo = require('../db/userRepo');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const configured = Boolean(STRIPE_KEY && !STRIPE_KEY.includes('TU_STRIPE') && STRIPE_PRICE_ID && !STRIPE_PRICE_ID.includes('TU_STRIPE'));
const stripe = configured ? require('stripe')(STRIPE_KEY) : null;

if (!configured) {
    console.warn('⚠️  Stripe NO configurado — los pagos están desactivados (ver server/.env)');
}

// ===== Crear sesión de checkout (suscripción Premium) =====
const createCheckout = async (req, res) => {
    if (!configured) {
        return res.status(503).json({ error: 'Los pagos aún no están configurados. Contacta al administrador.' });
    }

    try {
        const user = await userRepo.findById(req.user.id);
        if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
        if (user.role === 'premium' || user.role === 'admin') {
            return res.status(400).json({ error: 'Ya tienes acceso Premium' });
        }

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
            customer_email: user.email,
            client_reference_id: user.id,
            success_url: `${FRONTEND_URL}/premium?status=success`,
            cancel_url: `${FRONTEND_URL}/premium?status=cancelled`,
            metadata: { userId: user.id },
        });

        res.json({ url: session.url });
    } catch (e) {
        console.error('Error creando checkout:', e.message);
        res.status(500).json({ error: 'Error al iniciar el pago' });
    }
};

// ===== Webhook de Stripe =====
// IMPORTANTE: esta ruta usa express.raw() — se registra ANTES de express.json()
const webhook = async (req, res) => {
    if (!configured) return res.status(503).send('Stripe no configurado');

    let event;
    try {
        if (WEBHOOK_SECRET && !WEBHOOK_SECRET.includes('TU_STRIPE')) {
            const signature = req.headers['stripe-signature'];
            event = stripe.webhooks.constructEvent(req.body, signature, WEBHOOK_SECRET);
        } else {
            // Modo dev sin verificación de firma (no usar en producción)
            event = JSON.parse(req.body.toString());
            console.warn('⚠️  Webhook sin verificación de firma (configura STRIPE_WEBHOOK_SECRET)');
        }
    } catch (e) {
        console.error('Webhook inválido:', e.message);
        return res.status(400).send(`Webhook error: ${e.message}`);
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = session.client_reference_id || session.metadata?.userId;
                if (userId) {
                    await userRepo.update(userId, {
                        role: 'premium',
                        stripe_customer_id: session.customer || null,
                    });
                    console.log(`💎 Usuario ${userId} ahora es PREMIUM`);
                }
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const user = await userRepo.findByStripeCustomer(subscription.customer);
                if (user && user.role === 'premium') {
                    await userRepo.update(user.id, { role: 'free' });
                    console.log(`📉 Usuario ${user.id} bajó a FREE (suscripción cancelada)`);
                }
                break;
            }
        }
        res.json({ received: true });
    } catch (e) {
        console.error('Error procesando webhook:', e.message);
        res.status(500).send('Error interno');
    }
};

// Estado de configuración (para que el frontend sepa si mostrar el botón de pago)
const getConfig = (req, res) => {
    res.json({ paymentsEnabled: configured });
};

module.exports = { createCheckout, webhook, getConfig };
