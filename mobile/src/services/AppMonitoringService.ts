// mobile/src/services/AppMonitoringService.ts
import { NativeModules, Platform, Alert, Linking } from 'react-native';
import { PermissionsAndroid } from 'react-native';
import ApiService from './ApiService';

interface AppUsageData {
  packageName: string;
  appName: string;
  usageTime: number; // en millisegundos
  firstTimeStamp: number;
  lastTimeStamp: number;
  totalTimeForeground: number;
}

interface AppLimits {
  [packageName: string]: {
    dailyLimit: number; // en minutos
    isBlocked: boolean;
    category: 'social' | 'games' | 'educational' | 'productivity' | 'other';
  };
}

interface MonitoringConfig {
  enabled: boolean;
  updateInterval: number; // en millisegundos
  socialMediaLimit: number; // en minutos
  gamesLimit: number; // en minutos
  bedtimeStart: string; // HH:MM
  bedtimeEnd: string; // HH:MM
}

class AppMonitoringService {
  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private config: MonitoringConfig;
  private appLimits: AppLimits = {};
  private currentUsageSession: Map<string, number> = new Map();
  private todayUsage: Map<string, number> = new Map();

  constructor() {
    this.config = {
      enabled: false,
      updateInterval: 30000, // 30 segundos
      socialMediaLimit: 60, // 1 hora por defecto
      gamesLimit: 120, // 2 horas por defecto
      bedtimeStart: '22:00',
      bedtimeEnd: '07:00'
    };
  }

