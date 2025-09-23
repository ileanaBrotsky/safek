// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../models/database');

// Middleware para autenticar tokens JWT
const authenticateToken = async (req, res, next) => {
  try {
    // Obtener token del header Authorization
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token no proporcionado'
      });
    }

    // Verificar token
    jwt.verify(
      token, 
      process.env.JWT_SECRET || 'safekids_secret_key',
      async (err, decoded) => {
        if (err) {
          console.error('Error verificando token:', err.message);
          
          if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
              success: false,
              message: 'Token expirado',
              error: 'TOKEN_EXPIRED'
            });
          }
          
          if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({
              success: false,
              message: 'Token inválido',
              error: 'INVALID_TOKEN'
            });
          }
          
          return res.status(401).json({
            success: false,
            message: 'Error de autenticación'
          });
        }

        // Verificar que el usuario existe y está activo
        if (decoded.type === 'parent') {
          const userResult = await query(
            'SELECT id, email, is_active FROM users WHERE id = $1',
            [decoded.id]
          );

          if (userResult.rows.length === 0) {
            return res.status(404).json({
              success: false,
              message: 'Usuario no encontrado'
            });
          }

          if (!userResult.rows[0].is_active) {
            return res.status(403).json({
              success: false,
              message: 'Cuenta desactivada'
            });
          }
        }

        // Agregar información del usuario al request
        req.user = decoded;
        next();
      }
    );
  } catch (error) {
    console.error('Error en middleware de autenticación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Middleware para autenticar dispositivos (tokens de dispositivos móviles)
const authenticateDevice = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token de dispositivo no proporcionado'
      });
    }

    jwt.verify(
      token, 
      process.env.JWT_SECRET || 'safekids_secret_key',
      async (err, decoded) => {
        if (err) {
          console.error('Error verificando token de dispositivo:', err.message);
          
          return res.status(401).json({
            success: false,
            message: 'Token de dispositivo inválido',
            error: err.name
          });
        }

        // Verificar que es un token de dispositivo
        if (decoded.type !== 'device') {
          return res.status(403).json({
            success: false,
            message: 'Token no es de dispositivo'
          });
        }

        // Verificar que el dispositivo existe y está activo
        const deviceResult = await query(
          `SELECT d.*, c.name as child_name 
           FROM devices d 
           JOIN children c ON d.child_id = c.id 
           WHERE d.device_id = $1 AND d.is_active = true`,
          [decoded.deviceId]
        );

        if (deviceResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Dispositivo no encontrado o inactivo'
          });
        }

        // Actualizar última actividad del dispositivo
        await query(
          'UPDATE devices SET last_seen = NOW() WHERE device_id = $1',
          [decoded.deviceId]
        );

        // Agregar información del dispositivo al request
        req.device = {
          ...decoded,
          child_name: deviceResult.rows[0].child_name,
          device_info: deviceResult.rows[0]
        };
        
        req.user = {
          id: decoded.familyId,
          type: 'device'
        };

        next();
      }
    );
  } catch (error) {
    console.error('Error en autenticación de dispositivo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

// Middleware opcional: verificar rol (para futuras expansiones)
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado'
      });
    }

    if (!roles.includes(req.user.type)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para esta acción'
      });
    }

    next();
  };
};

// Middleware para verificar propiedad de recursos
const verifyOwnership = (resourceType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const resourceId = req.params.id;

      let query_str;
      let params;

      switch (resourceType) {
        case 'child':
          query_str = 'SELECT id FROM children WHERE id = $1 AND family_id = $2';
          params = [resourceId, userId];
          break;
        
        case 'safe_zone':
          query_str = 'SELECT id FROM safe_zones WHERE id = $1 AND family_id = $2';
          params = [resourceId, userId];
          break;
        
        case 'alert':
          query_str = 'SELECT id FROM alerts WHERE id = $1 AND family_id = $2';
          params = [resourceId, userId];
          break;
        
        default:
          return res.status(400).json({
            success: false,
            message: 'Tipo de recurso no válido'
          });
      }

      const result = await query(query_str, params);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: `${resourceType} no encontrado o no tienes acceso`
        });
      }

      next();
    } catch (error) {
      console.error('Error verificando propiedad:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };
};

// Middleware para rate limiting específico por endpoint
const createRateLimiter = (maxRequests = 100, windowMs = 60000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const key = `${req.user?.id || req.ip}:${req.path}`;
    const now = Date.now();
    
    if (!requests.has(key)) {
      requests.set(key, []);
    }
    
    const userRequests = requests.get(key);
    const recentRequests = userRequests.filter(time => now - time < windowMs);
    
    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Demasiadas peticiones, intenta más tarde',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    recentRequests.push(now);
    requests.set(key, recentRequests);
    
    // Limpiar requests antiguos cada cierto tiempo
    if (Math.random() < 0.1) {
      for (const [key, times] of requests.entries()) {
        const recent = times.filter(time => now - time < windowMs);
        if (recent.length === 0) {
          requests.delete(key);
        } else {
          requests.set(key, recent);
        }
      }
    }
    
    next();
  };
};

module.exports = {
  authenticateToken,
  authenticateDevice,
  requireRole,
  verifyOwnership,
  createRateLimiter
};