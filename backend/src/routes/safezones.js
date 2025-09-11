// backend/src/routes/safeZones.js
const express = require('express');
const { query } = require('../models/database');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Validaciones para zona segura
const validateSafeZone = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitud debe estar entre -90 y 90'),
  
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitud debe estar entre -180 y 180'),
  
  body('radius')
    .isInt({ min: 10, max: 5000 })
    .withMessage('Radio debe estar entre 10 y 5000 metros')
];

// LISTAR ZONAS SEGURAS
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { active_only = 'true' } = req.query;

    let whereClause = 'WHERE family_id = $1';
    if (active_only === 'true') {
      whereClause += ' AND is_active = true';
    }

    const result = await query(
      `SELECT id, name, latitude, longitude, radius, is_active, created_at, updated_at
       FROM safe_zones 
       ${whereClause}
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'Zonas seguras obtenidas exitosamente',
      data: {
        safe_zones: result.rows,
        total: result.rowCount
      }
    });

  } catch (error) {
    console.error('Error obteniendo zonas seguras:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// CREAR ZONA SEGURA
router.post('/', authenticateToken, validateSafeZone, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array()
      });
    }

    const { name, latitude, longitude, radius } = req.body;

    const result = await query(
      `INSERT INTO safe_zones (family_id, name, latitude, longitude, radius, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, name, latitude, longitude, radius, is_active, created_at`,
      [req.user.id, name.trim(), latitude, longitude, radius]
    );

    const safeZone = result.rows[0];

    console.log('Zona segura creada:', safeZone.id);

    res.status(201).json({
      success: true,
      message: 'Zona segura creada exitosamente',
      data: { safe_zone: safeZone }
    });

  } catch (error) {
    console.error('Error creando zona segura:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// OBTENER ZONA SEGURA POR ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, name, latitude, longitude, radius, is_active, created_at, updated_at
       FROM safe_zones 
       WHERE id = $1 AND family_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Zona segura no encontrada'
      });
    }

    res.json({
      success: true,
      data: { safe_zone: result.rows[0] }
    });

  } catch (error) {
    console.error('Error obteniendo zona segura:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ACTUALIZAR ZONA SEGURA
router.put('/:id', authenticateToken, validateSafeZone, async (req, res) => {
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
    const { name, latitude, longitude, radius, is_active } = req.body;

    const result = await query(
      `UPDATE safe_zones 
       SET name = $1, latitude = $2, longitude = $3, radius = $4, 
           is_active = $5, updated_at = NOW()
       WHERE id = $6 AND family_id = $7
       RETURNING id, name, latitude, longitude, radius, is_active, updated_at`,
      [name?.trim(), latitude, longitude, radius, is_active !== undefined ? is_active : true, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Zona segura no encontrada'
      });
    }

    console.log('Zona segura actualizada:', id);

    res.json({
      success: true,
      message: 'Zona segura actualizada exitosamente',
      data: { safe_zone: result.rows[0] }
    });

  } catch (error) {
    console.error('Error actualizando zona segura:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ELIMINAR ZONA SEGURA
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM safe_zones WHERE id = $1 AND family_id = $2 RETURNING id, name',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Zona segura no encontrada'
      });
    }

    console.log('Zona segura eliminada:', id);

    res.json({
      success: true,
      message: 'Zona segura eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando zona segura:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ALTERNAR ESTADO DE ZONA SEGURA
router.patch('/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE safe_zones 
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 AND family_id = $2
       RETURNING id, name, is_active`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Zona segura no encontrada'
      });
    }

    const safeZone = result.rows[0];

    console.log('Estado de zona segura cambiado:', {
      id: safeZone.id,
      is_active: safeZone.is_active
    });

    res.json({
      success: true,
      message: `Zona segura ${safeZone.is_active ? 'activada' : 'desactivada'} exitosamente`,
      data: { safe_zone: safeZone }
    });

  } catch (error) {
    console.error('Error alternando estado de zona segura:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// VERIFICAR SI UNA UBICACIÓN ESTÁ EN UNA ZONA ESPECÍFICA
router.post('/:id/check', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitud y longitud son requeridas'
      });
    }

    // Obtener la zona segura específica
    const zoneResult = await query(
      'SELECT id, name, latitude, longitude, radius FROM safe_zones WHERE id = $1 AND family_id = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (zoneResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Zona segura no encontrada o inactiva'
      });
    }

    const zone = zoneResult.rows[0];
    const distance = calculateDistance(
      latitude, longitude,
      parseFloat(zone.latitude), parseFloat(zone.longitude)
    );

    const isInside = distance <= zone.radius;

    res.json({
      success: true,
      message: 'Verificación completada',
      data: {
        location: { latitude, longitude },
        zone: {
          id: zone.id,
          name: zone.name,
          radius: zone.radius
        },
        is_inside: isInside,
        distance_meters: Math.round(distance)
      }
    });

  } catch (error) {
    console.error('Error verificando zona específica:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
module.exports = router;
