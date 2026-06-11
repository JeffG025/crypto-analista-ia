import { lazy, Suspense } from 'react';

// chart.js + react-chartjs-2 pesan ~200KB: se descargan en su propio chunk
// solo cuando una gráfica entra en pantalla, sin bloquear el render de la página.
const CryptoChart = lazy(() => import('./CryptoChart'));

export default function LazyChart(props) {
    return (
        <Suspense fallback={<div className="chart-skeleton" />}>
            <CryptoChart {...props} />
        </Suspense>
    );
}
