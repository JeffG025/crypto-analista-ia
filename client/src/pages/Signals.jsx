import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { signalsAPI } from '../utils/api';
import { useSettings } from '../context/SettingsContext';

const timeAgo = (dateStr, locale) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return locale.startsWith('es') ? `hace ${mins} min` : `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return locale.startsWith('es') ? `hace ${hours} h` : `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return locale.startsWith('es') ? `hace ${days} día${days === 1 ? '' : 's'}` : `${days}d ago`;
};

export default function Signals() {
    const { t, locale, formatPrice } = useSettings();
    const [signals, setSignals] = useState([]);
    const [stats, setStats] = useState(null);
    const [locked, setLocked] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        signalsAPI.list()
            .then(res => {
                setSignals(res.data.signals || []);
                setStats(res.data.stats || null);
                setLocked(res.data.locked || false);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const fmtUsd = (v) => formatPrice(v, 'usd');

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">{t('signals.title')}</h1>
                    <p className="page-sub">{t('signals.subtitle')}</p>
                </div>
            </div>

            {/* Stats */}
            {stats && stats.total > 0 && (
                <motion.div
                    className="signals-stats-row"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="admin-stat-card">
                        <span className="admin-stat-label">{t('signals.total')}</span>
                        <span className="admin-stat-value">{stats.total}</span>
                    </div>
                    <div className="admin-stat-card" style={{ borderColor: 'rgba(16,185,129,0.3)' }}>
                        <span className="admin-stat-label">{t('signals.hits')}</span>
                        <span className="admin-stat-value" style={{ color: 'var(--accent)' }}>
                            {stats.hits}/{stats.evaluated}
                        </span>
                    </div>
                    <div className="admin-stat-card" style={{ borderColor: 'rgba(139,92,246,0.3)' }}>
                        <span className="admin-stat-label">{t('signals.hitRate')}</span>
                        <span className="admin-stat-value" style={{ color: '#a78bfa' }}>
                            {stats.hitRate !== null ? `${stats.hitRate}%` : '—'}
                        </span>
                    </div>
                </motion.div>
            )}

            {loading ? (
                <div className="loading-grid" style={{ gridTemplateColumns: '1fr' }}>
                    {[...Array(3)].map((_, i) => <div key={i} className="skeleton-card" style={{ height: 80 }} />)}
                </div>
            ) : signals.length === 0 ? (
                <div className="alerts-empty" style={{ background: 'var(--surf-2)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
                    <div className="alerts-empty-icon">⚡</div>
                    <p>{t('signals.empty1')}</p>
                    <p style={{ marginTop: 4 }}>{t('signals.empty2')}</p>
                </div>
            ) : (
                <div className="signals-list-panel">
                    {signals.map((s, i) => {
                        const bullish = s.signal?.includes('ALCISTA');
                        return (
                            <motion.div
                                key={s.id}
                                className="signal-row"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.04 }}
                            >
                                <div className="signal-row-main">
                                    <span className="signal-row-emoji">{s.emoji}</span>
                                    <div className="signal-row-coin">
                                        <span className="signal-row-symbol">{s.coinSymbol}</span>
                                        <span className="signal-row-time">{timeAgo(s.createdAt, locale)}</span>
                                    </div>
                                    <span className={`signal-badge ${bullish ? 'buy' : 'sell'}`}>
                                        {s.signal}
                                    </span>
                                </div>

                                <div className="signal-row-prices">
                                    <div className="signal-price-block">
                                        <span className="signal-price-label">{t('signals.priceAt')}</span>
                                        <span className="signal-price-value">{fmtUsd(s.priceAtSignal)}</span>
                                    </div>
                                    <span className="signal-arrow">→</span>
                                    <div className="signal-price-block">
                                        <span className="signal-price-label">{t('signals.priceNow')}</span>
                                        <span className="signal-price-value">{s.currentPrice ? fmtUsd(s.currentPrice) : '—'}</span>
                                    </div>
                                </div>

                                <div className="signal-row-result">
                                    {s.changePct !== null && (
                                        <span className={`signal-change ${s.changePct >= 0 ? 'pos' : 'neg'}`}>
                                            {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
                                        </span>
                                    )}
                                    {s.hit !== null ? (
                                        <span className={`signal-verdict-badge ${s.hit ? 'hit' : 'miss'}`}>
                                            {s.hit ? t('signals.hit') : t('signals.miss')}
                                        </span>
                                    ) : (
                                        <span className="signal-verdict-badge pending">{t('signals.pendingEval')}</span>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}

                    {/* Candado para Free */}
                    {locked && (
                        <motion.div
                            className="signals-locked"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            <h3>{t('signals.lockedTitle')}</h3>
                            <p>{t('signals.lockedDesc')}</p>
                            <Link to="/premium" className="locked-cta">{t('locked.cta')} ✨</Link>
                        </motion.div>
                    )}
                </div>
            )}
        </div>
    );
}
