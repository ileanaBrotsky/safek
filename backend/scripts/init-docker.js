// backend/scripts/init-docker.js
require('dotenv').config();
const { spawn } = require('child_process');

async function initializeDatabase() {
  console.log('🚀 Inicializando base de datos SafeKids...');
  
  try {
    // Esperar a que PostgreSQL esté listo
    await waitForDatabase();
    
    // Ejecutar migraciones
    console.log('📋 Ejecutando migraciones...');
    await runCommand('npm', ['run', 'migrate']);
    
    // Ejecutar seed
    console.log('🌱 Insertando datos de prueba...');
    await runCommand('npm', ['run', 'seed']);
    
    console.log('✅ Base de datos inicializada correctamente!');
    
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    process.exit(1);
  }
}

function waitForDatabase() {
  return new Promise((resolve, reject) => {
    const maxAttempts = 30;
    let attempts = 0;
    
    const checkConnection = () => {
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL
      });
      
      pool.query('SELECT NOW()')
        .then(() => {
          console.log('✅ Conexión a PostgreSQL establecida');
          pool.end();
          resolve();
        })
        .catch((error) => {
          attempts++;
          if (attempts >= maxAttempts) {
            reject(new Error(`No se pudo conectar a PostgreSQL después de ${maxAttempts} intentos`));
          } else {
            console.log(`⏳ Esperando PostgreSQL... (${attempts}/${maxAttempts})`);
            setTimeout(checkConnection, 2000);
          }
          pool.end();
        });
    };
    
    checkConnection();
  });
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Comando falló con código ${code}`));
      }
    });
  });
}

// Ejecutar si se llama directamente
if (require.main === module) {
  initializeDatabase();
}

module.exports = initializeDatabase;