import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { adminAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const ROLES = ['free', 'premium', 'admin'];

const ROLE_INFO = {
    admin:   { label: 'Admin',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)' },
    premium: { label: 'Premium', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)' },
    free:    { label: 'Free',    color: '#4a5f7a', bg: 'rgba(74,95,122,0.12)',  border: 'rgba(74,95,122,0.2)'  },
};

function RoleBadge({ role }) {
    const info = ROLE_INFO[role] || ROLE_INFO.free;
    return (
        <span style={{
            padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700,
            color: info.color, background: info.bg, border: `1px solid ${info.border}`,
            display: 'inline-block', letterSpacing: 0.5
        }}>
            {info.label}
        </span>
    );
}

function CellContent({ value }) {
    const cls = value.startsWith('✅') ? 'perm-yes' : value.startsWith('❌') ? 'perm-no' : 'perm-partial';
    return <span className={cls}>{value}</span>;
}

export default function Admin() {
    const { user: currentUser } = useAuth();
    const { t, locale } = useSettings();
    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(null);
    const [activeTab, setActiveTab] = useState('users');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [statsRes, usersRes] = await Promise.all([
                adminAPI.stats(),
                adminAPI.users(),
            ]);
            setStats(statsRes.data);
            setUsers(usersRes.data);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    };

    const changeRole = async (userId, newRole) => {
        setUpdating(userId);
        try {
            await adminAPI.updateRole(userId, newRole);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
            const s = await adminAPI.stats();
            setStats(s.data);
        } catch (e) {
            alert(e.response?.data?.error || t('admin.roleChangeError'));
        } finally { setUpdating(null); }
    };

    const permRows = t('admin.permRows');
    const roleDescs = t('admin.roleDescs');

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">{t('admin.title')}</h1>
                    <p className="page-sub">{t('admin.subtitle')}</p>
                </div>
            </div>

            {/* Stats row */}
            {stats && (
                <div className="admin-stats-row">
                    <div className="admin-stat-card">
                        <span className="admin-stat-label">{t('admin.total')}</span>
                        <span className="admin-stat-value">{stats.total}</span>
                    </div>
                    <div className="admin-stat-card" style={{ borderColor: 'rgba(74,95,122,0.3)' }}>
                        <span className="admin-stat-label">Free</span>
                        <span className="admin-stat-value" style={{ color: '#4a5f7a' }}>{stats.byRole.free}</span>
                    </div>
                    <div className="admin-stat-card" style={{ borderColor: 'rgba(139,92,246,0.3)' }}>
                        <span className="admin-stat-label">Premium</span>
                        <span className="admin-stat-value" style={{ color: '#8b5cf6' }}>{stats.byRole.premium}</span>
                    </div>
                    <div className="admin-stat-card" style={{ borderColor: 'rgba(245,158,11,0.3)' }}>
                        <span className="admin-stat-label">Admin</span>
                        <span className="admin-stat-value" style={{ color: '#f59e0b' }}>{stats.byRole.admin}</span>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="admin-tabs">
                <button className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
                    {t('admin.tabUsers')}
                </button>
                <button className={`admin-tab ${activeTab === 'roles' ? 'active' : ''}`} onClick={() => setActiveTab('roles')}>
                    {t('admin.tabRoles')}
                </button>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'users' && (
                    <motion.div
                        key="users"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="admin-panel">
                            <div className="admin-panel-header">
                                <h2 className="section-title" style={{ marginBottom: 0 }}>{t('admin.registered')}</h2>
                                <button className="sessions-new-btn" onClick={loadData}>{t('admin.refresh')}</button>
                            </div>

                            {loading ? (
                                <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)' }}>{t('admin.loading')}</div>
                            ) : (
                                <div className="admin-users-table">
                                    <div className="admin-users-header">
                                        <span>{t('admin.user')}</span>
                                        <span>{t('admin.email')}</span>
                                        <span>{t('admin.currentRole')}</span>
                                        <span>{t('admin.joined')}</span>
                                        <span>{t('admin.changeRole')}</span>
                                    </div>
                                    {users.map(u => (
                                        <motion.div
                                            key={u.id}
                                            className="admin-user-row"
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                        >
                                            <div className="admin-user-cell">
                                                <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                                                    {u.picture
                                                        ? <img src={u.picture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                                        : u.name?.[0]?.toUpperCase()
                                                    }
                                                </div>
                                                <div>
                                                    <span className="table-name">{u.name}</span>
                                                    {u.id === currentUser?.id && <span className="you-badge">{t('admin.you')}</span>}
                                                </div>
                                            </div>
                                            <span className="table-sym" style={{ color: 'var(--t2)', fontSize: 12.5 }}>{u.email}</span>
                                            <span><RoleBadge role={u.role} /></span>
                                            <span className="table-sym" style={{ fontSize: 11 }}>
                                                {u.createdAt ? new Date(u.createdAt).toLocaleDateString(locale) : '—'}
                                            </span>
                                            <div className="role-selector">
                                                {ROLES.map(r => (
                                                    <button
                                                        key={r}
                                                        className={`role-select-btn ${u.role === r ? 'active' : ''}`}
                                                        style={u.role === r ? { borderColor: ROLE_INFO[r].color, color: ROLE_INFO[r].color, background: ROLE_INFO[r].bg } : {}}
                                                        onClick={() => u.role !== r && changeRole(u.id, r)}
                                                        disabled={updating === u.id || u.role === r}
                                                    >
                                                        {updating === u.id ? '...' : ROLE_INFO[r].label}
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'roles' && (
                    <motion.div
                        key="roles"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="admin-panel">
                            <h2 className="section-title">{t('admin.permsTitle')}</h2>
                            <div className="roles-table-wrap">
                                <table className="roles-table">
                                    <thead>
                                        <tr>
                                            <th className="roles-feature-col">{t('admin.feature')}</th>
                                            <th><span className="roles-th-badge" style={{ color: ROLE_INFO.free.color }}>Free</span></th>
                                            <th><span className="roles-th-badge" style={{ color: ROLE_INFO.premium.color }}>Premium</span></th>
                                            <th><span className="roles-th-badge" style={{ color: ROLE_INFO.admin.color }}>Admin</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {permRows.map((row, i) => (
                                            <tr key={i} className={i % 2 === 0 ? 'row-even' : ''}>
                                                <td className="roles-feature-col">{row.feature}</td>
                                                <td><CellContent value={row.free} /></td>
                                                <td><CellContent value={row.premium} /></td>
                                                <td><CellContent value={row.admin} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Role cards */}
                            <div className="role-cards">
                                {Object.entries(ROLE_INFO).map(([key, info]) => (
                                    <div key={key} className="role-card" style={{ borderColor: info.border }}>
                                        <div className="role-card-header" style={{ background: info.bg }}>
                                            <span className="role-card-name" style={{ color: info.color }}>{info.label}</span>
                                        </div>
                                        <div className="role-card-body">
                                            {(roleDescs[key] || []).map((line, i) => <p key={i}>{line}</p>)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
