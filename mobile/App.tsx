// mobile/App.tsx - SafeKids Mobile App Principal
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthService from './src/services/AuthService';
import RegistrationScreen from './src/screens/RegistrationScreen';
import HomeScreen from './src/screens/HomeScreen';

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    checkAppStatus();
  }, []);

  const checkAppStatus = async () => {
    try {
      console.log('🔍 Checking app status...');
      
      // Verificar si el dispositivo está registrado
      const registered = await AsyncStorage.getItem('isRegistered');
      
      if (registered === 'true') {
        console.log('📱 Device is registered, checking authentication...');
        
        // Intentar reautenticar
        const authenticated = await AuthService.checkAuthStatus();
        
        if (!authenticated) {
          // Intentar reautenticación automática
          const reauthSuccess = await AuthService.reauthenticate();
          setIsAuthenticated(reauthSuccess);
        } else {
          setIsAuthenticated(true);
        }
        
        setIsRegistered(true);
      } else {
        console.log('📱 Device not registered');
        setIsRegistered(false);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Error checking app status:', error);
      setIsRegistered(false);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegistrationComplete = async () => {
    console.log('✅ Registration completed');
    setIsRegistered(true);
    setIsAuthenticated(true);
  };

  // Pantalla de carga
  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#3B82F6" />
        <View style={styles.loadingContent}>
          <Text style={styles.loadingLogo}>SafeKids</Text>
          <ActivityIndicator size="large" color="#3B82F6" style={styles.loadingSpinner} />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Si no está registrado, mostrar pantalla de registro
  if (!isRegistered) {
    return (
      <>
        <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
        <RegistrationScreen onRegistrationComplete={handleRegistrationComplete} />
      </>
    );
  }

  // Si está registrado y autenticado, mostrar pantalla principal
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#3B82F6" />
      <HomeScreen />
    </>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 32,
  },
  loadingSpinner: {
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
});

export default App;