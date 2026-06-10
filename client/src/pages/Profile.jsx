import { useState } from 'react';
import { motion } from 'framer-motion';
import { profileAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { COIN_CATALOG, DEFAULT_WATCHLIST, MAX_WATCHLIST } from '../utils/coins';

const ROLE_COLORS = { admin: '#f59e0b', premium: '#8b5cf6', free: '#4a5f7a' };

const section = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
};

export default function Profile() {
    const { user, setUser } = useAuth();
    const { t, locale } = useSettings();

    // Nombre
    const [name, setName] = useState(user?.name || '');
    const [nameSaved, setNameSaved] = useState(false);
    const [nameError, setNameError] = useState('');
    const [savingName, setSavingName] = useState(false);

    // Contraseña
    const [passForm, setPassForm] = useState({ current: '', next: '', confirm: '' });
    const [passSaved, setPassSaved] = useState(false);
    const [passError, setPassError] = useState('');
    const [savingPass, setSavingPass] = useState(false);

    // Watchlist
    const [watchlist, setWatchlist] = useState(
        user?.watchlist?.length ? user.watchlist : DEFAULT_WATCHLIST
    );
    const [wlSaved, setWlSaved] = useState(false);
    const [wlError, setWlError] = useState('');
    const [savingWl, setSavingWl] = useState(false);

    const saveName = async (e) => {
        e.preventDefault();
        setNameError('');
        setSavingName(true);
        try {
            const res = await profileAPI.update({ name });
            setUser(res.data.user);
            setNameSaved(true);
            setTimeout(() => setNameSaved(false), 2500);
        } catch (err) {
            setNameError(err.response?.data?.error || 'Error');
        } finally {
            setSavingName(false);
        }
    };

    const savePassword = async (e) => {
        e.preventDefault();
        setPassError('');
        if (passForm.next !== passForm.confirm) {
            setPassError(t('profile.passMismatch'));
            return;
        }
        setSavingPass(true);
        try {
            const res = await profileAPI.changePassword({
                currentPassword: passForm.current || undefined,
                newPassword: passForm.next,
            });
            setUser(res.data.user);
            setPassForm({ current: '', next: '', confirm: '' });
            setPassSaved(true);
            setTimeout(() => setPassSaved(false), 2500);
        } catch (err) {
            setPassError(err.response?.data?.error || 'Error');
        } finally {
            setSavingPass(false);
        }
    };

    const toggleCoin = (id) => {
        setWlError('');
        setWatchlist(prev => {
            if (prev.includes(id)) return prev.filter(c => c !== id);
            if (prev.length >= MAX_WATCHLIST) return prev; // tope
            return [...prev, id];
        });
    };

    const saveWatchlist = async () => {
        setWlError('');
        if (watchlist.length < 1) {
            setWlError(t('profile.watchlistMin'));
            return;
        }
        setSavingWl(true);
        try {
            const res = await profileAPI.update({ watchlist });
            setUser(res.data.user);
            setWlSaved(true);
            setTimeout(() => setWlSaved(false), 2500);
        } catch (err) {
            setWlError(err.response?.data?.error || 'Error');
        } finally {
            setSavingWl(false);
        }
    };

    return (
        <div className="page settings-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">{t('profile.title')}</h1>
                    <p className="page-sub">{t('profile.subtitle')}</p>
                </div>
            </div>

            <motion.div
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.07 } } }}
                className="settings-sections"
            >
                {/* ===== TARJETA DE PERFIL ===== */}
                <motion.div className="settings-section profile-hero" variants={section}>
                    <div className="user-avatar profile-avatar">
                        {user?.picture
                            ? <img src={user.picture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            : user?.name?.[0]?.toUpperCase() || '?'
                        }
                    </div>
                    <div className="profile-hero-info">
                        <h2 className="profile-hero-name">{user?.name}</h2>
                        <span className="profile-hero-email">{user?.email}</span>
                        <span className="profile-hero-since">
                            {t('profile.memberSince')}{' '}
                            {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(locale, { month: 'long', year: 'numeric' }) : '—'}
                        </span>
                    </div>
                    <span className="role-chip profile-role" style={{ '--role-color': ROLE_COLORS[user?.role] }}>
                        {user?.role?.toUpperCase()}
                    </span>
                </motion.div>

                {/* ===== INFORMACIÓN PERSONAL ===== */}
                <motion.div className="settings-section" variants={section}>
                    <h2 className="settings-section-title">{t('profile.info')}</h2>
                    <form onSubmit={saveName} className="profile-form">
                        <div className="field">
                            <label>{t('profile.name')}</label>
                            <input
                                type="text"
                                value={name}
                                maxLength={40}
                                onChange={e => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="field">
                            <label>{t('profile.email')}</label>
                            <input type="email" value={user?.email || ''} disabled />
                            <span className="settings-desc">{t('profile.emailNote')}</span>
                        </div>
                        {nameError && <div className="form-error">{nameError}</div>}
                        <button type="submit" className="add-alert-btn profile-save-btn" disabled={savingName || name.trim() === user?.name}>
                            {savingName ? <span className="btn-spinner" /> : nameSaved ? t('profile.saved') : t('profile.save')}
                        </button>
                    </form>
                </motion.div>

                {/* ===== WATCHLIST ===== */}
                <motion.div className="settings-section" variants={section}>
                    <h2 className="settings-section-title">
                        ⭐ {t('profile.watchlist')}
                        <span className="watchlist-counter">{watchlist.length}/{MAX_WATCHLIST} {t('profile.watchlistCount')}</span>
                    </h2>
                    <p className="settings-desc" style={{ marginBottom: 14 }}>{t('profile.watchlistDesc')}</p>

                    <div className="watchlist-grid">
                        {COIN_CATALOG.map(coin => {
                            const active = watchlist.includes(coin.id);
                            const disabled = !active && watchlist.length >= MAX_WATCHLIST;
                            return (
                                <button
                                    key={coin.id}
                                    type="button"
                                    className={`watchlist-chip ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                                    onClick={() => toggleCoin(coin.id)}
                                    disabled={disabled}
                                >
                                    <span className="watchlist-chip-symbol">{coin.symbol}</span>
                                    <span className="watchlist-chip-name">{coin.name}</span>
                                    {active && <span className="watchlist-chip-check">✓</span>}
                                </button>
                            );
                        })}
                    </div>

                    {wlError && <div className="form-error" style={{ marginTop: 10 }}>{wlError}</div>}
                    <button
                        className="add-alert-btn profile-save-btn"
                        style={{ marginTop: 14 }}
                        onClick={saveWatchlist}
                        disabled={savingWl || watchlist.length < 1}
                    >
                        {savingWl ? <span className="btn-spinner" /> : wlSaved ? t('profile.saved') : t('profile.watchlistSave')}
                    </button>
                </motion.div>

                {/* ===== SEGURIDAD ===== */}
                <motion.div className="settings-section" variants={section}>
                    <h2 className="settings-section-title">{t('profile.security')}</h2>
                    {!user?.hasPassword && (
                        <p className="settings-desc" style={{ marginBottom: 14 }}>
                            {t('profile.setPassNote')}
                        </p>
                    )}
                    <form onSubmit={savePassword} className="profile-form">
                        {user?.hasPassword && (
                            <div className="field">
                                <label>{t('profile.currentPass')}</label>
                                <input
                                    type="password"
                                    value={passForm.current}
                                    onChange={e => setPassForm(f => ({ ...f, current: e.target.value }))}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        )}
                        <div className="profile-pass-row">
                            <div className="field">
                                <label>{t('profile.newPass')}</label>
                                <input
                                    type="password"
                                    value={passForm.next}
                                    minLength={6}
                                    onChange={e => setPassForm(f => ({ ...f, next: e.target.value }))}
                                    placeholder={t('auth.passPh')}
                                    required
                                />
                            </div>
                            <div className="field">
                                <label>{t('profile.confirmPass')}</label>
                                <input
                                    type="password"
                                    value={passForm.confirm}
                                    minLength={6}
                                    onChange={e => setPassForm(f => ({ ...f, confirm: e.target.value }))}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>
                        {passError && <div className="form-error">{passError}</div>}
                        <button type="submit" className="add-alert-btn profile-save-btn" disabled={savingPass}>
                            {savingPass
                                ? <span className="btn-spinner" />
                                : passSaved ? t('profile.passChanged')
                                : user?.hasPassword ? t('profile.changePass') : t('profile.setPass')
                            }
                        </button>
                    </form>
                </motion.div>
            </motion.div>
        </div>
    );
}
