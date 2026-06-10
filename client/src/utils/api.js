import axios from 'axios';

// En producción se define VITE_API_URL (Vercel); en local usa el backend de desarrollo
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({ baseURL: BASE });

api.interceptors.request.use(config => {
    const token = localStorage.getItem('cm_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export const authAPI = {
    register: (data) => api.post('/api/auth/register', data),
    login:    (data) => api.post('/api/auth/login', data),
    me:       ()     => api.get('/api/auth/me'),
    // Google OAuth usa redirección del navegador, no llamada API
    googleUrl: () => `${BASE}/api/auth/google`,
};

export const cryptoAPI = {
    chat:      (data)       => api.post('/api/chat', data),
    sentiment: ()           => api.get('/api/sentiment'),
    market:    (currency)   => api.get(`/api/market?currency=${currency || 'usd'}`),
    analysis:  (coin, lang) => api.get(`/api/analysis?coin=${coin}&lang=${lang || 'es'}`),
};

export const alertsAPI = {
    list:   ()     => api.get('/api/alerts'),
    create: (data) => api.post('/api/alerts', data),
    remove: (id)   => api.delete(`/api/alerts/${id}`),
};

export const adminAPI = {
    stats:      ()         => api.get('/api/admin/stats'),
    users:      ()         => api.get('/api/admin/users'),
    updateRole: (id, role) => api.patch(`/api/admin/users/${id}/role`, { role }),
};

export const telegramAPI = {
    link:   (code) => api.post('/api/telegram/link', { code }),
    unlink: ()     => api.post('/api/telegram/unlink'),
};

export const paymentsAPI = {
    config:   () => api.get('/api/payments/config'),
    checkout: () => api.post('/api/payments/checkout'),
};

export default api;
