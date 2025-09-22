// backend/scripts/simple-migration.js
require('dotenv').config();
const { Pool } = require('pg');

// Configuración de la base de datos
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'safekids_db',
  user: process.env.POSTGRES_USER || 'safekids_user',
  password: process.env.POSTGRES_PASSWORD || 'safekids_password123',
});

async function runSimpleMigration() {
  console.log('🔄 Iniciando migración simplificada de App Monitoring...');
  
  try {
    const client = await pool.connect();
    console.log('✅ Conectado a la base de datos');

    // 1. Tabla para estadísticas de uso de aplicaciones
    console.log('📝 Creando tabla app_usage_stats...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_usage_stats (
          id SERIAL PRIMARY KEY,
          child_id INTEGER,
          package_name VARCHAR(255) NOT NULL,
          app_name VARCHAR(255),
          usage_time_ms BIGINT DEFAULT 0,
          first_timestamp TIMESTAMP,
          last_timestamp TIMESTAMP,
          total_time_foreground BIGINT DEFAULT 0,
          recorded_at TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 2. Agregar foreign key para child_id
    console.log('📝 Agregando foreign key a app_usage_stats...');
    try {
      await client.query(`
        ALTER TABLE app_usage_stats 
        ADD CONSTRAINT fk_app_usage_child 
        FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
      `);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.log('⚠️ Foreign key ya existe o error:', error.message);
      }
    }

    // 3. Tabla para límites específicos por aplicación
    console.log('📝 Creando tabla app_limits...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_limits (
          id SERIAL PRIMARY KEY,
          child_id INTEGER,
          package_name VARCHAR(255) NOT NULL,
          daily_limit_minutes INTEGER DEFAULT 0,
          is_blocked BOOLEAN DEFAULT false,
          category VARCHAR(50) DEFAULT 'other',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 4. Agregar foreign key para app_limits
    console.log('📝 Agregando foreign key a app_limits...');
    try {
      await client.query(`
        ALTER TABLE app_limits 
        ADD CONSTRAINT fk_app_limits_child 
        FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
      `);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.log('⚠️ Foreign key ya existe o error:', error.message);
      }
    }

    // 5. Tabla para sesiones de uso en tiempo real
    console.log('📝 Creando tabla app_sessions...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_sessions (
          id SERIAL PRIMARY KEY,
          child_id INTEGER,
          package_name VARCHAR(255) NOT NULL,
          app_name VARCHAR(255),
          session_start TIMESTAMP DEFAULT NOW(),
          session_end TIMESTAMP,
          duration_ms BIGINT DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 6. Agregar foreign key para app_sessions
    console.log('📝 Agregando foreign key a app_sessions...');
    try {
      await client.query(`
        ALTER TABLE app_sessions 
        ADD CONSTRAINT fk_app_sessions_child 
        FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
      `);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.log('⚠️ Foreign key ya existe o error:', error.message);
      }
    }

    // 7. Tabla para categorización de aplicaciones
    console.log('📝 Creando tabla app_categories...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_categories (
          id SERIAL PRIMARY KEY,
          package_name VARCHAR(255) NOT NULL,
          app_name VARCHAR(255),
          category VARCHAR(50) NOT NULL,
          is_predefined BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 8. Agregar constraint único para package_name
    console.log('📝 Agregando constraint único para app_categories...');
    try {
      await client.query(`
        ALTER TABLE app_categories 
        ADD CONSTRAINT unique_package_name 
        UNIQUE (package_name)
      `);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.log('⚠️ Constraint único ya existe o error:', error.message);
      }
    }

    // 9. Extender tabla children - Verificar y agregar columnas una por una
    console.log('📝 Agregando columnas a tabla children...');
    
    const columnsToAdd = [
      { name: 'max_screen_time', type: 'INTEGER', default: '180' },
      { name: 'max_social_time', type: 'INTEGER', default: '60' },
      { name: 'bedtime_hour', type: 'VARCHAR(5)', default: "'22:00'" },
      { name: 'wakeup_hour', type: 'VARCHAR(5)', default: "'07:00'" },
      { name: 'monitoring_enabled', type: 'BOOLEAN', default: 'true' },
      { name: 'last_battery_level', type: 'INTEGER', default: null },
      { name: 'last_seen', type: 'TIMESTAMP', default: null }
    ];

    for (const column of columnsToAdd) {
      try {
        // Verificar si la columna existe
        const columnExists = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'children' AND column_name = $1
        `, [column.name]);

        if (columnExists.rows.length === 0) {
          // La columna no existe, agregarla
          const defaultClause = column.default ? `DEFAULT ${column.default}` : '';
          await client.query(`
            ALTER TABLE children ADD COLUMN ${column.name} ${column.type} ${defaultClause}
          `);
          console.log(`  ✓ Agregada columna: ${column.name}`);
        } else {
          console.log(`  ⚠️ Columna ${column.name} ya existe`);
        }
      } catch (error) {
        console.log(`  ❌ Error agregando columna ${column.name}: ${error.message}`);
      }
    }

    // 10. Insertar categorías predefinidas
    console.log('📱 Insertando categorías de aplicaciones...');
    
    const categories = [
      ['com.facebook.katana', 'Facebook', 'social'],
      ['com.instagram.android', 'Instagram', 'social'],
      ['com.twitter.android', 'Twitter', 'social'],
      ['com.snapchat.android', 'Snapchat', 'social'],
      ['com.zhiliaoapp.musically', 'TikTok', 'social'],
      ['com.whatsapp', 'WhatsApp', 'social'],
      ['org.telegram.messenger', 'Telegram', 'social'],
      ['com.discord', 'Discord', 'social'],
      ['com.mojang.minecraftpe', 'Minecraft', 'games'],
      ['com.roblox.client', 'Roblox', 'games'],
      ['com.tencent.ig', 'PUBG Mobile', 'games'],
      ['com.epicgames.fortnite', 'Fortnite', 'games'],
      ['com.supercell.clashofclans', 'Clash of Clans', 'games'],
      ['com.king.candycrushsaga', 'Candy Crush Saga', 'games'],
      ['com.duolingo', 'Duolingo', 'educational'],
      ['org.khanacademy.android', 'Khan Academy', 'educational'],
      ['com.google.android.apps.classroom', 'Google Classroom', 'educational'],
      ['com.google.android.apps.docs.editors.docs', 'Google Docs', 'productivity'],
      ['com.microsoft.office.word', 'Microsoft Word', 'productivity'],
      ['com.google.android.calendar', 'Google Calendar', 'productivity'],
      ['com.netflix.mediaclient', 'Netflix', 'entertainment'],
      ['com.google.android.youtube', 'YouTube', 'entertainment'],
      ['com.spotify.music', 'Spotify', 'entertainment']
    ];

    for (const [packageName, appName, category] of categories) {
      try {
        await client.query(`
          INSERT INTO app_categories (package_name, app_name, category, is_predefined) 
          VALUES ($1, $2, $3, true)
        `, [packageName, appName, category]);
      } catch (error) {
        if (error.message.includes('duplicate key')) {
          console.log(`  ⚠️ Categoría ${packageName} ya existe`);
        } else {
          console.log(`  ❌ Error insertando ${packageName}: ${error.message}`);
        }
      }
    }

    // 11. Crear índices
    console.log('📊 Creando índices...');
    
    const indexes = [
      {
        name: 'idx_app_usage_child_date',
        table: 'app_usage_stats',
        columns: 'child_id, DATE(recorded_at)'
      },
      {
        name: 'idx_app_usage_package',
        table: 'app_usage_stats', 
        columns: 'package_name'
      },
      {
        name: 'idx_app_sessions_child',
        table: 'app_sessions',
        columns: 'child_id, is_active'
      },
      {
        name: 'idx_app_limits_child',
        table: 'app_limits',
        columns: 'child_id'
      }
    ];

    for (const index of indexes) {
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${index.columns})
        `);
        console.log(`  ✓ Índice creado: ${index.name}`);
      } catch (error) {
        console.log(`  ❌ Error creando índice ${index.name}: ${error.message}`);
      }
    }

    console.log('✅ Migración completada exitosamente');

    // Verificar tablas creadas
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('app_usage_stats', 'app_limits', 'app_sessions', 'app_categories')
      ORDER BY table_name
    `);

    console.log('\n📋 Tablas de monitoreo creadas:');
    tablesResult.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });

    // Verificar columnas en children
    const columnsResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'children' 
      AND column_name IN ('max_screen_time', 'max_social_time', 'bedtime_hour', 'monitoring_enabled')
    `);

    console.log('\n📋 Columnas agregadas a children:');
    columnsResult.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name}`);
    });

    // Contar categorías
    const categoriesCount = await client.query(`
      SELECT COUNT(*) as count FROM app_categories WHERE is_predefined = true
    `);

    console.log(`\n📱 Categorías predefinidas: ${categoriesCount.rows[0].count}`);

    client.release();

  } catch (error) {
    console.error('❌ Error en migración:', error.message);
    console.error('Stack trace:', error.stack);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar migración
if (require.main === module) {
  runSimpleMigration()
    .then(() => {
      console.log('\n🎉 ¡Migración completada exitosamente!');
      console.log('🚀 El sistema de monitoreo de apps está listo para usar.');
      console.log('\n📋 Próximos pasos:');
      console.log('1. Probar el backend: node tests/test-app-monitoring.js');
      console.log('2. Compilar la app móvil: cd mobile && npx react-native run-android');
      console.log('3. Verificar permisos de Usage Stats en Android');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Error fatal en migración:', error.message);
      process.exit(1);
    });
}

module.exports = runSimpleMigration;