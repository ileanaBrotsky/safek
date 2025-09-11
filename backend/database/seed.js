// backend/database/seed.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const { query } = require('../src/models/database');

async function seedDatabase() {
  try {
    console.log('🌱 Iniciando seed de la base de datos...');

    // Crear usuario de prueba EN AMBAS TABLAS
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    // PRIMERO en users
    const userResult = await query(`
      INSERT INTO users (name, email, password_hash, phone, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `, ['Familia García', 'garcia@ejemplo.com', hashedPassword, '+54299123456']);

    let userId;
    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
      console.log('👤 Usuario de prueba creado:', userId);
    } else {
      // Si ya existe, obtener el ID
      const existingUser = await query(
        'SELECT id FROM users WHERE email = $1',
        ['garcia@ejemplo.com']
      );
      userId = existingUser.rows[0].id;
      console.log('👤 Usando usuario existente:', userId);
    }

    // DESPUÉS en families (con el mismo ID)
    await query(`
      INSERT INTO families (id, name, email, password_hash, phone, timezone, created_at, updated_at, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), true)
      ON CONFLICT (id) DO NOTHING
    `, [userId, 'Familia García', 'garcia@ejemplo.com', hashedPassword, '+54299123456', 'America/Argentina/Buenos_Aires']);

    console.log('👨‍👩‍👧‍👦 Familia sincronizada con ID:', userId);

    // Crear niños de prueba (usando el ID del usuario/familia)
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
      `, [userId, child.name, child.age, child.device_id, child.risk_level, 180, 60]);

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
      `, [userId, zone.name, zone.address, zone.lat, zone.lng, zone.radius, zone.type]);
      
      console.log(`🏠 Zona segura creada: ${zone.name}`);
    }

    console.log('✅ Seed completado exitosamente!');

  } catch (error) {
    console.error('❌ Error en seed:', error);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  seedDatabase().then(() => process.exit(0));
}

module.exports = seedDatabase;
