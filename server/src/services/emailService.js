const nodemailer = require('nodemailer');
const axios = require('axios');
require('dotenv').config();

// Render (plan free) bloquea los puertos SMTP salientes (25/465/587).
// Por eso en producción usamos la API HTTPS de Brevo (puerto 443, nunca bloqueado).
// El SMTP clásico queda como alternativa para hosts que sí lo permiten.

// ===== Brevo (API HTTPS) =====
const BREVO_KEY = process.env.BREVO_API_KEY;
const FROM = process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
const brevoConfigured = Boolean(BREVO_KEY && !BREVO_KEY.includes('TU_BREVO') && FROM);

// ===== SMTP (fallback) =====
const HOST = process.env.SMTP_HOST;
const PORT = parseInt(process.env.SMTP_PORT || '587');
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const smtpConfigured = Boolean(HOST && USER && PASS && !HOST.includes('TU_SMTP'));

const transporter = smtpConfigured
    ? nodemailer.createTransport({
        host: HOST,
        port: PORT,
        secure: PORT === 465,
        auth: { user: USER, pass: PASS },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
    })
    : null;

if (brevoConfigured) {
    console.log('📧 Email activo vía Brevo API (HTTPS)');
} else if (smtpConfigured) {
    console.log('📧 Email activo vía SMTP');
} else {
    console.warn('⚠️  Email no configurado — recuperación de contraseña desactivada (ver .env)');
}

const buildResetHtml = (resetUrl, expiryMinutes) => `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0c1220; border-radius: 16px; padding: 32px; color: #e2eaf8;">
        <h1 style="color: #10b981; font-size: 22px; margin: 0 0 8px;">₿ CryptoMind</h1>
        <h2 style="font-size: 17px; margin: 0 0 16px; color: #ffffff;">Restablecer contraseña</h2>
        <p style="color: #8899bb; font-size: 14px; line-height: 1.6;">
            Recibimos una solicitud para restablecer tu contraseña.
            Haz clic en el botón para crear una nueva:
        </p>
        <a href="${resetUrl}"
           style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none;
                  padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 14px; margin: 16px 0;">
            Crear nueva contraseña
        </a>
        <p style="color: #4a5f7a; font-size: 12px; line-height: 1.6;">
            El enlace expira en ${expiryMinutes} minutos y solo puede usarse una vez.<br/>
            Si tú no solicitaste esto, ignora este correo — tu cuenta está segura.
        </p>
    </div>`;

const sendPasswordReset = async (to, resetUrl, expiryMinutes) => {
    const subject = '🔐 Restablecer tu contraseña — CryptoMind';
    const html = buildResetHtml(resetUrl, expiryMinutes);

    if (brevoConfigured) {
        try {
            await axios.post('https://api.brevo.com/v3/smtp/email', {
                sender: { name: 'CryptoMind', email: FROM },
                to: [{ email: to }],
                subject,
                htmlContent: html,
            }, {
                headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
                timeout: 15000,
            });
            return;
        } catch (err) {
            // Errores típicos de Brevo: sender no verificado, key inválida
            const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
            throw new Error(`Brevo (${err.response?.status || 'red'}): ${detail}`);
        }
    }

    if (smtpConfigured) {
        await transporter.sendMail({ from: `"CryptoMind" <${FROM}>`, to, subject, html });
        return;
    }

    throw new Error('Email no configurado');
};

const isConfigured = () => brevoConfigured || smtpConfigured;

module.exports = { sendPasswordReset, isConfigured };
