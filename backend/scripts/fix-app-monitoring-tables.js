// backend/scripts/fix-app-monitoring-tables.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'safekids_db',
  user: process.env.POSTGRES_USER || 'safekids_user',
  password: process.env.POSTGRES_PASSWORD || 'safekids_password123',
});

async function fixAppMonitoringTables() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 CORRIGIENDO TABLAS DE MONITOREO DE APLICACIONES...\n');
    
    await client.query('BEGIN');
    
    // =================================================================
    // PASO 1: VERIFICAR Y CORREGIR app_usage_stats
    // =================================================================
    console.log('📋 PASO 1: Verificando tabla app_usage_stats...');
    
    const appUsageExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'app_usage_stats'
      )
    `);
    
    if (appUsageExists.rows[0].exists) {
      console.log('   ✅ Tabla existe, verificando columnas...');
      
      // Verificar si existe la columna recorded_date
      const recordedDateExists = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'app_usage_stats' AND column_name = 'recorded_date'
      `);
      
      if (recordedDateExists.rows.length === 0) {
        console.log('   ➕ Agregando columna recorded_date...');
        await client.query(`
          ALTER TABLE app_usage_stats 
          ADD COLUMN recorded_date DATE DEFAULT CURRENT_DATE
        `);
      }
      
      // Verificar otros campos importantes
      const columnsToCheck = [
        { name: 'usage_time_ms', type: 'BIGINT', default: '0' },
        { name: 'first_timestamp', type: 'TIMESTAMP', default: null },
        { name: 'last_timestamp', type: 'TIMESTAMP', default: null },
        { name: 'total_time_foreground', type: 'BIGINT', default: '0' },
        { name: 'recorded_at', type: 'TIMESTAMP', default: 'NOW()' },
        { name: 'created_at', type: 'TIMESTAMP', default: 'NOW()' },
        { name: 'updated_at', type: 'TIMESTAMP', default: 'NOW()' }
      ];
      
      for (const column of columnsToCheck) {
        const columnExists = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'app_usage_stats' AND column_name = $1
        `, [column.name]);
        
        if (columnExists.rows.length === 0) {
          const defaultClause = column.default ? `DEFAULT ${column.default}` : '';
          await client.query(`
            ALTER TABLE app_usage_stats 
            ADD COLUMN ${column.name} ${column.type} ${defaultClause}
          `);
          console.log(`   ✅ Agregada columna ${column.name}`);
        }
      }
      
      // Intentar agregar el constraint único
      const constraintExists = await client.query(`
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_child_app_date'
      `);
      
      if (constraintExists.rows.length === 0) {
        console.log('   ➕ Agregando constraint único...');
        try {
          await client.query(`
            ALTER TABLE app_usage_stats 
            ADD CONSTRAINT unique_child_app_date 
            UNIQUE (child_id, package_name, recorded_date)
          `);
          console.log('   ✅ Constraint único agregado');
        } catch (err) {
          console.log('   ⚠️ No se pudo agregar constraint único:', err.message);
        }
      }
      
    } else {
      // Crear tabla completa si no existe
      console.log('   ➕ Creando tabla app_usage_stats...');
      await client.query(`
        CREATE TABLE app_usage_stats (
          id SERIAL PRIMARY KEY,
          child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
          package_name VARCHAR(255) NOT NULL,
          app_name VARCHAR(255),
          usage_time_ms BIGINT DEFAULT 0,
          first_timestamp TIMESTAMP,
          last_timestamp TIMESTAMP,
          total_time_foreground BIGINT DEFAULT 0,
          recorded_date DATE DEFAULT CURRENT_DATE,
          recorded_at TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT unique_child_app_date UNIQUE (child_id, package_name, recorded_date)
        )
      `);
    }
    
    // Crear índices
    console.log('   ➕ Creando índices...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_app_usage_child_date 
      ON app_usage_stats(child_id, recorded_date DESC);
      
      CREATE INDEX IF NOT EXISTS idx_app_usage_package 
      ON app_usage_stats(package_name);
    `);
    
    console.log('   ✅ Tabla app_usage_stats lista');
    
    // =================================================================
    // PASO 2: VERIFICAR Y CORREGIR app_limits
    // =================================================================
    console.log('\n📋 PASO 2: Verificando tabla app_limits...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_limits (
        id SERIAL PRIMARY KEY,
        child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
        package_name VARCHAR(255) NOT NULL,
        app_name VARCHAR(255),
        daily_limit_minutes INTEGER DEFAULT 0,
        is_blocked BOOLEAN DEFAULT false,
        category VARCHAR(50) DEFAULT 'other',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Agregar constraint único si no existe
    const limitConstraintExists = await client.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'unique_child_app_limit'
    `);
    
    if (limitConstraintExists.rows.length === 0) {
      try {
        await client.query(`
          ALTER TABLE app_limits 
          ADD CONSTRAINT unique_child_app_limit 
          UNIQUE (child_id, package_name)
        `);
        console.log('   ✅ Constraint único agregado a app_limits');
      } catch (err) {
        console.log('   ⚠️ Constraint ya existe o error:', err.message);
      }
    }
    
    console.log('   ✅ Tabla app_limits lista');
    
    // =================================================================
    // PASO 3: VERIFICAR Y CORREGIR app_sessions
    // =================================================================
    console.log('\n📋 PASO 3: Verificando tabla app_sessions...');
    
    await client.query(`
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
      )
    `);
    
    // Crear índices
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_app_sessions_child 
      ON app_sessions(child_id);
      
      CREATE INDEX IF NOT EXISTS idx_app_sessions_active 
      ON app_sessions(is_active) WHERE is_active = true;
      
      CREATE INDEX IF NOT EXISTS idx_app_sessions_start 
      ON app_sessions(session_start DESC);
    `);
    
    console.log('   ✅ Tabla app_sessions lista');
    
    // =================================================================
    // PASO 4: VERIFICAR Y CORREGIR app_categories
    // =================================================================
    console.log('\n📋 PASO 4: Verificando tabla app_categories...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_categories (
        id SERIAL PRIMARY KEY,
        package_name VARCHAR(255) UNIQUE NOT NULL,
        app_name VARCHAR(255),
        category VARCHAR(50) NOT NULL,
        is_predefined BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log('   ✅ Tabla app_categories lista');
    
    // =================================================================
    // PASO 5: INSERTAR CATEGORÍAS PREDEFINIDAS
    // =================================================================
    console.log('\n📋 PASO 5: Insertando categorías de aplicaciones...');
    
    const categories = [
      // Redes Sociales
      { package: 'com.instagram.android', name: 'Instagram', category: 'social' },
      { package: 'com.facebook.katana', name: 'Facebook', category: 'social' },
      { package: 'com.whatsapp', name: 'WhatsApp', category: 'social' },
      { package: 'com.snapchat.android', name: 'Snapchat', category: 'social' },
      { package: 'com.twitter.android', name: 'Twitter', category: 'social' },
      { package: 'com.zhiliaoapp.musically', name: 'TikTok', category: 'social' },
      { package: 'com.discord', name: 'Discord', category: 'social' },
      { package: 'com.telegram.messenger', name: 'Telegram', category: 'social' },
      
      // Juegos
      { package: 'com.kiloo.subwaysurf', name: 'Subway Surfers', category: 'games' },
      { package: 'com.supercell.clashofclans', name: 'Clash of Clans', category: 'games' },
      { package: 'com.mojang.minecraftpe', name: 'Minecraft', category: 'games' },
      { package: 'com.roblox.client', name: 'Roblox', category: 'games' },
      { package: 'com.king.candycrushsaga', name: 'Candy Crush', category: 'games' },
      { package: 'com.innersloth.spacemafia', name: 'Among Us', category: 'games' },
      { package: 'com.supercell.brawlstars', name: 'Brawl Stars', category: 'games' },
      { package: 'com.activision.callofduty.shooter', name: 'Call of Duty Mobile', category: 'games' },
      { package: 'com.garena.game.freefire', name: 'Free Fire', category: 'games' },
      { package: 'com.pubg.mobile', name: 'PUBG Mobile', category: 'games' },
      
      // Educativas
      { package: 'com.duolingo', name: 'Duolingo', category: 'educational' },
      { package: 'org.khanacademy.android', name: 'Khan Academy', category: 'educational' },
      { package: 'com.google.android.apps.classroom', name: 'Google Classroom', category: 'educational' },
      { package: 'com.photomath.photomath', name: 'Photomath', category: 'educational' },
      
      // Entretenimiento
      { package: 'com.netflix.mediaclient', name: 'Netflix', category: 'entertainment' },
      { package: 'com.google.android.youtube', name: 'YouTube', category: 'entertainment' },
      { package: 'com.spotify.music', name: 'Spotify', category: 'entertainment' },
      { package: 'com.disney.disneyplus', name: 'Disney+', category: 'entertainment' },
      { package: 'tv.twitch.android.app', name: 'Twitch', category: 'entertainment' },
      { package: 'com.amazon.primevideo.android', name: 'Prime Video', category: 'entertainment' },
      
      // Productividad
      { package: 'com.google.android.apps.docs', name: 'Google Docs', category: 'productivity' },
      { package: 'com.microsoft.office.officehub', name: 'Microsoft Office', category: 'productivity' },
      { package: 'com.google.android.apps.sheets', name: 'Google Sheets', category: 'productivity' },
      { package: 'com.google.android.gm', name: 'Gmail', category: 'productivity' },
      
      // Navegadores
      { package: 'com.android.chrome', name: 'Chrome', category: 'browser' },
      { package: 'org.mozilla.firefox', name: 'Firefox', category: 'browser' },
      { package: 'com.opera.browser', name: 'Opera', category: 'browser' }
    ];
    
    let insertedCount = 0;
    for (const cat of categories) {
      try {
        const result = await client.query(`
          INSERT INTO app_categories (package_name, app_name, category, is_predefined)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (package_name) DO UPDATE 
          SET app_name = EXCLUDED.app_name,
              category = EXCLUDED.category
          RETURNING id
        `, [cat.package, cat.name, cat.category]);
        
        if (result.rowCount > 0) insertedCount++;
      } catch (err) {
        // Ignorar errores de duplicados
      }
    }
    console.log(`   ✅ Procesadas ${insertedCount} categorías de aplicaciones`);
    
    // =================================================================
    // PASO 6: VERIFICACIÓN FINAL
    // =================================================================
    console.log('\n📋 PASO 6: Verificación final...');
    
    // Verificar que todas las tablas de monitoreo existen
    const monitoringTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('app_usage_stats', 'app_limits', 'app_sessions', 'app_categories')
      ORDER BY table_name
    `);
    
    console.log('   📊 Tablas de monitoreo creadas:');
    monitoringTables.rows.forEach(row => {
      console.log(`      ✓ ${row.table_name}`);
    });
    
    // Estadísticas
    const stats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM app_categories) as categories_count,
        (SELECT COUNT(DISTINCT package_name) FROM app_usage_stats) as monitored_apps,
        (SELECT COUNT(DISTINCT child_id) FROM app_usage_stats) as monitored_children
    `);
    
    const s = stats.rows[0];
    console.log('\n   📊 Estadísticas:');
    console.log(`      • Categorías definidas: ${s.categories_count}`);
    console.log(`      • Apps monitoreadas: ${s.monitored_apps || 0}`);
    console.log(`      • Niños con monitoreo: ${s.monitored_children || 0}`);
    
    await client.query('COMMIT');
    console.log('\n✅ TABLAS DE MONITOREO CORREGIDAS EXITOSAMENTE!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  fixAppMonitoringTables()
    .then(() => {
      console.log('\n🎉 Script ejecutado exitosamente');
      console.log('\n📝 Siguiente paso:');
      console.log('   Ejecuta: node scripts/fix-complete-schema.js');
      console.log('   Para completar la configuración de todas las tablas');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Error fatal:', error.message);
      process.exit(1);
    });
}

module.exports = fixAppMonitoringTables;