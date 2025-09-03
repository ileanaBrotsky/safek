// backend/src/routes/alerts.js
const express = require('express');
const { query } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Obtener todas las alertas de la familia
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, severity, unreadOnly } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE a.family_id = $1';
    let params = [req.familyId];
    let paramIndex = 2;

    if (severity) {
      whereClause += ` AND a.severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    if (unreadOnly === 'true') {
      whereClause += ` AND a.is_read = false`;
    }

    const result = await query(`
      SELECT 
        a.*, 
        c.name as child_name
      FROM alerts a
      LEFT JOIN children c ON a.child_id = c.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    // Contar total de alertas
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM alerts a
      ${whereClause}
    `, params);

    res.json({
      success: true,
      alerts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo alertas:', error);
    res.status(500).json({
      error: 'Error obteniendo alertas'
    });
  }
});

// Crear nueva alerta
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { childId, alertType, severity = 'medium', title, message, metadata = {} } = req.body;

    if (!alertType || !title || !message) {
      return res.status(400).json({
        error: 'alertType, title y message son requeridos'
      });
    }

    // Verificar que el niño pertenece a la familia
    if (childId) {
      const childCheck = await query(
        'SELECT id FROM children WHERE id = $1 AND family_id = $2',
        [childId, req.familyId]
      );

      if (childCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'Niño no encontrado en esta familia'
        });
      }
    }

    const result = await query(`
      INSERT INTO alerts (family_id, child_id, alert_type, severity, title, message, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, uuid, created_at
    `, [req.familyId, childId || null, alertType, severity, title, message, JSON.stringify(metadata)]);

    // Notificar en tiempo real
    const io = req.app.get('io');
    io.to(`family_${req.familyId}`).emit('new_alert', {
      id: result.rows[0].id,
      alertType,
      severity,
      title,
      message,
      childId,
      timestamp: result.rows[0].created_at
    });

    res.status(201).json({
      success: true,
      message: 'Alerta creada correctamente',
      alert: result.rows[0]
    });

  } catch (error) {
    console.error('Error creando alerta:', error);
    res.status(500).json({
      error: 'Error creando alerta'
    });
  }
});

// Marcar alerta como leída
router.put('/:alertId/read', authenticateToken, async (req, res) => {
  try {
    const { alertId } = req.params;

    const result = await query(`
      UPDATE alerts 
      SET is_read = true, read_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND family_id = $2
      RETURNING id, is_read, read_at
    `, [alertId, req.familyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Alerta no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Alerta marcada como leída',
      alert: result.rows[0]
    });

  } catch (error) {
    console.error('Error actualizando alerta:', error);
    res.status(500).json({
      error: 'Error actualizando alerta'
    });
  }
});

// Ruta de test
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Ruta de alerts funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;