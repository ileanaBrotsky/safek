import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token a las requests
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

// Interceptor para manejar errores de autenticación
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

// Auth Service
export const authService = {
  login: async (email, password) => {
    try {
      const response = await api.post('/api/auth/login', { email, password });
      return response.data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  register: async (name, email, password) => {
    try {
      const response = await api.post('/api/auth/register', { name, email, password });
      return response.data;
    } catch (error) {
      console.error('Register error:', error);
      throw error;
    }
  },

  verify: async () => {
    try {
      const response = await api.get('/api/auth/verify');
      return response.data;
    } catch (error) {
      console.error('Verify error:', error);
      throw error;
    }
  }
};

// Children Service - Basado en las rutas de tu backend
export const childrenService = {
  // GET /api/children
  getAll: async () => {
    try {
      const response = await api.get('/api/children');
      return response.data;
    } catch (error) {
      console.error('Get children error:', error);
      throw error;
    }
  },

  // GET /api/children/:id
  getById: async (id) => {
    try {
      const response = await api.get(`/api/children/${id}`);
      return response.data;
    } catch (error) {
      console.error('Get child error:', error);
      throw error;
    }
  },

  // POST /api/children
  create: async (childData) => {
    try {
      const response = await api.post('/api/children', childData);
      return response.data;
    } catch (error) {
      console.error('Create child error:', error);
      throw error;
    }
  },

  // PUT /api/children/:id
  update: async (id, childData) => {
    try {
      const response = await api.put(`/api/children/${id}`, childData);
      return response.data;
    } catch (error) {
      console.error('Update child error:', error);
      throw error;
    }
  },

  // DELETE /api/children/:id
  delete: async (id) => {
    try {
      const response = await api.delete(`/api/children/${id}`);
      return response.data;
    } catch (error) {
      console.error('Delete child error:', error);
      throw error;
    }
  },
  // DELETE /api/children/:id
  delete: async (id, forceDelete = false) => {
    try {
      const params = forceDelete ? { force_delete: 'true' } : {};
      const response = await api.delete(`/api/children/${id}`, { params });
      return response.data;
    } catch (error) {
      console.error('Delete child error:', error);
      throw error;
    }
  },

  // ===== FUNCIONALIDADES ESPECIALES =====

  // PATCH /api/children/:id/toggle (compatibilidad hacia atrás)
  toggle: async (id) => {
    try {
      const response = await api.patch(`/api/children/${id}/toggle`);
      return response.data;
    } catch (error) {
      console.error('Toggle child error:', error);
      throw error;
    }
  },

  // PATCH /api/children/:id/activate (nuevo método más específico)
  setActive: async (id, isActive) => {
    try {
      const response = await api.patch(`/api/children/${id}/activate`, {
        is_active: isActive
      });
      return response.data;
    } catch (error) {
      console.error('Set child active error:', error);
      throw error;
    }
  },

  // PATCH /api/children/:id/risk-level
  updateRiskLevel: async (id, riskLevel) => {
    try {
      const response = await api.patch(`/api/children/${id}/risk-level`, {
        risk_level: riskLevel
      });
      return response.data;
    } catch (error) {
      console.error('Update risk level error:', error);
      throw error;
    }
  },

  // ===== UBICACIONES =====

  // GET /api/children/:id/location
  getCurrentLocation: async (id) => {
    try {
      const response = await api.get(`/api/children/${id}/location`);
      return response.data;
    } catch (error) {
      console.error('Get current location error:', error);
      throw error;
    }
  },

  // GET /api/children/:id/locations
  getLocationHistory: async (id, options = {}) => {
    try {
      const { limit = 50, offset = 0, date } = options;
      const params = { limit, offset };
      if (date) params.date = date;
      
      const response = await api.get(`/api/children/${id}/locations`, { params });
      return response.data;
    } catch (error) {
      console.error('Get location history error:', error);
      throw error;
    }
  },

  // ===== ESTADÍSTICAS =====

  // GET /api/children/:id/stats
  getStats: async (id, days = 7) => {
    try {
      const response = await api.get(`/api/children/${id}/stats`, {
        params: { days }
      });
      return response.data;
    } catch (error) {
      console.error('Get child stats error:', error);
      throw error;
    }
  },

  // ===== MÉTODOS DE UTILIDAD =====

  // Activar niño
  activate: async (id) => {
    return await childrenService.setActive(id, true);
  },

  // Desactivar niño (borrado lógico)
  deactivate: async (id) => {
    return await childrenService.setActive(id, false);
  },

  // Eliminar con confirmación
  deleteWithConfirmation: async (id, forceDelete = false) => {
    const confirmMessage = forceDelete 
      ? '¿Estás seguro de eliminar permanentemente este niño? Esta acción no se puede deshacer.'
      : '¿Estás seguro de eliminar este niño? Si tiene datos históricos, solo se desactivará.';
    
    if (window.confirm(confirmMessage)) {
      return await childrenService.delete(id, forceDelete);
    }
    return null;
  }
};

// Safe Zones Service
export const safeZonesService = {
  // GET /api/safe-zones
  getAll: async () => {
    try {
      const response = await api.get('/api/safe-zones');
      return response.data;
    } catch (error) {
      console.error('Get safe zones error:', error);
      throw error;
    }
  },

  // GET /api/safe-zones/:id
  getById: async (id) => {
    try {
      const response = await api.get(`/api/safe-zones/${id}`);
      return response.data;
    } catch (error) {
      console.error('Get safe zone error:', error);
      throw error;
    }
  },

  // POST /api/safe-zones
  create: async (zoneData) => {
    try {
      const response = await api.post('/api/safe-zones', zoneData);
      return response.data;
    } catch (error) {
      console.error('Create safe zone error:', error);
      throw error;
    }
  },

  // PUT /api/safe-zones/:id
  update: async (id, zoneData) => {
    try {
      const response = await api.put(`/api/safe-zones/${id}`, zoneData);
      return response.data;
    } catch (error) {
      console.error('Update safe zone error:', error);
      throw error;
    }
  },

  // DELETE /api/safe-zones/:id
  delete: async (id) => {
    try {
      const response = await api.delete(`/api/safe-zones/${id}`);
      return response.data;
    } catch (error) {
      console.error('Delete safe zone error:', error);
      throw error;
    }
  },

  // PATCH /api/safe-zones/:id/toggle - Activar/desactivar zona
  toggle: async (id) => {
    try {
      const response = await api.patch(`/api/safe-zones/${id}/toggle`);
      return response.data;
    } catch (error) {
      console.error('Toggle safe zone error:', error);
      throw error;
    }
  },

  // POST /api/safe-zones/:id/check - Verificar ubicación en zona específica
  checkLocation: async (id, latitude, longitude) => {
    try {
      const response = await api.post(`/api/safe-zones/${id}/check`, {
        latitude,
        longitude
      });
      return response.data;
    } catch (error) {
      console.error('Check safe zone location error:', error);
      throw error;
    }
  }
};

// Alerts Service
export const alertsService = {
  // GET /api/alerts
  getAll: async (params = {}) => {
    try {
      const response = await api.get('/api/alerts', { params });
      return response.data;
    } catch (error) {
      console.error('Get alerts error:', error);
      throw error;
    }
  },

  // GET /api/alerts/:id
  getById: async (id) => {
    try {
      const response = await api.get(`/api/alerts/${id}`);
      return response.data;
    } catch (error) {
      console.error('Get alert error:', error);
      throw error;
    }
  },

  // POST /api/alerts
  create: async (alertData) => {
    try {
      const response = await api.post('/api/alerts', alertData);
      return response.data;
    } catch (error) {
      console.error('Create alert error:', error);
      throw error;
    }
  },

  // PUT /api/alerts/:id/read
  markAsRead: async (alertId) => {
    try {
      const response = await api.put(`/api/alerts/${alertId}/read`);
      return response.data;
    } catch (error) {
      console.error('Mark alert as read error:', error);
      throw error;
    }
  },

  // DELETE /api/alerts/:id
  delete: async (alertId) => {
    try {
      const response = await api.delete(`/api/alerts/${alertId}`);
      return response.data;
    } catch (error) {
      console.error('Delete alert error:', error);
      throw error;
    }
  }
};

// Location Service
export const locationService = {
  // POST /api/locations
  create: async (locationData) => {
    try {
      const response = await api.post('/api/locations', locationData);
      return response.data;
    } catch (error) {
      console.error('Create location error:', error);
      throw error;
    }
  },

  // GET /api/locations/child/:childId
  getByChild: async (childId, params = {}) => {
    try {
      const response = await api.get(`/api/locations/child/${childId}`, { params });
      return response.data;
    } catch (error) {
      console.error('Get child locations error:', error);
      throw error;
    }
  },

  // GET /api/locations
  getAll: async (params = {}) => {
    try {
      const response = await api.get('/api/locations', { params });
      return response.data;
    } catch (error) {
      console.error('Get locations error:', error);
      throw error;
    }
  }
};

// Monitoring Service
export const monitoringService = {
  // GET /api/monitoring/dashboard
  getDashboard: async () => {
    try {
      const response = await api.get('/api/monitoring/dashboard');
      return response.data;
    } catch (error) {
      console.error('Get dashboard error:', error);
      throw error;
    }
  },

  // GET /api/monitoring/children/:id/activity
  getChildActivity: async (childId, params = {}) => {
    try {
      const response = await api.get(`/api/monitoring/children/${childId}/activity`, { params });
      return response.data;
    } catch (error) {
      console.error('Get child activity error:', error);
      throw error;
    }
  },

  // GET /api/monitoring/children/:id/screentime
  getScreenTime: async (childId, params = {}) => {
    try {
      const response = await api.get(`/api/monitoring/children/${childId}/screentime`, { params });
      return response.data;
    } catch (error) {
      console.error('Get screen time error:', error);
      throw error;
    }
  },

  // PUT /api/monitoring/children/:id/screentime-limit
  setScreenTimeLimit: async (childId, limit) => {
    try {
      const response = await api.put(`/api/monitoring/children/${childId}/screentime-limit`, { limit });
      return response.data;
    } catch (error) {
      console.error('Set screen time limit error:', error);
      throw error;
    }
  }
};

// Family Service
export const familyService = {
  // GET /api/family/profile
  getProfile: async () => {
    try {
      const response = await api.get('/api/family/profile');
      return response.data;
    } catch (error) {
      console.error('Get family profile error:', error);
      throw error;
    }
  },

  // PUT /api/family/profile
  updateProfile: async (profileData) => {
    try {
      const response = await api.put('/api/family/profile', profileData);
      return response.data;
    } catch (error) {
      console.error('Update family profile error:', error);
      throw error;
    }
  }
};

// Settings Service
export const settingsService = {
  // GET /api/settings
  getAll: async () => {
    try {
      const response = await api.get('/api/settings');
      return response.data;
    } catch (error) {
      console.error('Get settings error:', error);
      throw error;
    }
  },

  // PUT /api/settings
  update: async (settingsData) => {
    try {
      const response = await api.put('/api/settings', settingsData);
      return response.data;
    } catch (error) {
      console.error('Update settings error:', error);
      throw error;
    }
  }
};

// Device Service
export const deviceService = {
  // GET /api/devices
  getAll: async () => {
    try {
      const response = await api.get('/api/devices');
      return response.data;
    } catch (error) {
      console.error('Get devices error:', error);
      throw error;
    }
  },

  // POST /api/devices
  register: async (deviceData) => {
    try {
      const response = await api.post('/api/devices', deviceData);
      return response.data;
    } catch (error) {
      console.error('Register device error:', error);
      throw error;
    }
  },

  // PUT /api/devices/:id
  update: async (id, deviceData) => {
    try {
      const response = await api.put(`/api/devices/${id}`, deviceData);
      return response.data;
    } catch (error) {
      console.error('Update device error:', error);
      throw error;
    }
  },

  // DELETE /api/devices/:id
  delete: async (id) => {
    try {
      const response = await api.delete(`/api/devices/${id}`);
      return response.data;
    } catch (error) {
      console.error('Delete device error:', error);
      throw error;
    }
  }
};

export default api;