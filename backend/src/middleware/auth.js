// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../models/database');

// Middleware para verificar token JWT
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Token de acceso requerido'
      });
    }

    // Verificar y decodificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar que la familia aún existe y está activa
    const familyResult = await query(
      'SELECT id, name, email, is_active FROM families WHERE id = $1',
      [decoded.familyId]
    );

    if (familyResult.rows.length === 0 || !familyResult.rows[0].is_active) {
      return res.status(401).json({
        error: 'Token inválido o familia inactiva'
      });
    }

    // Agregar info de familia al request
    req.family = familyResult.rows[0];
    req.familyId = decoded.familyId;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token inválido'
      });
    }
    
    console.error('Error en autenticación:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
};

module.exports = {
  authenticateToken
};