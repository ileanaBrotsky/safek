// mobile/src/screens/HomeScreen.tsx
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

const HomeScreen: React.FC = () => {
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [childInfo, setChildInfo] = useState<ChildInfo | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(0);
  const [lastSync, setLastSync] = useState<string>('');
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
  }, []);

  const loadChildInfo = async () => {
    try {
      const childName = await AsyncStorage.getItem('childName');
      const childId = ApiService.getChildId();
      
      if (childId) {
        // Obtener información del niño desde el backend
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
        // Usar información local como fallback
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
      
      setMonitoringStatus({
        location: locationPermission,
        apps: false, // TODO: Implementar en próximo bloque
        screenTime: false, // TODO: Implementar en próximo bloque
        notifications: false, // TODO: Implementar en próximo bloque
      });
    } catch (error) {
      console.error('Error loading monitoring status:', error);
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
      case 'notifications':
        Alert.alert(
          'Próximamente',
          `El monitoreo de ${service === 'apps' ? 'aplicaciones' : 
            service === 'screenTime' ? 'tiempo de pantalla' : 'notificaciones'} estará disponible pronto.`
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
            // La app se reiniciará o navegará a la pantalla de registro
          }
        }
      ]
    );
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
              {childInfo ? `Hola, ${childInfo.name}` : 'Dispositivo Protegido'}
            </Text>
          </View>
          <View style={styles.batteryContainer}>
            <Text style={styles.batteryLevel}>{batteryLevel}%</Text>
            <Text style={styles.batteryLabel}>Batería</Text>
          </View>
        </View>

        {/* Estado de Protección */}
        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>Estado de Protección</Text>
          <View style={styles.statusGrid}>
            <StatusIndicator
              active={monitoringStatus.location}
              label="Ubicación"
              icon="📍"
            />
            <StatusIndicator
              active={monitoringStatus.apps}
              label="Apps"
              icon="📱"
            />
            <StatusIndicator
              active={monitoringStatus.screenTime}
              label="Tiempo"
              icon="⏰"
            />
            <StatusIndicator
              active={monitoringStatus.notifications}
              label="Alertas"
              icon="🔔"
            />
          </View>
          {lastSync && (
            <Text style={styles.lastSync}>Última sincronización: {lastSync}</Text>
          )}
        </View>

        {/* Servicios de Monitoreo */}
        <View style={styles.servicesCard}>
          <Text style={styles.sectionTitle}>Servicios de Monitoreo</Text>
          
          <ServiceToggle
            label="Seguimiento de Ubicación"
            description="Compartir ubicación en tiempo real"
            enabled={monitoringStatus.location}
            onToggle={() => toggleMonitoring('location')}
          />
          
          <ServiceToggle
            label="Monitoreo de Aplicaciones"
            description="Reportar apps instaladas y en uso"
            enabled={monitoringStatus.apps}
            onToggle={() => toggleMonitoring('apps')}
            disabled
          />
          
          <ServiceToggle
            label="Tiempo de Pantalla"
            description="Registrar uso del dispositivo"
            enabled={monitoringStatus.screenTime}
            onToggle={() => toggleMonitoring('screenTime')}
            disabled
          />
          
          <ServiceToggle
            label="Notificaciones"
            description="Recibir alertas de seguridad"
            enabled={monitoringStatus.notifications}
            onToggle={() => toggleMonitoring('notifications')}
            disabled
          />
        </View>

        {/* Límites Configurados */}
        {childInfo && (
          <View style={styles.limitsCard}>
            <Text style={styles.sectionTitle}>Límites Configurados</Text>
            <LimitRow
              label="Tiempo de pantalla diario"
              value={`${childInfo.screenTimeLimit} minutos`}
            />
            <LimitRow
              label="Redes sociales"
              value={`${childInfo.socialMediaLimit} minutos`}
            />
            <LimitRow
              label="Hora de descanso"
              value={childInfo.bedtime}
            />
          </View>
        )}

        {/* Botón de desvincular */}
        <TouchableOpacity style={styles.unlinkButton} onPress={handleUnregister}>
          <Text style={styles.unlinkButtonText}>Desvincular Dispositivo</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// Componentes auxiliares
const StatusIndicator: React.FC<{
  active: boolean;
  label: string;
  icon: string;
}> = ({ active, label, icon }) => (
  <View style={styles.statusIndicatorContainer}>
    <View style={[styles.statusIndicator, active && styles.statusIndicatorActive]}>
      <Text style={styles.statusIcon}>{icon}</Text>
    </View>
    <Text style={styles.statusLabel}>{label}</Text>
  </View>
);

const ServiceToggle: React.FC<{
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