const { TwitterApi } = require('twitter-api-v2');
require('dotenv').config();

// Publicación a X (Twitter) vía API oficial v2 con OAuth 1.0a (User Context).
// Solo publica a TU PROPIA cuenta — uso legítimo, no automatiza engagement de terceros.

const KEY = process.env.TWITTER_API_KEY;
const SECRET = process.env.TWITTER_API_SECRET;
const TOKEN = process.env.TWITTER_ACCESS_TOKEN;
const TOKEN_SECRET = process.env.TWITTER_ACCESS_SECRET;

const configured = Boolean(
    KEY && SECRET && TOKEN && TOKEN_SECRET && !String(KEY).includes('TU_TWITTER')
);

const client = configured
    ? new TwitterApi({ appKey: KEY, appSecret: SECRET, accessToken: TOKEN, accessSecret: TOKEN_SECRET })
    : null;

if (configured) {
    console.log('🐦 X (Twitter) conectado — publicación habilitada');
} else {
    console.warn('⚠️  X (Twitter) NO configurado — el contenido se genera pero no se publica (ver .env)');
}

const LIMIT = 280;

// Publica un tweet. Devuelve { id, url } o lanza error con detalle.
const postTweet = async (text) => {
    if (!configured) throw new Error('Twitter no configurado');
    if (!text || !text.trim()) throw new Error('Tweet vacío');
    if (text.length > LIMIT) text = text.slice(0, LIMIT - 1) + '…';

    try {
        const { data } = await client.v2.tweet(text);
        return { id: data.id, url: `https://x.com/i/web/status/${data.id}` };
    } catch (err) {
        // X devuelve detalle en err.data; lo propagamos para verlo en logs/Telegram
        const detail = err.data ? JSON.stringify(err.data) : err.message;
        throw new Error(`X API (${err.code || 'red'}): ${detail}`);
    }
};

const isConfigured = () => configured;

module.exports = { postTweet, isConfigured, LIMIT };
