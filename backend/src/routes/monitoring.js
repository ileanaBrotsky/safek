// backend/src/routes/monitoring.js
const express = require('express');
const { query } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Dashboard con métricas generales
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    // Contar niños activos
    const activeChildren = await query(
      'SELECT COUNT(*) as count FROM children WHERE family_id = $1 AND is_active = true',
      [req.familyId]
    );

    // Contar alertas del día
    const todayAlerts = await query(`
      SELECT COUNT(*) as count 
      FROM alerts 
      WHERE family_id = $1 AND DATE(created_at) = CURRENT_DATE
    `, [req.familyId]);

    // Contar alertas no leídas
    const unreadAlerts = await query(`
      SELECT COUNT(*) as count 
      FROM alerts 
      WHERE family_id = $1 AND is_read = false
    `, [req.familyId]);

    // Ubicaciones del día
    const locationsToday = await query(`
      SELECT COUNT(*) as count 
      FROM child_locations cl
      JOIN children c ON cl.child_id = c.id
      WHERE c.family_id = $1 AND DATE(cl.timestamp) = CURRENT_DATE
    `, [req.familyId]);

    // Actividad por niño
    const childrenActivity = await query(`
      SELECT 
        c.id, c.name, c.risk_level,
        COUNT(cl.id) as location_updates_today,
        MAX(cl.timestamp) as last_location,
        COUNT(a.id) as alerts_today
      FROM children c
      LEFT JOIN child_locations cl ON c.id = cl.child_id AND DATE(cl.timestamp) = CURRENT_DATE
      LEFT JOIN alerts a ON c.id = a.child_id AND DATE(a.created_at) = CURRENT_DATE
      WHERE c.family_id = $1 AND c.is_active = true
      GROUP BY c.id, c.name, c.risk_level
      ORDER BY c.name
    `, [req.familyId]);

    res.json({
      success: true,
      dashboard: {
        metrics: {
          activeChildren: parseInt(activeChildren.rows[0].count),
          todayAlerts: parseInt(todayAlerts.rows[0].count),
          unreadAlerts: parseInt(unreadAlerts.rows[0].count),
          locationsToday: parseInt(locationsToday.rows[0].count)
        },
        childrenActivity: childrenActivity.rows
      }
    });

  } catch (error) {
    console.error('Error obteniendo dashboard:', error);
    res.status(500).json({
      error: 'Error obteniendo métricas del dashboard'
    });
  }
});

// Historial de ubicaciones de un niño
router.get('/locations/:childId', authenticateToken, async (req, res) => {
  try {
    const { childId } = req.params;
    const { days = 7, limit = 100 } = req.query;

    // Verificar que el niño pertenece a la familia
    const childCheck = await query(
      'SELECT id, name FROM children WHERE id = $1 AND family_id = $2',
      [childId, req.familyId]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Niño no encontrado'
      });
    }

    const locations = await query(`
      SELECT 
        latitude, longitude, address, accuracy, timestamp
      FROM child_locations
      WHERE child_id = $1 
        AND timestamp >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY timestamp DESC
      LIMIT $2
    `, [childId, limit]);

    res.json({
      success: true,
      child: childCheck.rows[0],
      locations: locations.rows,
      period: `${days} días`,
      total: locations.rows.length
    });

  } catch (error) {
    console.error('Error obteniendo historial de ubicaciones:', error);
    res.status(500).json({
      error: 'Error obteniendo historial de ubicaciones'
    });
  }
});

// Estadísticas de tiempo en zonas
router.get('/zone-stats/:childId', authenticateToken, async (req, res) => {
  try {
    const { childId } = req.params;
    const { days = 7 } = req.query;

    // Verificar que el niño pertenece a la familia
    const childCheck = await query(
      'SELECT id, name FROM children WHERE id = $1 AND family_id = $2',
      [childId, req.familyId]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Niño no encontrado'
      });
    }

    // Obtener zonas seguras de la familia
    const safeZones = await query(
      'SELECT * FROM safe_zones WHERE family_id = $1 AND is_active = true',
      [req.familyId]
    );

    // Simular estadísticas (en una implementación real calcularías tiempo en cada zona)
    const zoneStats = safeZones.rows.map(zone => ({
      zoneId: zone.id,
      zoneName: zone.name,
      zoneType: zone.zone_type,
      timeSpent: Math.floor(Math.random() * 480), // Minutos simulados
      visits: Math.floor(Math.random() * 20) + 1,
      lastVisit: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
    }));

    res.json({
      success: true,
      child: childCheck.rows[0],
      period: `${days} días`,
      zoneStats: zoneStats
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas de zonas:', error);
    res.status(500).json({
      error: 'Error obteniendo estadísticas de zonas'
    });
  }
});

// Resumen de alertas por tipo
router.get('/alerts-summary', authenticateToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const alertsSummary = await query(`
      SELECT 
        alert_type,
        severity,
        COUNT(*) as count,
        MAX(created_at) as last_occurrence
      FROM alerts
      WHERE family_id = $1 
        AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY alert_type, severity
      ORDER BY count DESC, severity DESC
    `, [req.familyId]);

    // Tendencia de alertas por día
    const alertsTrend = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as alerts_count,
        COUNT(CASE WHEN severity IN ('high', 'critical') THEN 1 END) as high_priority_count
      FROM alerts
      WHERE family_id = $1 
        AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `, [req.familyId]);

    res.json({
      success: true,
      period: `${days} días`,
      summary: alertsSummary.rows,
      trend: alertsTrend.rows
    });

  } catch (error) {
    console.error('Error obteniendo resumen de alertas:', error);
    res.status(500).json({
      error: 'Error obteniendo resumen de alertas'
    });
  }
});

// Ruta de test
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Ruta de monitoring funcionando correctamente',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/monitoring/dashboard - Métricas generales',
      'GET /api/monitoring/locations/:childId - Historial de ubicaciones',
      'GET /api/monitoring/zone-stats/:childId - Estadísticas de zonas',
      'GET /api/monitoring/alerts-summary - Resumen de alertas'
    ]
  });
});

module.exports = router;