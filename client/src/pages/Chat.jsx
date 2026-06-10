import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cryptoAPI } from '../utils/api';
import { useSettings } from '../context/SettingsContext';
import { CURRENCIES } from '../utils/translations';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CryptoChart from '../components/CryptoChart';
import CryptoStats from '../components/CryptoStats';

function TypewriterText({ text }) {
    const [displayed, setDisplayed] = useState('');
    useEffect(() => {
        let i = 0;
        const t = setInterval(() => {
            setDisplayed(text.slice(0, i + 1));
            i++;
            if (i >= text.length) clearInterval(t);
        }, 8);
        return () => clearInterval(t);
    }, [text]);
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayed}</ReactMarkdown>;
}

export default function Chat() {
    const { currency, set, t, lang } = useSettings();
    const [sessions, setSessions] = useState(() => {
        try { return JSON.parse(localStorage.getItem('cm_sessions') || '[]'); } catch { return []; }
    });
    const [sessionId, setSessionId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSessions, setShowSessions] = useState(false);
    const messagesEnd = useRef(null);

    useEffect(() => {
        if (sessions.length === 0) createSession();
        else loadSession(sessions[0].id);
    }, []);

    useEffect(() => {
        localStorage.setItem('cm_sessions', JSON.stringify(sessions));
    }, [sessions]);

    useEffect(() => {
        if (!sessionId || messages.length === 0) return;
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages } : s));
    }, [messages]);

    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const createSession = () => {
        const id = Date.now();
        const welcome = [{ role: 'bot', type: 'text', content: t('chat.welcome') }];
        setSessions(prev => [{ id, title: t('chat.newChatTitle'), messages: welcome }, ...prev]);
        setSessionId(id);
        setMessages(welcome);
        setShowSessions(false);
    };

    const loadSession = (id) => {
        const s = sessions.find(s => s.id === id);
        if (!s) return;
        setSessionId(id);
        setMessages(s.messages);
        setShowSessions(false);
    };

    const deleteSession = (e, id) => {
        e.stopPropagation();
        const remaining = sessions.filter(s => s.id !== id);
        setSessions(remaining);
        if (id === sessionId) {
            if (remaining.length > 0) loadSession(remaining[0].id);
            else createSession();
        }
    };

    const sendMessage = async (text) => {
        const msg = (text || input).trim();
        if (!msg || loading) return;
        setInput('');

        const userMsg = { role: 'user', type: 'text', content: msg };
        const next = [...messages, userMsg];
        setMessages(next);

        if (messages.length <= 1) {
            setSessions(prev => prev.map(s =>
                s.id === sessionId
                    ? { ...s, title: msg.slice(0, 38) + (msg.length > 38 ? '…' : '') }
                    : s
            ));
        }

        setLoading(true);
        try {
            const history = messages.slice(-8).map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                content: m.content
            }));
            const res = await cryptoAPI.chat({ message: msg, history, currency, lang });
            const d = res.data;
            const botMsg = {
                role: 'bot', type: d.type,
                content: d.text || d.reply || '...',
                chartData: d.chartData, stats: d.stats,
                coins: d.coins, days: d.days,
                currency, isNew: true
            };
            setMessages(prev => [...prev, botMsg]);
        } catch (err) {
            // Si el servidor manda un mensaje específico (ej. límite diario), mostrarlo
            const serverMsg = err.response?.data?.error;
            setMessages(prev => [...prev, { role: 'bot', type: 'text', content: serverMsg || t('chat.error') }]);
        } finally {
            setLoading(false);
        }
    };

    const isVisual = (msg) => msg.type === 'chart' || msg.type === 'comparison';
    const suggestions = t('chat.suggestions');

    return (
        <div className="chat-page">
            {/* Sessions drawer overlay */}
            <AnimatePresence>
                {showSessions && (
                    <motion.div
                        className="sessions-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowSessions(false)}
                    />
                )}
            </AnimatePresence>

            {/* Sessions drawer */}
            <AnimatePresence>
                {showSessions && (
                    <motion.div
                        className="sessions-drawer"
                        initial={{ x: -280 }}
                        animate={{ x: 0 }}
                        exit={{ x: -280 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    >
                        <div className="sessions-drawer-header">
                            <span>{t('chat.conversations')}</span>
                            <button className="sessions-new-btn" onClick={createSession}>{t('chat.new')}</button>
                        </div>
                        <div className="sessions-list">
                            {sessions.map(s => (
                                <div
                                    key={s.id}
                                    className={`session-item ${s.id === sessionId ? 'active' : ''}`}
                                    onClick={() => loadSession(s.id)}
                                >
                                    <span className="session-title">◈ {s.title}</span>
                                    <button className="session-delete" onClick={(e) => deleteSession(e, s.id)}>✕</button>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Chat header */}
            <div className="chat-header">
                <div className="chat-header-left">
                    <button className="sessions-toggle" onClick={() => setShowSessions(true)}>☰</button>
                    <h2 className="chat-title-text">{t('chat.title')}</h2>
                </div>
                <select
                    className="form-select currency-dropdown"
                    value={currency}
                    onChange={e => set({ currency: e.target.value })}
                >
                    {CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>{c.code.toUpperCase()}</option>
                    ))}
                </select>
            </div>

            {/* Messages area */}
            <div className="chat-messages">
                <AnimatePresence initial={false}>
                    {messages.map((msg, i) => {
                        const isLast = i === messages.length - 1;
                        return (
                            <motion.div
                                key={`${sessionId}-${i}`}
                                className={`chat-msg ${msg.role}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="chat-avatar">
                                    {msg.role === 'bot' ? '₿' : '◆'}
                                </div>
                                <div className="chat-bubble-wrap">
                                    <div className="chat-bubble">
                                        {isLast && msg.isNew && msg.role === 'bot'
                                            ? <TypewriterText text={msg.content} />
                                            : <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                        }
                                    </div>
                                    {isVisual(msg) && msg.chartData && (
                                        <div className="chat-chart-wrap">
                                            <CryptoChart data={msg.chartData} currencyCode={msg.currency || 'usd'} />
                                        </div>
                                    )}
                                    {isVisual(msg) && msg.stats && (
                                        <CryptoStats stats={msg.stats} currencyCode={msg.currency || 'usd'} />
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {loading && (
                    <motion.div
                        className="chat-msg bot"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div className="chat-avatar">₿</div>
                        <div className="chat-typing">
                            <span /><span /><span />
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEnd} />
            </div>

            {/* Suggestions (only on fresh chat) */}
            {messages.length <= 1 && (
                <div className="chat-suggestions">
                    {suggestions.map((s, i) => (
                        <button key={i} className="chat-suggestion" onClick={() => sendMessage(s.label)} disabled={loading}>
                            <span>{s.icon}</span> {s.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="chat-input-row">
                <input
                    className="chat-input"
                    type="text"
                    placeholder={t('chat.placeholder')}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    disabled={loading}
                />
                <button
                    className="chat-send-btn"
                    onClick={() => sendMessage()}
                    disabled={loading || !input.trim()}
                >
                    {loading ? <span className="btn-spinner" /> : '↑'}
                </button>
            </div>
        </div>
    );
}
