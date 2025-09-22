// backend/scripts/run-migration.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Configuración de la base de datos
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'safekids_db',
  user: process.env.POSTGRES_USER || 'safekids_user',
  password: process.env.POSTGRES_PASSWORD || 'safekids_password123',
});

async function runMigration() {
  console.log('🔄 Iniciando migración de App Monitoring...');
  
  try {
    // Verificar conexión
    const client = await pool.connect();
    console.log('✅ Conectado a la base de datos');

    // Leer archivo de migración
    const migrationPath = path.join(__dirname, '../database/migrations/004_app_monitoring.sql');
    
    if (!fs.existsSync(migrationPath)) {
      // Si no existe el archivo, crear la migración inline
      console.log('📝 Creando migración inline...');
      
      const migrationSQL = `
        -- Migración para tablas de monitoreo de aplicaciones
        
        -- Tabla para estadísticas de uso de aplicaciones
        CREATE TABLE IF NOT EXISTS app_usage_stats (
            id SERIAL PRIMARY KEY,
            child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
            package_name VARCHAR(255) NOT NULL,
            app_name VARCHAR(255),
            usage_time_ms BIGINT DEFAULT 0,
            first_timestamp TIMESTAMP,
            last_timestamp TIMESTAMP,
            total_time_foreground BIGINT DEFAULT 0,
            recorded_at TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            
            CONSTRAINT unique_child_app_date UNIQUE (child_id, package_name, DATE(recorded_at))
        );

        -- Tabla para límites específicos por aplicación
        CREATE TABLE IF NOT EXISTS app_limits (
            id SERIAL PRIMARY KEY,
            child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
            package_name VARCHAR(255) NOT NULL,
            daily_limit_minutes INTEGER DEFAULT 0,
            is_blocked BOOLEAN DEFAULT false,
            category VARCHAR(50) DEFAULT 'other',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            
            CONSTRAINT unique_child_app_limit UNIQUE (child_id, package_name)
        );

        -- Tabla para sessiones de uso en tiempo real
        CREATE TABLE IF NOT EXISTS app_sessions (
            id SERIAL PRIMARY KEY,
            child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
            package_name VARCHAR(255) NOT NULL,
            app_name VARCHAR(255),
            session_start TIMESTAMP DEFAULT NOW(),
            session_end TIMESTAMP,
            duration_ms BIGINT DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        );

        -- Extender tabla children con campos de monitoreo
        ALTER TABLE children 
        ADD COLUMN IF NOT EXISTS max_screen_time INTEGER DEFAULT 180,
        ADD COLUMN IF NOT EXISTS max_social_time INTEGER DEFAULT 60,
        ADD COLUMN IF NOT EXISTS bedtime_hour VARCHAR(5) DEFAULT '22:00',
        ADD COLUMN IF NOT EXISTS wakeup_hour VARCHAR(5) DEFAULT '07:00',
        ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS last_battery_level INTEGER,
        ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP;

        -- Tabla para categorización automática de aplicaciones
        CREATE TABLE IF NOT EXISTS app_categories (
            id SERIAL PRIMARY KEY,
            package_name VARCHAR(255) UNIQUE NOT NULL,
            app_name VARCHAR(255),
            category VARCHAR(50) NOT NULL,
            is_predefined BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        );

        -- Insertar categorías predefinidas para apps comunes
        INSERT INTO app_categories (package_name, app_name, category, is_predefined) VALUES
        ('com.facebook.katana', 'Facebook', 'social', true),
        ('com.instagram.android', 'Instagram', 'social', true),
        ('com.twitter.android', 'Twitter', 'social', true),
        ('com.snapchat.android', 'Snapchat', 'social', true),
        ('com.zhiliaoapp.musically', 'TikTok', 'social', true),
        ('com.whatsapp', 'WhatsApp', 'social', true),
        ('org.telegram.messenger', 'Telegram', 'social', true),
        ('com.discord', 'Discord', 'social', true),
        ('com.mojang.minecraftpe', 'Minecraft', 'games', true),
        ('com.roblox.client', 'Roblox', 'games', true),
        ('com.tencent.ig', 'PUBG Mobile', 'games', true),
        ('com.epicgames.fortnite', 'Fortnite', 'games', true),
        ('com.supercell.clashofclans', 'Clash of Clans', 'games', true),
        ('com.king.candycrushsaga', 'Candy Crush Saga', 'games', true),
        ('com.duolingo', 'Duolingo', 'educational', true),
        ('org.khanacademy.android', 'Khan Academy', 'educational', true),
        ('com.google.android.apps.classroom', 'Google Classroom', 'educational', true),
        ('com.google.android.apps.docs.editors.docs', 'Google Docs', 'productivity', true),
        ('com.microsoft.office.word', 'Microsoft Word', 'productivity', true),
        ('com.google.android.calendar', 'Google Calendar', 'productivity', true),
        ('com.netflix.mediaclient', 'Netflix', 'entertainment', true),
        ('com.google.android.youtube', 'YouTube', 'entertainment', true),
        ('com.spotify.music', 'Spotify', 'entertainment', true)
        ON CONFLICT (package_name) DO NOTHING;

        -- Índices para mejorar performance de consultas
        CREATE INDEX IF NOT EXISTS idx_app_usage_child_date ON app_usage_stats(child_id, DATE(recorded_at));
        CREATE INDEX IF NOT EXISTS idx_app_usage_package ON app_usage_stats(package_name);
        CREATE INDEX IF NOT EXISTS idx_app_sessions_child ON app_sessions(child_id, is_active);
        CREATE INDEX IF NOT EXISTS idx_app_limits_child ON app_limits(child_id);
      `;

      await client.query(migrationSQL);
    } else {
      // Leer y ejecutar archivo de migración
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      console.log('📄 Ejecutando migración desde archivo...');
      
      await client.query(migrationSQL);
    }

    console.log('✅ Migración completada exitosamente');

    // Verificar que las tablas se crearon
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('app_usage_stats', 'app_limits', 'app_sessions', 'app_categories')
      ORDER BY table_name
    `);

    console.log('📋 Tablas creadas:');
    tablesResult.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });

    // Verificar columnas agregadas a children
    const columnsResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'children' 
      AND column_name IN ('max_screen_time', 'max_social_time', 'bedtime_hour', 'monitoring_enabled')
    `);

    console.log('📋 Columnas agregadas a tabla children:');
    columnsResult.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name}`);
    });

    // Verificar categorías insertadas
    const categoriesResult = await client.query(`
      SELECT COUNT(*) as count FROM app_categories WHERE is_predefined = true
    `);

    console.log(`📱 Categorías de apps predefinidas: ${categoriesResult.rows[0].count}`);

    client.release();

  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('🎉 Migración completada. El sistema de monitoreo de apps está listo!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Error fatal:', error);
      process.exit(1);
    });
}

module.exports = runMigration;