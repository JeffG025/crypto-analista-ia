import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AuthProvider } from './context/AuthContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Analysis from './pages/Analysis';
import Alerts from './pages/Alerts';
import Admin from './pages/Admin';
import Settings from './pages/Settings';
import Premium from './pages/Premium';

function AppRoutes() {
    return (
        <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                    <Route path="/"         element={<Dashboard />} />
                    <Route path="/chat"     element={<Chat />} />
                    <Route path="/analysis" element={<Analysis />} />
                    <Route path="/alerts"   element={<Alerts />} />
                    <Route path="/premium"  element={<Premium />} />
                    <Route path="/settings" element={<Settings />} />
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
