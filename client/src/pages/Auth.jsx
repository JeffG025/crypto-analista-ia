import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { authAPI } from '../utils/api';

const floatingCoins = ['₿', 'Ξ', '◎', '●', '◆'];

export default function Auth() {
    const { t, lang, set } = useSettings();
    const [mode, setMode] = useState('login');
    const [form, setForm] = useState({ name: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, register } = useAuth();
    const navigate = useNavigate();

    const handle = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (mode === 'login') await login(form.email, form.password);
            else await register(form.name, form.email, form.password);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || t('auth.unexpected'));
        } finally {
            setLoading(false);
        }
    };

    const switchMode = (m) => {
        setMode(m);
        setError('');
        setForm({ name: '', email: '', password: '' });
    };

    const handleGoogle = () => {
        window.location.href = authAPI.googleUrl();
    };

    const urlError = new URLSearchParams(window.location.search).get('error');

    return (
        <div className="auth-page">
            <div className="auth-bg">
                {floatingCoins.map((coin, i) => (
                    <span key={i} className="floating-coin" style={{ '--i': i }}>{coin}</span>
                ))}
                <div className="auth-grid" />
            </div>

            {/* Selector de idioma flotante */}
            <div className="auth-lang-switch">
                <button
                    className={`seg-btn ${lang === 'es' ? 'active' : ''}`}
                    onClick={() => set({ lang: 'es' })}
                >ES</button>
                <button
                    className={`seg-btn ${lang === 'en' ? 'active' : ''}`}
                    onClick={() => set({ lang: 'en' })}
                >EN</button>
            </div>

            <div className="auth-container">
                {/* Branding panel */}
                <motion.div
                    className="auth-brand"
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="brand-logo">
                        <span className="logo-icon">₿</span>
                        <span className="logo-text">CryptoMind</span>
                    </div>
                    <h1 className="brand-headline">
                        {t('auth.headline1')}<br />
                        <span className="gradient-text">{t('auth.headline2')}</span>
                    </h1>
                    <p className="brand-sub">{t('auth.sub')}</p>
                    <div className="brand-features">
                        {t('auth.features').map((f, i) => (
                            <motion.div
                                key={i}
                                className="brand-feature"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 + i * 0.1 }}
                            >
                                {f}
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* Form panel */}
                <motion.div
                    className="auth-card"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                >
                    <div className="auth-tabs">
                        <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => switchMode('login')}>
                            {t('auth.login')}
                        </button>
                        <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => switchMode('register')}>
                            {t('auth.register')}
                        </button>
                        <div className="tab-indicator" style={{ left: mode === 'login' ? '4px' : 'calc(50% + 4px)' }} />
                    </div>

                    {/* Google OAuth button */}
                    <button className="google-btn" onClick={handleGoogle} type="button">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                        </svg>
                        {t('auth.google')}
                    </button>

                    <div className="auth-divider">
                        <span>{t('auth.orEmail')}</span>
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.form
                            key={mode}
                            onSubmit={handle}
                            className="auth-form"
                            initial={{ opacity: 0, x: mode === 'login' ? -20 : 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            {mode === 'register' && (
                                <div className="field">
                                    <label>{t('auth.name')}</label>
                                    <input type="text" placeholder={t('auth.namePh')} value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>
                            )}
                            <div className="field">
                                <label>{t('auth.email')}</label>
                                <input type="email" placeholder="correo@ejemplo.com" value={form.email}
                                    onChange={e => setForm({ ...form, email: e.target.value })} required />
                            </div>
                            <div className="field">
                                <label>{t('auth.password')}</label>
                                <input type="password"
                                    placeholder={mode === 'register' ? t('auth.passPh') : '••••••••'}
                                    value={form.password}
                                    onChange={e => setForm({ ...form, password: e.target.value })} required />
                            </div>

                            <AnimatePresence>
                                {(error || urlError) && (
                                    <motion.div
                                        className="auth-error"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                    >
                                        ⚠️ {error || (urlError === 'google_failed' ? t('auth.googleFailed') : urlError)}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <motion.button
                                type="submit"
                                className="auth-submit"
                                disabled={loading}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                {loading ? <span className="btn-spinner" /> : (mode === 'login' ? t('auth.enter') : t('auth.create'))}
                            </motion.button>
                        </motion.form>
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    );
}
