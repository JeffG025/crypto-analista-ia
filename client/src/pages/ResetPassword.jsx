import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

export default function ResetPassword() {
    const { t } = useSettings();
    const { setUser } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const token = params.get('token');

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (password !== confirm) {
            setError(t('reset.mismatch'));
            return;
        }
        setLoading(true);
        try {
            const res = await authAPI.reset(token, password);
            localStorage.setItem('cm_token', res.data.token);
            setUser(res.data.user);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || t('reset.invalidLink'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-bg"><div className="auth-grid" /></div>

            <motion.div
                className="auth-card reset-card"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="brand-logo" style={{ justifyContent: 'center', marginBottom: 20 }}>
                    <span className="logo-icon">₿</span>
                    <span className="logo-text">CryptoMind</span>
                </div>

                <h2 className="reset-title">{t('reset.title')}</h2>
                <p className="reset-desc">{t('reset.desc')}</p>

                {!token ? (
                    <>
                        <div className="auth-error" style={{ marginTop: 12 }}>⚠️ {t('reset.invalidLink')}</div>
                        <Link to="/auth" className="forgot-back-link">{t('forgot.back')}</Link>
                    </>
                ) : (
                    <form className="auth-form" onSubmit={submit} style={{ marginTop: 16 }}>
                        <div className="field">
                            <label>{t('reset.newPass')}</label>
                            <input
                                type="password"
                                placeholder={t('auth.passPh')}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                minLength={6}
                                required
                            />
                        </div>
                        <div className="field">
                            <label>{t('reset.confirm')}</label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                minLength={6}
                                required
                            />
                        </div>

                        {error && <div className="auth-error">⚠️ {error}</div>}

                        <button type="submit" className="auth-submit" disabled={loading}>
                            {loading ? <span className="btn-spinner" /> : t('reset.submit')}
                        </button>

                        <Link to="/auth" className="forgot-back-link">{t('forgot.back')}</Link>
                    </form>
                )}
            </motion.div>
        </div>
    );
}
