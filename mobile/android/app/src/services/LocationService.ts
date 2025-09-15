/// mobile/src/services/LocationService.ts
import Geolocation from 'react-native-geolocation-service';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import ApiService from './ApiService';
import DeviceInfo from 'react-native-device-info';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  battery_level?: number;
  address?: string;
}

interface LocationOptions {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
  interval: number;
}

class LocationService {
  private watchId: number | null = null;
  private isTracking: boolean = false;
  private locationOptions: LocationOptions;
  private lastLocationTime: number = 0;
  private sendInterval: number = 30000; // Enviar cada 30 segundos

  constructor() {
    this.locationOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
      interval: 10000, // Obtener ubicación cada 10 segundos
    };
  }

  // Solicitar permisos de ubicación
  async requestLocationPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
        ]);

        const fineLocationGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted';
        const coarseLocationGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === 'granted';
        const backgroundLocationGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION] === 'granted';

        console.log('📍 Permissions granted:', {
          fine: fineLocationGranted,
          coarse: coarseLocationGranted,
          background: backgroundLocationGranted,
        });

        if (!backgroundLocationGranted) {
          Alert.alert(
            'Permiso Adicional Requerido',
            'Para funcionar correctamente, SafeKids necesita acceso a la ubicación todo el tiempo. Por favor, selecciona "Permitir todo el tiempo" en la configuración.',
            [{ text: 'Entendido', style: 'default' }]
          );
        }

        return fineLocationGranted && coarseLocationGranted;
      } catch (error) {
        console.error('❌ Error requesting permissions:', error);
        return false;
      }
    }

    // Para iOS - los permisos se solicitan automáticamente
    return true;
  }

  // Iniciar seguimiento de ubicación
  async startTracking(): Promise<void> {
    if (this.isTracking) {
      console.log('🔄 Location tracking already active');
      return;
    }

    const hasPermissions = await this.requestLocationPermissions();
    if (!hasPermissions) {
      throw new Error('Permisos de ubicación no concedidos');
    }

    const childInfo = ApiService.getChildInfo();
    if (!childInfo) {
      throw new Error('Dispositivo no configurado');
    }

    console.log('🚀 Starting location tracking for:', childInfo.name);

    this.watchId = Geolocation.watchPosition(
      (position) => {
        this.handleLocationUpdate(position);
      },
      (error) => {
        console.error('❌ Location error:', error);
        this.handleLocationError(error);
      },
      {
        ...this.locationOptions,
        distanceFilter: 10, // Actualizar cada 10 metros
        interval: this.locationOptions.interval,
        fastestInterval: 5000, // Mínimo 5 segundos entre actualizaciones
      }
    );

    this.isTracking = true;
    console.log('✅ Location tracking started with watchId:', this.watchId);
  }

  // Detener seguimiento
  stopTracking(): void {
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this.isTracking = false;
      console.log('🛑 Location tracking stopped');
    }
  }

  // Manejar actualización de ubicación
  private async handleLocationUpdate(position: GeolocationPosition): Promise<void> {
    const now = Date.now();
    
    // Solo procesar si han pasado al menos 10 segundos desde la última ubicación
    if (now - this.lastLocationTime < 10000) {
      return;
    }

    try {
      const batteryLevel = await DeviceInfo.getBatteryLevel();
      
      const locationData: LocationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy || 0,
        timestamp: new Date().toISOString(),
        battery_level: Math.round(batteryLevel * 100),
      };

      console.log('📍 New location:', {
        lat: locationData.latitude.toFixed(6),
        lng: locationData.longitude.toFixed(6),
        accuracy: locationData.accuracy,
        battery: locationData.battery_level,
      });

      // Enviar ubicación si han pasado más de 30 segundos desde el último envío
      if (now - this.lastLocationTime >= this.sendInterval) {
        await this.sendLocationToServer(locationData);
        this.lastLocationTime = now;
      }

    } catch (error) {
      console.error('❌ Error processing location:', error);
    }
  }

  // Enviar ubicación al servidor
  private async sendLocationToServer(locationData: LocationData): Promise<void> {
    try {
      await ApiService.sendLocation(locationData);
      console.log('✅ Location sent to server successfully');
    } catch (error) {
      console.error('❌ Failed to send location to server:', error);
      // Podrías implementar un sistema de cola para reintentar más tarde
    }
  }

  // Manejar errores de ubicación
  private handleLocationError(error: any): void {
    console.error('❌ Location Service Error:', error);
    
    switch (error.code) {
      case 1: // PERMISSION_DENIED
        Alert.alert(
          'Permisos Requeridos',
          'SafeKids necesita acceso a la ubicación para funcionar. Por favor, habilita los permisos en la configuración.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Configuración', onPress: () => console.log('Open settings') }
          ]
        );
        break;
      case 2: // POSITION_UNAVAILABLE
        console.log('⚠️ Location unavailable, will retry...');
        break;
      case 3: // TIMEOUT
        console.log('⚠️ Location timeout, will retry...');
        break;
      default:
        console.log('⚠️ Unknown location error:', error.message);
    }
  }

  // Obtener ubicación actual una sola vez
  async getCurrentLocation(): Promise<LocationData> {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        async (position) => {
          try {
            const batteryLevel = await DeviceInfo.getBatteryLevel();
            
            const locationData: LocationData = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy || 0,
              timestamp: new Date().toISOString(),
              battery_level: Math.round(batteryLevel * 100),
            };
            
            resolve(locationData);
          } catch (error) {
            reject(error);
          }
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        }
      );
    });
  }

  // Verificar si está rastreando
  isLocationTracking(): boolean {
    return this.isTracking;
  }

  // Configurar intervalo de envío
  setSendInterval(intervalMs: number): void {
    this.sendInterval = intervalMs;
    console.log('📝 Send interval updated to:', intervalMs / 1000, 'seconds');
  }
}

export default new LocationService();