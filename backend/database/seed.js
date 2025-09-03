// backend/database/seed.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const { query } = require('../src/models/database');

async function seedDatabase() {
  try {
    console.log('🌱 Iniciando seed de la base de datos...');

    // Crear familia de prueba
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    const familyResult = await query(`
      INSERT INTO families (name, email, password_hash, phone, timezone)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `, ['Familia García', 'garcia@ejemplo.com', hashedPassword, '+54299123456', 'America/Argentina/Buenos_Aires']);

    let familyId;
    if (familyResult.rows.length > 0) {
      familyId = familyResult.rows[0].id;
      console.log('👨‍👩‍👧‍👦 Familia de prueba creada:', familyId);
    } else {
      // Si ya existe, obtener el ID
      const existingFamily = await query(
        'SELECT id FROM families WHERE email = $1',
        ['garcia@ejemplo.com']
      );
      familyId = existingFamily.rows[0].id;
      console.log('👨‍👩‍👧‍👦 Usando familia existente:', familyId);
    }

    // Crear niños de prueba
    const children = [
      { name: 'María García', age: 14, device_id: 'device_maria_001', risk_level: 'low' },
      { name: 'Carlos García', age: 12, device_id: 'device_carlos_002', risk_level: 'medium' },
      { name: 'Ana García', age: 15, device_id: 'device_ana_003', risk_level: 'high' }
    ];

    for (const child of children) {
      const childResult = await query(`
        INSERT INTO children (family_id, name, age, device_id, risk_level, max_screen_time, max_social_time)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (device_id) DO NOTHING
        RETURNING id, name
      `, [familyId, child.name, child.age, child.device_id, child.risk_level, 180, 60]);

      if (childResult.rows.length > 0) {
        console.log(`👶 Niño creado: ${childResult.rows[0].name}`);
      }
    }

    // Crear zonas seguras de prueba
    const safeZones = [
      {
        name: 'Casa Familiar',
        address: 'Av. Argentina 123, Neuquén',
        lat: -38.9473,
        lng: -68.0626,
        radius: 100,
        type: 'home'
      },
      {
        name: 'Colegio San Patricio', 
        address: 'Calle San Martín 456, Neuquén',
        lat: -38.9516,
        lng: -68.0591,
        radius: 150,
        type: 'school'
      }
    ];

    for (const zone of safeZones) {
      await query(`
        INSERT INTO safe_zones (family_id, name, address, latitude, longitude, radius, zone_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [familyId, zone.name, zone.address, zone.lat, zone.lng, zone.radius, zone.type]);
      
      console.log(`🏠 Zona segura creada: ${zone.name}`);
    }

    console.log('✅ Seed completado exitosamente!');

  } catch (error) {
    console.error('❌ Error en seed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;