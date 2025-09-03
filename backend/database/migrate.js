// backend/database/migrate.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/models/database');

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  try {
    console.log('Iniciando migraciones de base de datos...');

    // Crear tabla de migraciones si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Leer archivos de migración
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`Encontradas ${migrationFiles.length} migraciones`);

    for (const file of migrationFiles) {
      // Verificar si ya se ejecutó
      const existing = await pool.query(
        'SELECT id FROM migrations WHERE filename = $1',
        [file]
      );

      if (existing.rows.length > 0) {
        console.log(`⏭️  Saltando ${file} (ya ejecutada)`);
        continue;
      }

      console.log(`🔄 Ejecutando ${file}...`);

      // Leer y ejecutar migración
      const migrationSQL = fs.readFileSync(
        path.join(migrationsDir, file), 
        'utf8'
      );

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(migrationSQL);
        await client.query(
          'INSERT INTO migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✅ ${file} ejecutada correctamente`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    console.log('🎉 Todas las migraciones completadas');

  } catch (error) {
    console.error('❌ Error ejecutando migraciones:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;