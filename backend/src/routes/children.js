// backend/src/routes/children.js
const express = require('express');
const { query } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Obtener todos los niños de la familia
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        c.id, c.uuid, c.name, c.age, c.device_id, c.risk_level,
        c.max_screen_time, c.max_social_time, c.bedtime_hour,
        c.created_at, c.is_active,
        COALESCE(
          (SELECT json_build_object(
            'latitude', cl.latitude,
            'longitude', cl.longitude, 
            'address', cl.address,
            'timestamp', cl.timestamp,
            'accuracy', cl.accuracy
          )
          FROM child_locations cl 
          WHERE cl.child_id = c.id 
          ORDER BY cl.timestamp DESC 
          LIMIT 1), 
          '{}'::json
        ) as last_location
      FROM children c 
      WHERE c.family_id = $1 AND c.is_active = true
      ORDER BY c.name
    `, [req.familyId]);

    res.json({
      success: true,
      children: result.rows
    });

  } catch (error) {
    console.error('Error obteniendo niños:', error);
    res.status(500).json({
      error: 'Error obteniendo lista de niños'
    });
  }
});

// Obtener un niño específico
router.get('/:childId', authenticateToken, async (req, res) => {
  try {
    const { childId } = req.params;

    const result = await query(`
      SELECT 
        c.*, 
        COUNT(cl.id) as location_count,
        MAX(cl.timestamp) as last_location_time
      FROM children c
      LEFT JOIN child_locations cl ON c.id = cl.child_id
      WHERE c.id = $1 AND c.family_id = $2 AND c.is_active = true
      GROUP BY c.id
    `, [childId, req.familyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Niño no encontrado'
      });
    }

    res.json({
      success: true,
      child: result.rows[0]
    });

  } catch (error) {
    console.error('Error obteniendo niño:', error);
    res.status(500).json({
      error: 'Error obteniendo información del niño'
    });
  }
});

// Crear nuevo niño
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, age, deviceId, maxScreenTime = 180, maxSocialTime = 60 } = req.body;

    if (!name || !age || !deviceId) {
      return res.status(400).json({
        error: 'Nombre, edad y device_id son requeridos'
      });
    }

    if (age < 5 || age > 18) {
      return res.status(400).json({
        error: 'Edad debe estar entre 5 y 18 años'
      });
    }

    const result = await query(`
      INSERT INTO children (family_id, name, age, device_id, max_screen_time, max_social_time)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, uuid, name, age, device_id, risk_level, created_at
    `, [req.familyId, name, age, deviceId, maxScreenTime, maxSocialTime]);

    res.status(201).json({
      success: true,
      message: 'Niño registrado correctamente',
      child: result.rows[0]
    });

  } catch (error) {
    if (error.code === '23505') { // Duplicate key
      return res.status(400).json({
        error: 'Este device_id ya está registrado'
      });
    }
    
    console.error('Error creando niño:', error);
    res.status(500).json({
      error: 'Error registrando el niño'
    });
  }
});

// Ruta de test (sin autenticación)
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Ruta de children funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});
// Actualizar un niño existente
router.put('/:childId', authenticateToken, async (req, res) => {
  try {
    const { childId } = req.params;
    const { name, age, deviceId, maxScreenTime, maxSocialTime, bedtimeHour } = req.body;

    if (!name || !age) {
      return res.status(400).json({
        error: 'Nombre y edad son requeridos'
      });
    }

    if (age < 5 || age > 18) {
      return res.status(400).json({
        error: 'Edad debe estar entre 5 y 18 años'
      });
    }

    const result = await query(`
      UPDATE children 
      SET name = $1, age = $2, device_id = $3, max_screen_time = $4, 
          max_social_time = $5, bedtime_hour = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 AND family_id = $8
      RETURNING id, uuid, name, age, device_id, max_screen_time, max_social_time, bedtime_hour, risk_level, updated_at
    `, [name, age, deviceId, maxScreenTime || 180, maxSocialTime || 60, bedtimeHour || '22:00', childId, req.familyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Niño no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Niño actualizado correctamente',
      child: result.rows[0]
    });

  } catch (error) {
    if (error.code === '23505') { // Duplicate key
      return res.status(400).json({
        error: 'Este device_id ya está en uso por otro niño'
      });
    }
    
    console.error('Error actualizando niño:', error);
    res.status(500).json({
      error: 'Error actualizando el niño'
    });
  }
});

// Eliminar un niño
router.delete('/:childId', authenticateToken, async (req, res) => {
  try {
    const { childId } = req.params;

    // Verificar que el niño existe y pertenece a la familia
    const checkResult = await query(
      'SELECT id, name FROM children WHERE id = $1 AND family_id = $2',
      [childId, req.familyId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Niño no encontrado'
      });
    }

    const childName = checkResult.rows[0].name;

    // Eliminar el niño (cascade eliminará ubicaciones y alertas relacionadas)
    await query('DELETE FROM children WHERE id = $1 AND family_id = $2', [childId, req.familyId]);

    res.json({
      success: true,
      message: `${childName} ha sido eliminado correctamente`
    });

  } catch (error) {
    console.error('Error eliminando niño:', error);
    res.status(500).json({
      error: 'Error eliminando el niño'
    });
  }
});
module.exports = router;