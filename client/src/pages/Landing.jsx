import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { signalsAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const CHANNEL_URL = 'https://t.me/CryptAnalista';
const floatingCoins = ['₿', 'Ξ', '◎', '●', '◆'];

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function Landing() {
    const { user, loading } = useAuth();
    const { t, lang, set } = useSettings();
    const [signals, setSignals] = useState([]);
    const [stats, setStats] = useState(null);

    useEffect(() => {
        signalsAPI.public()
            .then(res => {
                setSignals((res.data.signals || []).slice(0, 4));
                setStats(res.data.stats || null);
            })
            .catch(() => {});
    }, []);

    if (loading) return (
        <div className="app-loading"><div className="app-loading-spinner" /></div>
    );

    // Usuario logueado → directo a su dashboard
    if (user) return <Navigate to="/dashboard" replace />;

    return (
        <div className="landing">
            {/* Fondo */}
            <div className="auth-bg">
                {floatingCoins.map((coin, i) => (
                    <span key={i} className="floating-coin" style={{ '--i': i }}>{coin}</span>
                ))}
                <div className="auth-grid" />
            </div>

            {/* Navbar */}
            <nav className="landing-nav">
                <div className="brand-logo" style={{ marginBottom: 0 }}>
                    <span className="logo-icon" style={{ fontSize: 22 }}>₿</span>
                    <span className="logo-text" style={{ fontSize: 18 }}>CryptoMind</span>
                </div>
                <div className="landing-nav-right">
                    <div className="seg-control" style={{ padding: 2 }}>
                        <button className={`seg-btn ${lang === 'es' ? 'active' : ''}`} onClick={() => set({ lang: 'es' })}>ES</button>
                        <button className={`seg-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => set({ lang: 'en' })}>EN</button>
                    </div>
                    <Link to="/auth" className="landing-login-btn">{t('landing.login')}</Link>
                </div>
            </nav>

            {/* Hero */}
            <motion.section
                className="landing-hero"
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.12 } } }}
            >
                <motion.div className="landing-eyebrow" variants={fadeUp}>
                    <span className="eyebrow-dot" />
                    {t('landing.eyebrow')}
                </motion.div>
                <motion.h1 className="landing-headline" variants={fadeUp}>
                    {t('landing.heroTitle1')}<br />
                    <span className="gradient-text">{t('landing.heroTitle2')}</span>
                </motion.h1>
                <motion.p className="landing-sub" variants={fadeUp}>
                    {t('landing.heroSub')}
                </motion.p>
                <motion.div className="landing-ctas" variants={fadeUp}>
                    <Link to="/auth" className="landing-cta-main">{t('landing.ctaMain')}</Link>
                    <a href={CHANNEL_URL} target="_blank" rel="noreferrer" className="landing-cta-alt">
                        {t('landing.ctaChannel')}
                    </a>
                </motion.div>
                <motion.p className="landing-trust" variants={fadeUp}>
                    {t('landing.trust')}
                </motion.p>
                <motion.div className="landing-stats" variants={fadeUp}>
                    <div className="landing-stat">
                        <span className="landing-stat-value">{stats?.total || '10'}</span>
                        <span className="landing-stat-label">{stats?.total ? t('landing.statSignals') : t('landing.statCoins')}</span>
                    </div>
                    {stats?.hitRate !== null && stats?.hitRate !== undefined && (
                        <div className="landing-stat">
                            <span className="landing-stat-value">{stats.hitRate}%</span>
                            <span className="landing-stat-label">{t('landing.statHitRate')}</span>
                            {stats.baseline !== null && stats.baseline !== undefined && (
                                <span className="landing-stat-baseline">{t('landing.statBaseline')} {stats.baseline}%</span>
                            )}
                        </div>
                    )}
                    <div className="landing-stat">
                        <span className="landing-stat-value">6h</span>
                        <span className="landing-stat-label">{t('landing.statScan')}</span>
                    </div>
                </motion.div>
            </motion.section>

            {/* Señales recientes */}
            {signals.length > 0 && (
                <motion.section
                    className="landing-section"
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                >
                    <h2 className="landing-section-title">{t('landing.signalsTitle')}</h2>
                    <div className="landing-signals">
                        {signals.map(s => {
                            const bullish = s.signal?.includes('ALCISTA');
                            return (
                                <div key={s.id} className="landing-signal-card">
                                    <div className="landing-signal-top">
                                        <span style={{ fontSize: 18 }}>{s.emoji}</span>
                                        <span className="signal-row-symbol">{s.coinSymbol}</span>
                                        <span className={`signal-badge ${bullish ? 'buy' : 'sell'}`} style={{ fontSize: 10 }}>
                                            {s.signal}
                                        </span>
                                    </div>
                                    {s.changePct !== null && (
                                        <div className={`landing-signal-perf ${s.changePct >= 0 ? 'pos' : 'neg'}`}>
                                            {s.changePct >= 0 ? '▲ +' : '▼ '}{s.changePct.toFixed(2)}%
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <Link to="/auth" className="landing-signals-more">{t('landing.signalsCta')}</Link>
                </motion.section>
            )}

            {/* Cómo funciona */}
            <motion.section
                className="landing-section"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
            >
                <h2 className="landing-section-title">{t('landing.howTitle')}</h2>
                <div className="landing-how">
                    {t('landing.howSteps').map((s, i) => (
                        <motion.div
                            key={i}
                            className="how-step"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.12 }}
                        >
                            <span className="how-num">{s.n}</span>
                            <h3>{s.title}</h3>
                            <p>{s.desc}</p>
                            {i < 2 && <span className="how-connector" aria-hidden="true">→</span>}
                        </motion.div>
                    ))}
                </div>
            </motion.section>

            {/* Features */}
            <motion.section
                className="landing-section"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
            >
                <h2 className="landing-section-title">{t('landing.featuresTitle')}</h2>
                <div className="landing-features">
                    {t('landing.features').map((f, i) => (
                        <motion.div
                            key={i}
                            className="landing-feature-card"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.07 }}
                        >
                            <span className="landing-feature-icon">{f.icon}</span>
                            <h3>{f.title}</h3>
                            <p>{f.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </motion.section>

            {/* Pricing */}
            <motion.section
                className="landing-section"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
            >
                <h2 className="landing-section-title">{t('landing.pricingTitle')}</h2>
                <div className="premium-plans" style={{ maxWidth: 760, margin: '0 auto' }}>
                    <div className="plan-card">
                        <span className="plan-name">{t('premium.free')}</span>
                        <div className="plan-price">{t('premium.freePrice')}<span className="plan-period">{t('premium.month')}</span></div>
                        <ul className="plan-features">
                            {t('premium.f.free').map((f, i) => <li key={i}>✓ {f}</li>)}
                        </ul>
                        <Link to="/auth" className="landing-cta-alt" style={{ textAlign: 'center', display: 'block' }}>
                            {t('landing.ctaMain')}
                        </Link>
                    </div>
                    <div className="plan-card plan-premium">
                        <div className="plan-glow" />
                        <span className="plan-name premium-gradient">Premium</span>
                        <div className="plan-price">$99 MXN<span className="plan-period">{t('premium.month')}</span></div>
                        <p className="plan-anchor">{t('landing.annualNote')}</p>
                        <ul className="plan-features">
                            {t('premium.f.premium').map((f, i) => (
                                <li key={i} className={i === 0 ? 'feature-base' : ''}>{i === 0 ? '✓' : '✨'} {f}</li>
                            ))}
                        </ul>
                        <Link to="/auth" className="plan-cta" style={{ textDecoration: 'none', textAlign: 'center' }}>
                            {t('premium.cta')}
                        </Link>
                    </div>
                </div>
            </motion.section>

            {/* Footer */}
            <footer className="landing-footer">
                <p className="landing-disclaimer">{t('landing.disclaimer')}</p>
                <p className="landing-copy">
                    © 2026 {t('landing.footer')}
                    {' · '}
                    <Link to="/terms" className="legal-footer-link">{lang === 'es' ? 'Términos' : 'Terms'}</Link>
                    {' · '}
                    <Link to="/privacy" className="legal-footer-link">{lang === 'es' ? 'Privacidad' : 'Privacy'}</Link>
                    {' · '}
                    <Link to="/transparencia" className="legal-footer-link">{lang === 'es' ? 'Transparencia' : 'Transparency'}</Link>
                </p>
            </footer>
        </div>
    );
}
