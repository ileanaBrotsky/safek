// backend/scripts/fix-complete-schema.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'safekids_db',
  user: process.env.POSTGRES_USER || 'safekids_user',
  password: process.env.POSTGRES_PASSWORD || 'safekids_password123',
});

async function fixCompleteSchema() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 INICIANDO CORRECCIÓN COMPLETA DEL ESQUEMA DE BASE DE DATOS...\n');
    
    await client.query('BEGIN');
    
    // =================================================================
    // PASO 1: VERIFICAR Y ACTUALIZAR ESTRUCTURA DE TABLA USERS
    // =================================================================
    console.log('📋 PASO 1: Verificando y actualizando tabla USERS...');
    
    const usersExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `);
    
    if (!usersExists.rows[0].exists) {
      console.log('   ➕ Creando tabla users...');
      await client.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          uuid UUID DEFAULT gen_random_uuid() UNIQUE,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          phone VARCHAR(20),
          timezone VARCHAR(50) DEFAULT 'America/Argentina/Buenos_Aires',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT true
        )
      `);
      console.log('   ✅ Tabla users creada');
    } else {
      console.log('   ✅ Tabla users existe, verificando columnas...');
      
      // Agregar columnas faltantes a users
      const userColumns = [
        { name: 'uuid', type: 'UUID', default: 'gen_random_uuid()' },
        { name: 'phone', type: 'VARCHAR(20)', default: null },
        { name: 'timezone', type: 'VARCHAR(50)', default: "'America/Argentina/Buenos_Aires'" },
        { name: 'is_active', type: 'BOOLEAN', default: 'true' }
      ];
      
      for (const column of userColumns) {
        const columnExists = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = $1
        `, [column.name]);
        
        if (columnExists.rows.length === 0) {
          const defaultClause = column.default ? `DEFAULT ${column.default}` : '';
          await client.query(`
            ALTER TABLE users ADD COLUMN ${column.name} ${column.type} ${defaultClause}
          `);
          console.log(`   ✅ Agregada columna ${column.name} a users`);
        }
      }
    }
    
    // =================================================================
    // PASO 2: MIGRAR DATOS DE FAMILIES A USERS SI ES NECESARIO
    // =================================================================
    console.log('\n📋 PASO 2: Sincronizando datos entre FAMILIES y USERS...');
    
    const familiesExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'families'
      )
    `);
    
    if (familiesExists.rows[0].exists) {
      // Primero verificar qué columnas existen en families
      const familiesColumns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'families'
      `);
      
      const columnNames = familiesColumns.rows.map(row => row.column_name);
      console.log('   📝 Columnas en families:', columnNames.join(', '));
      
      // Construir query de migración basado en columnas existentes
      let selectColumns = 'f.name, f.email, f.password_hash';
      let insertColumns = 'name, email, password_hash';
      
      if (columnNames.includes('phone')) {
        selectColumns += ', f.phone';
        insertColumns += ', phone';
      }
      
      if (columnNames.includes('timezone')) {
        selectColumns += ', f.timezone';
        insertColumns += ', timezone';
      } else {
        selectColumns += ", 'America/Argentina/Buenos_Aires' as timezone";
        insertColumns += ', timezone';
      }
      
      if (columnNames.includes('created_at')) {
        selectColumns += ', f.created_at';
        insertColumns += ', created_at';
      }
      
      if (columnNames.includes('updated_at')) {
        selectColumns += ', f.updated_at';
        insertColumns += ', updated_at';
      }
      
      if (columnNames.includes('is_active')) {
        selectColumns += ', f.is_active';
        insertColumns += ', is_active';
      }
      
      // Migrar datos
      const migrated = await client.query(`
        INSERT INTO users (${insertColumns})
        SELECT ${selectColumns}
        FROM families f
        WHERE NOT EXISTS (
          SELECT 1 FROM users u WHERE u.email = f.email
        )
        RETURNING id, email
      `);
      
      if (migrated.rowCount > 0) {
        console.log(`   ✅ Migrados ${migrated.rowCount} registros de families a users`);
      } else {
        console.log('   ✅ No hay registros nuevos para migrar');
      }
    } else {
      console.log('   ℹ️ Tabla families no existe, saltando migración');
    }
    
    // =================================================================
    // PASO 3: ACTUALIZAR FOREIGN KEYS DE CHILDREN
    // =================================================================
    console.log('\n📋 PASO 3: Corrigiendo FOREIGN KEYS en tabla CHILDREN...');
    
    // Verificar si existe la tabla children
    const childrenExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'children'
      )
    `);
    
    if (childrenExists.rows[0].exists) {
      // Buscar y eliminar constraints viejos
      const constraints = await client.query(`
        SELECT tc.constraint_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name='children' 
        AND tc.constraint_type='FOREIGN KEY'
        AND kcu.column_name='family_id'
      `);
      
      for (const constraint of constraints.rows) {
        console.log(`   🗑️ Eliminando constraint: ${constraint.constraint_name}`);
        await client.query(`ALTER TABLE children DROP CONSTRAINT ${constraint.constraint_name}`);
      }
      
      // Crear nuevo constraint apuntando a users
      console.log('   ➕ Creando nuevo constraint family_id -> users(id)');
      await client.query(`
        ALTER TABLE children 
        ADD CONSTRAINT children_family_id_fkey 
        FOREIGN KEY (family_id) REFERENCES users(id) ON DELETE CASCADE
      `);
      console.log('   ✅ Foreign key corregido');
    } else {
      console.log('   ℹ️ Tabla children no existe, se creará más adelante');
    }
    
    // =================================================================
    // PASO 4: CREAR TABLA CHILDREN SI NO EXISTE
    // =================================================================
    console.log('\n📋 PASO 4: Verificando tabla CHILDREN...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS children (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT gen_random_uuid() UNIQUE,
        family_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        age INTEGER CHECK (age >= 5 AND age <= 18),
        device_id VARCHAR(255) UNIQUE,
        is_active BOOLEAN DEFAULT true,
        risk_level VARCHAR(20) DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
        max_screen_time INTEGER DEFAULT 180,
        max_social_time INTEGER DEFAULT 60,
        bedtime_hour VARCHAR(5) DEFAULT '22:00',
        wakeup_hour VARCHAR(5) DEFAULT '07:00',
        monitoring_enabled BOOLEAN DEFAULT true,
        last_battery_level INTEGER,
        last_seen TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Tabla children verificada');
    
    // =================================================================
    // PASO 5: AGREGAR COLUMNAS FALTANTES A CHILDREN
    // =================================================================
    console.log('\n📋 PASO 5: Agregando columnas de monitoreo a CHILDREN...');
    
    const columnsToAdd = [
      { name: 'uuid', type: 'UUID', default: 'gen_random_uuid()' },
      { name: 'max_screen_time', type: 'INTEGER', default: '180' },
      { name: 'max_social_time', type: 'INTEGER', default: '60' },
      { name: 'bedtime_hour', type: 'VARCHAR(5)', default: "'22:00'" },
      { name: 'wakeup_hour', type: 'VARCHAR(5)', default: "'07:00'" },
      { name: 'monitoring_enabled', type: 'BOOLEAN', default: 'true' },
      { name: 'last_battery_level', type: 'INTEGER', default: null },
      { name: 'last_seen', type: 'TIMESTAMP', default: null }
    ];
    
    for (const column of columnsToAdd) {
      const columnExists = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'children' AND column_name = $1
      `, [column.name]);
      
      if (columnExists.rows.length === 0) {
        const defaultClause = column.default ? `DEFAULT ${column.default}` : '';
        await client.query(`
          ALTER TABLE children ADD COLUMN IF NOT EXISTS ${column.name} ${column.type} ${defaultClause}
        `);
        console.log(`   ✅ Agregada columna: ${column.name}`);
      } else {
        console.log(`   ⏭️ Columna ${column.name} ya existe`);
      }
    }
    
    // =================================================================
    // PASO 6: CREAR TABLAS DE MONITOREO DE APLICACIONES
    // =================================================================
    console.log('\n📋 PASO 6: Creando/verificando tablas de MONITOREO DE APPS...');
    
    // Tabla app_usage_stats - SIN el constraint problemático por ahora
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_usage_stats (
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
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Agregar constraint único usando recorded_date en lugar de DATE()
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'unique_child_app_date'
        ) THEN
          ALTER TABLE app_usage_stats 
          ADD CONSTRAINT unique_child_app_date 
          UNIQUE (child_id, package_name, recorded_date);
        END IF;
      END $$;
    `);
    
    // Crear índices para app_usage_stats
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_app_usage_child_date 
      ON app_usage_stats(child_id, recorded_date DESC);
      
      CREATE INDEX IF NOT EXISTS idx_app_usage_package 
      ON app_usage_stats(package_name);
    `);
    
    console.log('   ✅ Tabla app_usage_stats lista');
    
    // Tabla app_limits
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
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'unique_child_app_limit'
        ) THEN
          ALTER TABLE app_limits 
          ADD CONSTRAINT unique_child_app_limit 
          UNIQUE (child_id, package_name);
        END IF;
      END $$;
    `);
    console.log('   ✅ Tabla app_limits lista');
    
    // Tabla app_sessions
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
    
    // Crear índices para app_sessions
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_app_sessions_child 
      ON app_sessions(child_id);
      
      CREATE INDEX IF NOT EXISTS idx_app_sessions_active 
      ON app_sessions(is_active) WHERE is_active = true;
    `);
    
    console.log('   ✅ Tabla app_sessions lista');
    
    // Tabla app_categories
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
    // PASO 7: CREAR TABLAS DE DISPOSITIVOS Y REGISTRO
    // =================================================================
    console.log('\n📋 PASO 7: Verificando tablas de DISPOSITIVOS...');
    
    // Tabla registration_codes
    await client.query(`
      CREATE TABLE IF NOT EXISTS registration_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(6) UNIQUE NOT NULL,
        child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMP,
        created_by INTEGER REFERENCES users(id)
      )
    `);
    
    // Crear índices si no existen
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_registration_codes_code ON registration_codes(code);
      CREATE INDEX IF NOT EXISTS idx_registration_codes_child_id ON registration_codes(child_id);
      CREATE INDEX IF NOT EXISTS idx_registration_codes_expires_at ON registration_codes(expires_at);
    `);
    console.log('   ✅ Tabla registration_codes lista');
    
    // Tabla devices
    await client.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) UNIQUE NOT NULL,
        child_id INTEGER REFERENCES children(id) ON DELETE SET NULL,
        device_name VARCHAR(255),
        brand VARCHAR(100),
        model VARCHAR(100),
        os VARCHAR(50),
        os_version VARCHAR(50),
        app_version VARCHAR(20),
        platform VARCHAR(20),
        push_token TEXT,
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        unregistered_at TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        battery_level INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Crear índices si no existen
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
      CREATE INDEX IF NOT EXISTS idx_devices_child_id ON devices(child_id);
      CREATE INDEX IF NOT EXISTS idx_devices_is_active ON devices(is_active);
    `);
    console.log('   ✅ Tabla devices lista');
    
    // =================================================================
    // PASO 8: VERIFICAR TABLA LOCATIONS
    // =================================================================
    console.log('\n📋 PASO 8: Verificando tabla LOCATIONS...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        accuracy FLOAT,
        address TEXT,
        battery_level INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Crear índice si no existe
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_locations_child_timestamp 
      ON locations(child_id, timestamp DESC)
    `);
    console.log('   ✅ Tabla locations lista');
    
    // =================================================================
    // PASO 9: CREAR TABLA SAFE_ZONES
    // =================================================================
    console.log('\n📋 PASO 9: Verificando tabla SAFE_ZONES...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS safe_zones (
        id SERIAL PRIMARY KEY,
        family_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        address TEXT,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        radius INTEGER DEFAULT 100,
        zone_type VARCHAR(20) DEFAULT 'custom' CHECK (zone_type IN ('home', 'school', 'family', 'custom')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Tabla safe_zones lista');
    
    // =================================================================
    // PASO 10: CREAR TABLA ALERTS
    // =================================================================
    console.log('\n📋 PASO 10: Verificando tabla ALERTS...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT gen_random_uuid() UNIQUE,
        family_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
        alert_type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB,
        is_read BOOLEAN DEFAULT false,
        is_resolved BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);
    
    // Crear índices si no existen
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_alerts_family_created ON alerts(family_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_child_created ON alerts(child_id, created_at DESC);
    `);
    console.log('   ✅ Tabla alerts lista');
    
    // =================================================================
    // PASO 11: INSERTAR CATEGORÍAS PREDEFINIDAS
    // =================================================================
    console.log('\n📋 PASO 11: Insertando categorías predefinidas de apps...');
    
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
      
      // Juegos populares
      { package: 'com.kiloo.subwaysurf', name: 'Subway Surfers', category: 'games' },
      { package: 'com.supercell.clashofclans', name: 'Clash of Clans', category: 'games' },
      { package: 'com.mojang.minecraftpe', name: 'Minecraft', category: 'games' },
      { package: 'com.roblox.client', name: 'Roblox', category: 'games' },
      { package: 'com.king.candycrushsaga', name: 'Candy Crush', category: 'games' },
      { package: 'com.innersloth.spacemafia', name: 'Among Us', category: 'games' },
      { package: 'com.supercell.brawlstars', name: 'Brawl Stars', category: 'games' },
      { package: 'com.activision.callofduty.shooter', name: 'Call of Duty Mobile', category: 'games' },
      { package: 'com.garena.game.freefire', name: 'Free Fire', category: 'games' },
      
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
      { package: 'com.hbo.hbonow', name: 'HBO Max', category: 'entertainment' },
      
      // Productividad
      { package: 'com.google.android.apps.docs', name: 'Google Docs', category: 'productivity' },
      { package: 'com.microsoft.office.officehub', name: 'Microsoft Office', category: 'productivity' },
      { package: 'com.google.android.apps.sheets', name: 'Google Sheets', category: 'productivity' }
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
        console.log(`   ⚠️ Error insertando ${cat.name}: ${err.message}`);
      }
    }
    console.log(`   ✅ Procesadas ${insertedCount} categorías de aplicaciones`);
    
    // =================================================================
    // PASO 12: VERIFICACIÓN FINAL
    // =================================================================
    console.log('\n📋 PASO 12: Verificación final...');
    
    // Verificar integridad referencial
    const orphanChildren = await client.query(`
      SELECT c.id, c.name, c.family_id
      FROM children c
      LEFT JOIN users u ON c.family_id = u.id
      WHERE u.id IS NULL
    `);
    
    if (orphanChildren.rows.length > 0) {
      console.log(`   ⚠️ Encontrados ${orphanChildren.rows.length} children huérfanos`);
      
      // Intentar reasignar al primer usuario disponible
      const firstUser = await client.query('SELECT id FROM users LIMIT 1');
      if (firstUser.rows.length > 0) {
        await client.query(
          'UPDATE children SET family_id = $1 WHERE family_id IS NULL OR family_id NOT IN (SELECT id FROM users)',
          [firstUser.rows[0].id]
        );
        console.log(`   ✅ Children huérfanos reasignados al usuario ${firstUser.rows[0].id}`);
      }
    } else {
      console.log('   ✅ Todos los children tienen familia válida');
    }
    
    // Crear usuario de prueba si no hay usuarios
    const userCount = await client.query('SELECT COUNT(*) as count FROM users');
    if (userCount.rows[0].count == 0) {
      console.log('\n📋 PASO 13: Creando usuario de prueba...');
      
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash('password123', 12);
      
      const testUser = await client.query(`
        INSERT INTO users (name, email, password_hash, phone, timezone)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, email
      `, [
        'Familia García', 
        'test@safekids.com', 
        hashedPassword,
        '+54299123456',
        'America/Argentina/Buenos_Aires'
      ]);
      
      console.log(`   ✅ Usuario de prueba creado: ${testUser.rows[0].email}`);
      console.log('   📧 Email: test@safekids.com');
      console.log('   🔑 Password: password123');
    }
    
    await client.query('COMMIT');
    console.log('\n✅ CORRECCIÓN COMPLETA DEL ESQUEMA FINALIZADA EXITOSAMENTE!');
    
    // Mostrar estadísticas finales
    const stats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM children) as children_count,
        (SELECT COUNT(*) FROM devices WHERE is_active = true) as devices_count,
        (SELECT COUNT(*) FROM app_categories) as categories_count,
        (SELECT COUNT(*) FROM registration_codes WHERE used = false AND expires_at > NOW()) as active_codes
    `);
    
    const s = stats.rows[0];
    console.log('\n📊 ESTADÍSTICAS FINALES:');
    console.log(`   👤 Usuarios: ${s.users_count}`);
    console.log(`   👶 Niños: ${s.children_count}`);
    console.log(`   📱 Dispositivos activos: ${s.devices_count || 0}`);
    console.log(`   🏷️ Categorías de apps: ${s.categories_count}`);
    console.log(`   🔑 Códigos de registro activos: ${s.active_codes || 0}`);
    
    // Mostrar tablas creadas
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\n📋 TABLAS EN LA BASE DE DATOS:');
    tables.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });
    
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
  fixCompleteSchema()
    .then(() => {
      console.log('\n🎉 Script ejecutado exitosamente');
      console.log('📝 Próximos pasos:');
      console.log('   1. Verificar que el backend funcione: npm start');
      console.log('   2. Probar login con test@safekids.com / password123');
      console.log('   3. Continuar con el desarrollo de la app móvil');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Error fatal:', error.message);
      process.exit(1);
    });
}

module.exports = fixCompleteSchema;