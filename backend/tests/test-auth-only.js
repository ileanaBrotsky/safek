// backend/tests/test-auth-only.js
require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

const testUser = {
  name: 'Test User Auth',
  email: `test.auth.${Date.now()}@example.com`,
  password: 'password123'
};

async function testAuthEndpoints() {
  console.log('🔐 PROBANDO ENDPOINTS DE AUTENTICACIÓN');
  console.log('=' .repeat(50));
  
  try {
    // 1. Probar registro
    console.log('\n1️⃣ Probando registro...');
    console.log('📤 Datos a enviar:', testUser);
    
    const registerResponse = await axios.post(`${BASE_URL}/api/auth/register`, testUser);
    
    console.log('📥 Respuesta de registro:');
    console.log('Status:', registerResponse.status);
    console.log('Data:', JSON.stringify(registerResponse.data, null, 2));
    
    // Extraer token de la respuesta
    const token = registerResponse.data.token || registerResponse.data.data?.token;
    const user = registerResponse.data.user || registerResponse.data.data?.user;
    
    console.log('\n🔍 Análisis de respuesta:');
    console.log('Token encontrado:', token ? 'SÍ' : 'NO');
    console.log('User encontrado:', user ? 'SÍ' : 'NO');
    
    if (token) {
      console.log('Token (primeros 20 chars):', token.substring(0, 20) + '...');
    }
    
    if (user) {
      console.log('User ID:', user.id);
      console.log('User name:', user.name);
      console.log('User email:', user.email);
    }
    
    // 2. Probar verificación de token
    if (token) {
      console.log('\n2️⃣ Probando verificación de token...');
      
      const verifyResponse = await axios.get(`${BASE_URL}/api/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('📥 Respuesta de verificación:');
      console.log('Status:', verifyResponse.status);
      console.log('Data:', JSON.stringify(verifyResponse.data, null, 2));
    }
    
    // 3. Probar login
    console.log('\n3️⃣ Probando login...');
    
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    
    console.log('📥 Respuesta de login:');
    console.log('Status:', loginResponse.status);
    console.log('Data:', JSON.stringify(loginResponse.data, null, 2));
    
    const loginToken = loginResponse.data.token || loginResponse.data.data?.token;
    const loginUser = loginResponse.data.user || loginResponse.data.data?.user;
    
    console.log('\n🔍 Análisis de login:');
    console.log('Token encontrado:', loginToken ? 'SÍ' : 'NO');
    console.log('User encontrado:', loginUser ? 'SÍ' : 'NO');
    
    // 4. Probar endpoint que requiere autenticación
    if (loginToken) {
      console.log('\n4️⃣ Probando endpoint autenticado...');
      
      try {
        const childrenResponse = await axios.get(`${BASE_URL}/api/children`, {
          headers: {
            'Authorization': `Bearer ${loginToken}`
          }
        });
        
        console.log('📥 Respuesta de children:');
        console.log('Status:', childrenResponse.status);
        console.log('Data:', JSON.stringify(childrenResponse.data, null, 2));
      } catch (error) {
        console.log('⚠️ Error en children (esperado si no hay children):', error.response?.data);
      }
    }
    
    console.log('\n✅ Todas las pruebas de auth completadas');
    
  } catch (error) {
    console.error('❌ Error en pruebas de auth:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
}

// Ejecutar pruebas
if (require.main === module) {
  testAuthEndpoints()
    .then(() => {
      console.log('\n🏁 Pruebas de auth terminadas');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Error fatal:', error.message);
      process.exit(1);
    });
}

module.exports = testAuthEndpoints;