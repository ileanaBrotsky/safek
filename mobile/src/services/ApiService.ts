// mobile/src/services/ApiService.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class ApiService {
  private api: AxiosInstance;
  private authToken: string | null = null;
  private deviceId: string | null = null;
  private childId: number | null = null;

  constructor() {
    // Configuración base de la API
    this.api = axios.create({
      baseURL: this.getBaseURL(),
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-App-Version': DeviceInfo.getVersion(),
        'X-Platform': Platform.OS,
        'X-Platform-Version': Platform.Version
      }
    });

    // Interceptor para agregar token a todas las requests
    this.api.interceptors.request.use(
      async (config) => {
        const token = await this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Agregar device info a todas las requests
        const deviceId = await this.getDeviceId();
        if (deviceId) {
          config.headers['X-Device-Id'] = deviceId;
        }

        console.log(`📤 API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Interceptor para manejar respuestas y errores
    this.api.interceptors.response.use(
      (response) => {
        console.log(`✅ API Response: ${response.config.url} - Status: ${response.status}`);
        return response;
      },
      async (error) => {
        console.error(`❌ API Error: ${error.config?.url}`, {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });

        // Si el token expiró (401), intentar renovar
        if (error.response?.status === 401) {
          console.log('🔑 Token expired, attempting to refresh...');
          await this.handleTokenExpired();
        }

        return Promise.reject(error);
      }
    );

    // Inicializar datos almacenados
    this.initializeStoredData();
  }

  // Obtener URL base según el entorno
  private getBaseURL(): string {
    if (__DEV__) {
      // Desarrollo
      if (Platform.OS === 'android') {
        // Emulador Android
        return 'http://10.0.2.2:3000';
      } else {
        // iOS Simulator o dispositivo físico
        // Cambiar por la IP de tu máquina local
        return 'http://localhost:3000';
      }
    } else {
      // Producción
      return process.env.API_URL || 'https://api.safekids.com';
    }
  }

  // Inicializar datos almacenados
  private async initializeStoredData(): Promise<void> {
    try {
      const [token, deviceId, childId] = await Promise.all([
        AsyncStorage.getItem('authToken'),
        AsyncStorage.getItem('deviceId'),
        AsyncStorage.getItem('childId')
      ]);

      this.authToken = token;
      this.deviceId = deviceId || await this.generateDeviceId();
      this.childId = childId ? parseInt(childId) : null;

      console.log('📱 Stored data initialized:', {
        hasToken: !!token,
        deviceId: this.deviceId,
        childId: this.childId
      });
    } catch (error) {
      console.error('Error initializing stored data:', error);
    }
  }

  // Generar ID único del dispositivo
  private async generateDeviceId(): Promise<string> {
    try {
      let deviceId = await DeviceInfo.getUniqueId();
      
      // Guardar el ID generado
      await AsyncStorage.setItem('deviceId', deviceId);
      this.deviceId = deviceId;
      
      return deviceId;
    } catch (error) {
      console.error('Error generating device ID:', error);
      // Fallback: generar un UUID simple
      const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      await AsyncStorage.setItem('deviceId', uuid);
      return uuid;
    }
  }

  // Obtener token de autenticación
  private async getAuthToken(): Promise<string | null> {
    if (!this.authToken) {
      this.authToken = await AsyncStorage.getItem('authToken');
    }
    return this.authToken;
  }

  // Obtener ID del dispositivo
  private async getDeviceId(): Promise<string | null> {
    if (!this.deviceId) {
      this.deviceId = await AsyncStorage.getItem('deviceId');
    }
    return this.deviceId;
  }

  // Manejar token expirado
  private async handleTokenExpired(): Promise<void> {
    try {
      // Limpiar datos de sesión
      await this.clearSession();
      
      // TODO: Navegar a pantalla de login o solicitar nuevo código
      console.log('📱 Session expired, please authenticate again');
    } catch (error) {
      console.error('Error handling expired token:', error);
    }
  }

  // Guardar token de autenticación
  public async setAuthToken(token: string): Promise<void> {
    this.authToken = token;
    await AsyncStorage.setItem('authToken', token);
  }

  // Guardar ID del niño
  public async setChildId(childId: number): Promise<void> {
    this.childId = childId;
    await AsyncStorage.setItem('childId', childId.toString());
  }

  // Obtener ID del niño actual
  public getChildId(): number | null {
    return this.childId;
  }

  // Limpiar sesión
  public async clearSession(): Promise<void> {
    this.authToken = null;
    this.childId = null;
    await AsyncStorage.multiRemove(['authToken', 'childId']);
  }

  // Método genérico GET
  public async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.api.get<ApiResponse<T>>(url, config);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Método genérico POST
  public async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.api.post<ApiResponse<T>>(url, data, config);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Método genérico PUT
  public async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.api.put<ApiResponse<T>>(url, data, config);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Método genérico DELETE
  public async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.api.delete<ApiResponse<T>>(url, config);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Manejo centralizado de errores
  private handleError(error: any): Error {
    if (error.response) {
      // Error de respuesta del servidor
      const message = error.response.data?.message || error.response.data?.error || 'Error en el servidor';
      console.error(`Server error (${error.response.status}):`, message);
      return new Error(message);
    } else if (error.request) {
      // No se recibió respuesta
      console.error('No response received:', error.request);
      return new Error('No se pudo conectar con el servidor. Verifica tu conexión.');
    } else {
      // Error en la configuración de la request
      console.error('Request error:', error.message);
      return new Error(error.message || 'Error desconocido');
    }
  }

  // Obtener información del dispositivo para registro
  public async getDeviceInfo() {
    const [
      brand,
      model,
      systemName,
      systemVersion,
      appVersion,
      buildNumber,
      deviceName,
      totalMemory,
      isTablet
    ] = await Promise.all([
      DeviceInfo.getBrand(),
      DeviceInfo.getModel(),
      DeviceInfo.getSystemName(),
      DeviceInfo.getSystemVersion(),
      DeviceInfo.getVersion(),
      DeviceInfo.getBuildNumber(),
      DeviceInfo.getDeviceName(),
      DeviceInfo.getTotalMemory(),
      DeviceInfo.isTablet()
    ]);

    return {
      device_id: this.deviceId,
      brand,
      model,
      os: systemName,
      os_version: systemVersion,
      app_version: appVersion,
      build_number: buildNumber,
      device_name: deviceName,
      total_memory: totalMemory,
      is_tablet: isTablet,
      platform: Platform.OS
    };
  }
}

// Singleton instance
const apiService = new ApiService();
export default apiService;