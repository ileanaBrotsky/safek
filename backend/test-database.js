// backend/test-database.js
require('dotenv').config();
const { query } = require('./src/models/database');

async function testDatabase() {
  try {
    console.log('🧪 Probando conexión a la base de datos...');
    
    // Probar conexión básica
    const result = await query('SELECT NOW() as current_time');
    console.log('⏰ Hora actual:', result.rows[0].current_time);
    
    // Contar familias
    const families = await query('SELECT COUNT(*) as count FROM families');
    console.log('👨‍👩‍👧‍👦 Familias en BD:', families.rows[0].count);
    
    // Contar niños
    const children = await query('SELECT COUNT(*) as count FROM children');
    console.log('👶 Niños en BD:', children.rows[0].count);
    
    // Listar niños
    const childrenList = await query('SELECT name, age, risk_level FROM children');
    console.log('📋 Lista de niños:');
    childrenList.rows.forEach(child => {
      console.log(`  - ${child.name} (${child.age} años, riesgo: ${child.risk_level})`);
    });
    
    // Contar zonas seguras
    const zones = await query('SELECT COUNT(*) as count FROM safe_zones');
    console.log('🏠 Zonas seguras:', zones.rows[0].count);
    
    // Listar zonas seguras
    const zonesList = await query('SELECT name, zone_type FROM safe_zones');
    console.log('📋 Lista de zonas seguras:');
    zonesList.rows.forEach(zone => {
      console.log(`  - ${zone.name} (tipo: ${zone.zone_type})`);
    });
    
    console.log('✅ Prueba de base de datos exitosa!');
    
  } catch (error) {
    console.error('❌ Error probando base de datos:', error);
  } finally {
    process.exit(0);
  }
}

testDatabase();