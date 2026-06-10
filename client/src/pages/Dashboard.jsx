import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cryptoAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { CURRENCIES } from '../utils/translations';
import CryptoChart from '../components/CryptoChart';

const card = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0 }
};

const stagger = {
    show: { transition: { staggerChildren: 0.07 } }
};

export default function Dashboard() {
    const { user } = useAuth();
    const { currency, set, t, locale, formatPrice, refresh } = useSettings();
    const [coins, setCoins] = useState([]);
    const [sentiment, setSentiment] = useState(null);
    const [selected, setSelected] = useState('bitcoin');
    const [chartData, setChartData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
        if (refresh > 0) {
            const interval = setInterval(loadData, refresh * 1000);
            return () => clearInterval(interval);
        }
    }, [currency, refresh]);

    useEffect(() => {
        loadChart();
    }, [selected, currency]);

    const loadData = async () => {
        try {
            const [marketRes, sentRes] = await Promise.all([
                cryptoAPI.market(currency),
                cryptoAPI.sentiment()
            ]);
            setCoins(marketRes.data);
            setSentiment(sentRes.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const loadChart = async () => {
        try {
            const res = await cryptoAPI.chat({
                isUpdate: true,
                coins: [selected],
                days: 30,
                currency
            });
            setChartData(res.data.chartData);
        } catch (e) { /* silencioso */ }
    };

    const fgValue = parseInt(sentiment?.value || 50);
    const fgColor = fgValue <= 25 ? '#ef4444' : fgValue <= 45 ? '#f97316' : fgValue >= 75 ? '#10b981' : '#eab308';

    return (
        <div className="page">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">{t('nav.dashboard')}</h1>
                    <p className="page-sub">
                        {t('dash.welcome')}, <strong>{user?.name}</strong> — {new Date().toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
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

            {loading ? (
                <div className="loading-grid">
                    {[...Array(4)].map((_, i) => <div key={i} className="skeleton-card" />)}
                </div>
            ) : (
                <>
                    {/* Fear & Greed + top 3 */}
                    <motion.div
                        className="metrics-row"
                        variants={stagger}
                        initial="hidden"
                        animate="show"
                    >
                        <motion.div className="metric-card fg-card" variants={card}>
                            <span className="metric-label">{t('dash.fearGreed')}</span>
                            <div className="fg-gauge">
                                <svg viewBox="0 0 120 70" className="gauge-svg">
                                    <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="var(--surf-4)" strokeWidth="10" strokeLinecap="round" />
                                    <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke={fgColor} strokeWidth="10" strokeLinecap="round"
                                        strokeDasharray={`${(fgValue / 100) * 157} 157`} />
                                    <text x="60" y="58" textAnchor="middle" fill="var(--t1)" fontSize="18" fontWeight="bold">{fgValue}</text>
                                </svg>
                            </div>
                            <span className="fg-label" style={{ color: fgColor }}>{sentiment?.value_classification}</span>
                        </motion.div>

                        {coins.slice(0, 3).map(coin => (
                            <motion.div
                                key={coin.symbol}
                                className={`metric-card coin-card ${selected === (coin.id || coin.name?.toLowerCase()) ? 'selected' : ''}`}
                                variants={card}
                                onClick={() => setSelected(coin.id || coin.name?.toLowerCase())}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <div className="coin-card-top">
                                    <img src={coin.image} alt={coin.name} className="coin-img" />
                                    <span className="coin-sym">{coin.symbol?.toUpperCase()}</span>
                                </div>
                                <div className="coin-price">{formatPrice(coin.current_price)}</div>
                                <div className={`coin-change ${coin.price_change_24h >= 0 ? 'pos' : 'neg'}`}>
                                    {coin.price_change_24h >= 0 ? '▲' : '▼'} {Math.abs(coin.price_change_24h)?.toFixed(2)}%
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>

                    {/* Gráfica principal */}
                    {chartData && (
                        <motion.div
                            className="chart-panel"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <div className="chart-panel-header">
                                <h2 className="chart-title">{selected.toUpperCase()} — {t('dash.lastDays')}</h2>
                                <div className="coin-pills">
                                    {coins.slice(0, 6).map(c => (
                                        <button
                                            key={c.symbol}
                                            className={`coin-pill ${selected === (c.id || c.name?.toLowerCase()) ? 'active' : ''}`}
                                            onClick={() => setSelected(c.id || c.name?.toLowerCase())}
                                        >
                                            {c.symbol?.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <CryptoChart data={chartData} currencyCode={currency} />
                        </motion.div>
                    )}

                    {/* Tabla de mercado */}
                    <motion.div
                        className="market-table-panel"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <h2 className="section-title">{t('dash.market')}</h2>
                        <div className="market-table">
                            <div className="table-header">
                                <span>{t('dash.coin')}</span>
                                <span>{t('dash.price')}</span>
                                <span>{t('dash.change24h')}</span>
                                <span>{t('dash.marketCap')}</span>
                                <span>{t('dash.high24h')}</span>
                                <span>{t('dash.low24h')}</span>
                            </div>
                            {coins.map((coin, i) => (
                                <motion.div
                                    key={coin.symbol}
                                    className="table-row"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.04 }}
                                    onClick={() => setSelected(coin.id || coin.name?.toLowerCase())}
                                >
                                    <div className="table-coin">
                                        <img src={coin.image} alt={coin.name} />
                                        <div>
                                            <span className="table-name">{coin.name}</span>
                                            <span className="table-sym">{coin.symbol?.toUpperCase()}</span>
                                        </div>
                                    </div>
                                    <span className="table-price">{formatPrice(coin.current_price)}</span>
                                    <span className={`table-change ${coin.price_change_24h >= 0 ? 'pos' : 'neg'}`}>
                                        {coin.price_change_24h >= 0 ? '+' : ''}{coin.price_change_24h?.toFixed(2)}%
                                    </span>
                                    <span className="table-cap">
                                        {coin.market_cap ? `${(coin.market_cap / 1e9).toFixed(1)}B` : '-'}
                                    </span>
                                    <span className="table-hl">{formatPrice(coin.high_24h)}</span>
                                    <span className="table-hl">{formatPrice(coin.low_24h)}</span>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </>
            )}
        </div>
    );
}
