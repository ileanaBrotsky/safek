// backend/scripts/fix-safezones-fk.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'safekids_db',
  user: process.env.POSTGRES_USER || 'safekids_user',
  password: process.env.POSTGRES_PASSWORD || 'safekids_password123',
});

async function fixSafeZonesForeignKey() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 CORRIGIENDO FOREIGN KEY DE SAFE_ZONES...\n');
    
    await client.query('BEGIN');
    
    // 1. Verificar el constraint actual
    console.log('📋 PASO 1: Verificando constraint actual de safe_zones...');
    const currentConstraint = await client.query(`
      SELECT 
        tc.constraint_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name='safe_zones' 
        AND tc.constraint_type='FOREIGN KEY'
        AND kcu.column_name='family_id'
    `);
    
    if (currentConstraint.rows.length > 0) {
      const constraint = currentConstraint.rows[0];
      console.log(`   Constraint actual: ${constraint.constraint_name}`);
      console.log(`   Apunta a: ${constraint.foreign_table_name}.${constraint.foreign_column_name}`);
      
      if (constraint.foreign_table_name === 'families') {
        console.log('   ⚠️ Constraint apunta a families, necesita corrección');
        
        // 2. Eliminar constraint viejo
        console.log('\n📋 PASO 2: Eliminando constraint viejo...');
        await client.query(`
          ALTER TABLE safe_zones 
          DROP CONSTRAINT ${constraint.constraint_name}
        `);
        console.log('   ✅ Constraint eliminado');
        
        // 3. Crear nuevo constraint apuntando a users
        console.log('\n📋 PASO 3: Creando nuevo constraint...');
        await client.query(`
          ALTER TABLE safe_zones 
          ADD CONSTRAINT safe_zones_family_id_fkey 
          FOREIGN KEY (family_id) REFERENCES users(id) ON DELETE CASCADE
        `);
        console.log('   ✅ Nuevo constraint creado: safe_zones.family_id -> users.id');
        
      } else if (constraint.foreign_table_name === 'users') {
        console.log('   ✅ Constraint ya apunta a users, no necesita corrección');
      }
    } else {
      console.log('   ⚠️ No se encontró constraint de family_id');
      
      // Intentar crear el constraint
      console.log('   ➕ Creando constraint family_id -> users...');
      await client.query(`
        ALTER TABLE safe_zones 
        ADD CONSTRAINT safe_zones_family_id_fkey 
        FOREIGN KEY (family_id) REFERENCES users(id) ON DELETE CASCADE
      `);
      console.log('   ✅ Constraint creado');
    }
    
    // 4. Verificar también la tabla alerts
    console.log('\n📋 PASO 4: Verificando tabla ALERTS...');
    const alertsConstraint = await client.query(`
      SELECT 
        tc.constraint_name,
        ccu.table_name AS foreign_table_name
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name='alerts' 
        AND tc.constraint_type='FOREIGN KEY'
        AND kcu.column_name='family_id'
    `);
    
    if (alertsConstraint.rows.length > 0 && alertsConstraint.rows[0].foreign_table_name === 'families') {
      console.log('   ⚠️ Alerts también apunta a families, corrigiendo...');
      
      await client.query(`
        ALTER TABLE alerts 
        DROP CONSTRAINT ${alertsConstraint.rows[0].constraint_name}
      `);
      
      await client.query(`
        ALTER TABLE alerts 
        ADD CONSTRAINT alerts_family_id_fkey 
        FOREIGN KEY (family_id) REFERENCES users(id) ON DELETE CASCADE
      `);
      console.log('   ✅ Constraint de alerts corregido');
    } else {
      console.log('   ✅ Tabla alerts OK');
    }
    
    // 5. Verificación final
    console.log('\n📋 PASO 5: Verificación final...');
    
    const finalCheck = await client.query(`
      SELECT 
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'family_id'
        AND tc.table_name IN ('children', 'safe_zones', 'alerts')
      ORDER BY tc.table_name
    `);
    
    console.log('   Constraints actuales con family_id:');
    finalCheck.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}.${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`);
    });
    
    await client.query('COMMIT');
    console.log('\n✅ CORRECCIÓN COMPLETADA EXITOSAMENTE!');
    
    // Mostrar estadísticas
    const stats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM children) as children_count,
        (SELECT COUNT(*) FROM safe_zones) as zones_count,
        (SELECT COUNT(*) FROM alerts) as alerts_count
    `);
    
    const s = stats.rows[0];
    console.log('\n📊 ESTADÍSTICAS:');
    console.log(`   👤 Usuarios: ${s.users_count}`);
    console.log(`   👶 Niños: ${s.children_count}`);
    console.log(`   📍 Zonas seguras: ${s.zones_count}`);
    console.log(`   🔔 Alertas: ${s.alerts_count}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  fixSafeZonesForeignKey()
    .then(() => {
      console.log('\n🎉 Script ejecutado exitosamente');
      console.log('📌 Ahora puedes ejecutar las pruebas nuevamente');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Error fatal:', error.message);
      process.exit(1);
    });
}

module.exports = fixSafeZonesForeignKey;