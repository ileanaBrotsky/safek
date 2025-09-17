// mobile/src/screens/RegistrationScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Keyboard,
  ScrollView
} from 'react-native';
import AuthService from '../services/AuthService';
import DeviceInfo from 'react-native-device-info';

interface RegistrationScreenProps {
  onRegistrationComplete: () => void;
}

const RegistrationScreen: React.FC<RegistrationScreenProps> = ({ onRegistrationComplete }) => {
  const [code, setCode] = useState<string>('');
  const [deviceName, setDeviceName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showDeviceInfo, setShowDeviceInfo] = useState<boolean>(false);
  
  // Referencias para los inputs
  const codeInputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    // Obtener nombre del dispositivo por defecto
    loadDeviceName();
  }, []);

  const loadDeviceName = async () => {
    try {
      const name = await DeviceInfo.getDeviceName();
      setDeviceName(name);
    } catch (error) {
      console.error('Error getting device name:', error);
      setDeviceName('Dispositivo Android');
    }
  };

  // Manejar entrada del código
  const handleCodeChange = (value: string, index: number) => {
    const newCode = code.split('');
    newCode[index] = value.toUpperCase();
    const updatedCode = newCode.join('');
    setCode(updatedCode);

    // Auto-avanzar al siguiente campo
    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }

    // Si se completó el código, intentar registrar
    if (updatedCode.length === 6 && !updatedCode.includes('')) {
      handleRegister(updatedCode);
    }
  };

  // Manejar backspace
  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  // Registrar dispositivo
  const handleRegister = async (registrationCode?: string) => {
    const finalCode = registrationCode || code;
    
    // Validar código
    if (!AuthService.validateRegistrationCode(finalCode)) {
      Alert.alert('Código Inválido', 'Por favor ingresa un código de 6 caracteres', [{ text: 'OK' }]);
      return;
    }

    Keyboard.dismiss();
    setIsLoading(true);

    try {
      const success = await AuthService.registerDevice({
        registration_code: finalCode,
        device_name: deviceName || 'Dispositivo'
      });

      if (success) {
        onRegistrationComplete();
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Pegar código del portapapeles
  const handlePasteCode = async () => {
    try {
      const { Clipboard } = require('@react-native-clipboard/clipboard');
      const text = await Clipboard.getString();
      const cleanCode = text.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
      
      if (cleanCode.length === 6) {
        setCode(cleanCode);
        handleRegister(cleanCode);
      } else {
        Alert.alert('Código Inválido', 'El código del portapapeles no es válido', [{ text: 'OK' }]);
      }
    } catch (error) {
      console.error('Error pasting code:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>SafeKids</Text>
            <Text style={styles.title}>Vincular Dispositivo</Text>
            <Text style={styles.subtitle}>
              Ingresa el código de 6 dígitos que te proporcionó tu padre/madre
            </Text>
          </View>

          {/* Código Input */}
          <View style={styles.codeContainer}>
            <View style={styles.codeInputContainer}>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <React.Fragment key={index}>
                  <TextInput
                    ref={(ref) => (codeInputRefs.current[index] = ref)}
                    style={[
                      styles.codeInput,
                      code[index] && styles.codeInputFilled
                    ]}
                    value={code[index] || ''}
                    onChangeText={(value) => handleCodeChange(value, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    maxLength={1}
                    autoCapitalize="characters"
                    keyboardType="default"
                    editable={!isLoading}
                  />
                  {index === 2 && <Text style={styles.codeSeparator}>-</Text>}
                </React.Fragment>
              ))}
            </View>

            <TouchableOpacity
              style={styles.pasteButton}
              onPress={handlePasteCode}
              disabled={isLoading}
            >
              <Text style={styles.pasteButtonText}>Pegar Código</Text>
            </TouchableOpacity>
          </View>

          {/* Nombre del dispositivo */}
          <View style={styles.deviceNameContainer}>
            <Text style={styles.inputLabel}>Nombre del Dispositivo</Text>
            <TextInput
              style={styles.deviceNameInput}
              value={deviceName}
              onChangeText={setDeviceName}
              placeholder="Ej: Tablet de María"
              placeholderTextColor="#9CA3AF"
              editable={!isLoading}
            />
            <Text style={styles.inputHint}>
              Este nombre ayudará a identificar el dispositivo en el panel de control
            </Text>
          </View>

          {/* Botón de Registro */}
          <TouchableOpacity
            style={[styles.registerButton, isLoading && styles.registerButtonDisabled]}
            onPress={() => handleRegister()}
            disabled={isLoading || code.length !== 6}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.registerButtonText}>Vincular Dispositivo</Text>
            )}
          </TouchableOpacity>

          {/* Información adicional */}
          <TouchableOpacity
            style={styles.infoButton}
            onPress={() => setShowDeviceInfo(!showDeviceInfo)}
          >
            <Text style={styles.infoButtonText}>
              {showDeviceInfo ? 'Ocultar' : 'Ver'} información del dispositivo
            </Text>
          </TouchableOpacity>

          {showDeviceInfo && (
            <View style={styles.deviceInfoContainer}>
              <Text style={styles.deviceInfoTitle}>Información del Dispositivo</Text>
              <DeviceInfoRow label="Modelo" value={DeviceInfo.getModel()} />
              <DeviceInfoRow label="Sistema" value={`${Platform.OS} ${Platform.Version}`} />
              <DeviceInfoRow label="App Version" value={DeviceInfo.getVersion()} />
            </View>
          )}

          {/* Footer con instrucciones */}
          <View style={styles.footer}>
            <Text style={styles.footerTitle}>¿Cómo obtener el código?</Text>
            <Text style={styles.footerText}>
              1. Tu padre/madre debe iniciar sesión en SafeKids{'\n'}
              2. Agregar un nuevo hijo/a en el panel{'\n'}
              3. Generar un código de vinculación{'\n'}
              4. Compartir el código contigo
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// Componente auxiliar para mostrar información del dispositivo
const DeviceInfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.deviceInfoRow}>
    <Text style={styles.deviceInfoLabel}>{label}:</Text>
    <Text style={styles.deviceInfoValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  codeContainer: {
    marginBottom: 32,
  },
  codeInputContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  codeInput: {
    width: 45,
    height: 55,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginHorizontal: 6,
    backgroundColor: '#FFFFFF',
    color: '#1F2937',
  },
  codeInputFilled: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  codeSeparator: {
    fontSize: 24,
    color: '#9CA3AF',
    marginHorizontal: 4,
  },
  pasteButton: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pasteButtonText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '500',
  },
  deviceNameContainer: {
    marginBottom: 32,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  deviceNameInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  inputHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    paddingHorizontal: 4,
  },
  registerButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  registerButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoButton: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  infoButtonText: {
    color: '#6B7280',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  deviceInfoContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  deviceInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  deviceInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  deviceInfoLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  deviceInfoValue: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
  },
  footer: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginTop: 'auto',
  },
  footerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  footerText: {
    fontSize: 13,
    color: '#3730A3',
    lineHeight: 20,
  },
});

export default RegistrationScreen;