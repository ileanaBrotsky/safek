// backend/src/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../models/database');

const router = express.Router();

// Ruta de login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email y contraseña son requeridos'
      });
    }

    // Buscar familia por email
    const result = await query(
      'SELECT id, name, email, password_hash FROM families WHERE email = $1 AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Credenciales inválidas'
      });
    }

    const family = result.rows[0];

    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(password, family.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        error: 'Credenciales inválidas'
      });
    }

    // Crear JWT token
    const token = jwt.sign(
      { familyId: family.id, email: family.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      message: 'Login exitoso',
      token,
      family: {
        id: family.id,
        name: family.name,
        email: family.email
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// Ruta de prueba
router.get('/test', (req, res) => {
  res.json({
    message: 'Ruta de autenticación funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;