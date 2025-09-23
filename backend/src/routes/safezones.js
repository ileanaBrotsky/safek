// backend/src/routes/safeZones.js - VERSIÓN COMPLETA CORREGIDA
const express = require('express');
const { query } = require('../models/database');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Validaciones
const validateSafeZone = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitud inválida'),
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitud inválida'),
  body('radius')
    .optional()
    .isInt({ min: 50, max: 5000 })
    .withMessage('El radio debe estar entre 50 y 5000 metros'),
  body('zone_type')
    .optional()
    .isIn(['home', 'school', 'family', 'custom'])
    .withMessage('Tipo de zona inválido')
];

// LISTAR ZONAS SEGURAS
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT sz.*, 
              COUNT(DISTINCT csz.child_id) as assigned_children
       FROM safe_zones sz
       LEFT JOIN child_safe_zones csz ON sz.id = csz.safe_zone_id
       WHERE sz.family_id = $1
       GROUP BY sz.id
       ORDER BY sz.created_at DESC`,
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

// OBTENER ZONA SEGURA POR ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT sz.*, 
              array_agg(
                json_build_object(
                  'id', c.id,
                  'name', c.name
                )
              ) FILTER (WHERE c.id IS NOT NULL) as assigned_children
       FROM safe_zones sz
       LEFT JOIN child_safe_zones csz ON sz.id = csz.safe_zone_id
       LEFT JOIN children c ON csz.child_id = c.id
       WHERE sz.id = $1 AND sz.family_id = $2
       GROUP BY sz.id`,
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

    const { 
      name, 
      address, 
      latitude, 
      longitude, 
      radius, 
      zone_type,
      assign_to_children 
    } = req.body;

    // IMPORTANTE: family_id en safe_zones ahora apunta a users.id
    const result = await query(
      `INSERT INTO safe_zones 
       (family_id, name, address, latitude, longitude, radius, zone_type, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
       RETURNING *`,
      [
        req.user.id,  // Este es el ID del usuario de la tabla users
        name.trim(),
        address || null,
        latitude,
        longitude,
        radius || 100,
        zone_type || 'custom'
      ]
    );

    const safeZone = result.rows[0];

    // Si se especificaron niños para asignar
    if (assign_to_children && Array.isArray(assign_to_children)) {
      for (const childId of assign_to_children) {
        // Verificar que el niño pertenece al usuario
        const childCheck = await query(
          'SELECT id FROM children WHERE id = $1 AND family_id = $2',
          [childId, req.user.id]
        );
        
        if (childCheck.rows.length > 0) {
          await query(
            'INSERT INTO child_safe_zones (child_id, safe_zone_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [childId, safeZone.id]
          );
        }
      }
    }

    console.log(`✅ Zona segura creada: ${safeZone.id}`);

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

