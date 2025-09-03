// backend/src/routes/location.js
const express = require('express');
const { query } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Actualizar ubicación de un niño
router.post('/update', async (req, res) => {
  try {
    const { childId, latitude, longitude, accuracy, address, timestamp } = req.body;

    if (!childId || !latitude || !longitude) {
      return res.status(400).json({
        error: 'childId, latitude y longitude son requeridos'
      });
    }

    // Verificar que el niño existe
    const childCheck = await query(
      'SELECT id, family_id, name FROM children WHERE device_id = $1 AND is_active = true',
      [childId]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Dispositivo no registrado'
      });
    }

    const child = childCheck.rows[0];

    // Guardar ubicación
    const locationResult = await query(`
      INSERT INTO child_locations (child_id, latitude, longitude, accuracy, address, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, timestamp
    `, [
      child.id,
      latitude,
      longitude,
      accuracy || null,
      address || null,
      timestamp || new Date()
    ]);

    // Verificar zonas seguras
    const safeZones = await checkSafeZones(child.id, latitude, longitude);

    // Notificar via Socket.IO
    const io = req.app.get('io');
    io.to(`family_${child.family_id}`).emit('location_update', {
      childId: child.id,
      childName: child.name,
      latitude,
      longitude,
      timestamp: locationResult.rows[0].timestamp,
      inSafeZone: safeZones.length > 0,
      safeZones
    });

    res.json({
      success: true,
      message: 'Ubicación actualizada',
      location: locationResult.rows[0],
      safeZones: safeZones
    });

  } catch (error) {
    console.error('Error actualizando ubicación:', error);
    res.status(500).json({
      error: 'Error actualizando ubicación'
    });
  }
});

// Obtener ubicación actual de un niño
router.get('/current/:childId', authenticateToken, async (req, res) => {
  try {
    const { childId } = req.params;

    const result = await query(`
      SELECT cl.*, c.name as child_name
      FROM child_locations cl
      JOIN children c ON cl.child_id = c.id
      WHERE c.id = $1 AND c.family_id = $2
      ORDER BY cl.timestamp DESC
      LIMIT 1
    `, [childId, req.familyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'No se encontró ubicación para este niño'
      });
    }

    res.json({
      success: true,
      location: result.rows[0]
    });

  } catch (error) {
    console.error('Error obteniendo ubicación:', error);
    res.status(500).json({
      error: 'Error obteniendo ubicación'
    });
  }
});

// Función auxiliar para verificar zonas seguras
async function checkSafeZones(childId, lat, lng) {
  const zones = await query(`
    SELECT sz.* 
    FROM safe_zones sz
    JOIN children c ON sz.family_id = c.family_id
    WHERE c.id = $1 AND sz.is_active = true
  `, [childId]);

  return zones.rows.filter(zone => {
    const distance = calculateDistance(lat, lng, zone.latitude, zone.longitude);
    return distance <= zone.radius;
  });
}

// Función para calcular distancia entre dos puntos
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distancia en metros
}

// Ruta de test
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Ruta de location funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;