import { useAuth } from '../context/AuthContext';

export default function RoleGuard({ roles, fallback = null, children }) {
    const { user } = useAuth();
    if (!user || !roles.includes(user.role)) return fallback;
    return children;
}
