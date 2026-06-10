# CryptoMind 🧠₿

Plataforma de análisis de criptomonedas con IA: bot de Telegram + aplicación web.

## Características

- 🤖 **Bot de Telegram** — precios, análisis técnico (RSI, MACD, Bollinger), predicciones IA, alertas y scanner automático de señales cada 6h
- 🌐 **Web app** — dashboard de mercado, chat IA, análisis técnico visual, alertas de precio, modo claro/oscuro, español/inglés, 16 divisas
- 🔗 **Vinculación Telegram ↔ Web** — alertas unificadas: las que creas en la web te llegan por Telegram
- 👥 **Roles** — Free / Premium / Admin con límites aplicados en backend
- 💳 **Pagos** — suscripción Premium vía Stripe (checkout + webhooks)
- 🔐 **Auth** — email/contraseña + Google OAuth, JWT

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js, Express, Telegraf |
| IA | Groq (Llama 3.3 70B) |
| Datos crypto | CoinGecko API (con caché TTL) |
| Frontend | React 19, Vite, React Router, Framer Motion, Chart.js |
| Base de datos | Supabase (PostgreSQL) con fallback en memoria |
| Pagos | Stripe (suscripciones) |

## Desarrollo local

```bash
# Backend (puerto 3001)
cd server
cp .env.example .env   # llena las variables
npm install
npm run dev

# Frontend (puerto 5173)
cd client
npm install
npm run dev
```

**Base de datos**: crea un proyecto en [Supabase](https://supabase.com), ejecuta `server/schema.sql` en el SQL Editor y copia las credenciales al `.env`.

**Stripe local**: instala el [Stripe CLI](https://github.com/stripe/stripe-cli/releases) y corre:
```bash
stripe listen --forward-to localhost:3001/api/payments/webhook
```

## Estructura

```
server/
  index.js              # Express + arranque del bot
  schema.sql            # Esquema de base de datos
  src/
    controllers/        # auth, chat, payments
    db/                 # Repositorios (Supabase + fallback memoria)
    jobs/               # Scanner de señales, resumen diario
    middleware/         # JWT auth, roles
    services/           # Telegram, IA, crypto, alertas, análisis técnico
client/
  src/
    components/         # Layout, gráficas, guards
    context/            # Auth, Settings (tema/idioma/moneda)
    pages/              # Dashboard, Chat, Analysis, Alerts, Premium, Admin, Settings
    utils/              # API client, traducciones ES/EN
```
