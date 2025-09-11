// backend/scripts/smart-migrate.js
require('dotenv').config();
const { query } = require('../src/models/database');

async function smartMigrate() {
  try {
    console.log('🔍 Verificando estado de la base de datos...');
    
    // Verificar si las tablas ya existen
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('families', 'children', 'safe_zones', 'alerts')
    `);
    
    const existingTables = tablesResult.rows.map(row => row.table_name);
    console.log('Tablas existentes:', existingTables);
    
    if (existingTables.length > 0) {
      console.log('⚠️ Las tablas ya existen. ¿Deseas recrearlas?');
      console.log('Ejecutando DROP y recreación...');
      
      // Eliminar tablas en orden correcto (por dependencias)
      await query('DROP TABLE IF EXISTS child_safe_zones CASCADE');
      await query('DROP TABLE IF EXISTS alerts CASCADE');
      await query('DROP TABLE IF EXISTS child_locations CASCADE');
      await query('DROP TABLE IF EXISTS safe_zones CASCADE');
      await query('DROP TABLE IF EXISTS children CASCADE');
      await query('DROP TABLE IF EXISTS families CASCADE');
      await query('DROP TABLE IF EXISTS migrations CASCADE');
      
      console.log('✅ Tablas eliminadas correctamente');
    }
    
    // Ahora ejecutar migraciones normalmente
    console.log('📋 Ejecutando migraciones...');
    const runMigrations = require('../database/migrate');
    await runMigrations();
    
    console.log('🌱 Ejecutando seed...');
    const seedDatabase = require('../database/seed');
    await seedDatabase();
    
    console.log('✅ Base de datos inicializada correctamente!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  smartMigrate();
}

module.exports = smartMigrate;