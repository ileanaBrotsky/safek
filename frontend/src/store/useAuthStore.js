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
      
      localStorage.setItem('safekids_token', response.token);
      localStorage.setItem('safekids_family', JSON.stringify(response.family));
      
      set({
        isAuthenticated: true,
        family: response.family,
        token: response.token,
        loading: false,
        error: null,
      });
      
      return response;
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Error en el login';
      set({ 
        loading: false, 
        error: errorMessage,
        isAuthenticated: false 
      });
      throw error;
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