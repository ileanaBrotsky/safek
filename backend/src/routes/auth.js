// backend/src/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../models/database');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validaciones para registro
const validateRegister = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
    .matches(/\d/)
    .withMessage('La contraseña debe contener al menos un número')
];

// Validaciones para login
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  body('password')
    .notEmpty()
    .withMessage('La contraseña es requerida')
];

// REGISTRO DE USUARIO
router.post('/register', validateRegister, async (req, res) => {
  try {
    // Validar entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array()
      });
    }

    const { name, email, password, phone } = req.body;

    // Verificar si el email ya existe
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'El email ya está registrado'
      });
    }

    // Hash de la contraseña
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insertar nuevo usuario en tabla users
    const result = await query(
      `INSERT INTO users (name, email, password_hash, phone, timezone, created_at, updated_at, is_active) 
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), true) 
       RETURNING id, name, email, phone`,
      [name, email, hashedPassword, phone || null, 'America/Argentina/Buenos_Aires']
    );

    const user = result.rows[0];

    // Generar JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        type: 'parent'
      },
      process.env.JWT_SECRET || 'safekids_secret_key',
      { 
        expiresIn: '30d',
        issuer: 'safekids-api',
        audience: 'safekids-web'
      }
    );

    console.log('✅ Usuario registrado:', user.email);

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone
        }
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// LOGIN DE USUARIO
router.post('/login', validateLogin, async (req, res) => {
  try {
    // Validar entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Buscar usuario en tabla users
    const result = await query(
      `SELECT id, name, email, password_hash, phone, timezone, is_active 
       FROM users 
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    const user = result.rows[0];

    // Verificar si el usuario está activo
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Cuenta desactivada. Contacta al soporte.'
      });
    }

    // Verificar contraseña
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Actualizar última actividad
    await query(
      'UPDATE users SET updated_at = NOW() WHERE id = $1',
      [user.id]
    );

    // Obtener información adicional (niños registrados)
    const childrenResult = await query(
      'SELECT COUNT(*) as count FROM children WHERE family_id = $1',
      [user.id]
    );

    const childrenCount = parseInt(childrenResult.rows[0].count);

    // Generar JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        type: 'parent'
      },
      process.env.JWT_SECRET || 'safekids_secret_key',
      { 
        expiresIn: '30d',
        issuer: 'safekids-api',
        audience: 'safekids-web'
      }
    );

    console.log('✅ Usuario autenticado:', user.email);

    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          timezone: user.timezone,
          children_count: childrenCount
        }
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// VERIFICAR TOKEN
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    // El middleware authenticateToken ya verificó el token
    // req.user contiene los datos del token decodificado
    
    // Obtener información actualizada del usuario
    const result = await query(
      `SELECT id, name, email, phone, timezone, is_active 
       FROM users 
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Cuenta desactivada'
      });
    }

    // Obtener estadísticas del usuario
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM children WHERE family_id = $1) as children_count,
        (SELECT COUNT(*) FROM devices WHERE child_id IN (SELECT id FROM children WHERE family_id = $1) AND is_active = true) as devices_count,
        (SELECT COUNT(*) FROM alerts WHERE family_id = $1 AND is_read = false) as unread_alerts
    `, [user.id]);

    const userStats = stats.rows[0];

    res.json({
      success: true,
      message: 'Token válido',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          timezone: user.timezone
        },
        stats: {
          children_count: parseInt(userStats.children_count),
          devices_count: parseInt(userStats.devices_count),
          unread_alerts: parseInt(userStats.unread_alerts)
        }
      }
    });

  } catch (error) {
    console.error('Error verificando token:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// CAMBIAR CONTRASEÑA
router.post('/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Contraseña actual requerida'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('La nueva contraseña debe tener al menos 6 caracteres')
    .matches(/\d/)
    .withMessage('La nueva contraseña debe contener al menos un número')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Obtener hash actual
    const userResult = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Verificar contraseña actual
    const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Contraseña actual incorrecta'
      });
    }

    // Hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Actualizar contraseña
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, userId]
    );

    console.log('✅ Contraseña cambiada para usuario:', userId);

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });

  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ACTUALIZAR PERFIL
router.put('/profile', authenticateToken, [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('phone').optional().trim().matches(/^\+?[\d\s-()]+$/).withMessage('Formato de teléfono inválido'),
  body('timezone').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { name, phone, timezone } = req.body;

    // Construir query de actualización dinámico
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }

    if (phone !== undefined) {
      updates.push(`phone = $${paramCount}`);
      values.push(phone);
      paramCount++;
    }

    if (timezone !== undefined) {
      updates.push(`timezone = $${paramCount}`);
      values.push(timezone);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay datos para actualizar'
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(userId);

    const updateQuery = `
      UPDATE users 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount}
      RETURNING id, name, email, phone, timezone
    `;

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    console.log('✅ Perfil actualizado para usuario:', userId);

    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: {
        user: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// LOGOUT (opcional - invalida el token en el cliente)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // En una implementación más completa, podrías:
    // 1. Agregar el token a una lista negra en Redis
    // 2. Registrar el evento de logout
    // 3. Limpiar sesiones activas
    
    const userId = req.user.id;
    
    // Registrar logout
    await query(
      'UPDATE users SET updated_at = NOW() WHERE id = $1',
      [userId]
    );

    console.log('✅ Usuario cerró sesión:', userId);

    res.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });

  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;