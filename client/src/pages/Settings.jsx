import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { telegramAPI } from '../utils/api';
import { CURRENCIES } from '../utils/translations';

const ROLE_COLORS = { admin: '#f59e0b', premium: '#8b5cf6', free: '#4a5f7a' };
const REFRESH_OPTIONS = [0, 30, 60, 120, 300];

const section = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
};

export default function Settings() {
    const { theme, lang, currency, animations, refresh, set, t } = useSettings();
    const { user, logout, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [cleared, setCleared] = useState(false);
    const [tgCode, setTgCode] = useState('');
    const [tgLoading, setTgLoading] = useState(false);
    const [tgError, setTgError] = useState('');
    const [tgSuccess, setTgSuccess] = useState(false);

    const clearChat = () => {
        if (!window.confirm(t('settings.confirmClear'))) return;
        localStorage.removeItem('cm_sessions');
        setCleared(true);
        setTimeout(() => setCleared(false), 2500);
    };

    const handleLogout = () => { logout(); navigate('/auth'); };

    const linkTelegram = async (e) => {
        e.preventDefault();
        if (!tgCode.trim() || tgLoading) return;
        setTgLoading(true);
        setTgError('');
        try {
            await telegramAPI.link(tgCode.trim());
            await refreshUser();
            setTgCode('');
            setTgSuccess(true);
            setTimeout(() => setTgSuccess(false), 3000);
        } catch (err) {
            setTgError(err.response?.data?.error || t('tg.invalidCode'));
        } finally {
            setTgLoading(false);
        }
    };

    const unlinkTelegram = async () => {
        setTgLoading(true);
        try {
            await telegramAPI.unlink();
            await refreshUser();
        } catch { /* ignore */ }
        finally { setTgLoading(false); }
    };

    const refreshLabel = (s) =>
        s === 0 ? t('settings.refreshOff') : s < 60 ? `${s}s` : `${s / 60} min`;

    return (
        <div className="page settings-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">{t('settings.title')}</h1>
                    <p className="page-sub">{t('settings.subtitle')}</p>
                </div>
            </div>

            <motion.div
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.07 } } }}
                className="settings-sections"
            >
                {/* ===== APARIENCIA ===== */}
                <motion.div className="settings-section" variants={section}>
                    <h2 className="settings-section-title">{t('settings.appearance')}</h2>

                    <div className="settings-row">
                        <div className="settings-row-info">
                            <span className="settings-label">{t('settings.theme')}</span>
                            <span className="settings-desc">{t('settings.themeDesc')}</span>
                        </div>
                        <div className="seg-control">
                            <button
                                className={`seg-btn ${theme === 'dark' ? 'active' : ''}`}
                                onClick={() => set({ theme: 'dark' })}
                            >
                                {t('settings.dark')}
                            </button>
                            <button
                                className={`seg-btn ${theme === 'light' ? 'active' : ''}`}
                                onClick={() => set({ theme: 'light' })}
                            >
                                {t('settings.light')}
                            </button>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-info">
                            <span className="settings-label">{t('settings.animations')}</span>
                            <span className="settings-desc">{t('settings.animationsDesc')}</span>
                        </div>
                        <button
                            className={`switch ${animations ? 'on' : ''}`}
                            onClick={() => set({ animations: !animations })}
                            aria-label={t('settings.animations')}
                        />
                    </div>
                </motion.div>

                {/* ===== IDIOMA Y MONEDA ===== */}
                <motion.div className="settings-section" variants={section}>
                    <h2 className="settings-section-title">{t('settings.preferences')}</h2>

                    <div className="settings-row">
                        <div className="settings-row-info">
                            <span className="settings-label">{t('settings.language')}</span>
                            <span className="settings-desc">{t('settings.languageDesc')}</span>
                        </div>
                        <div className="seg-control">
                            <button
                                className={`seg-btn ${lang === 'es' ? 'active' : ''}`}
                                onClick={() => set({ lang: 'es' })}
                            >
                                🇲🇽 Español
                            </button>
                            <button
                                className={`seg-btn ${lang === 'en' ? 'active' : ''}`}
                                onClick={() => set({ lang: 'en' })}
                            >
                                🇺🇸 English
                            </button>
                        </div>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-info">
                            <span className="settings-label">{t('settings.currency')}</span>
                            <span className="settings-desc">{t('settings.currencyDesc')}</span>
                        </div>
                        <select
                            className="form-select settings-select"
                            value={currency}
                            onChange={e => set({ currency: e.target.value })}
                        >
                            {CURRENCIES.map(c => (
                                <option key={c.code} value={c.code}>
                                    {c.code.toUpperCase()} — {lang === 'es' ? c.es : c.en}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="settings-row">
                        <div className="settings-row-info">
                            <span className="settings-label">{t('settings.refresh')}</span>
                            <span className="settings-desc">{t('settings.refreshDesc')}</span>
                        </div>
                        <div className="seg-control">
                            {REFRESH_OPTIONS.map(s => (
                                <button
                                    key={s}
                                    className={`seg-btn ${refresh === s ? 'active' : ''}`}
                                    onClick={() => set({ refresh: s })}
                                >
                                    {refreshLabel(s)}
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* ===== DATOS ===== */}
                <motion.div className="settings-section" variants={section}>
                    <h2 className="settings-section-title">{t('settings.data')}</h2>

                    <div className="settings-row">
                        <div className="settings-row-info">
                            <span className="settings-label">{t('settings.clearChat')}</span>
                            <span className="settings-desc">{t('settings.clearChatDesc')}</span>
                        </div>
                        <button className="danger-btn" onClick={clearChat}>
                            {cleared ? t('settings.cleared') : t('settings.clearBtn')}
                        </button>
                    </div>
                </motion.div>

                {/* ===== TELEGRAM ===== */}
                <motion.div className="settings-section" variants={section}>
                    <h2 className="settings-section-title">{t('tg.section')}</h2>

                    <div className="settings-row">
                        <div className="settings-row-info">
                            <span className="settings-label">{t('tg.title')}</span>
                            <span className="settings-desc">{t('tg.desc')}</span>
                        </div>

                        {user?.telegramId ? (
                            <div className="tg-linked">
                                <span className="tg-linked-badge">
                                    ✈️ {t('tg.linked')} <strong>@{user.telegramUsername || user.telegramId}</strong>
                                </span>
                                <button className="danger-btn" onClick={unlinkTelegram} disabled={tgLoading}>
                                    {t('tg.unlink')}
                                </button>
                            </div>
                        ) : (
                            <form className="tg-link-form" onSubmit={linkTelegram}>
                                <input
                                    className="price-input tg-code-input"
                                    type="text"
                                    maxLength={6}
                                    placeholder={t('tg.placeholder')}
                                    value={tgCode}
                                    onChange={e => setTgCode(e.target.value.toUpperCase())}
                                />
                                <button type="submit" className="add-alert-btn tg-link-btn" disabled={tgLoading || !tgCode.trim()}>
                                    {tgLoading ? <span className="btn-spinner" /> : t('tg.link')}
                                </button>
                            </form>
                        )}
                    </div>

                    {!user?.telegramId && (
                        <div className="tg-instructions">
                            <span>{t('tg.how1')}</span>
                            <span>{t('tg.how2')}</span>
                            <span>{t('tg.how3')}</span>
                        </div>
                    )}

                    {tgError && <div className="form-error" style={{ marginTop: 8 }}>{tgError}</div>}
                    {tgSuccess && <div className="tg-success">{t('tg.success')}</div>}
                </motion.div>

                {/* ===== CUENTA ===== */}
                <motion.div className="settings-section" variants={section}>
                    <h2 className="settings-section-title">{t('settings.account')}</h2>

                    <div className="settings-account">
                        <div className="user-avatar" style={{ width: 48, height: 48, fontSize: 18 }}>
                            {user?.picture
                                ? <img src={user.picture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                : user?.name?.[0]?.toUpperCase() || '?'
                            }
                        </div>
                        <div className="settings-account-info">
                            <span className="settings-label">{user?.name}</span>
                            <span className="settings-desc">{user?.email}</span>
                        </div>
                        <span
                            className="role-chip"
                            style={{ '--role-color': ROLE_COLORS[user?.role] || '#4a5f7a' }}
                        >
                            {user?.role?.toUpperCase()}
                        </span>
                        <button className="danger-btn" onClick={handleLogout}>
                            {t('settings.logout')}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
}
