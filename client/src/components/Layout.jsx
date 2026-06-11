import { useState, Suspense } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const ROLE_LABELS = { admin: 'Admin', premium: 'Premium', free: 'Free' };
const ROLE_COLORS = { admin: '#f59e0b', premium: '#8b5cf6', free: '#4a5f7a' };

export default function Layout() {
    const { user, logout } = useAuth();
    const { t } = useSettings();
    const navigate = useNavigate();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const handleLogout = () => { logout(); navigate('/auth'); };

    const navItems = [
        { path: '/dashboard', icon: '▦', label: t('nav.dashboard') },
        { path: '/chat',      icon: '◈', label: t('nav.chat') },
        { path: '/analysis',  icon: '◉', label: t('nav.analysis') },
        { path: '/signals',   icon: '⚡', label: t('nav.signals') },
        { path: '/alerts',    icon: '◎', label: t('nav.alerts') },
        { path: '/profile',   icon: '◍', label: t('nav.profile') },
        ...(user?.role !== 'admin' ? [{ path: '/premium', icon: '✦', label: 'Premium' }] : []),
        ...(user?.role === 'admin' ? [{ path: '/admin', icon: '◧', label: t('nav.admin') }] : []),
        { path: '/settings', icon: '⚙', label: t('nav.settings') },
    ];

    return (
        <div className={`layout ${collapsed ? 'collapsed' : ''}`}>
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        className="sidebar-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setMobileOpen(false)}
                    />
                )}
            </AnimatePresence>

            <motion.aside
                className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}
                animate={{ width: collapsed ? 72 : 240 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
                <div className="sidebar-logo">
                    <span className="logo-icon-sm">₿</span>
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.span
                                className="logo-label"
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: 'auto' }}
                                exit={{ opacity: 0, width: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                CryptoMind
                            </motion.span>
                        )}
                    </AnimatePresence>
                    <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
                        {collapsed ? '›' : '‹'}
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map(item => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${item.path === '/admin' ? 'nav-admin' : ''} ${item.path === '/premium' ? 'nav-premium' : ''}`}
                            onClick={() => setMobileOpen(false)}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <AnimatePresence>
                                {!collapsed && (
                                    <motion.span
                                        className="nav-label"
                                        initial={{ opacity: 0, width: 0 }}
                                        animate={{ opacity: 1, width: 'auto' }}
                                        exit={{ opacity: 0, width: 0 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        {item.label}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </NavLink>
                    ))}
                </nav>

                <div
                    className="sidebar-user clickable"
                    onClick={() => { navigate('/profile'); setMobileOpen(false); }}
                    title={t('nav.profile')}
                >
                    <div className="user-avatar">
                        {user?.picture
                            ? <img src={user.picture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            : user?.name?.[0]?.toUpperCase() || '?'
                        }
                    </div>
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.div
                                className="user-info"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                            >
                                <span className="user-name">{user?.name}</span>
                                <span
                                    className="role-badge"
                                    style={{ color: ROLE_COLORS[user?.role] || '#4a5f7a' }}
                                >
                                    {ROLE_LABELS[user?.role] || user?.role}
                                </span>
                                <button className="logout-btn" onClick={(e) => { e.stopPropagation(); handleLogout(); }}>{t('nav.logout')}</button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.aside>

            <div className="main-content">
                <header className="top-navbar">
                    <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>☰</button>
                    <div className="navbar-right">
                        {user?.role !== 'free' && (
                            <span className="role-chip" style={{ '--role-color': ROLE_COLORS[user?.role] }}>
                                {ROLE_LABELS[user?.role]}
                            </span>
                        )}
                        <div className="user-chip">
                            <span className="user-dot" />
                            {user?.name}
                        </div>
                    </div>
                </header>

                <motion.main
                    className="page-content"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                >
                    {/* Suspense local: el sidebar permanece visible mientras carga el chunk de la página */}
                    <Suspense fallback={<div className="app-loading" style={{ height: '60vh' }}><div className="app-loading-spinner" /></div>}>
                        <Outlet />
                    </Suspense>
                </motion.main>
            </div>
        </div>
    );
}
