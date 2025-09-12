/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

// mobile/App.tsx - SafeKids Mobile App
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  PermissionsAndroid,
  Platform,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';

interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
}

const SafeKidsApp: React.FC = () => {
  const [location, setLocation] = useState<Location | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const [isTracking, setIsTracking] = useState<boolean>(false);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async (): Promise<void> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);

        const locationGranted =
          granted['android.permission.ACCESS_FINE_LOCATION'] === 'granted' &&
          granted['android.permission.ACCESS_COARSE_LOCATION'] === 'granted';

        setLocationPermission(locationGranted);

        if (locationGranted) {
          startLocationTracking();
        } else {
          Alert.alert(
            'Permisos Requeridos',
            'SafeKids necesita acceso a la ubicación para proteger a tu familia.',
            [{text: 'OK'}],
          );
        }
      } catch (err) {
        console.warn('Error requesting location permission:', err);
      }
    } else {
      // iOS permissions logic would go here
      setLocationPermission(true);
      startLocationTracking();
    }
  };

  const startLocationTracking = (): void => {
    if (!locationPermission) return;

    setIsTracking(true);

    Geolocation.getCurrentPosition(
      position => {
        console.log('Current position:', position);
        const coords: Location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setLocation(coords);
        sendLocationToBackend(coords);
      },
      error => {
        console.error('Error getting location:', error);
        Alert.alert('Error', 'No se pudo obtener la ubicación');
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      },
    );

    // Tracking continuo cada 30 segundos
    const watchId = Geolocation.watchPosition(
      position => {
        console.log('Position update:', position);
        const coords: Location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setLocation(coords);
        sendLocationToBackend(coords);
      },
      error => {
        console.error('Watch position error:', error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 10, // Actualizar cada 10 metros
        interval: 30000, // Cada 30 segundos
        fastestInterval: 15000, // Mínimo 15 segundos
      },
    );

    // Cleanup function
    return () => {
      Geolocation.clearWatch(watchId);
    };
  };

  const sendLocationToBackend = async (coords: Location): Promise<void> => {
    try {
      // URL del backend SafeKids
      const BACKEND_URL = 'http://10.0.2.2:3000'; // Emulador Android
      // const BACKEND_URL = 'http://192.168.1.XXX:3000'; // Dispositivo real

      const response = await fetch(`${BACKEND_URL}/api/locations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // TODO: Agregar token de autenticación
          // 'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          child_id: 1, // TODO: Obtener de configuración
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Location sent successfully:', result);
    } catch (error) {
      console.error('Error sending location to backend:', error);
      // No mostrar alert para evitar molestar al usuario
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#3B82F6" />

      <View style={styles.header}>
        <Text style={styles.title}>SafeKids</Text>
        <Text style={styles.subtitle}>Protección Familiar Inteligente</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Estado de Protección</Text>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Ubicación:</Text>
            <View
              style={[
                styles.statusIndicator,
                {
                  backgroundColor: locationPermission ? '#10B981' : '#EF4444',
                },
              ]}
            />
            <Text style={styles.statusText}>
              {locationPermission ? 'Activa' : 'Inactiva'}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Seguimiento:</Text>
            <View
              style={[
                styles.statusIndicator,
                {
                  backgroundColor: isTracking ? '#10B981' : '#F59E0B',
                },
              ]}
            />
            <Text style={styles.statusText}>
              {isTracking ? 'En Funcionamiento' : 'Detenido'}
            </Text>
          </View>

          {location && (
            <View style={styles.locationInfo}>
              <Text style={styles.locationTitle}>Última Ubicación:</Text>
              <Text style={styles.locationText}>
                Lat: {location.latitude.toFixed(6)}
              </Text>
              <Text style={styles.locationText}>
                Lng: {location.longitude.toFixed(6)}
              </Text>
              <Text style={styles.locationText}>
                Precisión: ±{Math.round(location.accuracy)}m
              </Text>
              <Text style={styles.locationTime}>
                {new Date().toLocaleTimeString()}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Protección Activa</Text>
          <Text style={styles.infoText}>
            Esta aplicación mantiene a tu familia segura mediante:
          </Text>
          <Text style={styles.featureText}>• Seguimiento de ubicación GPS</Text>
          <Text style={styles.featureText}>• Monitoreo de zonas seguras</Text>
          <Text style={styles.featureText}>• Alertas en tiempo real</Text>
          <Text style={styles.featureText}>• Funcionamiento en segundo plano</Text>
        </View>

        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>⚠️ Importante</Text>
          <Text style={styles.warningText}>
            Esta aplicación está protegida y no debe ser desinstalada. 
            Cualquier intento de desactivación será notificado a los tutores.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#3B82F6',
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#E5E7EB',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 16,
    color: '#4B5563',
    marginRight: 12,
    minWidth: 100,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  locationInfo: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  locationText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  locationTime: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    fontStyle: 'italic',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 4,
  },
  warningCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },
});

export default SafeKidsApp;