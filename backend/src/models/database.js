// backend/src/models/database.js
const { Pool } = require('pg');

// Configuración de la base de datos
const dbConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'safekids_db',
  user: process.env.POSTGRES_USER || 'safekids_user',
  password: process.env.POSTGRES_PASSWORD || 'safekids_password123',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Debug: mostrar configuración (sin password)
console.log('🔧 Configuración de DB:', {
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  password: '***'
});

const pool = new Pool(dbConfig);

// Función para ejecutar queries
const query = async (text, params) => {
  const start = Date.now();
  
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    console.log('📊 Query ejecutado:', {
      text: text.slice(0, 50) + '...',
      duration: `${duration}ms`,
      rows: res.rowCount
    });
    
    return res;
  } catch (error) {
    console.error('❌ Error en query:', {
      text: text.slice(0, 50) + '...',
      error: error.message,
      params
    });
    throw error;
  }
};

// Función para verificar conexión
const checkConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Conexión a PostgreSQL exitosa');
    
    // Probar query simple
    const result = await client.query('SELECT NOW()');
    console.log('🕒 Hora del servidor:', result.rows[0].now);
    
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Error conectando a PostgreSQL:', error.message);
    return false;
  }
};

// Función para crear tablas si no existen
const createTables = async () => {
  try {
    console.log('📝 Creando tablas...');
    
    // Tabla usuarios
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla niños
    await query(`
      CREATE TABLE IF NOT EXISTS children (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        age INTEGER,
        phone VARCHAR(20),
        emergency_contact VARCHAR(100),
        photo_url VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla ubicaciones
    await query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        address TEXT,
        timestamp TIMESTAMP DEFAULT NOW(),
        battery_level INTEGER,
        accuracy DECIMAL(10, 2)
      )
    `);

    // Tabla zonas seguras
    await query(`
      CREATE TABLE IF NOT EXISTS safe_zones (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        radius INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla alertas
    await query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        severity VARCHAR(20) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Tablas creadas exitosamente');
    
  } catch (error) {
    console.error('❌ Error creando tablas:', error.message);
    throw error;
  }
};

// Función de inicialización
const initDatabase = async () => {
  console.log('🚀 Inicializando base de datos...');
  
  const isConnected = await checkConnection();
  if (!isConnected) {
    throw new Error('No se pudo conectar a la base de datos');
  }
  
  await createTables();
  console.log('✅ Base de datos inicializada correctamente');
};

module.exports = {
  query,
  pool,
  checkConnection,
  createTables,
  initDatabase
};