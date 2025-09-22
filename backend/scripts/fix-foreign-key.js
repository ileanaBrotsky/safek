// backend/scripts/fix-foreign-key.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'safekids_db',
  user: process.env.POSTGRES_USER || 'safekids_user',
  password: process.env.POSTGRES_PASSWORD || 'safekids_password123',
});

async function fixForeignKey() {
  console.log('🔧 Corrigiendo foreign key constraint...');
  
  try {
    const client = await pool.connect();
    
    // 1. Verificar qué tablas existen
    console.log('🔍 Verificando tablas existentes...');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'families')
      ORDER BY table_name
    `);
    
    const tableNames = tables.rows.map(row => row.table_name);
    console.log('📋 Tablas encontradas:', tableNames);
    
    const hasUsers = tableNames.includes('users');
    const hasFamilies = tableNames.includes('families');
    
    // 2. Verificar el constraint actual
    console.log('\n🔍 Verificando constraint actual...');
    const currentConstraint = await client.query(`
      SELECT 
        tc.constraint_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name='children' 
      AND tc.constraint_type='FOREIGN KEY'
      AND tc.constraint_name LIKE '%family_id%'
    `);
    
    if (currentConstraint.rows.length > 0) {
      const constraint = currentConstraint.rows[0];
      console.log(`📋 Constraint actual: ${constraint.constraint_name} -> ${constraint.foreign_table_name}.${constraint.foreign_column_name}`);
      
      // 3. Si apunta a 'families' pero solo existe 'users', corregir
      if (constraint.foreign_table_name === 'families' && hasUsers && !hasFamilies) {
        console.log('\n🔧 Corrigiendo foreign key de families a users...');
        
        // Eliminar constraint actual
        await client.query(`
          ALTER TABLE children 
          DROP CONSTRAINT ${constraint.constraint_name}
        `);
        console.log('✅ Constraint anterior eliminado');
        
        // Crear nuevo constraint apuntando a users
        await client.query(`
          ALTER TABLE children 
          ADD CONSTRAINT children_family_id_fkey 
          FOREIGN KEY (family_id) REFERENCES users(id) ON DELETE CASCADE
        `);
        console.log('✅ Nuevo constraint creado apuntando a users');
        
      } else if (constraint.foreign_table_name === 'users') {
        console.log('✅ Constraint ya apunta a users, no necesita corrección');
      } else {
        console.log(`⚠️ Constraint apunta a ${constraint.foreign_table_name}, verificar manualmente`);
      }
    } else {
      console.log('⚠️ No se encontró constraint de family_id');
      
      // Crear constraint si no existe
      if (hasUsers) {
        console.log('\n➕ Creando constraint family_id -> users...');
        await client.query(`
          ALTER TABLE children 
          ADD CONSTRAINT children_family_id_fkey 
          FOREIGN KEY (family_id) REFERENCES users(id) ON DELETE CASCADE
        `);
        console.log('✅ Constraint creado');
      }
    }
    
    // 4. Verificar constraint final
    console.log('\n🔍 Verificando constraint final...');
    const finalConstraint = await client.query(`
      SELECT 
        tc.constraint_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name='children' 
      AND tc.constraint_type='FOREIGN KEY'
      AND tc.constraint_name LIKE '%family_id%'
    `);
    
    if (finalConstraint.rows.length > 0) {
      const constraint = finalConstraint.rows[0];
      console.log(`✅ Constraint final: ${constraint.constraint_name} -> ${constraint.foreign_table_name}.${constraint.foreign_column_name}`);
    }
    
    // 5. Probar inserción de child de prueba
    console.log('\n🧪 Probando inserción de child...');
    
    // Verificar si hay usuarios
    const users = await client.query('SELECT id, name FROM users LIMIT 1');
    
    if (users.rows.length > 0) {
      const userId = users.rows[0].id;
      console.log(`📝 Probando inserción con user_id: ${userId}`);
      
      try {
        // Intentar insertar child de prueba
        const testChild = await client.query(`
          INSERT INTO children (family_id, name, age) 
          VALUES ($1, 'Test Child', 10) 
          RETURNING id, name
        `, [userId]);
        
        console.log('✅ Inserción exitosa:', testChild.rows[0]);
        
        // Eliminar child de prueba
        await client.query('DELETE FROM children WHERE name = $1', ['Test Child']);
        console.log('🧹 Child de prueba eliminado');
        
      } catch (insertError) {
        console.log('❌ Error en inserción de prueba:', insertError.message);
      }
    } else {
      console.log('⚠️ No hay usuarios para probar inserción');
    }
    
    client.release();
    console.log('\n✅ Corrección de foreign key completada');
    
  } catch (error) {
    console.error('❌ Error corrigiendo foreign key:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar corrección
if (require.main === module) {
  fixForeignKey()
    .then(() => {
      console.log('\n🎉 Foreign key corregido exitosamente');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Error fatal:', error.message);
      process.exit(1);
    });
}

module.exports = fixForeignKey;