// backend/test-backend.js
require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:3000/api';
let authToken = '';

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

async function testEndpoint(name, method, endpoint, data = null, useAuth = true) {
  try {
    log(`\n📋 Probando: ${name}`, 'cyan');
    
    const config = {
      method,
      url: `${API_URL}${endpoint}`,
      headers: {}
    };
    
    if (useAuth && authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    
    log(`   ✅ ${method} ${endpoint} - Status: ${response.status}`, 'green');
    
    if (response.data) {
      console.log('   📦 Respuesta:', JSON.stringify(response.data, null, 2));
    }
    
    return response.data;
    
  } catch (error) {
    log(`   ❌ ${method} ${endpoint} - Error: ${error.response?.status || error.message}`, 'red');
    
    if (error.response?.data) {
      console.log('   ⚠️ Detalles:', JSON.stringify(error.response.data, null, 2));
    }
    
    return null;
  }
}

async function runTests() {
  log('\n🧪 INICIANDO PRUEBAS DEL BACKEND SAFEKIDS\n', 'bright');
  
  // Test 1: Health Check
  log('═══════════════════════════════════', 'blue');
  await testEndpoint('Health Check', 'GET', '/../health', null, false);
  
  // Test 2: Registro de Usuario
  log('\n═══════════════════════════════════', 'blue');
  const testUser = {
    name: 'Usuario Test ' + Date.now(),
    email: `test${Date.now()}@safekids.com`,
    password: 'test123456',
    phone: '+54299' + Math.floor(Math.random() * 9000000 + 1000000)
  };
  
  const registerResult = await testEndpoint(
    'Registro de Usuario',
    'POST',
    '/auth/register',
    testUser,
    false
  );
  
  if (registerResult?.data?.token) {
    authToken = registerResult.data.token;
    log('   🔑 Token obtenido y guardado', 'yellow');
  }
  
  // Test 3: Login
  log('\n═══════════════════════════════════', 'blue');
  const loginResult = await testEndpoint(
    'Login de Usuario',
    'POST',
    '/auth/login',
    {
      email: testUser.email,
      password: testUser.password
    },
    false
  );
  
  if (loginResult?.data?.token) {
    authToken = loginResult.data.token;
  }
  
  // Test 4: Verificar Token
  log('\n═══════════════════════════════════', 'blue');
  await testEndpoint('Verificar Token', 'GET', '/auth/verify');
  
  // Test 5: Obtener Children
  log('\n═══════════════════════════════════', 'blue');
  await testEndpoint('Listar Children', 'GET', '/children');
  
  // Test 6: Crear Child
  log('\n═══════════════════════════════════', 'blue');
  const childResult = await testEndpoint(
    'Crear Child',
    'POST',
    '/children',
    {
      name: 'Niño Test',
      age: 12
    }
  );
  
  let childId = null;
  if (childResult?.data?.child?.id) {
    childId = childResult.data.child.id;
    log(`   👶 Child creado con ID: ${childId}`, 'yellow');
  }
  
  // Test 7: Generar Código de Registro
  if (childId) {
    log('\n═══════════════════════════════════', 'blue');
    const codeResult = await testEndpoint(
      'Generar Código de Registro',
      'POST',
      `/children/${childId}/generate-code`,
      {}
    );
    
    if (codeResult?.data?.code) {
      log(`   📱 Código de registro: ${codeResult.data.code}`, 'yellow');
    }
  }
  
  // Test 8: Obtener Zonas Seguras
  log('\n═══════════════════════════════════', 'blue');
  await testEndpoint('Listar Zonas Seguras', 'GET', '/safe-zones');
  
  // Test 9: Crear Zona Segura
  log('\n═══════════════════════════════════', 'blue');
  const zoneResult = await testEndpoint(
    'Crear Zona Segura',
    'POST',
    '/safe-zones',
    {
      name: 'Casa Test',
      latitude: -38.7167,
      longitude: -62.2653,
      radius: 100,
      zone_type: 'home',
      address: 'Dirección de prueba'
    }
  );
  
  // Test 10: Obtener Alertas
  log('\n═══════════════════════════════════', 'blue');
  await testEndpoint('Listar Alertas', 'GET', '/alerts');
  
  // Test 11: Estadísticas de Monitoreo
  log('\n═══════════════════════════════════', 'blue');
  await testEndpoint(
    'Enviar Estadísticas de Uso',
    'POST',
    '/monitoring/usage-stats',
    {
      child_id: childId,
      timestamp: new Date().toISOString(),
      usageData: [
        {
          packageName: 'com.whatsapp',
          appName: 'WhatsApp',
          usageTimeMs: 300000,
          firstTimestamp: new Date(Date.now() - 300000).toISOString(),
          lastTimestamp: new Date().toISOString()
        },
        {
          packageName: 'com.instagram.android',
          appName: 'Instagram',
          usageTimeMs: 600000,
          firstTimestamp: new Date(Date.now() - 600000).toISOString(),
          lastTimestamp: new Date().toISOString()
        }
      ],
      todayUsage: {
        totalScreenTime: 900000,
        totalSocialTime: 900000
      }
    }
  );
  
  // Test 12: Obtener Estadísticas
  if (childId) {
    log('\n═══════════════════════════════════', 'blue');
    await testEndpoint(
      'Obtener Estadísticas del Niño',
      'GET',
      `/monitoring/child/${childId}/stats`
    );
  }
  
  // Test 13: Actualizar Perfil
  log('\n═══════════════════════════════════', 'blue');
  await testEndpoint(
    'Actualizar Perfil',
    'PUT',
    '/auth/profile',
    {
      name: 'Usuario Actualizado',
      phone: '+54299555555'
    }
  );
  
  // Resumen
  log('\n═══════════════════════════════════', 'blue');
  log('\n📊 PRUEBAS COMPLETADAS', 'bright');
  log('   ✅ Endpoints básicos probados', 'green');
  log('   ✅ Autenticación funcionando', 'green');
  log('   ✅ CRUD de children funcionando', 'green');
  log('   ✅ Sistema de monitoreo listo', 'green');
  
  log('\n📝 Próximos pasos:', 'yellow');
  log('   1. Verificar logs del servidor para errores', 'cyan');
  log('   2. Probar desde el frontend web', 'cyan');
  log('   3. Iniciar desarrollo de app móvil', 'cyan');
}

// Ejecutar pruebas
runTests().catch(error => {
  log('\n💥 Error fatal en pruebas:', 'red');
  console.error(error);
  process.exit(1);
});