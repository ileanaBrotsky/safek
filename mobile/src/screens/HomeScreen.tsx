// mobile/src/screens/HomeScreen.tsx - COMPLETO
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  RefreshControl,
} from 'react-native';
import LocationService from '../services/LocationService';
import AppMonitoringService from '../services/AppMonitoringService';
import AuthService from '../services/AuthService';
import ApiService from '../services/ApiService';
import DeviceInfo from 'react-native-device-info';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface MonitoringStatus {
  location: boolean;
  apps: boolean;
  screenTime: boolean;
  notifications: boolean;
}

interface ChildInfo {
  name: string;
  age: number;
  screenTimeLimit: number;
  socialMediaLimit: number;
  bedtime: string;
}

interface TodayUsageStats {
  totalScreenTime: number; // en minutos
  appsUsed: number;
  mostUsedApp: string;
  socialMediaTime: number;
  gamesTime: number;
}

const HomeScreen: React.FC = () => {
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [childInfo, setChildInfo] = useState<ChildInfo | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(0);
  const [lastSync, setLastSync] = useState<string>('');
  const [todayUsage, setTodayUsage] = useState<TodayUsageStats>({
    totalScreenTime: 0,
    appsUsed: 0,
    mostUsedApp: 'Ninguna',
    socialMediaTime: 0,
    gamesTime: 0
  });
  
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus>({
    location: false,
    apps: false,
    screenTime: false,
    notifications: false,
  });

  useEffect(() => {
    loadChildInfo();
    loadMonitoringStatus();
    updateBatteryLevel();
    startLocationTracking();
    loadTodayUsageStats();
    
    // Actualizar estadísticas cada minuto
    const statsInterval = setInterval(loadTodayUsageStats, 60000);
    
    return () => clearInterval(statsInterval);
  }, []);

  const loadChildInfo = async () => {
    try {
      const childName = await AsyncStorage.getItem('childName');
      const childId = ApiService.getChildId();
      
      if (childId) {
        const response = await ApiService.get(`/api/children/${childId}`);
        
        if (response.success) {
          setChildInfo({
            name: response.data.name,
            age: response.data.age,
            screenTimeLimit: response.data.max_screen_time || 180,
            socialMediaLimit: response.data.max_social_time || 60,
            bedtime: response.data.bedtime_hour || '22:00',
          });
        }
      } else if (childName) {
        setChildInfo({
          name: childName,
          age: 0,
          screenTimeLimit: 180,
          socialMediaLimit: 60,
          bedtime: '22:00',
        });
      }
    } catch (error) {
      console.error('Error loading child info:', error);
    }
  };

  const loadMonitoringStatus = async () => {
    try {
      const locationPermission = await LocationService.checkLocationPermission();
      const appsPermission = await AppMonitoringService.checkUsageStatsPermission();
      
      setMonitoringStatus({
        location: locationPermission,
        apps: appsPermission && AppMonitoringService.isMonitoringActive(),
        screenTime: appsPermission && AppMonitoringService.isMonitoringActive(),
        notifications: false, // TODO: Implementar en próximo bloque
      });
    } catch (error) {
      console.error('Error loading monitoring status:', error);
    }
  };

  const loadTodayUsageStats = async () => {
    try {
      const hasPermission = await AppMonitoringService.checkUsageStatsPermission();
      
      if (!hasPermission) {
        return;
      }

      const usageStats = await AppMonitoringService.getUsageStats();
      
      if (usageStats.length === 0) {
        return;
      }

      let totalTime = 0;
      let socialTime = 0;
      let gamesTime = 0;
      let mostUsedApp = '';
      let maxUsageTime = 0;

      // Categorías de redes sociales y juegos
      const socialApps = ['facebook', 'instagram', 'twitter', 'snapchat', 'tiktok', 'whatsapp'];
      const gameApps = ['game', 'play', 'minecraft', 'roblox', 'pubg'];

      usageStats.forEach(app => {
        const usageMinutes = app.usageTime / (1000 * 60); // Convertir a minutos
        totalTime += usageMinutes;

        // Encontrar app más usada
        if (app.usageTime > maxUsageTime) {
          maxUsageTime = app.usageTime;
          mostUsedApp = app.appName;
        }

        // Categorizar tiempo
        const packageLower = app.packageName.toLowerCase();
        
        if (socialApps.some(social => packageLower.includes(social))) {
          socialTime += usageMinutes;
        }
        
        if (gameApps.some(game => packageLower.includes(game))) {
          gamesTime += usageMinutes;
        }
      });

      setTodayUsage({
        totalScreenTime: Math.round(totalTime),
        appsUsed: usageStats.length,
        mostUsedApp: mostUsedApp || 'Ninguna',
        socialMediaTime: Math.round(socialTime),
        gamesTime: Math.round(gamesTime)
      });

    } catch (error) {
      console.error('Error loading today usage stats:', error);
    }
  };

  const startLocationTracking = async () => {
    try {
      const started = await LocationService.startTracking();
      setMonitoringStatus(prev => ({ ...prev, location: started }));
      
      if (started) {
        setLastSync(new Date().toLocaleTimeString());
      }
    } catch (error) {
      console.error('Error starting location tracking:', error);
    }
  };

  const updateBatteryLevel = async () => {
    try {
      const level = await DeviceInfo.getBatteryLevel();
      setBatteryLevel(Math.round(level * 100));
    } catch (error) {
      console.error('Error getting battery level:', error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      loadChildInfo(),
      loadMonitoringStatus(),
      updateBatteryLevel(),
      loadTodayUsageStats(),
    ]);
    setIsRefreshing(false);
  };

  const toggleMonitoring = async (service: keyof MonitoringStatus) => {
    const newStatus = !monitoringStatus[service];
    
    switch (service) {
      case 'location':
        if (newStatus) {
          const success = await LocationService.startTracking();
          if (!success) {
            Alert.alert(
              'Permisos Requeridos',
              'Por favor, habilita los permisos de ubicación en la configuración del dispositivo.'
            );
            return;
          }
        } else {
          LocationService.stopTracking();
        }
        break;
      
      case 'apps':
      case 'screenTime':
        if (newStatus) {
          const success = await AppMonitoringService.startMonitoring();
          if (!success) {
            Alert.alert(
              'Permisos Requeridos',
              'SafeKids necesita acceso a las estadísticas de uso para monitorear aplicaciones. ' +
              'Serás redirigido a la configuración del sistema.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Ir a Configuración',
                  onPress: async () => {
                    await AppMonitoringService.requestUsageStatsPermission();
                  }
                }
              ]
            );
            return;
          }
          // Actualizar estado de ambos servicios si el monitoreo se inicia exitosamente
          setMonitoringStatus(prev => ({ 
            ...prev, 
            apps: true,
            screenTime: true
          }));
          return;
        } else {
          AppMonitoringService.stopMonitoring();
          setMonitoringStatus(prev => ({ 
            ...prev, 
            apps: false,
            screenTime: false
          }));
          return;
        }
      
      case 'notifications':
        Alert.alert(
          'Próximamente',
          'El monitoreo de notificaciones estará disponible pronto.'
        );
        return;
    }
    
    setMonitoringStatus(prev => ({ ...prev, [service]: newStatus }));
  };

  const handleUnregister = () => {
    Alert.alert(
      'Desvincular Dispositivo',
      '¿Estás seguro de que quieres desvincular este dispositivo? Se desactivará todo el monitoreo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desvincular',
          style: 'destructive',
          onPress: async () => {
            await AuthService.unregisterDevice();
          }
        }
      ]
    );
  };

  const formatTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getScreenTimeColor = (used: number, limit: number): string => {
    const percentage = (used / limit) * 100;
    if (percentage >= 90) return '#EF4444'; // Rojo
    if (percentage >= 75) return '#F59E0B'; // Amarillo
    return '#10B981'; // Verde
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>SafeKids</Text>
            <Text style={styles.headerSubtitle}>
              {childInfo ? `${childInfo.name}` : 'Dispositivo Protegido'}
            </Text>
          </View>
          <View style={styles.batteryContainer}>
            <Text style={styles.batteryLevel}>{batteryLevel}%</Text>
            <Text style={styles.batteryLabel}>Batería</Text>
          </View>
        </View>

        {/* Estado del Monitoreo */}
        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>Estado del Monitoreo</Text>
          <View style={styles.statusGrid}>
            <View style={styles.statusIndicatorContainer}>
              <View style={[
                styles.statusIndicator,
                monitoringStatus.location && styles.statusIndicatorActive
              ]}>
                <Text style={styles.statusIcon}>📍</Text>
              </View>
              <Text style={styles.statusLabel}>Ubicación</Text>
            </View>
            
            <View style={styles.statusIndicatorContainer}>
              <View style={[
                styles.statusIndicator,
                monitoringStatus.apps && styles.statusIndicatorActive
              ]}>
                <Text style={styles.statusIcon}>📱</Text>
              </View>
              <Text style={styles.statusLabel}>Apps</Text>
            </View>
            
            <View style={styles.statusIndicatorContainer}>
              <View style={[
                styles.statusIndicator,
                monitoringStatus.screenTime && styles.statusIndicatorActive
              ]}>
                <Text style={styles.statusIcon}>⏰</Text>
              </View>
              <Text style={styles.statusLabel}>Tiempo</Text>
            </View>
            
            <View style={styles.statusIndicatorContainer}>
              <View style={[
                styles.statusIndicator,
                monitoringStatus.notifications && styles.statusIndicatorActive
              ]}>
                <Text style={styles.statusIcon}>🔔</Text>
              </View>
              <Text style={styles.statusLabel}>Alertas</Text>
            </View>
          </View>
          <Text style={styles.lastSync}>
            Última sincronización: {lastSync || 'Nunca'}
          </Text>
        </View>

        {/* ✅ NUEVA SECCIÓN: Estadísticas de Uso de Hoy */}
        <View style={styles.usageStatsCard}>
          <Text style={styles.sectionTitle}>Uso de Hoy</Text>
          
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Tiempo Total</Text>
            <Text style={[
              styles.usageValue,
              { color: getScreenTimeColor(todayUsage.totalScreenTime, childInfo?.screenTimeLimit || 180) }
            ]}>
              {formatTime(todayUsage.totalScreenTime)} / {formatTime(childInfo?.screenTimeLimit || 180)}
            </Text>
          </View>
          
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Apps Usadas</Text>
            <Text style={styles.usageValue}>{todayUsage.appsUsed}</Text>
          </View>
          
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>App Más Usada</Text>
            <Text style={styles.usageValue}>{todayUsage.mostUsedApp}</Text>
          </View>
          
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Redes Sociales</Text>
            <Text style={[
              styles.usageValue,
              { color: getScreenTimeColor(todayUsage.socialMediaTime, childInfo?.socialMediaLimit || 60) }
            ]}>
              {formatTime(todayUsage.socialMediaTime)} / {formatTime(childInfo?.socialMediaLimit || 60)}
            </Text>
          </View>
          
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Juegos</Text>
            <Text style={styles.usageValue}>{formatTime(todayUsage.gamesTime)}</Text>
          </View>
        </View>

        {/* Controles de Servicios */}
        <View style={styles.servicesCard}>
          <Text style={styles.sectionTitle}>Servicios de Monitoreo</Text>
          
          <ServiceRow
            label="Seguimiento de Ubicación"
            description="Monitorea la ubicación GPS en tiempo real"
            enabled={monitoringStatus.location}
            onToggle={() => toggleMonitoring('location')}
          />
          
          <ServiceRow
            label="Monitoreo de Aplicaciones"
            description="Controla qué aplicaciones se están usando"
            enabled={monitoringStatus.apps}
            onToggle={() => toggleMonitoring('apps')}
          />
          
          <ServiceRow
            label="Control de Tiempo de Pantalla"
            description="Aplica límites de tiempo por aplicación"
            enabled={monitoringStatus.screenTime}
            onToggle={() => toggleMonitoring('screenTime')}
          />
          
          <ServiceRow
            label="Alertas de Notificaciones"
            description="Monitorea notificaciones recibidas"
            enabled={monitoringStatus.notifications}
            onToggle={() => toggleMonitoring('notifications')}
            disabled={true}
          />
        </View>

        {/* Límites Configurados */}
        {childInfo && (
          <View style={styles.limitsCard}>
            <Text style={styles.sectionTitle}>Límites Configurados</Text>
            <LimitRow 
              label="Tiempo Total Diario" 
              value={formatTime(childInfo.screenTimeLimit)} 
            />
            <LimitRow 
              label="Redes Sociales" 
              value={formatTime(childInfo.socialMediaLimit)} 
            />
            <LimitRow 
              label="Hora de Dormir" 
              value={childInfo.bedtime} 
            />
          </View>
        )}

        {/* Botón de Desvincular */}
        <TouchableOpacity style={styles.unlinkButton} onPress={handleUnregister}>
          <Text style={styles.unlinkButtonText}>Desvincular Dispositivo</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// Componente auxiliar para filas de servicios
const ServiceRow: React.FC<{
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}> = ({ label, description, enabled, onToggle, disabled = false }) => (
  <View style={[styles.serviceRow, disabled && styles.serviceRowDisabled]}>
    <View style={styles.serviceInfo}>
      <Text style={[styles.serviceLabel, disabled && styles.textDisabled]}>{label}</Text>
      <Text style={[styles.serviceDescription, disabled && styles.textDisabled]}>
        {description}
      </Text>
    </View>
    <Switch
      value={enabled}
      onValueChange={onToggle}
      disabled={disabled}
      trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
      thumbColor={enabled ? '#3B82F6' : '#F3F4F6'}
    />
  </View>
);

const LimitRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.limitRow}>
    <Text style={styles.limitLabel}>{label}</Text>
    <Text style={styles.limitValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#DBEAFE',
    marginTop: 4,
  },
  batteryContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  batteryLevel: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  batteryLabel: {
    fontSize: 12,
    color: '#DBEAFE',
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statusIndicatorContainer: {
    alignItems: 'center',
  },
  statusIndicator: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicatorActive: {
    backgroundColor: '#DBEAFE',
  },
  statusIcon: {
    fontSize: 24,
  },
  statusLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  lastSync: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
  },
  // ✅ NUEVOS ESTILOS: Para las estadísticas de uso
  usageStatsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  usageLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  usageValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  servicesCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  serviceRowDisabled: {
    opacity: 0.5,
  },
  serviceInfo: {
    flex: 1,
    marginRight: 16,
  },
  serviceLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  serviceDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  textDisabled: {
    color: '#9CA3AF',
  },
  limitsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  limitLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  limitValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  unlinkButton: {
    marginHorizontal: 16,
    marginBottom: 32,
    paddingVertical: 12,
    alignItems: 'center',
  },
  unlinkButtonText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
});

export default HomeScreen;