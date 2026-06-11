import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from './context/AuthContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Code splitting por ruta: cada página se descarga solo cuando se visita.
// chart.js, react-markdown, etc. quedan en los chunks de las páginas que los usan.
const Landing       = lazy(() => import('./pages/Landing'));
const Auth          = lazy(() => import('./pages/Auth'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Dashboard     = lazy(() => import('./pages/Dashboard'));
const Chat          = lazy(() => import('./pages/Chat'));
const Analysis      = lazy(() => import('./pages/Analysis'));
const Alerts        = lazy(() => import('./pages/Alerts'));
const Signals       = lazy(() => import('./pages/Signals'));
const Admin         = lazy(() => import('./pages/Admin'));
const Settings      = lazy(() => import('./pages/Settings'));
const Premium       = lazy(() => import('./pages/Premium'));
const Profile       = lazy(() => import('./pages/Profile'));
const Terms         = lazy(() => import('./pages/Legal').then(m => ({ default: m.Terms })));
const Privacy       = lazy(() => import('./pages/Legal').then(m => ({ default: m.Privacy })));

const PageLoader = () => (
    <div className="app-loading">
        <div className="app-loading-spinner" />
    </div>
);

function AppRoutes() {
    return (
        <Suspense fallback={<PageLoader />}>
            <Routes>
                {/* Públicas */}
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />

                {/* Protegidas */}
                <Route element={<ProtectedRoute />}>
                    <Route element={<Layout />}>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/chat"      element={<Chat />} />
                        <Route path="/analysis"  element={<Analysis />} />
                        <Route path="/alerts"    element={<Alerts />} />
                        <Route path="/signals"   element={<Signals />} />
                        <Route path="/premium"   element={<Premium />} />
                        <Route path="/profile"   element={<Profile />} />
                        <Route path="/settings"  element={<Settings />} />
                    </Route>
                </Route>
                <Route element={<ProtectedRoute roles={['admin']} />}>
                    <Route element={<Layout />}>
                        <Route path="/admin" element={<Admin />} />
                    </Route>
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}

function Shell() {
    const { animations } = useSettings();
    // 'user' respeta prefers-reduced-motion del sistema operativo (accesibilidad)
    return (
        <MotionConfig reducedMotion={animations ? 'user' : 'always'}>
            <AppRoutes />
        </MotionConfig>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <SettingsProvider>
                <AuthProvider>
                    <Shell />
                    <Analytics />
                </AuthProvider>
            </SettingsProvider>
        </BrowserRouter>
    );
}
