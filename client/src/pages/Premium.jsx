import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { paymentsAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

export default function Premium() {
    const { user, refreshUser } = useAuth();
    const { t } = useSettings();
    const [loading, setLoading] = useState(false);
    const [paymentsEnabled, setPaymentsEnabled] = useState(true);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        paymentsAPI.config()
            .then(res => setPaymentsEnabled(res.data.paymentsEnabled))
            .catch(() => {});

        // Mensaje al volver del checkout de Stripe
        const status = new URLSearchParams(window.location.search).get('status');
        if (status === 'success') {
            setNotice(t('premium.success'));
            window.history.replaceState({}, '', '/premium');
            // El webhook tarda unos segundos en activar premium
            const timer = setTimeout(() => refreshUser(), 4000);
            return () => clearTimeout(timer);
        }
        if (status === 'cancelled') {
            setNotice(t('premium.cancelled'));
            window.history.replaceState({}, '', '/premium');
        }
    }, []);

    const subscribe = async () => {
        setLoading(true);
        setNotice('');
        try {
            const res = await paymentsAPI.checkout();
            window.location.href = res.data.url;
        } catch (e) {
            setNotice(e.response?.data?.error || t('premium.notConfigured'));
            setLoading(false);
        }
    };

    const isPremium = user?.role === 'premium';
    const isAdmin = user?.role === 'admin';

    return (
        <div className="page premium-page">
            <div className="page-header" style={{ justifyContent: 'center', textAlign: 'center' }}>
                <div>
                    <h1 className="page-title premium-headline">{t('premium.title')}</h1>
                    <p className="page-sub">{t('premium.subtitle')}</p>
                </div>
            </div>

            {notice && (
                <motion.div
                    className="premium-notice"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    {notice}
                </motion.div>
            )}

            <div className="premium-plans">
                {/* Plan Free */}
                <motion.div
                    className="plan-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <span className="plan-name">{t('premium.free')}</span>
                    <div className="plan-price">
                        {t('premium.freePrice')}<span className="plan-period">{t('premium.month')}</span>
                    </div>
                    <ul className="plan-features">
                        {t('premium.f.free').map((f, i) => (
                            <li key={i}>✓ {f}</li>
                        ))}
                    </ul>
                    {user?.role === 'free' && (
                        <div className="plan-current-badge">{t('premium.current')}</div>
                    )}
                </motion.div>

                {/* Plan Premium */}
                <motion.div
                    className="plan-card plan-premium"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <div className="plan-glow" />
                    <span className="plan-name premium-gradient">Premium</span>
                    <div className="plan-price">
                        $99 MXN<span className="plan-period">{t('premium.month')}</span>
                    </div>
                    <ul className="plan-features">
                        {t('premium.f.premium').map((f, i) => (
                            <li key={i} className={i === 0 ? 'feature-base' : ''}>
                                {i === 0 ? '✓' : '✨'} {f}
                            </li>
                        ))}
                    </ul>

                    {isAdmin ? (
                        <div className="plan-current-badge admin">{t('premium.youAreAdmin')}</div>
                    ) : isPremium ? (
                        <div className="plan-current-badge premium">{t('premium.youArePremium')}</div>
                    ) : (
                        <motion.button
                            className="plan-cta"
                            onClick={subscribe}
                            disabled={loading || !paymentsEnabled}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {loading
                                ? t('premium.processing')
                                : paymentsEnabled ? t('premium.cta') : t('premium.notConfigured')
                            }
                        </motion.button>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
