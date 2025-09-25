// mobile/src/services/AppMonitoringService.ts - VERSIÓN FINAL OPTIMIZADA
import { NativeModules, Platform, Alert, Linking } from 'react-native';
import { PermissionsAndroid } from 'react-native';
import ApiService from './ApiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

interface UsageSummary {
  totalScreenTime: number;
  socialMediaTime: number; 
  gamesTime: number;
  educationalTime: number;
  mostUsedApp: string;
  appsCount: number;
}

class AppMonitoringService {
  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private config: MonitoringConfig;
  private appLimits: AppLimits = {};
  private currentUsageSession: Map<string, number> = new Map();
  private todayUsage: Map<string, number> = new Map();
  private lastSyncTime: string | null = null;

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

  // ✅ VERIFICACIÓN DE PERMISOS
  async checkUsageStatsPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      console.log('⚠️ App monitoring only supported on Android');
      return false;
    }

    try {
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

  async requestUsageStatsPermission(): Promise<boolean> {
    try {
      const hasPermission = await this.checkUsageStatsPermission();
      
      if (hasPermission) {
        return true;
      }

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

  // ✅ OBTENCIÓN DE DATOS DE USO
  async getUsageStats(startTime?: number, endTime?: number): Promise<AppUsageData[]> {
    try {
      if (!await this.checkUsageStatsPermission()) {
        throw new Error('Usage stats permission not granted');
      }

      const now = Date.now();
      const start = startTime || (now - 24 * 60 * 60 * 1000);
      const end = endTime || now;

      const usageStats = await NativeModules.UsageStatsModule.getUsageStats(start, end);
      
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
        .sort((a, b) => b.usageTime - a.usageTime);

      console.log(`📊 Obtained usage stats for ${processedStats.length} apps`);
      return processedStats;
    } catch (error) {
      console.error('Error getting usage stats:', error);
      return [];
    }
  }

  // ✅ WRAPPER PARA ESTADÍSTICAS DE HOY (requerido por HomeScreen)
  async getTodayUsageStats(): Promise<AppUsageData[]> {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    return await this.getUsageStats(startOfDay.getTime(), now);
  }

  // ✅ ANÁLISIS Y CATEGORIZACIÓN DE DATOS (requerido por HomeScreen)
  analyzeUsageData(stats: AppUsageData[]): UsageSummary {
    let totalScreenTime = 0;
    let socialMediaTime = 0;
    let gamesTime = 0;
    let educationalTime = 0;
    let mostUsedApp = 'Ninguna';
    let maxUsageTime = 0;

    stats.forEach(stat => {
      const timeInMinutes = Math.round(stat.usageTime / (1000 * 60));
      totalScreenTime += timeInMinutes;

      if (stat.usageTime > maxUsageTime) {
        maxUsageTime = stat.usageTime;
        mostUsedApp = stat.appName;
      }

      const category = this.categorizeApp(stat.packageName);
      switch (category) {
        case 'social':
          socialMediaTime += timeInMinutes;
          break;
        case 'games':
          gamesTime += timeInMinutes;
          break;
        case 'educational':
          educationalTime += timeInMinutes;
          break;
      }
    });

    return {
      totalScreenTime,
      socialMediaTime,
      gamesTime, 
      educationalTime,
      mostUsedApp,
      appsCount: stats.length
    };
  }

  private categorizeApp(packageName: string): string {
    const categories: { [key: string]: string[] } = {
      social: [
        'com.whatsapp', 'com.instagram.android', 'com.facebook.katana',
        'com.twitter.android', 'com.snapchat.android', 'com.zhiliaoapp.musically',
        'com.discord', 'org.telegram.messenger'
      ],
      games: [
        'com.mojang.minecraftpe', 'com.roblox.client', 'com.supercell.clashofclans',
        'com.king.candycrushsaga', 'com.tencent.ig', 'com.epicgames.fortnite'
      ],
      educational: [
        'com.duolingo', 'org.khanacademy.android', 'com.google.android.apps.classroom',
        'com.google.android.apps.docs'
      ],
      entertainment: [
        'com.netflix.mediaclient', 'com.google.android.youtube', 'com.spotify.music'
      ]
    };

    for (const [category, apps] of Object.entries(categories)) {
      if (apps.includes(packageName)) {
        return category;
      }
    }

    return 'other';
  }

  // ✅ APP EN PRIMER PLANO
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

  // ✅ CONTROL DE MONITOREO
  async startMonitoring(customConfig?: Partial<MonitoringConfig>): Promise<boolean> {
    try {
      if (this.isMonitoring) {
        console.log('📱 App monitoring already active');
        return true;
      }

      const hasPermission = await this.checkUsageStatsPermission();
      if (!hasPermission) {
        const granted = await this.requestUsageStatsPermission();
        if (!granted) {
          console.log('❌ Usage stats permission denied');
          return false;
        }
      }

      console.log('🚀 Starting app monitoring...');
      
      // Aplicar configuración personalizada si se proporciona
      if (customConfig) {
        this.config = { ...this.config, ...customConfig };
      }
      
      this.isMonitoring = true;

      // Cargar configuración desde el backend
      await this.loadConfiguration();

      // Iniciar monitoreo periódico
      this.monitoringInterval = setInterval(() => {
        this.performMonitoringCheck();
      }, this.config.updateInterval);

      // Guardar estado
      await AsyncStorage.setItem('monitoringActive', 'true');

      console.log('✅ App monitoring started');
      return true;
    } catch (error) {
      console.error('Error starting app monitoring:', error);
      this.isMonitoring = false;
      return false;
    }
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    this.currentUsageSession.clear();
    
    AsyncStorage.setItem('monitoringActive', 'false');
    console.log('⏹️ App monitoring stopped');
  }

  // ✅ VERIFICACIÓN PERIÓDICA DE MONITOREO
  private async performMonitoringCheck(): Promise<void> {
    try {
      if (!this.config.enabled) {
        return;
      }

      const currentApp = await this.getCurrentForegroundApp();
      
      if (currentApp) {
        await this.checkAppLimits(currentApp);
        await this.checkBedtime(currentApp);
        this.updateUsageSession(currentApp);
      }

      // Sincronización periódica cada 5 minutos
      if (Date.now() % 300000 < this.config.updateInterval) {
        await this.sendUsageDataToBackend();
      }
    } catch (error) {
      console.error('Error in monitoring check:', error);
    }
  }

  // ✅ VERIFICACIONES DE LÍMITES Y BEDTIME
  private async checkAppLimits(packageName: string): Promise<void> {
    const limits = this.appLimits[packageName];
    
    if (!limits || limits.isBlocked) {
      return;
    }

    const todayUsageMs = this.todayUsage.get(packageName) || 0;
    const todayUsageMinutes = todayUsageMs / (1000 * 60);

    if (todayUsageMinutes >= limits.dailyLimit) {
      console.log(`⏰ Daily limit exceeded for ${packageName}: ${todayUsageMinutes}/${limits.dailyLimit} minutes`);
      
      await this.sendAppLimitAlert(packageName, todayUsageMinutes, limits.dailyLimit);
      
      Alert.alert(
        'Límite de Tiempo Alcanzado',
        `Has alcanzado el límite diario para esta aplicación (${limits.dailyLimit} minutos).`,
        [{ text: 'Entendido' }]
      );
    }
  }

  private async checkBedtime(packageName: string): Promise<void> {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const isInBedtime = this.isTimeBetween(currentTime, this.config.bedtimeStart, this.config.bedtimeEnd);
    
    if (isInBedtime) {
      console.log(`🌙 Bedtime mode active, app: ${packageName}`);
      await this.sendBedtimeAlert(packageName);
      
      Alert.alert(
        'Hora de Dormir',
        'Es hora de dormir. Por favor, deja el dispositivo y descansa.',
        [{ text: 'Entendido' }]
      );
    }
  }

  // ✅ UTILIDADES DE TIEMPO
  private isTimeBetween(current: string, start: string, end: string): boolean {
    const currentMinutes = this.timeToMinutes(current);
    const startMinutes = this.timeToMinutes(start);
    const endMinutes = this.timeToMinutes(end);

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // ✅ GESTIÓN DE SESIONES DE USO
  private updateUsageSession(packageName: string): void {
    const now = Date.now();
    const lastUpdate = this.currentUsageSession.get(packageName) || now;
    const sessionTime = now - lastUpdate;

    const currentTodayUsage = this.todayUsage.get(packageName) || 0;
    this.todayUsage.set(packageName, currentTodayUsage + sessionTime);
    
    this.currentUsageSession.set(packageName, now);
  }

  // ✅ CONFIGURACIÓN DESDE BACKEND
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

  // ✅ SINCRONIZACIÓN CON BACKEND
  private async sendUsageDataToBackend(): Promise<void> {
    try {
      const usageStats = await this.getUsageStats();
      
      if (usageStats.length === 0) {
        return;
      }

      const childId = ApiService.getChildId();
      if (!childId) {
        throw new Error('Child ID not available');
      }

      const payload = {
        timestamp: Date.now(),
        child_id: childId,
        usageData: usageStats,
        todayUsage: Object.fromEntries(this.todayUsage),
        device_info: {
          battery_level: await this.getBatteryLevel(),
          platform: Platform.OS
        }
      };

      await ApiService.post('/api/monitoring/usage-stats', payload);
      
      // Guardar timestamp de última sincronización
      this.lastSyncTime = new Date().toISOString();
      await AsyncStorage.setItem('lastUsageSync', this.lastSyncTime);
      
      console.log('📤 Usage stats sent to backend');
    } catch (error) {
      console.error('Error sending usage stats:', error);
      throw error;
    }
  }

  // ✅ ALIAS PARA SINCRONIZACIÓN MANUAL (requerido por HomeScreen)
  async syncUsageStatsWithBackend(): Promise<void> {
    return await this.sendUsageDataToBackend();
  }

  // ✅ SISTEMA DE ALERTAS
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

  // ✅ UTILIDADES
  private async getBatteryLevel(): Promise<number> {
    try {
      const DeviceInfo = require('react-native-device-info');
      const level = await DeviceInfo.getBatteryLevel();
      return Math.round(level * 100);
    } catch (error) {
      return 0;
    }
  }

  // ✅ MÉTODOS PÚBLICOS PARA OBTENER ESTADO (requeridos por HomeScreen)
  isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  getConfiguration(): MonitoringConfig {
    return { ...this.config };
  }

  getTodayUsage(): Map<string, number> {
    return new Map(this.todayUsage);
  }

  async getLastSyncTime(): Promise<string | null> {
    if (!this.lastSyncTime) {
      this.lastSyncTime = await AsyncStorage.getItem('lastUsageSync');
    }
    return this.lastSyncTime;
  }

  // ✅ ACTUALIZACIÓN DE CONFIGURACIÓN
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