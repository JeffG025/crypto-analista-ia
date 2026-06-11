import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cryptoAPI } from '../utils/api';
import { useSettings } from '../context/SettingsContext';
import CryptoChart from '../components/LazyChart';

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

export default function Analysis() {
    const { t, lang, formatPrice } = useSettings();
    const [selected, setSelected] = useState(null);
    const [result, setResult] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const rsiSignal = (v) => {
        const n = parseFloat(v);
        if (n < 30) return t('analysis.oversold');
        if (n > 70) return t('analysis.overbought');
        if (n < 45) return t('analysis.lowZone');
        if (n > 55) return t('analysis.highZone');
        return t('analysis.neutral');
    };

    const rsiSignalClass = (v) => {
        const n = parseFloat(v);
        if (n < 45) return 'pos';
        if (n > 55) return 'neg';
        return 'neu';
    };

    const macdSignal = (macd) => {
        if (!macd) return { value: '—', signal: t('analysis.noData'), cls: 'neu' };
        const diff = parseFloat(macd.value) - parseFloat(macd.signal);
        return {
            value: parseFloat(macd.histogram).toFixed(4),
            signal: diff > 0 ? t('analysis.bullish') : t('analysis.bearish'),
            cls: diff > 0 ? 'pos' : 'neg',
        };
    };

    const bbSignal = (bb) => {
        if (!bb) return { value: '—', signal: t('analysis.noData'), cls: 'neu' };
        const pos = parseFloat(bb.position);
        let signal = t('analysis.central'), cls = 'neu';
        if (pos < 20) { signal = t('analysis.buyZone'); cls = 'pos'; }
        else if (pos > 80) { signal = t('analysis.overbought'); cls = 'neg'; }
        else if (pos < 35) { signal = t('analysis.low'); cls = 'pos'; }
        else if (pos > 65) { signal = t('analysis.high'); cls = 'neg'; }
        return { value: `${pos.toFixed(0)}%`, signal, cls };
    };

    const trendSignal = (sma20, sma50) => {
        if (!sma20 || !sma50) return { value: '—', signal: t('analysis.noData'), cls: 'neu' };
        const diff = parseFloat(sma20) - parseFloat(sma50);
        return {
            value: diff > 0 ? 'Golden ✓' : 'Death ✗',
            signal: diff > 0 ? t('analysis.bullish') : t('analysis.bearish'),
            cls: diff > 0 ? 'pos' : 'neg',
        };
    };

    const analyze = async () => {
        if (!selected || loading) return;
        setLoading(true);
        setError('');
        setResult(null);
        setChartData(null);
        try {
            const [aRes, cRes] = await Promise.all([
                cryptoAPI.analysis(selected.id, lang),
                cryptoAPI.chat({ isUpdate: true, coins: [selected.id], days: 30, currency: 'usd' })
            ]);
            setResult(aRes.data);
            setChartData(cRes.data.chartData);
        } catch (e) {
            setError(e.response?.data?.error || t('analysis.error'));
        } finally {
            setLoading(false);
        }
    };

    const signalClass = () => {
        if (!result) return 'neutral';
        if (result.signal.includes('ALCISTA')) return 'buy';
        if (result.signal.includes('BAJISTA')) return 'sell';
        return 'neutral';
    };

    const scorePercent = result ? Math.min(Math.max(((result.score + 8) / 16) * 100, 0), 100) : 50;
    const macdData = result ? macdSignal(result.macd) : null;
    const bbData = result ? bbSignal(result.bollingerBands) : null;
    const trendData = result ? trendSignal(result.sma20, result.sma50) : null;
    const cls = signalClass();

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">{t('analysis.title')}</h1>
                    <p className="page-sub">{t('analysis.subtitle')}</p>
                </div>
            </div>

            {/* Coin selector */}
            <div className="analysis-coin-grid">
                {COINS.map(coin => (
                    <button
                        key={coin.id}
                        className={`analysis-coin-btn ${selected?.id === coin.id ? 'selected' : ''}`}
                        onClick={() => { setSelected(coin); setResult(null); setError(''); }}
                    >
                        <span className="analysis-coin-sym">{coin.symbol}</span>
                        <span className="analysis-coin-name">{coin.name}</span>
                    </button>
                ))}
            </div>

            {/* Run button */}
            <motion.button
                className={`analysis-run-btn ${!selected ? 'disabled' : ''}`}
                onClick={analyze}
                disabled={!selected || loading}
                whileHover={selected && !loading ? { scale: 1.01 } : {}}
                whileTap={selected && !loading ? { scale: 0.99 } : {}}
            >
                {loading
                    ? <><span className="btn-spinner" style={{ marginRight: 10 }} />{t('analysis.analyzing')} {selected?.name}...</>
                    : selected ? `◉ ${t('analysis.run')} ${selected.name}` : t('analysis.select')
                }
            </motion.button>

            {/* Error */}
            {error && <div className="analysis-error">{error}</div>}

            {/* Results */}
            <AnimatePresence>
                {result && (
                    <motion.div
                        className="analysis-results"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* Signal banner */}
                        <div className={`signal-banner ${cls}`}>
                            <span className="signal-emoji">{result.emoji}</span>
                            <div>
                                <span className="signal-label">{t('analysis.signal')}</span>
                                <span className="signal-value">{result.signal}</span>
                            </div>
                            <div style={{ flex: 1 }} />
                            <div style={{ textAlign: 'center' }}>
                                <span className="signal-label">{t('analysis.currentPrice')}</span>
                                <span className="signal-value" style={{ fontSize: 15 }}>
                                    {formatPrice(result.currentPrice, 'usd')}
                                </span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span className="reliability-label">{t('analysis.reliability')}</span>
                                <span className="reliability-value">{result.reliability}%</span>
                            </div>
                        </div>

                        {/* Score bar */}
                        <div className="score-section">
                            <span className="score-label-left">{t('analysis.sell8')}</span>
                            <div className="score-track">
                                <div className="score-center-line" />
                                <motion.div
                                    className={`score-fill ${cls}`}
                                    initial={{ width: '50%' }}
                                    animate={{ width: `${scorePercent}%` }}
                                    transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
                                />
                            </div>
                            <span className="score-label-right">{t('analysis.buy8')}</span>
                        </div>
                        <p className="score-text">
                            {t('analysis.score')}: <strong>{result.score > 0 ? '+' : ''}{result.score} / 8</strong>
                            {' '}—{' '}{result.verdict}
                        </p>

                        {/* Indicators */}
                        <div className="indicators-grid">
                            <div className="indicator-card">
                                <span className="indicator-name">RSI (14)</span>
                                <span className="indicator-value">{parseFloat(result.rsi).toFixed(1)}</span>
                                <span className={`indicator-signal ${rsiSignalClass(result.rsi)}`}>
                                    {rsiSignal(result.rsi)}
                                </span>
                            </div>
                            <div className="indicator-card">
                                <span className="indicator-name">MACD</span>
                                <span className="indicator-value">{macdData?.value}</span>
                                <span className={`indicator-signal ${macdData?.cls}`}>{macdData?.signal}</span>
                            </div>
                            <div className="indicator-card">
                                <span className="indicator-name">Bollinger</span>
                                <span className="indicator-value">{bbData?.value}</span>
                                <span className={`indicator-signal ${bbData?.cls}`}>{bbData?.signal}</span>
                            </div>
                            <div className="indicator-card">
                                <span className="indicator-name">SMA Cross</span>
                                <span className="indicator-value">{trendData?.value}</span>
                                <span className={`indicator-signal ${trendData?.cls}`}>{trendData?.signal}</span>
                            </div>
                        </div>

                        {/* Signals list */}
                        {result.signals?.length > 0 && (
                            <div className="signals-list">
                                {result.signals.map((s, i) => {
                                    const low = s.toLowerCase();
                                    const cls2 = low.includes('alcist') || low.includes('compra') || low.includes('sobrevendid') || low.includes('rebote') || low.includes('golden')
                                        ? 'pos'
                                        : low.includes('bajist') || low.includes('vender') || low.includes('sobrecomprad') || low.includes('corrección') || low.includes('death')
                                            ? 'neg' : 'neu';
                                    return <div key={i} className={`signal-item ${cls2}`}>{s}</div>;
                                })}
                            </div>
                        )}

                        {/* AI Prediction */}
                        {result.prediction && (
                            <div className="prediction-panel">
                                <h3 className="prediction-title">◈ {t('analysis.aiTitle')}</h3>
                                <p className="prediction-text">{result.prediction}</p>
                            </div>
                        )}

                        {/* Predicción bloqueada para plan Free */}
                        {result.predictionLocked && (
                            <div className="prediction-panel prediction-locked">
                                <h3 className="prediction-title">🔒 {t('locked.prediction')}</h3>
                                <p className="prediction-text">{t('locked.predictionDesc')}</p>
                                <Link to="/premium" className="locked-cta">{t('locked.cta')} ✨</Link>
                            </div>
                        )}

                        {/* Chart */}
                        {chartData && (
                            <div className="analysis-chart-panel">
                                <h3 className="chart-title">{selected?.name} — {t('dash.lastDays')}</h3>
                                <div style={{ marginTop: 12 }}>
                                    <CryptoChart data={chartData} currencyCode="usd" />
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
