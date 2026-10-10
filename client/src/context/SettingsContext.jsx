import { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../utils/translations';

const SettingsContext = createContext(null);

const DEFAULTS = {
    theme: 'dark',      // 'dark' | 'light'
    lang: 'es',         // 'es' | 'en'
    currency: 'usd',
    animations: true,
    refresh: 60,        // segundos; 0 = desactivado
};

const load = () => {
    try {
        return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('cm_settings') || '{}') };
    } catch {
        return DEFAULTS;
    }
};

export const SettingsProvider = ({ children }) => {
    const [settings, setSettings] = useState(load);

    useEffect(() => {
        localStorage.setItem('cm_settings', JSON.stringify(settings));
        document.documentElement.setAttribute('data-theme', settings.theme);
        document.documentElement.lang = settings.lang;
    }, [settings]);

    const set = (patch) => setSettings(prev => ({ ...prev, ...patch }));

    const t = (key) =>
        translations[settings.lang]?.[key] ?? translations.es[key] ?? key;

    // Traduce un valor que llega del servidor; si no hay traducción, muestra el original
    const tr = (prefix, value, fallback = value) =>
        translations[settings.lang]?.[`${prefix}.${value}`] ?? fallback;

    const locale = settings.lang === 'es' ? 'es-MX' : 'en-US';

    const formatPrice = (value, currencyOverride) => {
        if (value === null || value === undefined || isNaN(value)) return '—';
        const cur = (currencyOverride || settings.currency).toUpperCase();
        const abs = Math.abs(value);
        const maxFrac = abs >= 1000 ? 0 : abs >= 1 ? 2 : 6;
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: cur,
                minimumFractionDigits: 0,
                maximumFractionDigits: maxFrac,
            }).format(value);
        } catch {
            return `$${value}`;
        }
    };

    return (
        <SettingsContext.Provider value={{ ...settings, set, t, tr, locale, formatPrice }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => useContext(SettingsContext);
