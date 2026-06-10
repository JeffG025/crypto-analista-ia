const nodemailer = require('nodemailer');
require('dotenv').config();

// Funciona con cualquier SMTP: Gmail (app password), Brevo, Resend, etc.
const HOST = process.env.SMTP_HOST;
const PORT = parseInt(process.env.SMTP_PORT || '587');
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const FROM = process.env.SMTP_FROM || USER;

const configured = Boolean(HOST && USER && PASS && !HOST.includes('TU_SMTP'));

const transporter = configured
    ? nodemailer.createTransport({
        host: HOST,
        port: PORT,
        secure: PORT === 465, // 465 = SSL, 587 = STARTTLS
        auth: { user: USER, pass: PASS },
        connectionTimeout: 10000, // fallar rápido y con error claro en logs
        greetingTimeout: 10000,
    })
    : null;

if (!configured) {
    console.warn('⚠️  SMTP no configurado — recuperación de contraseña desactivada (ver .env)');
}

const sendPasswordReset = async (to, resetUrl, expiryMinutes) => {
    if (!configured) throw new Error('SMTP no configurado');

    await transporter.sendMail({
        from: `"CryptoMind" <${FROM}>`,
        to,
        subject: '🔐 Restablecer tu contraseña — CryptoMind',
        html: `
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
        </div>`,
    });
};

const isConfigured = () => configured;

module.exports = { sendPasswordReset, isConfigured };