  // Verificar si tenemos permisos de Usage Stats
  async checkUsageStatsPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      console.log('⚠️ App monitoring only supported on Android');
      return false;
    }

    try {
      // Verificar si el módulo nativo está disponible
      if (!NativeModules.UsageStatsModule) {
        console.log('❌ UsageStatsModule not available');
        return false;
      }

      const hasPermission = await NativeModules.UsageStatsModule.hasUsageStatsPermission();
      console.log('📱 Usage Stats Permission:', hasPermission);
      return hasPermission;
    } catch (error) {
      console.error('Error checking usage stats permission:', error);
      return false;
    }
  }

  // Solicitar permisos de Usage Stats
  async requestUsageStatsPermission(): Promise<boolean> {
    try {
      const hasPermission = await this.checkUsageStatsPermission();
      
      if (hasPermission) {
        return true;
      }

      // Mostrar diálogo explicativo
      return new Promise((resolve) => {
        Alert.alert(
          'Permisos Necesarios',
          'SafeKids necesita acceso a las estadísticas de uso para monitorear las aplicaciones. ' +
          'Esto nos permite:\n\n' +
          '• Controlar el tiempo de pantalla\n' +
          '• Aplicar límites por aplicación\n' +
          '• Generar reportes de uso\n\n' +
          'Serás redirigido a la configuración del sistema.',
          [
            {
              text: 'Cancelar',
              style: 'cancel',
              onPress: () => resolve(false)
            },
            {
              text: 'Ir a Configuración',
              onPress: async () => {
                try {
                  if (NativeModules.UsageStatsModule) {
                    await NativeModules.UsageStatsModule.requestUsageStatsPermission();
                  }
                  
                  // Verificar nuevamente después de un breve delay
                  setTimeout(async () => {
                    const granted = await this.checkUsageStatsPermission();
                    resolve(granted);
                  }, 1000);
                } catch (error) {
                  console.error('Error requesting permission:', error);
                  resolve(false);
                }
              }
            }
          ]
        );
      });
    } catch (error) {
      console.error('Error requesting usage stats permission:', error);
      return false;
    }
  }

  // Obtener estadísticas de uso de aplicaciones
  async getUsageStats(startTime?: number, endTime?: number): Promise<AppUsageData[]> {
    try {
      if (!await this.checkUsageStatsPermission()) {
        throw new Error('Usage stats permission not granted');
      }

      const now = Date.now();
      const start = startTime || (now - 24 * 60 * 60 * 1000); // Últimas 24 horas por defecto
      const end = endTime || now;

      const usageStats = await NativeModules.UsageStatsModule.getUsageStats(start, end);
      
      // Filtrar y procesar datos
      const processedStats: AppUsageData[] = usageStats
        .filter((app: any) => app.totalTimeForeground > 0)
        .map((app: any) => ({
          packageName: app.packageName,
          appName: app.appName || app.packageName,
          usageTime: app.totalTimeForeground,
          firstTimeStamp: app.firstTimeStamp,
          lastTimeStamp: app.lastTimeStamp,
          totalTimeForeground: app.totalTimeForeground
        }))
        .sort((a, b) => b.usageTime - a.usageTime); // Ordenar por tiempo de uso

      console.log(`📊 Obtained usage stats for ${processedStats.length} apps`);
      return processedStats;
    } catch (error) {
      console.error('Error getting usage stats:', error);
      return [];
    }
  }

  // Obtener la aplicación actualmente en primer plano
  async getCurrentForegroundApp(): Promise<string | null> {
    try {
      if (!await this.checkUsageStatsPermission()) {
        return null;
      }

      const currentApp = await NativeModules.UsageStatsModule.getCurrentForegroundApp();
      return currentApp?.packageName || null;
    } catch (error) {
      console.error('Error getting current foreground app:', error);
      return null;
    }
  }

  // Iniciar monitoreo de aplicaciones
  async startMonitoring(): Promise<boolean> {
    try {
      if (this.isMonitoring) {
        console.log('📱 App monitoring already active');
        return true;
      }

      // Verificar permisos
      const hasPermission = await this.checkUsageStatsPermission();
      if (!hasPermission) {
        const granted = await this.requestUsageStatsPermission();
        if (!granted) {
          console.log('❌ Usage stats permission denied');
          return false;
        }
      }

      console.log('🚀 Starting app monitoring...');
      this.isMonitoring = true;

      // Cargar configuración desde el backend
      await this.loadConfiguration();

      // Iniciar monitoreo periódico
      this.monitoringInterval = setInterval(() => {
        this.performMonitoringCheck();
      }, this.config.updateInterval);

      console.log('✅ App monitoring started');
      return true;
    } catch (error) {
      console.error('Error starting app monitoring:', error);
      this.isMonitoring = false;
      return false;
    }
  }

  // Detener monitoreo
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    this.currentUsageSession.clear();
    
    console.log('⏹️ App monitoring stopped');
  }

  // Realizar verificación de monitoreo
  private async performMonitoringCheck(): Promise<void> {
    try {
      if (!this.config.enabled) {
        return;
      }

      // Obtener app actual
      const currentApp = await this.getCurrentForegroundApp();
      
      if (currentApp) {
        // Verificar límites de tiempo
        await this.checkAppLimits(currentApp);
        
        // Verificar hora de dormir
        await this.checkBedtime(currentApp);
        
        // Actualizar sesión de uso
        this.updateUsageSession(currentApp);
      }

      // Enviar datos de uso al backend cada 5 minutos
      if (Date.now() % 300000 < this.config.updateInterval) {
        await this.sendUsageDataToBackend();
      }
    } catch (error) {
      console.error('Error in monitoring check:', error);
    }
  }

  // Verificar límites de aplicación
  private async checkAppLimits(packageName: string): Promise<void> {
    const limits = this.appLimits[packageName];
    
    if (!limits || limits.isBlocked) {
      return;
    }

    const todayUsageMs = this.todayUsage.get(packageName) || 0;
    const todayUsageMinutes = todayUsageMs / (1000 * 60);

    if (todayUsageMinutes >= limits.dailyLimit) {
      // Límite excedido
      console.log(`⏰ Daily limit exceeded for ${packageName}: ${todayUsageMinutes}/${limits.dailyLimit} minutes`);
      
      // Enviar alerta al backend
      await this.sendAppLimitAlert(packageName, todayUsageMinutes, limits.dailyLimit);
      
      // Mostrar notificación local
      Alert.alert(
        'Límite de Tiempo Alcanzado',
        `Has alcanzado el límite diario para esta aplicación (${limits.dailyLimit} minutos).`,
        [{ text: 'Entendido' }]
      );
    }
  }

  // Verificar hora de dormir
  private async checkBedtime(packageName: string): Promise<void> {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const isInBedtime = this.isTimeBetween(currentTime, this.config.bedtimeStart, this.config.bedtimeEnd);
    
    if (isInBedtime) {
      console.log(`🌙 Bedtime mode active, app: ${packageName}`);
      
      // Enviar alerta de hora de dormir
      await this.sendBedtimeAlert(packageName);
      
      Alert.alert(
        'Hora de Dormir',
        'Es hora de dormir. Por favor, deja el dispositivo y descansa.',
        [{ text: 'Entendido' }]
      );
    }
  }

  // Verificar si una hora está entre dos rangos
  private isTimeBetween(current: string, start: string, end: string): boolean {
    const currentMinutes = this.timeToMinutes(current);
    const startMinutes = this.timeToMinutes(start);
    const endMinutes = this.timeToMinutes(end);

    if (startMinutes <= endMinutes) {
      // No cruza medianoche
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Cruza medianoche
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  // Convertir tiempo HH:MM a minutos
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Actualizar sesión de uso
  private updateUsageSession(packageName: string): void {
    const now = Date.now();
    const lastUpdate = this.currentUsageSession.get(packageName) || now;
    const sessionTime = now - lastUpdate;

    // Actualizar uso de hoy
    const currentTodayUsage = this.todayUsage.get(packageName) || 0;
    this.todayUsage.set(packageName, currentTodayUsage + sessionTime);
    
    this.currentUsageSession.set(packageName, now);
  }

  // Cargar configuración desde el backend
  private async loadConfiguration(): Promise<void> {
    try {
      const response = await ApiService.get('/api/monitoring/config');
      
      if (response.success && response.data) {
        this.config = { ...this.config, ...response.data };
        this.appLimits = response.data.appLimits || {};
      }
      
      console.log('📋 Monitoring configuration loaded');
    } catch (error) {
      console.error('Error loading monitoring configuration:', error);
    }
  }

  // Enviar datos de uso al backend
  private async sendUsageDataToBackend(): Promise<void> {
    try {
      const usageStats = await this.getUsageStats();
      
      if (usageStats.length === 0) {
        return;
      }

      const payload = {
        timestamp: Date.now(),
        usageData: usageStats,
        todayUsage: Object.fromEntries(this.todayUsage),
        device_info: {
          battery_level: await this.getBatteryLevel(),
          platform: Platform.OS
        }
      };

      await ApiService.post('/api/monitoring/usage-stats', payload);
      console.log('📤 Usage stats sent to backend');
    } catch (error) {
      console.error('Error sending usage stats:', error);
    }
  }

  // Enviar alerta de límite de aplicación
  private async sendAppLimitAlert(packageName: string, usedMinutes: number, limitMinutes: number): Promise<void> {
    try {
      await ApiService.post('/api/alerts', {
        type: 'app_limit_exceeded',
        severity: 'medium',
        message: `App limit exceeded: ${packageName}`,
        data: {
          packageName,
          usedMinutes,
          limitMinutes,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      console.error('Error sending app limit alert:', error);
    }
  }

  // Enviar alerta de hora de dormir
  private async sendBedtimeAlert(packageName: string): Promise<void> {
    try {
      await ApiService.post('/api/alerts', {
        type: 'bedtime_violation',
        severity: 'high',
        message: `Device used during bedtime`,
        data: {
          packageName,
          timestamp: Date.now(),
          bedtimeStart: this.config.bedtimeStart,
          bedtimeEnd: this.config.bedtimeEnd
        }
      });
    } catch (error) {
      console.error('Error sending bedtime alert:', error);
    }
  }

  // Obtener nivel de batería
  private async getBatteryLevel(): Promise<number> {
    try {
      const DeviceInfo = require('react-native-device-info');
      const level = await DeviceInfo.getBatteryLevel();
      return Math.round(level * 100);
    } catch (error) {
      return 0;
    }
  }

  // Métodos públicos para obtener estado
  isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  getConfiguration(): MonitoringConfig {
    return { ...this.config };
  }

  getTodayUsage(): Map<string, number> {
    return new Map(this.todayUsage);
  }

  // Actualizar configuración
  async updateConfiguration(newConfig: Partial<MonitoringConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    try {
      await ApiService.put('/api/monitoring/config', this.config);
      console.log('✅ Configuration updated');
    } catch (error) {
      console.error('Error updating configuration:', error);
    }
  }
}

// Singleton instance
const appMonitoringService = new AppMonitoringService();
export default appMonitoringService;