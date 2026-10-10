const { Telegraf } = require('telegraf');
const aiService = require('./aiService');
const cryptoService = require('./cryptoService');
const technicalService = require('./technicalService');
const { DISCLAIMER } = require('./technicalService');
const { checkLimit } = require('./rateLimiter');
const alertRepo = require('../db/alertRepo');
const userRepo = require('../db/userRepo');
const linkRepo = require('../db/linkRepo');
const { runScanner, getLastMessageUrl, getChannelUrl, isOnCooldown, minutesUntilReady } = require('../jobs/signalScheduler');
const { runDailyContent, publishPending, discardPending } = require('../jobs/marketingScheduler');

// Historial de conversación por usuario (en memoria, se resetea al reiniciar el servidor)
const userSessions = new Map();

const getHistory = (userId) => userSessions.get(userId) || [];

const addToHistory = (userId, role, content) => {
    const history = getHistory(userId);
    history.push({ role, content });
    // Máximo 10 mensajes para no sobrecargar el prompt de Gemini
    if (history.length > 10) history.shift();
    userSessions.set(userId, history);
};

// Escapar caracteres especiales para HTML de Telegram
const escapeHTML = (text) => {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

const formatPrice = (price) => {
    if (price === null || price === undefined) return 'N/A';
    if (price >= 1) return `$${price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${price.toFixed(6)}`;
};

// Etiquetas del dictamen direccional, iguales a las de la web
const DIRECTION_LABEL = { UP: 'Al alza', DOWN: 'A la baja', FLAT: 'Sin dirección' };
const VERDICT_LABEL = {
    EDGE: 'ventaja medida sobre el mercado',
    NO_EDGE: 'sin ventaja demostrable',
    WORSE: 'peor que el mercado'
};

// Rango esperado: la parte calibrada del análisis. Se omite si falta la tabla de calibración.
const formatBandBlock = (band) => {
    if (!band) return '';
    return (
        `<b>📐 Rango esperado (${band.horizonDays} días):</b>\n` +
        `<code>${formatPrice(band.low)} — ${formatPrice(band.high)}</code>\n` +
        `Confianza ${band.level}% · verificado: acierta <b>${band.coverage}%</b>\n` +
        `<i>Dice cuánto puede moverse, no hacia dónde.</i>\n\n`
    );
};

// Sesgo direccional con su acierto histórico medido
const formatDirectionalBlock = (d) => {
    if (!d) return '';
    return (
        `<b>🧭 Sesgo direccional:</b> ${DIRECTION_LABEL[d.direction] || '—'} — ${VERDICT_LABEL[d.verdict] || 'sin datos suficientes'}\n` +
        `Acierta <b>${d.reliability}%</b> ±${d.ci95} · baseline del mercado ${d.baseline}% · ${d.sampleSize.toLocaleString('es-MX')} casos medidos\n` +
        `<i>Acierto histórico medido sobre 5 años, no una probabilidad del análisis de hoy.</i>\n\n`
    );
};

const formatMarketMessage = (coins) => {
    if (!coins || coins.length === 0) return '❌ No se encontraron datos de mercado.';

    return coins.map(coin => {
        const change = coin.price_change_24h;
        const isPositive = change >= 0;
        const changeEmoji = isPositive ? '📈' : '📉';
        const changeSign = isPositive ? '+' : '';

        return (
            `${changeEmoji} <b>${escapeHTML(coin.name)} (${escapeHTML(coin.symbol.toUpperCase())})</b>\n` +
            `💰 Precio: <code>${formatPrice(coin.current_price)}</code>\n` +
            `${changeEmoji} 24h: <code>${changeSign}${change?.toFixed(2) ?? 'N/A'}%</code>\n` +
            `📊 Máx: <code>${formatPrice(coin.high_24h)}</code>  |  Mín: <code>${formatPrice(coin.low_24h)}</code>`
        );
    }).join('\n\n');
};

const formatPredictionMessage = (ta, aiAnalysis) => {
    const changeEmoji = parseFloat(ta.priceChange24h) >= 0 ? '📈' : '📉';

    // Barra visual de concordancia entre indicadores
    const filledBars = Math.round(ta.agreement / 10);
    const agreementBar = '█'.repeat(filledBars) + '░'.repeat(10 - filledBars);

    return (
        `${ta.emoji} <b>Señal Técnica — ${ta.coinId.toUpperCase()}: ${escapeHTML(ta.signal)}</b>\n\n` +
        `💰 Precio: <code>$${parseFloat(ta.currentPrice).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</code>\n` +
        `${changeEmoji} Cambio 24h: <code>${ta.priceChange24h}%</code>  |  7d: <code>${ta.priceChange7d}%</code>\n\n` +
        formatBandBlock(ta.band) +
        `<b>📊 Indicadores técnicos:</b>\n` +
        `• RSI (14): <code>${ta.rsi}</code>\n` +
        `• MACD: <code>${ta.macd?.value ?? 'N/A'}</code>  |  Señal: <code>${ta.macd?.signal ?? 'N/A'}</code>\n` +
        `• SMA20: <code>$${ta.sma20}</code>  |  SMA50: <code>$${ta.sma50}</code>\n` +
        `• BB Superior: <code>$${ta.bollingerBands?.upper}</code>  |  Inferior: <code>$${ta.bollingerBands?.lower}</code>\n\n` +
        `<b>🔍 Señales detectadas:</b>\n` +
        ta.signals.map(s => `• ${escapeHTML(s)}`).join('\n') + '\n\n' +
        `<b>🤖 Análisis IA:</b>\n${escapeHTML(aiAnalysis)}\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `<b>📌 Lectura técnica:</b>\n` +
        `${escapeHTML(ta.verdict)}\n\n` +
        formatDirectionalBlock(ta.directional) +
        `🔗 Concordancia entre indicadores: <b>${ta.agreement}%</b>\n` +
        `<code>${agreementBar}</code>\n` +
        `<i>Mide qué tan de acuerdo están los indicadores entre sí, no qué tan seguido aciertan.</i>\n\n` +
        `<i>⚠️ ${DISCLAIMER} El mercado cripto es volátil; invierte solo lo que estés dispuesto a perder.</i>`
    );
};

// Devuelve true si el usuario está bloqueado, y responde automáticamente
const isRateLimited = async (ctx) => {
    const result = checkLimit(ctx.from.id);
    if (!result.allowed) {
        await ctx.reply(
            `⛔ Alcanzaste el límite de 15 consultas por hora.\n` +
            `Podrás volver a usar el bot en ${result.minutesLeft} minuto${result.minutesLeft === 1 ? '' : 's'}.`
        );
        return true;
    }
    return false;
};

const getFearGreedLabel = (value) => {
    const v = parseInt(value);
    if (v <= 25) return '😱 Miedo Extremo';
    if (v <= 45) return '😨 Miedo';
    if (v <= 55) return '😐 Neutral';
    if (v <= 75) return '😏 Codicia';
    return '🤑 Codicia Extrema';
};

const createBot = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.warn('⚠️  TELEGRAM_BOT_TOKEN no configurado. Bot de Telegram desactivado.');
        return null;
    }

    const bot = new Telegraf(token);

    // /start
    bot.start(async (ctx) => {
        const name = ctx.from.first_name || 'trader';
        await ctx.replyWithHTML(
            `🚀 <b>Bienvenido a CryptoMind, ${escapeHTML(name)}!</b>\n\n` +
            `Soy tu analista de criptomonedas con IA. Puedo responder preguntas, ` +
            `darte precios en tiempo real y analizar el mercado.\n\n` +
            `<b>Prueba preguntarme:</b>\n` +
            `• ¿A cuánto está Bitcoin?\n` +
            `• Analiza Ethereum\n` +
            `• Compara BTC y SOL\n` +
            `• ¿Qué es el halving?\n\n` +
            `Escribe /help para ver todos los comandos.`
        );
    });

    // /help
    bot.help(async (ctx) => {
        await ctx.replyWithHTML(
            `<b>📋 Comandos disponibles</b>\n\n` +
            `/precio [cripto] — Precio actual\n` +
            `  Ej: <code>/precio btc</code>\n\n` +
            `/prediccion [cripto] — Señal técnica: sube / baja / neutral\n` +
            `  Ej: <code>/prediccion ethereum</code>\n\n` +
            `/analisis [cripto] — Análisis IA detallado\n` +
            `  Ej: <code>/analisis solana</code>\n\n` +
            `/mercado — Top 5 criptos + Fear &amp; Greed\n\n` +
            `/alerta [cripto] [precio] — Alerta de precio\n` +
            `  Ej: <code>/alerta bitcoin 90000</code>\n\n` +
            `/misalertas — Ver tus alertas activas\n\n` +
            `/vincular — Conecta tu cuenta de la web 🌐\n\n` +
            `/scanner — Escanear top 10 criptos (admin)\n\n` +
            `/contenido — Generar tweet del día (admin)\n\n` +
            `/start — Reiniciar el bot\n\n` +
            `<b>💬 O escríbeme en lenguaje natural:</b>\n` +
            `<i>"¿Subirá Bitcoin esta semana?"</i>\n` +
            `<i>"¿Es buen momento para comprar ETH?"</i>`
        );
    });

    // /precio [coin]
    bot.command('precio', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        const coin = args.join(' ').trim() || 'bitcoin';

        await ctx.sendChatAction('typing');

        const data = await cryptoService.getMarketData([coin.toLowerCase()]);

        if (!data || data.length === 0) {
            return ctx.reply(
                `❌ No encontré datos para "${coin}".\n` +
                `Intenta con el símbolo (btc, eth, sol) o el nombre completo.`
            );
        }

        await ctx.replyWithHTML(formatMarketMessage(data));
    });

    // /analisis [coin]
    bot.command('analisis', async (ctx) => {
        if (await isRateLimited(ctx)) return;
        const args = ctx.message.text.split(' ').slice(1);
        const coin = args.join(' ').trim() || 'bitcoin';

        await ctx.sendChatAction('typing');

        const [data, fearGreed] = await Promise.all([
            cryptoService.getMarketData([coin.toLowerCase()]),
            cryptoService.getFearAndGreed()
        ]);

        // Construimos un contexto rico para que la IA analice con datos reales
        const contextMsg = data.length > 0
            ? `Analiza ${data[0].name}: precio $${data[0].current_price}, ` +
              `cambio 24h: ${data[0].price_change_24h?.toFixed(2)}%, ` +
              `Fear & Greed: ${fearGreed.value} (${fearGreed.value_classification}). ` +
              `Da un análisis breve y directo del momento del mercado para esta cripto.`
            : `Da un análisis breve de ${coin} en el contexto del mercado cripto actual.`;

        const aiResponse = await aiService.analyzeIntent(contextMsg, []);

        let message = '';

        if (data.length > 0) {
            message += formatMarketMessage(data) + '\n\n';
        }

        message += `<b>🤖 Análisis IA:</b>\n${escapeHTML(aiResponse.reply)}`;

        await ctx.replyWithHTML(message);
    });

    // /prediccion [coin]
    bot.command('prediccion', async (ctx) => {
        if (await isRateLimited(ctx)) return;
        const args = ctx.message.text.split(' ').slice(1);
        const coin = args.join(' ').trim() || 'bitcoin';

        await ctx.sendChatAction('typing');
        await ctx.reply(`⏳ Calculando indicadores técnicos para ${coin.toUpperCase()}... (puede tomar unos segundos)`);

        try {
            const [ta, marketData] = await Promise.all([
                technicalService.analyzeTechnicals(coin.toLowerCase()),
                cryptoService.getMarketData([coin.toLowerCase()])
            ]);

            await ctx.sendChatAction('typing');
            const aiAnalysis = await aiService.generatePrediction(ta);

            await ctx.replyWithHTML(formatPredictionMessage(ta, aiAnalysis));

        } catch (error) {
            console.error('Error en /prediccion:', error.message);
            await ctx.reply(
                `❌ No se pudieron calcular los indicadores para "${coin}".\n` +
                `Intenta con el nombre completo: bitcoin, ethereum, solana, etc.`
            );
        }
    });

    // /scanner — disparo manual del análisis de mercado (solo admin)
    bot.command('scanner', async (ctx) => {
        const adminId = process.env.BOT_ADMIN_ID;
        if (adminId && String(ctx.from.id) !== String(adminId)) {
            return ctx.reply('⛔ Este comando es solo para el administrador del bot.');
        }

        try {
            // Verificar cooldown ANTES de empezar
            if (isOnCooldown()) {
                const lastUrl = getLastMessageUrl();
                const channelUrl = getChannelUrl();
                const linkUrl = lastUrl || channelUrl;

                return ctx.reply(
                    `⏳ Ya se envió un scanner hace menos de 10 minutos.\nFaltan ${minutesUntilReady()} min para el próximo.`,
                    linkUrl ? {
                        reply_markup: {
                            inline_keyboard: [[{
                                text: '👀 Ve a ver el último scanner al canal',
                                url: linkUrl
                            }]]
                        }
                    } : {}
                );
            }

            await ctx.reply('⏳ Escaneando top 10 criptos... puede tomar unos segundos.');
            await ctx.sendChatAction('typing');
            await runScanner(bot);

            // Confirmación con botón al canal
            const lastUrl = getLastMessageUrl();
            const channelUrl = getChannelUrl();
            const linkUrl = lastUrl || channelUrl;

            await ctx.reply(
                '✅ Scanner completado y publicado en el canal.',
                linkUrl ? {
                    reply_markup: {
                        inline_keyboard: [[{
                            text: '📢 Ver en el canal',
                            url: linkUrl
                        }]]
                    }
                } : {}
            );

        } catch (err) {
            console.error('Error en /scanner:', err.message);
            await ctx.reply('❌ Error al ejecutar el scanner. Revisa los logs del servidor.');
        }
    });


    // /alerta [coin] [precio] — Ej: /alerta bitcoin 90000
    bot.command('alerta', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);

        if (args.length < 2) {
            return ctx.replyWithHTML(
                `<b>📌 Uso correcto:</b>\n` +
                `<code>/alerta [cripto] [precio]</code>\n\n` +
                `<b>Ejemplos:</b>\n` +
                `<code>/alerta bitcoin 90000</code>\n` +
                `<code>/alerta eth 3000</code>`
            );
        }

        const coin = args[0].toLowerCase();
        const targetPrice = parseFloat(args[1].replace(/,/g, ''));

        if (isNaN(targetPrice) || targetPrice <= 0) {
            return ctx.reply('❌ El precio debe ser un número válido. Ej: /alerta bitcoin 90000');
        }

        await ctx.sendChatAction('typing');

        // Obtener precio actual para saber la dirección
        const data = await cryptoService.getMarketData([coin]);
        if (!data || data.length === 0) {
            return ctx.reply(`❌ No encontré la cripto "${coin}". Usa el nombre completo: bitcoin, ethereum, solana...`);
        }

        const currentPrice = data[0].current_price;
        const condition = targetPrice > currentPrice ? 'above' : 'below';
        const dirText = condition === 'above' ? '📈 suba a' : '📉 baje a';

        // Si está vinculado a una cuenta web, la alerta se asocia y respeta su plan
        const linkedUser = await userRepo.findByTelegramId(ctx.from.id);
        const role = linkedUser?.role || 'free';

        if (role === 'free') {
            const count = linkedUser
                ? await alertRepo.countActiveForUser(linkedUser.id, ctx.from.id)
                : (await alertRepo.listForTelegram(ctx.from.id)).length;
            if (count >= 3) {
                return ctx.replyWithHTML(
                    `⛔ El plan Free permite máximo <b>3 alertas activas</b>.\n` +
                    `Elimina alguna o actualiza a <b>Premium</b> en la web para alertas ilimitadas. ✨`
                );
            }
        }

        await alertRepo.create({
            userId: linkedUser?.id || null,
            telegramId: ctx.from.id,
            telegramChatId: ctx.chat.id,
            coinId: coin,
            coinName: data[0].name,
            coinSymbol: data[0].symbol,
            condition,
            targetPrice,
            source: 'telegram',
        });

        const formattedTarget = targetPrice.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formattedCurrent = currentPrice.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        await ctx.replyWithHTML(
            `🔔 <b>Alerta creada</b>\n\n` +
            `Te avisaré cuando <b>${escapeHTML(data[0].name)}</b> ${dirText} <code>$${formattedTarget}</code>\n` +
            `Precio actual: <code>$${formattedCurrent}</code>\n\n` +
            `<i>La alerta se revisa cada 5 minutos.</i>` +
            (linkedUser ? '\n<i>🌐 También visible en tu cuenta web.</i>' : '')
        );
    });

    // /misalertas — Ver alertas activas
    bot.command('misalertas', async (ctx) => {
        const alerts = await alertRepo.listForTelegram(ctx.from.id);

        if (alerts.length === 0) {
            return ctx.reply('No tienes alertas activas.\nCrea una con /alerta [cripto] [precio]');
        }

        let message = `<b>🔔 Tus alertas activas (${alerts.length}):</b>\n\n`;
        alerts.forEach((alert, i) => {
            const dirEmoji = alert.condition === 'above' ? '📈' : '📉';
            const formattedPrice = alert.targetPrice.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            message += `${i + 1}. ${dirEmoji} <b>${(alert.coinSymbol || alert.coinId).toUpperCase()}</b> → <code>$${formattedPrice}</code>\n`;
        });

        await ctx.replyWithHTML(message);
    });

    // /vincular — Conectar cuenta web con Telegram
    bot.command('vincular', async (ctx) => {
        try {
            // ¿Ya está vinculado?
            const existing = await userRepo.findByTelegramId(ctx.from.id);
            if (existing) {
                const masked = existing.email.replace(/^(..).*(@.*)$/, '$1•••$2');
                return ctx.replyWithHTML(
                    `✅ Tu Telegram ya está vinculado a la cuenta <b>${escapeHTML(masked)}</b>.\n\n` +
                    `Tus alertas del bot y de la web están unificadas. ` +
                    `Si quieres desvincularlo, hazlo desde Configuración en la web.`
                );
            }

            const { code, expiresInMinutes } = await linkRepo.createCode(
                ctx.from.id,
                ctx.from.username || ctx.from.first_name || null,
                ctx.chat.id
            );

            await ctx.replyWithHTML(
                `🔗 <b>Vincular con la web</b>\n\n` +
                `Tu código es:\n\n` +
                `<code>${code}</code>\n\n` +
                `1. Entra a la web de CryptoMind\n` +
                `2. Ve a <b>Configuración → Telegram</b>\n` +
                `3. Ingresa este código\n\n` +
                `<i>⏱ Expira en ${expiresInMinutes} minutos. Al vincular, recibirás aquí las alertas que crees en la web.</i>`
            );
        } catch (err) {
            console.error('Error en /vincular:', err.message);
            await ctx.reply('❌ Error generando el código. Intenta de nuevo.');
        }
    });

    // /mercado
    bot.command('mercado', async (ctx) => {
        await ctx.sendChatAction('typing');

        const [topCoins, fearGreed] = await Promise.all([
            cryptoService.getMarketData(['bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple']),
            cryptoService.getFearAndGreed()
        ]);

        const header =
            `<b>📊 Estado del Mercado Cripto</b>\n` +
            `🌡️ Fear &amp; Greed: <code>${fearGreed.value}/100 — ${escapeHTML(getFearGreedLabel(fearGreed.value))}</code>\n\n`;

        await ctx.replyWithHTML(header + formatMarketMessage(topCoins));
    });

    // Mensajes de texto libre — el núcleo del bot
    bot.on('text', async (ctx) => {
        const userMessage = ctx.message.text;

        if (userMessage.startsWith('/')) return;

        if (await isRateLimited(ctx)) return;

        const userId = ctx.from.id;
        const history = getHistory(userId);

        await ctx.sendChatAction('typing');

        try {
            const aiResponse = await aiService.analyzeIntent(userMessage, history);

            // Persistir en historial del usuario
            addToHistory(userId, 'user', userMessage);
            addToHistory(userId, 'assistant', aiResponse.reply);

            // Respuesta de texto puro
            if (aiResponse.type === 'text') {
                await ctx.replyWithHTML(escapeHTML(aiResponse.reply));
                return;
            }

            // Predicción técnica solicitada por lenguaje natural
            if (aiResponse.type === 'prediction') {
                let coins = aiResponse.coins || ['bitcoin'];
                if (typeof coins === 'string') coins = [coins];

                await ctx.reply(`⏳ Calculando indicadores técnicos para ${coins[0].toUpperCase()}...`);
                await ctx.sendChatAction('typing');

                const ta = await technicalService.analyzeTechnicals(coins[0]);
                const aiAnalysis = await aiService.generatePrediction(ta);

                await ctx.replyWithHTML(formatPredictionMessage(ta, aiAnalysis));
                return;
            }

            // Para chart o comparison: enriquecer con datos de mercado reales
            let coins = aiResponse.coins || ['bitcoin'];
            if (typeof coins === 'string') coins = [coins];

            await ctx.sendChatAction('typing');

            const marketData = await cryptoService.getMarketData(coins);

            let message = escapeHTML(aiResponse.reply);

            if (marketData.length > 0) {
                message += '\n\n' + formatMarketMessage(marketData);
                message += '\n\n<i>📊 Gráficas detalladas disponibles en la plataforma web.</i>';
            }

            await ctx.replyWithHTML(message);

        } catch (error) {
            console.error('❌ Error en bot Telegram:', error.message);
            await ctx.reply('❌ Hubo un error procesando tu consulta. Por favor intenta de nuevo.');
        }
    });

    // /contenido — genera el tweet del día bajo demanda (solo admin)
    bot.command('contenido', async (ctx) => {
        const adminId = process.env.BOT_ADMIN_ID;
        if (adminId && String(ctx.from.id) !== String(adminId)) {
            return ctx.reply('⛔ Este comando es solo para el administrador del bot.');
        }
        await ctx.reply('✍️ Generando el tweet del día con datos reales...');
        await ctx.sendChatAction('typing');
        try {
            await runDailyContent(bot);
        } catch (err) {
            console.error('Error en /contenido:', err.message);
            await ctx.reply('❌ No se pudo generar el contenido. Revisa los logs.');
        }
    });

    // --- Botones del asistente de contenido ---
    bot.action(/^twpub:(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery('Publicando en X...');
        try {
            const res = await publishPending(ctx.match[1]);
            await ctx.editMessageReplyMarkup({
                inline_keyboard: [[{ text: '✅ Publicado — ver en X', url: res.url }]]
            });
            await ctx.reply('🐦 ¡Publicado en X!');
        } catch (err) {
            console.error('Error publicando tweet:', err.message);
            await ctx.reply(`❌ No se pudo publicar: ${err.message}`);
        }
    });

    bot.action('twgen', async (ctx) => {
        await ctx.answerCbQuery('Generando otra versión...');
        try {
            await runDailyContent(bot);
        } catch (err) {
            await ctx.reply(`❌ Error generando: ${err.message}`);
        }
    });

    bot.action(/^twdis:(\d+)$/, async (ctx) => {
        discardPending(ctx.match[1]);
        await ctx.answerCbQuery('Descartado');
        await ctx.editMessageReplyMarkup({ inline_keyboard: [[{ text: '❌ Descartado', callback_data: 'noop' }]] });
    });

    bot.action('noop', (ctx) => ctx.answerCbQuery());

    bot.catch((err) => {
        console.error('❌ Error en Telegraf:', err.message);
    });

    return bot;
};

// formatPredictionMessage se exporta para poder verificar el mensaje sin lanzar el bot
module.exports = { createBot, formatPredictionMessage };
