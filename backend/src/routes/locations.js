// backend/src/routes/locations.js
const express = require('express');
const { query } = require('../models/database');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Validaciones corregidas para locations
const validateLocation = [
  body('child_id')
    .isInt({ min: 1 })
    .withMessage('ID de child inválido'),
  
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitud debe estar entre -90 y 90'),
  
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitud debe estar entre -180 y 180'),
  
  body('address')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Dirección muy larga'),
  
  body('battery_level')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Nivel de batería debe estar entre 0 y 100'),
  
  body('accuracy')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Precisión debe ser un número positivo')
];

// REGISTRAR NUEVA UBICACIÓN
router.post('/', authenticateToken, validateLocation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array()
      });
    }

    const { child_id, latitude, longitude, address, battery_level, accuracy } = req.body;

    // Verificar que el child pertenece al usuario
    const childCheck = await query(
      'SELECT id, name FROM children WHERE id = $1 AND family_id = $2',
      [child_id, req.user.id]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Child no encontrado o no autorizado'
      });
    }

    const child = childCheck.rows[0]; // ✅ CORREGIDO: definir child

    // Insertar nueva ubicación
    const result = await query(
      `INSERT INTO locations (child_id, latitude, longitude, address, battery_level, accuracy, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, child_id, latitude, longitude, address, battery_level, accuracy, timestamp`,
      [child_id, latitude, longitude, address, battery_level, accuracy]
    );

    const location = result.rows[0];

    console.log('Ubicación registrada:', location.id);

    // Emitir actualización de ubicación via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      wsService.emitLocationUpdate(req.user.id, {
        childId: child_id,
        childName: child.name, // ✅ CORREGIDO: ahora child está definido
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address,
          battery_level: location.battery_level,
          accuracy: location.accuracy,
          timestamp: location.timestamp
        }
      });
    }

    // Verificar zonas seguras (Geofencing básico)
    await checkSafeZones(child_id, latitude, longitude, req.user.id, wsService);

    // Verificar nivel de batería crítico
    if (battery_level && battery_level <= 15) {
      await createLowBatteryAlert(child_id, battery_level, req.user.id, wsService);
    }

    res.status(201).json({
      success: true,
      message: 'Ubicación registrada exitosamente',
      data: { location }
    });

  } catch (error) {
    console.error('Error registrando ubicación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// OBTENER UBICACIONES DE UN CHILD
router.get('/child/:childId', authenticateToken, async (req, res) => {
  try {
    const { childId } = req.params;
    const { limit = 50, hours = 24 } = req.query;

    const childCheck = await query(
      'SELECT id, name FROM children WHERE id = $1 AND family_id = $2',
      [childId, req.user.id]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Child no encontrado'
      });
    }

    const result = await query(
      `SELECT id, latitude, longitude, address, battery_level, accuracy, timestamp
       FROM locations 
       WHERE child_id = $1 
         AND timestamp >= NOW() - INTERVAL '${hours} hours'
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [childId, limit]
    );

    res.json({
      success: true,
      message: 'Ubicaciones obtenidas exitosamente',
      data: {
        child: childCheck.rows[0],
        locations: result.rows,
        total: result.rowCount
      }
    });

  } catch (error) {
    console.error('Error obteniendo ubicaciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// OBTENER ÚLTIMA UBICACIÓN DE UN CHILD
router.get('/child/:childId/latest', authenticateToken, async (req, res) => {
  try {
    const { childId } = req.params;

    const result = await query(
      `SELECT l.id, l.latitude, l.longitude, l.address, l.battery_level, 
              l.accuracy, l.timestamp, c.name as child_name
       FROM locations l
       JOIN children c ON l.child_id = c.id
       WHERE l.child_id = $1 AND c.family_id = $2
       ORDER BY l.timestamp DESC
       LIMIT 1`,
      [childId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron ubicaciones para este child'
      });
    }

    res.json({
      success: true,
      message: 'Última ubicación obtenida exitosamente',
      data: { location: result.rows[0] }
    });

  } catch (error) {
    console.error('Error obteniendo última ubicación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// OBTENER UBICACIONES DE TODA LA FAMILIA
router.get('/family', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT ON (c.id) 
              c.id as child_id, c.name as child_name,
              l.id as location_id, l.latitude, l.longitude, l.address,
              l.battery_level, l.accuracy, l.timestamp
       FROM children c
       LEFT JOIN locations l ON c.id = l.child_id
       WHERE c.family_id = $1 AND c.is_active = true
       ORDER BY c.id, l.timestamp DESC`,
      [req.user.id]
    );

    const familyLocations = result.rows.map(row => ({
      child: {
        id: row.child_id,
        name: row.child_name
      },
      lastLocation: row.location_id ? {
        id: row.location_id,
        latitude: row.latitude,
        longitude: row.longitude,
        address: row.address,
        battery_level: row.battery_level,
        accuracy: row.accuracy,
        timestamp: row.timestamp
      } : null
    }));

    res.json({
      success: true,
      message: 'Ubicaciones familiares obtenidas exitosamente',
      data: {
        family_locations: familyLocations,
        total_children: familyLocations.length
      }
    });

  } catch (error) {
    console.error('Error obteniendo ubicaciones familiares:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// OBTENER HISTORIAL DE UBICACIONES
router.get('/history/:childId', authenticateToken, async (req, res) => {
  try {
    const { childId } = req.params;
    const { 
      start_date, 
      end_date, 
      limit = 100,
      page = 1 
    } = req.query;

    const childCheck = await query(
      'SELECT id, name FROM children WHERE id = $1 AND family_id = $2',
      [childId, req.user.id]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Child no encontrado'
      });
    }

    let whereClause = 'WHERE child_id = $1';
    let queryParams = [childId];
    let paramCount = 1;

    if (start_date) {
      paramCount++;
      whereClause += ` AND timestamp >= $${paramCount}`;
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereClause += ` AND timestamp <= $${paramCount}`;
      queryParams.push(end_date);
    }

    const offset = (page - 1) * limit;
    
    const result = await query(
      `SELECT id, latitude, longitude, address, battery_level, accuracy, timestamp
       FROM locations 
       ${whereClause}
       ORDER BY timestamp DESC 
       LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...queryParams, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM locations ${whereClause}`,
      queryParams
    );

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      message: 'Historial obtenido exitosamente',
      data: {
        child: childCheck.rows[0],
        locations: result.rows,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_records: total,
          limit: parseInt(limit)
        },
        filters: {
          start_date,
          end_date
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

// *** FUNCIONES AUXILIARES PARA GEOFENCING ***

async function checkSafeZones(childId, latitude, longitude, familyId, wsService) {
  try {
    const safeZones = await query(
      'SELECT id, name, latitude, longitude, radius FROM safe_zones WHERE family_id = $1 AND is_active = true',
      [familyId]
    );

    for (const zone of safeZones.rows) {
      const distance = calculateDistance(
        latitude, longitude,
        parseFloat(zone.latitude), parseFloat(zone.longitude)
      );

      const isInside = distance <= zone.radius;

      const lastStatus = await query(
        `SELECT inside_zone FROM child_zone_status 
         WHERE child_id = $1 AND zone_id = $2 
         ORDER BY created_at DESC LIMIT 1`,
        [childId, zone.id]
      );

      const wasInside = lastStatus.rows.length > 0 ? lastStatus.rows[0].inside_zone : false;

      if (isInside !== wasInside) {
        await query(
          `INSERT INTO child_zone_status (child_id, zone_id, inside_zone, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [childId, zone.id, isInside]
        );

        const alertType = isInside ? 'safe_zone_enter' : 'safe_zone_exit';
        const alertTitle = isInside ? 'Entrada a zona segura' : 'Salida de zona segura';
        const alertMessage = `El niño ${isInside ? 'ha entrado a' : 'ha salido de'} la zona segura "${zone.name}"`;

        const alertResult = await query(
          `INSERT INTO alerts (family_id, child_id, alert_type, title, message, severity, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           RETURNING id, alert_type, title, message, severity, created_at`,
          [familyId, childId, alertType, alertTitle, alertMessage, isInside ? 'low' : 'high']
        );

        if (wsService) {
          wsService.emitSafeZoneViolation(familyId, {
            childId,
            zoneId: zone.id,
            zoneName: zone.name,
            alertType,
            isInside,
            location: { latitude, longitude }
          });

          wsService.emitAlert(familyId, alertResult.rows[0]);
        }

        console.log(`${alertType} detectado - Child: ${childId}, Zone: ${zone.name}`);
      }
    }
  } catch (error) {
    console.error('Error en verificación de zonas seguras:', error);
  }
}

async function createLowBatteryAlert(childId, batteryLevel, familyId, wsService) {
  try {
    const childInfo = await query(
      'SELECT name FROM children WHERE id = $1',
      [childId]
    );

    if (childInfo.rows.length === 0) return;

    const childName = childInfo.rows[0].name;
    const alertResult = await query(
      `INSERT INTO alerts (family_id, child_id, alert_type, title, message, severity, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, alert_type, title, message, severity, created_at`,
      [
        familyId, 
        childId, 
        'low_battery', 
        'Batería baja',
        `El dispositivo de ${childName} tiene ${batteryLevel}% de batería`,
        'medium'
      ]
    );

    if (wsService) {
      wsService.emitAlert(familyId, alertResult.rows[0]);
    }

    console.log(`Alerta de batería baja - Child: ${childId}, Battery: ${batteryLevel}%`);
  } catch (error) {
    console.error('Error creando alerta de batería baja:', error);
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

module.exports = router;
