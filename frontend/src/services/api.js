import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('safekids_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('safekids_token');
      localStorage.removeItem('safekids_family');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: async (email, password) => {
    const response = await api.post('/api/auth/login', { email, password });
    return response.data;
  },
};

export const childrenService = {
  getAll: async () => {
    const response = await api.get('/api/children');
    return response.data;
  },
};

export const monitoringService = {
  getDashboard: async () => {
    const response = await api.get('/api/monitoring/dashboard');
    return response.data;
  },
};

export const alertsService = {
  getAll: async (params = {}) => {
    const response = await api.get('/api/alerts', { params });
    return response.data;
  },
};

export const safeZonesService = {
  getAll: async () => {
    const response = await api.get('/api/safezones');
    return response.data;
  },
};

export default api;