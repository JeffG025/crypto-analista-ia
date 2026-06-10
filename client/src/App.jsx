import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AuthProvider } from './context/AuthContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Analysis from './pages/Analysis';
import Alerts from './pages/Alerts';
import Signals from './pages/Signals';
import Admin from './pages/Admin';
import Settings from './pages/Settings';
import Premium from './pages/Premium';

function AppRoutes() {
    return (
        <Routes>
            {/* Públicas */}
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protegidas */}
            <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/chat"      element={<Chat />} />
                    <Route path="/analysis"  element={<Analysis />} />
                    <Route path="/alerts"    element={<Alerts />} />
                    <Route path="/signals"   element={<Signals />} />
                    <Route path="/premium"   element={<Premium />} />
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
    );
}

function Shell() {
    const { animations } = useSettings();
    return (
        <MotionConfig reducedMotion={animations ? 'never' : 'always'}>
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
                </AuthProvider>
            </SettingsProvider>
        </BrowserRouter>
    );
}
