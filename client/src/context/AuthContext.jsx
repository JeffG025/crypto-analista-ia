import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Handle OAuth redirect token in URL
        const params = new URLSearchParams(window.location.search);
        const oauthToken = params.get('token');
        const oauthError = params.get('error');

        if (oauthToken) {
            localStorage.setItem('cm_token', oauthToken);
            window.history.replaceState({}, '', '/');
        } else if (oauthError) {
            window.history.replaceState({}, '', '/auth');
        }

        const token = localStorage.getItem('cm_token');
        if (!token) { setLoading(false); return; }

        authAPI.me()
            .then(res => setUser(res.data.user))
            .catch(() => localStorage.removeItem('cm_token'))
            .finally(() => setLoading(false));
    }, []);

    const login = async (email, password) => {
        const res = await authAPI.login({ email, password });
        localStorage.setItem('cm_token', res.data.token);
        setUser(res.data.user);
        return res.data.user;
    };

    const register = async (name, email, password) => {
        const res = await authAPI.register({ name, email, password });
        localStorage.setItem('cm_token', res.data.token);
        setUser(res.data.user);
        return res.data.user;
    };

    const logout = () => {
        localStorage.removeItem('cm_token');
        setUser(null);
    };

    // Recargar datos del usuario (rol, telegram) tras vincular o pagar
    const refreshUser = async () => {
        try {
            const res = await authAPI.me();
            setUser(res.data.user);
            return res.data.user;
        } catch { return null; }
    };

    return (
        <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
