// backend/src/routes/alerts.js
const express = require('express');
const { query } = require('../models/database');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Validaciones para alertas - actualizadas
const validateAlert = [
  body('child_id')
    .isInt({ min: 1 })
    .withMessage('ID de child inválido'),
  
  body('alert_type')
    .isIn(['safe_zone_exit', 'safe_zone_enter', 'low_battery', 'emergency', 'location_lost', 'custom'])
    .withMessage('Tipo de alerta inválido'),
  
  body('title')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('El título debe tener entre 3 y 200 caracteres'),
  
  body('message')
    .trim()
    .isLength({ min: 5, max: 1000 })
    .withMessage('El mensaje debe tener entre 5 y 1000 caracteres'),
  
  body('severity')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Severidad inválida')
];

// LISTAR ALERTAS
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      child_id, 
      unread_only = 'false',
      limit = 50,
      page = 1 
    } = req.query;

    let whereClause = 'WHERE a.family_id = $1';
    let queryParams = [req.user.id];
    let paramCount = 1;

    if (child_id) {
      paramCount++;
      whereClause += ` AND a.child_id = $${paramCount}`;
      queryParams.push(child_id);
    }

    if (unread_only === 'true') {
      whereClause += ' AND a.is_read = false';
    }

    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT a.id, a.alert_type, a.title, a.message, a.severity, a.is_read, a.is_resolved, a.created_at,
              c.name as child_name, c.id as child_id
       FROM alerts a
       LEFT JOIN children c ON a.child_id = c.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...queryParams, limit, offset]
    );

    res.json({
      success: true,
      message: 'Alertas obtenidas exitosamente',
      data: {
        alerts: result.rows,
        pagination: {
          current_page: parseInt(page),
          limit: parseInt(limit),
          total: result.rowCount
        }
      }
    });

  } catch (error) {
    console.error('Error obteniendo alertas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// CREAR ALERTA
router.post('/', authenticateToken, validateAlert, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array()
      });
    }

    const { child_id, alert_type, title, message, severity = 'medium' } = req.body;

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

    // Crear la alerta
    const result = await query(
      `INSERT INTO alerts (family_id, child_id, alert_type, title, message, severity, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, alert_type, title, message, severity, is_read, is_resolved, created_at`,
      [req.user.id, child_id, alert_type, title.trim(), message.trim(), severity]
    );

    const alert = result.rows[0];

    console.log('Alerta creada:', alert.id);

    res.status(201).json({
      success: true,
      message: 'Alerta creada exitosamente',
      data: { 
        alert: {
          ...alert,
          child_name: childCheck.rows[0].name
        }
      }
    });

  } catch (error) {
    console.error('Error creando alerta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// MARCAR ALERTA COMO LEÍDA
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE alerts 
       SET is_read = true
       WHERE id = $1 AND family_id = $2
       RETURNING id, alert_type, title, is_read`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alerta no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Alerta marcada como leída',
      data: { alert: result.rows[0] }
    });

  } catch (error) {
    console.error('Error marcando alerta como leída:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
