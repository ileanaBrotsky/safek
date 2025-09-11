// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../models/database');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token de acceso requerido',
        code: 'MISSING_TOKEN'
      });
    }

    // Verificar y decodificar token
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'safekids_secret_key',
      {
        issuer: 'safekids-api',
        audience: 'safekids-app'
      }
    );

    // Verificar que el usuario existe en la base de datos
    const userResult = await query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    // Agregar información del usuario a la request
    req.user = {
      id: userResult.rows[0].id,
      name: userResult.rows[0].name,
      email: userResult.rows[0].email
    };

    console.log('✅ Usuario autenticado:', {
      id: req.user.id,
      email: req.user.email
    });

    next();

  } catch (error) {
    console.error('❌ Error en autenticación:', error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido',
        code: 'INVALID_TOKEN'
      });
    }

    res.status(401).json({
      success: false,
      message: 'Error de autenticación',
      code: 'AUTH_ERROR'
    });
  }
};

module.exports = { authenticateToken };