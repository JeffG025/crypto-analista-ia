import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { alertsAPI, cryptoAPI } from '../utils/api';
import { useSettings } from '../context/SettingsContext';

const COINS = [
    { id: 'bitcoin',      symbol: 'BTC',  name: 'Bitcoin' },
    { id: 'ethereum',     symbol: 'ETH',  name: 'Ethereum' },
    { id: 'solana',       symbol: 'SOL',  name: 'Solana' },
    { id: 'binancecoin',  symbol: 'BNB',  name: 'BNB' },
    { id: 'ripple',       symbol: 'XRP',  name: 'XRP' },
    { id: 'cardano',      symbol: 'ADA',  name: 'Cardano' },
    { id: 'avalanche-2',  symbol: 'AVAX', name: 'Avalanche' },
    { id: 'dogecoin',     symbol: 'DOGE', name: 'Dogecoin' },
    { id: 'chainlink',    symbol: 'LINK', name: 'Chainlink' },
    { id: 'polkadot',     symbol: 'DOT',  name: 'Polkadot' },
];

export default function Alerts() {
    const { t, formatPrice } = useSettings();
    const [alerts, setAlerts] = useState([]);
    const [prices, setPrices] = useState({});
    const [form, setForm] = useState({ coinId: 'bitcoin', condition: 'above', targetPrice: '' });
    const [loading, setLoading] = useState(false);
    const [formError, setFormError] = useState('');

    // Las alertas se comparan contra precios en USD (el backend revisa en USD)
    const fmtUsd = (v) => formatPrice(v, 'usd');

    useEffect(() => {
        loadAlerts();
        loadPrices();
        const interval = setInterval(loadPrices, 60000);
        return () => clearInterval(interval);
    }, []);

    const loadAlerts = async () => {
        try {
            const res = await alertsAPI.list();
            setAlerts(res.data);
        } catch { /* ignore */ }
    };

    const loadPrices = async () => {
        try {
            const res = await cryptoAPI.market('usd');
            const map = {};
            res.data.forEach(c => { map[c.id] = c.current_price; });
            setPrices(map);
        } catch { /* ignore */ }
    };

    const currentCoin = COINS.find(c => c.id === form.coinId);
    const currentPrice = prices[form.coinId];

    const addAlert = async (e) => {
        e.preventDefault();
        setFormError('');
        const target = parseFloat(form.targetPrice);
        if (isNaN(target) || target <= 0) {
            setFormError(t('alerts.invalidPrice'));
            return;
        }
        setLoading(true);
        try {
            await alertsAPI.create({
                coinId: form.coinId,
                coinName: currentCoin?.name || form.coinId,
                coinSymbol: currentCoin?.symbol || '',
                condition: form.condition,
                targetPrice: target,
            });
            setForm(f => ({ ...f, targetPrice: '' }));
            await loadAlerts();
        } catch (e) {
            setFormError(e.response?.data?.error || t('alerts.createError'));
        } finally {
            setLoading(false);
        }
    };

    const removeAlert = async (id) => {
        try {
            await alertsAPI.remove(id);
            setAlerts(prev => prev.filter(a => a.id !== id));
        } catch { /* ignore */ }
    };

    const isTriggered = (alert) => {
        const p = prices[alert.coinId];
        if (!p) return false;
        return alert.condition === 'above' ? p >= alert.targetPrice : p <= alert.targetPrice;
    };

    const distanceText = (alert) => {
        const p = prices[alert.coinId];
        if (!p) return null;
        const pct = ((alert.targetPrice - p) / p * 100);
        const abs = Math.abs(pct).toFixed(1);
        if (alert.condition === 'above') {
            return pct > 0
                ? { text: `+${abs}% ${t('alerts.toTrigger')}`, cls: 'pos' }
                : { text: `${t('alerts.activated')} +${abs}% ${t('alerts.aboveTarget')}`, cls: 'pos' };
        } else {
            return pct < 0
                ? { text: `-${abs}% ${t('alerts.toTrigger')}`, cls: 'neg' }
                : { text: `${t('alerts.activated')} -${abs}% ${t('alerts.belowTarget')}`, cls: 'neg' };
        }
    };

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">{t('alerts.title')}</h1>
                    <p className="page-sub">{t('alerts.subtitle')}</p>
                </div>
            </div>

            <div className="alerts-grid">
                {/* Form panel */}
                <div className="alerts-form-panel">
                    <h2 className="alerts-panel-title">◎ {t('alerts.new')}</h2>
                    <form className="alerts-form" onSubmit={addAlert}>
                        <div>
                            <label className="form-label">{t('alerts.coin')}</label>
                            <select
                                className="form-select"
                                value={form.coinId}
                                onChange={e => setForm(f => ({ ...f, coinId: e.target.value }))}
                            >
                                {COINS.map(c => (
                                    <option key={c.id} value={c.id}>{c.symbol} — {c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="form-label">{t('alerts.condition')}</label>
                            <div className="condition-buttons">
                                <button
                                    type="button"
                                    className={`condition-btn above ${form.condition === 'above' ? 'active' : ''}`}
                                    onClick={() => setForm(f => ({ ...f, condition: 'above' }))}
                                >
                                    ▲ {t('alerts.above')}
                                </button>
                                <button
                                    type="button"
                                    className={`condition-btn below ${form.condition === 'below' ? 'active' : ''}`}
                                    onClick={() => setForm(f => ({ ...f, condition: 'below' }))}
                                >
                                    ▼ {t('alerts.below')}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="form-label">{t('alerts.target')}</label>
                            <input
                                className="price-input"
                                type="number"
                                step="any"
                                min="0"
                                placeholder={currentPrice ? `${t('alerts.current')}: ${fmtUsd(currentPrice)}` : 'Ej: 50000'}
                                value={form.targetPrice}
                                onChange={e => setForm(f => ({ ...f, targetPrice: e.target.value }))}
                            />
                            {currentPrice && (
                                <p className="current-price-hint">
                                    {t('alerts.current')}: <strong>{fmtUsd(currentPrice)}</strong>
                                </p>
                            )}
                        </div>

                        {formError && <div className="form-error">{formError}</div>}

                        <button type="submit" className="add-alert-btn" disabled={loading}>
                            {loading ? <span className="btn-spinner" /> : t('alerts.create')}
                        </button>
                    </form>
                </div>

                {/* Alerts list */}
                <div className="alerts-list-panel">
                    <h2 className="alerts-panel-title">
                        {t('alerts.active')}
                        {alerts.length > 0 && (
                            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: '2px 7px', background: 'var(--accent-d)', color: 'var(--accent)', borderRadius: 99 }}>
                                {alerts.length}
                            </span>
                        )}
                    </h2>

                    {alerts.length === 0 ? (
                        <div className="alerts-empty">
                            <div className="alerts-empty-icon">◎</div>
                            <p>{t('alerts.empty1')}</p>
                            <p style={{ marginTop: 4 }}>{t('alerts.empty2')}</p>
                        </div>
                    ) : (
                        <AnimatePresence>
                            {alerts.map(alert => {
                                const dist = distanceText(alert);
                                const triggered = isTriggered(alert);
                                return (
                                    <motion.div
                                        key={alert.id}
                                        className="alert-item"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, height: 0, marginBottom: 0, padding: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className="alert-coin-badge">{alert.coinSymbol}</div>

                                        <div className="alert-info">
                                            <div className="alert-coin-name">{alert.coinName}</div>
                                            <div className="alert-condition-text">
                                                {t('alerts.alertLabel')}{' '}
                                                <span className={alert.condition}>
                                                    {alert.condition === 'above' ? `▲ ${t('alerts.alertAbove')}` : `▼ ${t('alerts.alertBelow')}`}
                                                </span>
                                                {' '}{fmtUsd(alert.targetPrice)}
                                            </div>
                                        </div>

                                        <div className="alert-prices">
                                            <div className="alert-target-price">{fmtUsd(alert.targetPrice)}</div>
                                            {dist && (
                                                <div className={`alert-distance ${dist.cls}`}>{dist.text}</div>
                                            )}
                                        </div>

                                        <span className={`alert-triggered-badge ${triggered ? 'triggered' : ''}`}>
                                            {triggered ? t('alerts.triggered') : t('alerts.pending')}
                                        </span>

                                        <button
                                            className="alert-delete-btn"
                                            onClick={() => removeAlert(alert.id)}
                                            title={t('alerts.delete')}
                                        >
                                            ✕
                                        </button>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    )}
                </div>
            </div>
        </div>
    );
}
