// backend/scripts/check-table-structure.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'safekids_db',
  user: process.env.POSTGRES_USER || 'safekids_user',
  password: process.env.POSTGRES_PASSWORD || 'safekids_password123',
});

async function checkTableStructure() {
  console.log('🔍 Verificando estructura real de la base de datos...');
  
  try {
    const client = await pool.connect();
    
    // 1. Verificar todas las tablas
    console.log('\n📋 TODAS LAS TABLAS:');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    tables.rows.forEach(row => {
      console.log(`  ${row.table_name}`);
    });
    
    // 2. Verificar estructura de children
    console.log('\n📋 ESTRUCTURA DE TABLA CHILDREN:');
    const childrenColumns = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'children'
      ORDER BY ordinal_position
    `);
    
    if (childrenColumns.rows.length === 0) {
      console.log('❌ La tabla children no existe');
    } else {
      childrenColumns.rows.forEach(row => {
        console.log(`  ${row.column_name.padEnd(20)} ${row.data_type.padEnd(15)} ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} ${row.column_default || ''}`);
      });
    }
    
    // 3. Verificar constraints de children
    console.log('\n🔗 CONSTRAINTS DE CHILDREN:');
    const constraints = await client.query(`
      SELECT 
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        LEFT JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name='children'
    `);
    
    if (constraints.rows.length === 0) {
      console.log('  No hay constraints definidos');
    } else {
      constraints.rows.forEach(row => {
        const type = row.constraint_type === 'FOREIGN KEY' ? 'FK' :
                     row.constraint_type === 'PRIMARY KEY' ? 'PK' :
                     row.constraint_type === 'UNIQUE' ? 'UQ' : row.constraint_type;
        
        if (row.foreign_table_name) {
          console.log(`  ${row.constraint_name} (${type}): ${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`);
        } else {
          console.log(`  ${row.constraint_name} (${type}): ${row.column_name}`);
        }
      });
    }
    
    // 4. Verificar estructura de users
    console.log('\n📋 ESTRUCTURA DE TABLA USERS:');
    const usersColumns = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    if (usersColumns.rows.length === 0) {
      console.log('❌ La tabla users no existe');
    } else {
      usersColumns.rows.forEach(row => {
        console.log(`  ${row.column_name.padEnd(20)} ${row.data_type.padEnd(15)} ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
    }
    
    // 5. Verificar si hay datos en users
    console.log('\n👥 USUARIOS EXISTENTES:');
    const users = await client.query('SELECT id, name, email FROM users ORDER BY id');
    
    if (users.rows.length === 0) {
      console.log('  No hay usuarios');
    } else {
      users.rows.forEach(row => {
        console.log(`  ${row.id}: ${row.name} (${row.email})`);
      });
    }
    
    // 6. Verificar si hay datos en children
    console.log('\n👶 CHILDREN EXISTENTES:');
    try {
      const children = await client.query('SELECT id, name, user_id, family_id FROM children ORDER BY id');
      
      if (children.rows.length === 0) {
        console.log('  No hay children');
      } else {
        children.rows.forEach(row => {
          console.log(`  ${row.id}: ${row.name} (user_id: ${row.user_id || 'NULL'}, family_id: ${row.family_id || 'NULL'})`);
        });
      }
    } catch (error) {
      console.log(`  Error consultando children: ${error.message}`);
    }
    
    client.release();
    
    console.log('\n✅ Verificación de estructura completada');
    
  } catch (error) {
    console.error('❌ Error verificando estructura:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar verificación
if (require.main === module) {
  checkTableStructure()
    .then(() => {
      console.log('\n🏁 Verificación completada');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Error fatal:', error.message);
      process.exit(1);
    });
}

module.exports = checkTableStructure;