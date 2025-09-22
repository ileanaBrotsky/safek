// backend/scripts/sync-users-families.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'safekids_db',
  user: process.env.POSTGRES_USER || 'safekids_user',
  password: process.env.POSTGRES_PASSWORD || 'safekids_password123',
});

async function syncUsersFamilies() {
  console.log('🔄 Sincronizando usuarios entre tables users y families...');
  
  try {
    const client = await pool.connect();
    
    // 1. Verificar estructura de families
    console.log('🔍 Verificando estructura de families...');
    const familiesColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'families'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Columnas en families:');
    familiesColumns.rows.forEach(row => {
      console.log(`  ${row.column_name} (${row.data_type})`);
    });
    
    // 2. Obtener usuarios que están en users pero no en families
    console.log('\n🔍 Buscando usuarios que faltan en families...');
    const missingUsers = await client.query(`
      SELECT u.id, u.name, u.email, u.password_hash, u.phone, u.created_at, u.updated_at
      FROM users u
      LEFT JOIN families f ON u.id = f.id
      WHERE f.id IS NULL
      ORDER BY u.id
    `);
    
    console.log(`📋 Usuarios faltantes en families: ${missingUsers.rows.length}`);
    
    if (missingUsers.rows.length > 0) {
      console.log('\n📝 Insertando usuarios faltantes en families...');
      
      for (const user of missingUsers.rows) {
        try {
          // Insertar usuario en families usando el mismo ID
          await client.query(`
            INSERT INTO families (id, name, email, password_hash, phone, created_at, updated_at, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, true)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              email = EXCLUDED.email,
              updated_at = EXCLUDED.updated_at
          `, [
            user.id,
            user.name,
            user.email,
            user.password_hash,
            user.phone,
            user.created_at,
            user.updated_at
          ]);
          
          console.log(`  ✅ Usuario ${user.id}: ${user.name} sincronizado`);
          
        } catch (insertError) {
          console.log(`  ❌ Error insertando usuario ${user.id}: ${insertError.message}`);
        }
      }
    } else {
      console.log('✅ Todos los usuarios ya están sincronizados');
    }
    
    // 3. Verificar sincronización
    console.log('\n🔍 Verificando sincronización final...');
    const syncCheck = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM families) as families_count,
        (SELECT COUNT(*) FROM users u JOIN families f ON u.id = f.id) as synced_count
    `);
    
    const { users_count, families_count, synced_count } = syncCheck.rows[0];
    
    console.log(`📊 Estadísticas:
  👥 Users: ${users_count}
  👪 Families: ${families_count}  
  🔄 Sincronizados: ${synced_count}`);
    
    // 4. Probar creación de child con el último usuario
    console.log('\n🧪 Probando creación de child...');
    const lastUser = await client.query('SELECT id, name FROM users ORDER BY id DESC LIMIT 1');
    
    if (lastUser.rows.length > 0) {
      const userId = lastUser.rows[0].id;
      console.log(`📝 Probando con usuario ID: ${userId}`);
      
      try {
        const testChild = await client.query(`
          INSERT INTO children (family_id, name, age) 
          VALUES ($1, 'Test Sync Child', 10) 
          RETURNING id, name, family_id
        `, [userId]);
        
        console.log('✅ Child creado exitosamente:', testChild.rows[0]);
        
        // Eliminar child de prueba
        await client.query('DELETE FROM children WHERE name = $1', ['Test Sync Child']);
        console.log('🧹 Child de prueba eliminado');
        
      } catch (childError) {
        console.log('❌ Error creando child de prueba:', childError.message);
      }
    }
    
    client.release();
    console.log('\n✅ Sincronización completada');
    
  } catch (error) {
    console.error('❌ Error en sincronización:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar sincronización
if (require.main === module) {
  syncUsersFamilies()
    .then(() => {
      console.log('\n🎉 Sincronización de usuarios exitosa');
      console.log('📋 Próximo paso: node tests/test-app-monitoring.js');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Error fatal:', error.message);
      process.exit(1);
    });
}

module.exports = syncUsersFamilies;