import { create } from 'zustand';
import { authService } from '../services/api';

const useAuthStore = create((set) => ({
  isAuthenticated: !!localStorage.getItem('safekids_token'),
  family: JSON.parse(localStorage.getItem('safekids_family') || 'null'),
  token: localStorage.getItem('safekids_token'),
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    
    try {
      const response = await authService.login(email, password);
      
      // Según tu Postman, la respuesta tiene esta estructura:
      // { success: true, data: { token: "...", user: {...} } }
      if (response.success && response.data.token) {
        localStorage.setItem('safekids_token', response.data.token);
        localStorage.setItem('safekids_family', JSON.stringify(response.data.user));
        
        set({
          isAuthenticated: true,
          family: response.data.user,
          token: response.data.token,
          loading: false,
          error: null,
        });
        
        return response;
      } else {
        throw new Error('Respuesta de login inválida');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          'Error en el login';
      set({ 
        loading: false, 
        error: errorMessage,
        isAuthenticated: false 
      });
      throw error;
    }
  },

  register: async (name, email, password) => {
    set({ loading: true, error: null });
    
    try {
      const response = await authService.register(name, email, password);
      
      if (response.success && response.data.token) {
        localStorage.setItem('safekids_token', response.data.token);
        localStorage.setItem('safekids_family', JSON.stringify(response.data.user));
        
        set({
          isAuthenticated: true,
          family: response.data.user,
          token: response.data.token,
          loading: false,
          error: null,
        });
        
        return response;
      } else {
        throw new Error('Respuesta de registro inválida');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          'Error en el registro';
      set({ 
        loading: false, 
        error: errorMessage,
        isAuthenticated: false 
      });
      throw error;
    }
  },

  verifyToken: async () => {
    const token = localStorage.getItem('safekids_token');
    if (!token) {
      set({ isAuthenticated: false, family: null, token: null });
      return false;
    }

    try {
      const response = await authService.verify();
      if (response.success && response.data.user) {
        set({
          isAuthenticated: true,
          family: response.data.user,
          token: token,
          error: null
        });
        return true;
      } else {
        throw new Error('Token inválido');
      }
    } catch (error) {
      localStorage.removeItem('safekids_token');
      localStorage.removeItem('safekids_family');
      set({
        isAuthenticated: false,
        family: null,
        token: null,
        error: 'Sesión expirada'
      });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('safekids_token');
    localStorage.removeItem('safekids_family');
    
    set({
      isAuthenticated: false,
      family: null,
      token: null,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;