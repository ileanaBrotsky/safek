// mobile/src/services/LocationService.ts
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
  distanceFilter: number;
  interval?: number;
  fastestInterval?: number;
}

class LocationService {
  private watchId: number | null = null;
  private isTracking: boolean = false;
  private locationOptions: LocationOptions;
  private lastLocationTime: number = 0;
  private sendInterval: number = 30000; // Enviar cada 30 segundos
  private locationQueue: LocationData[] = [];
  private maxQueueSize: number = 10;

  constructor() {
    this.locationOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
      distanceFilter: 10, // Actualizar cada 10 metros
      interval: 10000, // Android: obtener ubicación cada 10 segundos
      fastestInterval: 5000, // Android: no más rápido que cada 5 segundos
    };
  }

  // Verificar si los permisos están otorgados
  async checkLocationPermission(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const fineLocation = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        const coarseLocation = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
        );
        
        return fineLocation && coarseLocation;
      } catch (error) {
        console.error('Error checking location permission:', error);
        return false;
      }
    } else {
      // iOS - usar react-native-permissions para mejor control
      return true;
    }
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

        const fineLocationGranted = 
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted';
        const coarseLocationGranted = 
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === 'granted';
        const backgroundLocationGranted = 
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION] === 'granted';

        console.log('📍 Permissions granted:', {
          fine: fineLocationGranted,
          coarse: coarseLocationGranted,
          background: backgroundLocationGranted,
        });

        if (!backgroundLocationGranted && fineLocationGranted) {
          Alert.alert(
            'Permiso Adicional Recomendado',
            'Para un mejor funcionamiento, SafeKids necesita acceso a la ubicación todo el tiempo. ' +
            'Puedes habilitarlo en Configuración > Aplicaciones > SafeKids > Permisos > Ubicación > Permitir todo el tiempo.',
            [
              { text: 'Entendido', style: 'default' }
            ]
          );
        }

        return fineLocationGranted && coarseLocationGranted;
      } catch (err) {
        console.error('Error requesting location permission:', err);
        return false;
      }
    } else {
      // iOS permissions
      const auth = await Geolocation.requestAuthorization('always');
      return auth === 'granted';
    }
  }

  // Iniciar tracking de ubicación
  async startTracking(): Promise<boolean> {
    try {
      // Verificar permisos
      let hasPermission = await this.checkLocationPermission();
      
      if (!hasPermission) {
        hasPermission = await this.requestLocationPermissions();
        
        if (!hasPermission) {
          console.log('❌ Location permissions denied');
          return false;
        }
      }

      if (this.isTracking) {
        console.log('📍 Location tracking already active');
        return true;
      }

      console.log('🚀 Starting location tracking...');
      this.isTracking = true;

      // Obtener ubicación inicial
      this.getCurrentLocation();

      // Iniciar seguimiento continuo
      this.watchId = Geolocation.watchPosition(
        (position) => {
          this.handleLocationUpdate(position);
        },
        (error) => {
          this.handleLocationError(error);
        },
        this.locationOptions
      );

      console.log('✅ Location tracking started with watch ID:', this.watchId);
      
      // Iniciar envío periódico de ubicaciones en cola
      this.startQueueProcessor();
      
      return true;
    } catch (error) {
      console.error('Error starting location tracking:', error);
      this.isTracking = false;
      return false;
    }
  }

  // Detener tracking
  stopTracking(): void {
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    
    this.isTracking = false;
    this.locationQueue = [];
    console.log('⏹️ Location tracking stopped');
  }

  // Obtener ubicación actual (una sola vez)
  async getCurrentLocation(): Promise<LocationData | null> {
    return new Promise((resolve) => {
      Geolocation.getCurrentPosition(
        async (position) => {
          const locationData = await this.prepareLocationData(position);
          resolve(locationData);
        },
        (error) => {
          console.error('Error getting current location:', error);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        }
      );
    });
  }

  // Manejar actualización de ubicación
  private async handleLocationUpdate(position: any): Promise<void> {
    console.log('📍 Location update received:', {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    });

    const now = Date.now();
    
    // Limitar la frecuencia de envío
    if (now - this.lastLocationTime < this.sendInterval) {
      // Agregar a la cola para envío posterior
      const locationData = await this.prepareLocationData(position);
      this.addToQueue(locationData);
      return;
    }

    this.lastLocationTime = now;
    const locationData = await this.prepareLocationData(position);
    await this.sendLocationToBackend(locationData);
  }

  // Manejar error de ubicación
  private handleLocationError(error: any): void {
    console.error('📍 Location error:', error);
    
    switch (error.code) {
      case 1: // PERMISSION_DENIED
        Alert.alert(
          'Permisos Denegados',
          'Por favor, habilita los permisos de ubicación para SafeKids.'
        );
        this.stopTracking();
        break;
      case 2: // POSITION_UNAVAILABLE
        console.log('Position unavailable, will retry...');
        break;
      case 3: // TIMEOUT
        console.log('Location request timeout, will retry...');
        break;
      case 5: // LOCATION_SETTINGS_OFF
        Alert.alert(
          'Ubicación Desactivada',
          'Por favor, activa la ubicación en tu dispositivo.'
        );
        break;
    }
  }

  // Preparar datos de ubicación
  private async prepareLocationData(position: any): Promise<LocationData> {
    const batteryLevel = await DeviceInfo.getBatteryLevel();
    
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: new Date().toISOString(),
      battery_level: Math.round(batteryLevel * 100),
      // address se puede agregar con geocoding inverso si es necesario
    };
  }

  // Agregar ubicación a la cola
  private addToQueue(locationData: LocationData): void {
    this.locationQueue.push(locationData);
    
    // Limitar tamaño de la cola
    if (this.locationQueue.length > this.maxQueueSize) {
      this.locationQueue.shift(); // Remover el más antiguo
    }
    
    console.log(`📦 Location queued (${this.locationQueue.length} in queue)`);
  }

  // Procesar cola de ubicaciones
  private async startQueueProcessor(): Promise<void> {
    setInterval(async () => {
      if (this.locationQueue.length > 0 && this.isTracking) {
        console.log(`📤 Processing ${this.locationQueue.length} queued locations`);
        
        // Enviar ubicaciones en lote
        const batch = [...this.locationQueue];
        this.locationQueue = [];
        
        for (const location of batch) {
          await this.sendLocationToBackend(location);
        }
      }
    }, this.sendInterval);
  }

  // Enviar ubicación al backend
  private async sendLocationToBackend(locationData: LocationData): Promise<void> {
    try {
      const childId = ApiService.getChildId();
      
      if (!childId) {
        console.error('No child ID available');
        return;
      }

      const response = await ApiService.post('/api/locations', {
        child_id: childId,
        ...locationData,
      });

      if (response.success) {
        console.log('✅ Location sent successfully');
        
        // Si hay alertas en la respuesta, manejarlas
        if (response.data?.alert) {
          this.handleLocationAlert(response.data.alert);
        }
      }
    } catch (error) {
      console.error('❌ Error sending location:', error);
      // Re-agregar a la cola para reintentar
      this.addToQueue(locationData);
    }
  }

  // Manejar alertas de ubicación
  private handleLocationAlert(alert: any): void {
    console.log('🚨 Location alert received:', alert);
    
    // Aquí puedes mostrar una notificación local
    // Por ahora solo mostramos un Alert
    if (alert.type === 'out_of_safe_zone') {
      Alert.alert(
        '⚠️ Fuera de Zona Segura',
        alert.message || 'Has salido de una zona segura.',
        [{ text: 'OK' }]
      );
    }
  }

  // Verificar si está en zona segura
  async checkSafeZoneStatus(): Promise<boolean> {
    try {
      const location = await this.getCurrentLocation();
      
      if (!location) {
        return false;
      }

      const response = await ApiService.post('/api/safe-zones/check', {
        latitude: location.latitude,
        longitude: location.longitude,
      });

      return response.data?.in_safe_zone || false;
    } catch (error) {
      console.error('Error checking safe zone status:', error);
      return false;
    }
  }

  // Obtener estado del tracking
  getTrackingStatus(): boolean {
    return this.isTracking;
  }

  // Obtener estadísticas de ubicación
  async getLocationStats(): Promise<any> {
    try {
      const childId = ApiService.getChildId();
      
      if (!childId) {
        return null;
      }

      const response = await ApiService.get(`/api/monitoring/locations/${childId}`, {
        params: { days: 7 }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting location stats:', error);
      return null;
    }
  }
}

// Singleton instance
const locationService = new LocationService();
export default locationService;