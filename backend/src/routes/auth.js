// backend/src/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../models/database');
const { validationResult, body } = require('express-validator');
const router = express.Router();

// 🔒 Middleware para validar datos (mejorado con express-validator)
const validateRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('El nombre solo puede contener letras y espacios'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Formato de email inválido'),
  
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('La contraseña debe tener entre 6 y 128 caracteres')
];

const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Formato de email inválido'),
  
  body('password')
    .notEmpty()
    .withMessage('Password es requerido')
];

// Middleware para manejar errores de validación
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Datos inválidos',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// 🔐 REGISTRO DE USUARIO
router.post('/register', validateRegistration, handleValidationErrors, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    console.log('📝 Intento de registro:', { name, email });
    
    // Verificar si el usuario ya existe
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'El email ya está registrado',
        code: 'EMAIL_EXISTS'
      });
    }
    
    // Encriptar password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Crear nuevo usuario
    const newUser = await query(
      `INSERT INTO users (name, email, password_hash, created_at, updated_at) 
       VALUES ($1, $2, $3, NOW(), NOW()) 
       RETURNING id, name, email, created_at`,
      [name.trim(), email, hashedPassword]
    );
    
    const user = newUser.rows[0];
    
    // Generar token JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        name: user.name,
        type: 'access'
      },
      process.env.JWT_SECRET || 'safekids_secret_key',
      { 
        expiresIn: process.env.JWT_EXPIRE || '7d',
        issuer: 'safekids-api',
        audience: 'safekids-app'
      }
    );
    
    console.log('✅ Usuario registrado exitosamente:', { id: user.id, email: user.email });
    
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.created_at
        },
        token,
        expiresIn: process.env.JWT_EXPIRE || '7d'
      }
    });
    
  } catch (error) {
    console.error('❌ Error en registro:', {
      message: error.message,
      stack: error.stack,
      email: req.body?.email
    });
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23505') { // Constraint violation
      return res.status(409).json({
        success: false,
        message: 'El email ya está registrado',
        code: 'DUPLICATE_EMAIL'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 🔑 LOGIN DE USUARIO
router.post('/login', validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Intento de login:', { email, timestamp: new Date().toISOString() });
    
    // Buscar usuario por email
    const userResult = await query(
      `SELECT id, name, email, password_hash, created_at, updated_at 
       FROM users 
       WHERE email = $1`,
      [email]
    );
    
    if (userResult.rows.length === 0) {
      console.log('❌ Usuario no encontrado:', email);
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    const user = userResult.rows[0];
    
    // Verificar password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      console.log('❌ Password inválido para usuario:', user.id);
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    // Actualizar último login
    await query(
      'UPDATE users SET updated_at = NOW() WHERE id = $1',
      [user.id]
    );
    
    // Generar token JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        name: user.name,
        type: 'access'
      },
      process.env.JWT_SECRET || 'safekids_secret_key',
      { 
        expiresIn: process.env.JWT_EXPIRE || '7d',
        issuer: 'safekids-api',
        audience: 'safekids-app'
      }
    );
    
    console.log('✅ Login exitoso:', { 
      userId: user.id, 
      email: user.email,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.created_at,
          updatedAt: user.updated_at
        },
        token,
        expiresIn: process.env.JWT_EXPIRE || '7d'
      }
    });
    
  } catch (error) {
    console.error('❌ Error en login:', {
      message: error.message,
      stack: error.stack,
      email: req.body?.email
    });
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 🔍 VERIFICAR TOKEN
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token no proporcionado o formato inválido',
        code: 'MISSING_TOKEN'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'safekids_secret_key',
      {
        issuer: 'safekids-api',
        audience: 'safekids-app'
      }
    );
    
    // Verificar que el usuario aún existe
    const userResult = await query(
      `SELECT id, name, email, created_at, updated_at 
       FROM users 
       WHERE id = $1`,
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado o inactivo',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const user = userResult.rows[0];
    
    res.json({
      success: true,
      message: 'Token válido',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.created_at,
          updatedAt: user.updated_at
        },
        tokenInfo: {
          userId: decoded.userId,
          issuedAt: new Date(decoded.iat * 1000),
          expiresAt: new Date(decoded.exp * 1000)
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error verificando token:', {
      message: error.message,
      name: error.name
    });
    
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
      message: 'Error verificando token',
      code: 'TOKEN_ERROR'
    });
  }
});

// 🚪 LOGOUT
router.post('/logout', (req, res) => {
  console.log('👋 Logout solicitado');
  
  res.json({
    success: true,
    message: 'Logout exitoso',
    data: {
      timestamp: new Date().toISOString(),
      note: 'Token invalidado del lado del cliente'
    }
  });
});

// 🔄 REFRESH TOKEN
router.post('/refresh', async (req, res) => {
  try {
    const { token: oldToken } = req.body;
    
    if (!oldToken) {
      return res.status(400).json({
        success: false,
        message: 'Token requerido para refresh'
      });
    }
    
    const decoded = jwt.verify(
      oldToken, 
      process.env.JWT_SECRET || 'safekids_secret_key',
      { ignoreExpiration: true }
    );
    
    // Verificar usuario existe
    const userResult = await query(
      'SELECT id, name, email FROM families WHERE id = $1',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    const user = userResult.rows[0];
    
    // Generar nuevo token
    const newToken = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        name: user.name,
        type: 'access'
      },
      process.env.JWT_SECRET || 'safekids_secret_key',
      { 
        expiresIn: process.env.JWT_EXPIRE || '7d',
        issuer: 'safekids-api',
        audience: 'safekids-app'
      }
    );
    
    res.json({
      success: true,
      message: 'Token renovado exitosamente',
      data: {
        token: newToken,
        expiresIn: process.env.JWT_EXPIRE || '7d'
      }
    });
    
  } catch (error) {
    console.error('❌ Error renovando token:', error);
    res.status(401).json({
      success: false,
      message: 'Error renovando token'
    });
  }
});

module.exports = router;