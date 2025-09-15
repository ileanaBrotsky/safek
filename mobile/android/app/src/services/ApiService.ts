// mobile/src/services/ApiService.ts
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  battery_level?: number;
  address?: string;
}

interface ChildInfo {
  id: number;
  name: string;
  family_id: number;
  is_active: boolean;
}

interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

class ApiService {
  private api: AxiosInstance;
  private baseURL: string;
  private childInfo: ChildInfo | null = null;

  constructor() {
    // Cambia esta URL por la IP de tu backend
    this.baseURL = 'http://10.0.2.2:3000'; // Para emulador Android
    // this.baseURL = 'http://192.168.1.100:3000'; // Para dispositivo físico (cambia por tu IP local)
    
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
    this.loadChildInfo();
  }

  private setupInterceptors(): void {
    // Request interceptor - agregar token si existe
    this.api.interceptors.request.use(
      async (config) => {
        const token = await AsyncStorage.getItem('child_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        console.log('🔄 API Request:', config.method?.toUpperCase(), config.url);
        return config;
      },
      (error) => {
        console.error('❌ Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        console.log('✅ API Response:', response.status, response.config.url);
        return response;
      },
      (error) => {
        console.error('❌ API Error:', error.response?.status, error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  private async loadChildInfo(): Promise<void> {
    try {
      const savedChildInfo = await AsyncStorage.getItem('child_info');
      if (savedChildInfo) {
        this.childInfo = JSON.parse(savedChildInfo);
        console.log('👶 Child Info Loaded:', this.childInfo?.name);
      }
    } catch (error) {
      console.error('Error loading child info:', error);
    }
  }

  // Configuración inicial del dispositivo del niño
  async setupChild(childCode: string, childName: string): Promise<ChildInfo> {
    try {
      const response = await this.api.post<ApiResponse<ChildInfo>>('/api/children/setup-device', {
        childCode,
        childName,
        deviceInfo: await this.getDeviceInfo(),
      });

      if (response.data.success && response.data.data) {
        this.childInfo = response.data.data;
        await AsyncStorage.setItem('child_info', JSON.stringify(this.childInfo));
        await AsyncStorage.setItem('child_token', childCode); // Usar el código como token temporal
        console.log('✅ Child setup successful:', this.childInfo.name);
        return this.childInfo;
      } else {
        throw new Error(response.data.message || 'Setup failed');
      }
    } catch (error: any) {
      console.error('❌ Child setup error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Error configurando dispositivo');
    }
  }

  // Enviar ubicación al backend
  async sendLocation(locationData: LocationData): Promise<boolean> {
    if (!this.childInfo) {
      throw new Error('Child not configured');
    }

    try {
      const response = await this.api.post<ApiResponse>('/api/locations', {
        child_id: this.childInfo.id,
        ...locationData,
      });

      console.log('📍 Location sent successfully');
      return response.data.success;
    } catch (error: any) {
      console.error('❌ Error sending location:', error.response?.data || error.message);
      throw error;
    }
  }

  // Obtener información del dispositivo
  private async getDeviceInfo(): Promise<object> {
    const DeviceInfo = require('react-native-device-info');
    
    try {
      return {
        deviceId: await DeviceInfo.getUniqueId(),
        model: DeviceInfo.getModel(),
        systemName: DeviceInfo.getSystemName(),
        systemVersion: DeviceInfo.getSystemVersion(),
        appVersion: DeviceInfo.getVersion(),
        buildNumber: DeviceInfo.getBuildNumber(),
      };
    } catch (error) {
      console.error('Error getting device info:', error);
      return {};
    }
  }

  // Verificar conectividad
  async checkConnection(): Promise<boolean> {
    try {
      const response = await this.api.get('/health');
      return response.status === 200;
    } catch (error) {
      console.error('❌ Backend connection failed:', error);
      return false;
    }
  }

  // Obtener información del niño actual
  getChildInfo(): ChildInfo | null {
    return this.childInfo;
  }

  // Limpiar configuración (para testing)
  async clearChildInfo(): Promise<void> {
    this.childInfo = null;
    await AsyncStorage.removeItem('child_info');
    await AsyncStorage.removeItem('child_token');
    console.log('🗑️ Child info cleared');
  }
}

export default new ApiService();