// backend/src/routes/children.js
const express = require('express');
const { query } = require('../models/database');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Validaciones corregidas para el esquema existente
const validateChild = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  
  body('age')
    .optional()
    .isInt({ min: 5, max: 18 })
    .withMessage('La edad debe ser entre 5 y 18 años'),
  
  body('device_id')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Device ID muy largo')
];

// LISTAR CHILDREN
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, age, device_id, is_active, risk_level, created_at, updated_at
       FROM children 
       WHERE family_id = $1 
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'Children obtenidos exitosamente',
      data: {
        children: result.rows,
        total: result.rowCount
      }
    });

  } catch (error) {
    console.error('Error obteniendo children:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// CREAR CHILD
router.post('/', authenticateToken, validateChild, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array()
      });
    }

    const { name, age, device_id } = req.body;

    const result = await query(
      `INSERT INTO children (family_id, name, age, device_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, name, age, device_id, is_active, risk_level, created_at`,
      [req.user.id, name.trim(), age || 8, device_id || null]
    );

    const child = result.rows[0];

    console.log('Child creado:', child.id);

    res.status(201).json({
      success: true,
      message: 'Child creado exitosamente',
      data: { child }
    });

  } catch (error) {
    console.error('Error creando child:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// OBTENER CHILD POR ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, name, age, device_id, is_active, risk_level, created_at, updated_at
       FROM children 
       WHERE id = $1 AND family_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Child no encontrado'
      });
    }

    res.json({
      success: true,
      data: { child: result.rows[0] }
    });

  } catch (error) {
    console.error('Error obteniendo child:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// ALTERNAR ESTADO ACTIVO DE CHILD
router.patch('/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE children 
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 AND family_id = $2
       RETURNING id, name, is_active`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Child no encontrado'
      });
    }

    const child = result.rows[0];

    console.log('Estado de child cambiado:', {
      id: child.id,
      is_active: child.is_active
    });

    res.json({
      success: true,
      message: `Child ${child.is_active ? 'activado' : 'desactivado'} exitosamente`,
      data: { child }
    });

  } catch (error) {
    console.error('Error alternando estado de child:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// OBTENER ESTADÍSTICAS DE UN CHILD
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 7 } = req.query;

    // Verificar que el child pertenece al usuario
    const childCheck = await query(
      'SELECT id, name FROM children WHERE id = $1 AND family_id = $2',
      [id, req.user.id]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Child no encontrado'
      });
    }

    // Estadísticas de ubicaciones
    const locationStats = await query(
      `SELECT 
         COUNT(*) as total_locations,
         AVG(battery_level) as avg_battery,
         MIN(battery_level) as min_battery,
         MAX(timestamp) as last_update
       FROM locations 
       WHERE child_id = $1 AND timestamp >= NOW() - INTERVAL '${days} days'`,
      [id]
    );

    // Estadísticas de alertas
    const alertStats = await query(
      `SELECT 
         COUNT(*) as total_alerts,
         COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_alerts,
         COUNT(CASE WHEN is_read = false THEN 1 END) as unread_alerts
       FROM alerts 
       WHERE child_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'`,
      [id]
    );

    res.json({
      success: true,
      message: 'Estadísticas obtenidas exitosamente',
      data: {
        child: childCheck.rows[0],
        period_days: parseInt(days),
        location_stats: locationStats.rows[0],
        alert_stats: alertStats.rows[0]
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ACTUALIZAR CHILD (PUT)
router.put('/:id', authenticateToken, validateChild, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { name, age, device_id } = req.body;

    // Verificar que el child existe y pertenece al usuario
    const existingChild = await query(
      'SELECT id FROM children WHERE id = $1 AND family_id = $2',
      [id, req.user.id]
    );

    if (existingChild.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Child no encontrado'
      });
    }

    // Actualizar child
    const result = await query(
      `UPDATE children 
       SET name = $1, age = $2, device_id = $3, updated_at = NOW()
       WHERE id = $4 AND family_id = $5
       RETURNING id, name, age, device_id, is_active, risk_level, created_at, updated_at`,
      [name.trim(), age || 8, device_id || null, id, req.user.id]
    );

    const child = result.rows[0];

    console.log('Child actualizado:', child.id);

    res.json({
      success: true,
      message: 'Child actualizado exitosamente',
      data: { child }
    });

  } catch (error) {
    console.error('Error actualizando child:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ACTIVAR/DESACTIVAR CHILD (PATCH) - BORRADO LÓGICO
router.patch('/:id/activate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    // Validar que is_active sea boolean
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'is_active debe ser true o false'
      });
    }

    const result = await query(
      `UPDATE children 
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2 AND family_id = $3
       RETURNING id, name, is_active`,
      [is_active, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Child no encontrado'
      });
    }

    const child = result.rows[0];

    console.log('Estado de child cambiado:', {
      id: child.id,
      is_active: child.is_active
    });

    res.json({
      success: true,
      message: `Child ${child.is_active ? 'activado' : 'desactivado'} exitosamente`,
      data: { child }
    });

  } catch (error) {
    console.error('Error cambiando estado de child:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ELIMINAR CHILD (DELETE)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el child existe y pertenece al usuario
    const existingChild = await query(
      'SELECT id, name FROM children WHERE id = $1 AND family_id = $2',
      [id, req.user.id]
    );

    if (existingChild.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Child no encontrado'
      });
    }

    // Verificar si hay datos relacionados que impidan la eliminación
    const relatedData = await query(
      `SELECT 
         (SELECT COUNT(*) FROM locations WHERE child_id = $1) as locations,
         (SELECT COUNT(*) FROM alerts WHERE child_id = $1) as alerts`,
      [id]
    );

    const { locations, alerts } = relatedData.rows[0];
    
    if (parseInt(locations) > 0 || parseInt(alerts) > 0) {
      // En lugar de eliminar, desactivar el child para preservar datos históricos
      const result = await query(
        `UPDATE children 
         SET is_active = false, updated_at = NOW()
         WHERE id = $1 AND family_id = $2
         RETURNING id, name, is_active`,
        [id, req.user.id]
      );

      return res.json({
        success: true,
        message: 'Child desactivado (tiene datos históricos). Para eliminación completa, contacta soporte.',
        data: { 
          child: result.rows[0],
          preserved_data: { locations, alerts }
        }
      });
    }

    // Si no hay datos relacionados, eliminar completamente
    await query(
      'DELETE FROM children WHERE id = $1 AND family_id = $2',
      [id, req.user.id]
    );

    console.log('Child eliminado completamente:', existingChild.rows[0].name);

    res.json({
      success: true,
      message: 'Child eliminado exitosamente',
      data: { 
        deleted_child: existingChild.rows[0]
      }
    });

  } catch (error) {
    console.error('Error eliminando child:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// ===== FUNCIONALIDADES ADICIONALES =====

// OBTENER UBICACIÓN ACTUAL DE UN CHILD
router.get('/:id/location', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el child pertenece al usuario
    const childCheck = await query(
      'SELECT id, name FROM children WHERE id = $1 AND family_id = $2',
      [id, req.user.id]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Child no encontrado'
      });
    }

    // Obtener última ubicación
    const locationResult = await query(
      `SELECT latitude, longitude, accuracy, address, timestamp, created_at
       FROM child_locations 
       WHERE child_id = $1 
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Ubicación obtenida exitosamente',
      data: {
        child: childCheck.rows[0],
        location: locationResult.rows[0] || null,
        has_location: locationResult.rows.length > 0
      }
    });

  } catch (error) {
    console.error('Error obteniendo ubicación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// OBTENER HISTORIAL DE UBICACIONES
router.get('/:id/locations', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0, date } = req.query;

    // Verificar que el child pertenece al usuario
    const childCheck = await query(
      'SELECT id, name FROM children WHERE id = $1 AND family_id = $2',
      [id, req.user.id]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Child no encontrado'
      });
    }

    // Construir query dinámicamente
    let whereClause = 'WHERE child_id = $1';
    let queryParams = [id];
    
    if (date) {
      whereClause += ' AND DATE(timestamp) = $2';
      queryParams.push(date);
    }

    // Obtener ubicaciones
    const locationsResult = await query(
      `SELECT latitude, longitude, accuracy, address, timestamp, created_at
       FROM child_locations 
       ${whereClause}
       ORDER BY timestamp DESC 
       LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    // Contar total
    const countResult = await query(
      `SELECT COUNT(*) as total 
       FROM child_locations 
       ${whereClause}`,
      queryParams
    );

    res.json({
      success: true,
      message: 'Historial de ubicaciones obtenido exitosamente',
      data: {
        child: childCheck.rows[0],
        locations: locationsResult.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          limit: parseInt(limit),
          offset: parseInt(offset),
          has_more: (parseInt(offset) + parseInt(limit)) < parseInt(countResult.rows[0].total)
        }
      }
    });

  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ACTUALIZAR NIVEL DE RIESGO
router.patch('/:id/risk-level', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { risk_level } = req.body;

    // Validar risk_level
    const validRiskLevels = ['low', 'medium', 'high'];
    if (!validRiskLevels.includes(risk_level)) {
      return res.status(400).json({
        success: false,
        message: 'risk_level debe ser: low, medium o high'
      });
    }
    const result = await query(
      `UPDATE children 
       SET risk_level = $1, updated_at = NOW()
       WHERE id = $2 AND family_id = $3
       RETURNING id, name, risk_level`,
      [risk_level, id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Child no encontrado'
      });
    }
    const child = result.rows[0];
    console.log('Nivel de riesgo actualizado:', {
      id: child.id,
      risk_level: child.risk_level
    });
    res.json({
      success: true,
      message: 'Nivel de riesgo actualizado exitosamente',
      data: { child }
    });

  } catch (error) {
    console.error('Error actualizando nivel de riesgo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
module.exports = router;