// ACTUALIZAR ZONA SEGURA
router.put('/:id', authenticateToken, validateSafeZone, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      address, 
      latitude, 
      longitude, 
      radius, 
      zone_type,
      is_active 
    } = req.body;

    // Verificar que la zona pertenece al usuario
    const zoneCheck = await query(
      'SELECT id FROM safe_zones WHERE id = $1 AND family_id = $2',
      [id, req.user.id]
    );

    if (zoneCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Zona segura no encontrada'
      });
    }

    // Construir query dinámico
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      values.push(name.trim());
      paramCount++;
    }
    if (address !== undefined) {
      updates.push(`address = $${paramCount}`);
      values.push(address);
      paramCount++;
    }
    if (latitude !== undefined) {
      updates.push(`latitude = $${paramCount}`);
      values.push(latitude);
      paramCount++;
    }
    if (longitude !== undefined) {
      updates.push(`longitude = $${paramCount}`);
      values.push(longitude);
      paramCount++;
    }
    if (radius !== undefined) {
      updates.push(`radius = $${paramCount}`);
      values.push(radius);
      paramCount++;
    }
    if (zone_type !== undefined) {
      updates.push(`zone_type = $${paramCount}`);
      values.push(zone_type);
      paramCount++;
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount}`);
      values.push(is_active);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay datos para actualizar'
      });
    }

    updates.push('updated_at = NOW()');
    values.push(id);

    const result = await query(
      `UPDATE safe_zones 
       SET ${updates.join(', ')} 
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

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

    console.log('✅ Zona segura eliminada:', id);

    res.json({
      success: true,
      message: 'Zona segura eliminada exitosamente',
      data: {
        deleted_zone: result.rows[0]
      }
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

// ASIGNAR/DESASIGNAR NIÑOS A ZONA
router.post('/:id/assign-children', authenticateToken, async (req, res) => {
  const client = await query.pool?.connect() || await require('../models/database').pool.connect();
  
  try {
    const { id } = req.params;
    const { children_ids, action = 'assign' } = req.body;

    if (!Array.isArray(children_ids) || children_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar un array de IDs de niños'
      });
    }

    await client.query('BEGIN');

    // Verificar que la zona pertenece al usuario
    const zoneCheck = await client.query(
      'SELECT id, name FROM safe_zones WHERE id = $1 AND family_id = $2',
      [id, req.user.id]
    );

    if (zoneCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Zona segura no encontrada'
      });
    }

    const results = {
      assigned: [],
      unassigned: [],
      errors: []
    };

    for (const childId of children_ids) {
      // Verificar que el niño pertenece al usuario
      const childCheck = await client.query(
        'SELECT id, name FROM children WHERE id = $1 AND family_id = $2',
        [childId, req.user.id]
      );

      if (childCheck.rows.length === 0) {
        results.errors.push({ 
          child_id: childId, 
          error: 'Niño no encontrado o no autorizado' 
        });
        continue;
      }

      const childName = childCheck.rows[0].name;

      if (action === 'assign') {
        // Asignar niño a zona
        try {
          await client.query(
            'INSERT INTO child_safe_zones (child_id, safe_zone_id) VALUES ($1, $2)',
            [childId, id]
          );
          results.assigned.push({ id: childId, name: childName });
        } catch (err) {
          if (err.code === '23505') { // Duplicate key
            results.errors.push({ 
              child_id: childId, 
              name: childName,
              error: 'Ya asignado a esta zona' 
            });
          } else {
            throw err;
          }
        }
      } else if (action === 'unassign') {
        // Desasignar niño de zona
        const deleteResult = await client.query(
          'DELETE FROM child_safe_zones WHERE child_id = $1 AND safe_zone_id = $2',
          [childId, id]
        );
        
        if (deleteResult.rowCount > 0) {
          results.unassigned.push({ id: childId, name: childName });
        } else {
          results.errors.push({ 
            child_id: childId, 
            name: childName,
            error: 'No estaba asignado a esta zona' 
          });
        }
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Operación completada para zona "${zoneCheck.rows[0].name}"`,
      data: results
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error asignando niños a zona:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

// VERIFICAR SI UN NIÑO ESTÁ EN ZONA SEGURA
router.get('/check-location/:childId', authenticateToken, async (req, res) => {
  try {
    const { childId } = req.params;
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar latitud y longitud'
      });
    }

    // Verificar que el niño pertenece al usuario
    const childCheck = await query(
      'SELECT id FROM children WHERE id = $1 AND family_id = $2',
      [childId, req.user.id]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Niño no encontrado'
      });
    }

    // Obtener zonas asignadas al niño y verificar si está dentro
    // Usando la fórmula de Haversine para calcular distancia
    const result = await query(
      `SELECT 
        sz.id,
        sz.name,
        sz.zone_type,
        sz.latitude,
        sz.longitude,
        sz.radius,
        (
          6371000 * acos(
            cos(radians($1)) * cos(radians(sz.latitude)) * 
            cos(radians(sz.longitude) - radians($2)) + 
            sin(radians($1)) * sin(radians(sz.latitude))
          )
        ) as distance
      FROM safe_zones sz
      JOIN child_safe_zones csz ON sz.id = csz.safe_zone_id
      WHERE csz.child_id = $3 
        AND sz.is_active = true
        AND sz.family_id = $4`,
      [parseFloat(lat), parseFloat(lng), childId, req.user.id]
    );

    const zonesStatus = result.rows.map(zone => ({
      id: zone.id,
      name: zone.name,
      type: zone.zone_type,
      is_inside: zone.distance <= zone.radius,
      distance: Math.round(zone.distance),
      radius: zone.radius
    }));

    const insideZones = zonesStatus.filter(z => z.is_inside);

    res.json({
      success: true,
      data: {
        is_in_safe_zone: insideZones.length > 0,
        zones_status: zonesStatus,
        inside_zones: insideZones,
        location: { lat: parseFloat(lat), lng: parseFloat(lng) }
      }
    });

  } catch (error) {
    console.error('Error verificando ubicación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// VERIFICAR SI UNA UBICACIÓN ESTÁ EN ALGUNA ZONA (sin childId específico)
router.post('/check', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar latitud y longitud'
      });
    }

    // Obtener todas las zonas de la familia y verificar distancia
    const result = await query(
      `SELECT 
        id,
        name,
        zone_type,
        latitude,
        longitude,
        radius,
        (
          6371000 * acos(
            cos(radians($1)) * cos(radians(latitude)) * 
            cos(radians(longitude) - radians($2)) + 
            sin(radians($1)) * sin(radians(latitude))
          )
        ) as distance
      FROM safe_zones
      WHERE family_id = $3 AND is_active = true`,
      [latitude, longitude, req.user.id]
    );

    const zonesStatus = result.rows.map(zone => ({
      id: zone.id,
      name: zone.name,
      type: zone.zone_type,
      is_inside: zone.distance <= zone.radius,
      distance: Math.round(zone.distance),
      radius: zone.radius
    }));

    const insideZones = zonesStatus.filter(z => z.is_inside);

    res.json({
      success: true,
      data: {
        is_in_safe_zone: insideZones.length > 0,
        zones_checked: zonesStatus.length,
        inside_zones: insideZones,
        all_zones: zonesStatus
      }
    });

  } catch (error) {
    console.error('Error verificando ubicación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
