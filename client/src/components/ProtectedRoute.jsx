import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ roles }) {
    const { user, loading } = useAuth();

    if (loading) return (
        <div className="app-loading">
            <div className="app-loading-spinner" />
        </div>
    );

    if (!user) return <Navigate to="/auth" replace />;

    if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

    return <Outlet />;
}
