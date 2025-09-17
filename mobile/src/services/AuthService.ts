// mobile/src/services/AuthService.ts
import ApiService from './ApiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

interface RegisterDeviceData {
  registration_code: string;
  device_name?: string;
}

interface AuthResponse {
  success: boolean;
  data?: {
    token: string;
    child: {
      id: number;
      name: string;
      age: number;
      device_id: string;
    };
    family: {
      id: number;
      name: string;
    };
  };
  message?: string;
  error?: string;
}

interface VerifyResponse {
  success: boolean;
  data?: {
    authenticated: boolean;
    child?: {
      id: number;
      name: string;
    };
  };
  message?: string;
}

class AuthService {
  private isAuthenticated: boolean = false;
  private currentChild: any = null;

  constructor() {
    this.checkAuthStatus();
  }

  // Verificar estado de autenticación al iniciar
  async checkAuthStatus(): Promise<boolean> {
    try {
      const token = await AsyncStorage.getItem('authToken');
      
      if (!token) {
        console.log('📱 No auth token found');
        this.isAuthenticated = false;
        return false;
      }

      // Verificar token con el backend
      const response = await ApiService.get<VerifyResponse>('/api/auth/verify');
      
      if (response.success && response.data?.authenticated) {
        console.log('✅ Authentication valid');
        this.isAuthenticated = true;
        this.currentChild = response.data.child;
        return true;
      } else {
        console.log('❌ Authentication invalid');
        await this.logout();
        return false;
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      this.isAuthenticated = false;
      return false;
    }
  }

  // Registrar dispositivo con código de vinculación
  async registerDevice(data: RegisterDeviceData): Promise<boolean> {
    try {
      console.log('📱 Registering device with code:', data.registration_code);

      // Obtener información del dispositivo
      const deviceInfo = await ApiService.getDeviceInfo();

      // Enviar registro al backend
      const response = await ApiService.post<AuthResponse>('/api/auth/register-device', {
        ...data,
        ...deviceInfo
      });

      if (response.success && response.data?.token) {
        // Guardar token y datos del niño
        await ApiService.setAuthToken(response.data.token);
        await ApiService.setChildId(response.data.child.id);
        
        // Guardar información adicional
        await AsyncStorage.multiSet([
          ['childName', response.data.child.name],
          ['familyName', response.data.family.name],
          ['isRegistered', 'true']
        ]);

        this.isAuthenticated = true;
        this.currentChild = response.data.child;

        console.log('✅ Device registered successfully:', {
          childId: response.data.child.id,
          childName: response.data.child.name,
          familyName: response.data.family.name
        });

        // Mostrar mensaje de éxito
        Alert.alert(
          '¡Registro Exitoso!',
          `Dispositivo vinculado a ${response.data.child.name} en la familia ${response.data.family.name}`,
          [{ text: 'OK' }]
        );

        return true;
      } else {
        throw new Error(response.message || 'Error en el registro');
      }
    } catch (error: any) {
      console.error('❌ Device registration error:', error);
      
      // Manejar errores específicos
      let errorMessage = 'No se pudo registrar el dispositivo';
      
      if (error.message.includes('código')) {
        errorMessage = 'Código de registro inválido o expirado';
      } else if (error.message.includes('network')) {
        errorMessage = 'Error de conexión. Verifica tu internet';
      }

      Alert.alert('Error de Registro', errorMessage, [{ text: 'OK' }]);
      return false;
    }
  }

  // Reautenticar dispositivo (si ya estaba registrado)
  async reauthenticate(): Promise<boolean> {
    try {
      const deviceId = await AsyncStorage.getItem('deviceId');
      const childId = await AsyncStorage.getItem('childId');

      if (!deviceId || !childId) {
        console.log('📱 No previous registration found');
        return false;
      }

      console.log('🔄 Attempting to reauthenticate device...');

      const response = await ApiService.post<AuthResponse>('/api/auth/device-login', {
        device_id: deviceId,
        child_id: parseInt(childId)
      });

      if (response.success && response.data?.token) {
        await ApiService.setAuthToken(response.data.token);
        this.isAuthenticated = true;
        this.currentChild = response.data.child;

        console.log('✅ Device reauthenticated successfully');
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Reauthentication failed:', error);
      return false;
    }
  }

  // Cerrar sesión (solo limpia datos locales, el dispositivo sigue registrado)
  async logout(): Promise<void> {
    try {
      console.log('🚪 Logging out...');
      
      // Notificar al backend
      try {
        await ApiService.post('/api/auth/logout');
      } catch (error) {
        console.warn('Could not notify backend of logout:', error);
      }

      // Limpiar datos locales
      await ApiService.clearSession();
      this.isAuthenticated = false;
      this.currentChild = null;

      console.log('✅ Logged out successfully');
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }

  // Desvincular dispositivo completamente
  async unregisterDevice(): Promise<boolean> {
    try {
      Alert.alert(
        'Confirmar Desvinculación',
        '¿Estás seguro de que quieres desvincular este dispositivo? El monitoreo parental se desactivará.',
        [
          {
            text: 'Cancelar',
            style: 'cancel'
          },
          {
            text: 'Desvincular',
            style: 'destructive',
            onPress: async () => {
              try {
                // Notificar al backend
                const response = await ApiService.delete('/api/devices/unregister');

                if (response.success) {
                  // Limpiar TODOS los datos locales
                  await AsyncStorage.clear();
                  this.isAuthenticated = false;
                  this.currentChild = null;

                  Alert.alert(
                    'Dispositivo Desvinculado',
                    'El dispositivo ha sido desvinculado exitosamente.',
                    [{ text: 'OK' }]
                  );

                  return true;
                }
              } catch (error) {
                console.error('Error unregistering device:', error);
                Alert.alert('Error', 'No se pudo desvincular el dispositivo');
              }
            }
          }
        ]
      );

      return false;
    } catch (error) {
      console.error('Error in unregister process:', error);
      return false;
    }
  }

  // Verificar si el dispositivo necesita permisos adicionales
  async checkRequiredPermissions(): Promise<{
    location: boolean;
    notifications: boolean;
    usage_stats: boolean;
    accessibility: boolean;
  }> {
    try {
      const response = await ApiService.get('/api/devices/check-permissions');
      return response.data || {
        location: false,
        notifications: false,
        usage_stats: false,
        accessibility: false
      };
    } catch (error) {
      console.error('Error checking permissions:', error);
      return {
        location: false,
        notifications: false,
        usage_stats: false,
        accessibility: false
      };
    }
  }

  // Actualizar token de notificaciones push
  async updatePushToken(token: string): Promise<void> {
    try {
      await ApiService.put('/api/devices/push-token', {
        push_token: token
      });
      console.log('✅ Push token updated');
    } catch (error) {
      console.error('Error updating push token:', error);
    }
  }

  // Getters
  getIsAuthenticated(): boolean {
    return this.isAuthenticated;
  }

  getCurrentChild(): any {
    return this.currentChild;
  }

  // Validar código de registro (antes de enviar)
  validateRegistrationCode(code: string): boolean {
    // El código debe tener 6 caracteres alfanuméricos
    const codeRegex = /^[A-Z0-9]{6}$/;
    return codeRegex.test(code.toUpperCase());
  }

  // Formatear código de registro para display
  formatRegistrationCode(code: string): string {
    // Convertir a mayúsculas y agregar guión en el medio (ABC-123)
    const upperCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (upperCode.length === 6) {
      return `${upperCode.slice(0, 3)}-${upperCode.slice(3)}`;
    }
    return upperCode;
  }
}

// Singleton instance
const authService = new AuthService();
export default authService;