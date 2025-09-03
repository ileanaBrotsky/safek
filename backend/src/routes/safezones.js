// backend/src/routes/safezones.js
const express = require('express');
const { query } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Obtener todas las zonas seguras de la familia
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        sz.*,
        COUNT(csz.child_id) as assigned_children
      FROM safe_zones sz
      LEFT JOIN child_safe_zones csz ON sz.id = csz.safe_zone_id
      WHERE sz.family_id = $1 AND sz.is_active = true
      GROUP BY sz.id
      ORDER BY sz.name
    `, [req.familyId]);

    res.json({
      success: true,
      safeZones: result.rows
    });

  } catch (error) {
    console.error('Error obteniendo zonas seguras:', error);
    res.status(500).json({
      error: 'Error obteniendo zonas seguras'
    });
  }
});

// Crear nueva zona segura
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, address, latitude, longitude, radius = 100, zoneType = 'custom' } = req.body;

    if (!name || !latitude || !longitude) {
      return res.status(400).json({
        error: 'Nombre, latitud y longitud son requeridos'
      });
    }

    const result = await query(`
      INSERT INTO safe_zones (family_id, name, address, latitude, longitude, radius, zone_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [req.familyId, name, address, latitude, longitude, radius, zoneType]);

    res.status(201).json({
      success: true,
      message: 'Zona segura creada correctamente',
      safeZone: result.rows[0]
    });

  } catch (error) {
    console.error('Error creando zona segura:', error);
    res.status(500).json({
      error: 'Error creando zona segura'
    });
  }
});

module.exports = router;