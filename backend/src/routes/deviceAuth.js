// backend/src/routes/deviceAuth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const { query } = require('../models/database');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Generar código de registro único (6 caracteres alfanuméricos)
function generateRegistrationCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin caracteres confusos (I,O,1,0)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 📱 REGISTRAR DISPOSITIVO CON CÓDIGO
router.post('/register-device', [
  body('registration_code')
    .trim()
    .isLength({ min: 6, max: 6 })
    .toUpperCase()
    .withMessage('Código de registro debe tener 6 caracteres'),
  body('device_id')
    .trim()
    .notEmpty()
    .withMessage('Device ID es requerido'),
  body('device_name')
    .trim()
    .optional()
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

    const { 
      registration_code, 
      device_id, 
      device_name,
      brand,
      model,
      os,
      os_version,
      app_version,
      platform
    } = req.body;

    console.log('📱 Registro de dispositivo:', { registration_code, device_id });

    // Verificar código de registro y obtener el child asociado
    const codeResult = await query(`
      SELECT c.*, rc.id as code_id, rc.expires_at, f.name as family_name, f.id as family_id
      FROM registration_codes rc
      JOIN children c ON rc.child_id = c.id
      JOIN families f ON c.family_id = f.id
      WHERE rc.code = $1 
        AND rc.used = false 
        AND rc.expires_at > NOW()
    `, [registration_code]);

    if (codeResult.rows.length === 0) {
      console.log('❌ Código inválido o expirado:', registration_code);
      return res.status(400).json({
        success: false,
        message: 'Código de registro inválido o expirado',
        error: 'INVALID_CODE'
      });
    }

    const child = codeResult.rows[0];

    // Verificar si el dispositivo ya está registrado
    const existingDevice = await query(
      'SELECT id FROM devices WHERE device_id = $1',
      [device_id]
    );

    let deviceRecord;
    
    if (existingDevice.rows.length > 0) {
      // Actualizar dispositivo existente
      deviceRecord = await query(`
        UPDATE devices 
        SET child_id = $1, 
            device_name = $2,
            brand = $3,
            model = $4,
            os = $5,
            os_version = $6,
            app_version = $7,
            platform = $8,
            last_seen = NOW(),
            is_active = true
        WHERE device_id = $9
        RETURNING id
      `, [
        child.id, 
        device_name || `Dispositivo de ${child.name}`,
        brand,
        model,
        os,
        os_version,
        app_version,
        platform,
        device_id
      ]);
    } else {
      // Crear nuevo registro de dispositivo
      deviceRecord = await query(`
        INSERT INTO devices (
          device_id, 
          child_id, 
          device_name, 
          brand,
          model,
          os,
          os_version,
          app_version,
          platform,
          registered_at, 
          last_seen,
          is_active
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), true)
        RETURNING id
      `, [
        device_id, 
        child.id, 
        device_name || `Dispositivo de ${child.name}`,
        brand,
        model,
        os,
        os_version,
        app_version,
        platform
      ]);
    }

    // Marcar código como usado
    await query(
      'UPDATE registration_codes SET used = true, used_at = NOW() WHERE id = $1',
      [child.code_id]
    );

    // Actualizar el device_id del niño
    await query(
      'UPDATE children SET device_id = $1, updated_at = NOW() WHERE id = $2',
      [device_id, child.id]
    );

    // Generar token JWT para el dispositivo
    const token = jwt.sign(
      { 
        deviceId: device_id,
        childId: child.id,
        familyId: child.family_id,
        type: 'device'
      },
      process.env.JWT_SECRET || 'safekids_secret_key',
      { 
        expiresIn: '30d', // Token de larga duración para dispositivos
        issuer: 'safekids-api',
        audience: 'safekids-mobile'
      }
    );

    console.log('✅ Dispositivo registrado exitosamente:', {
      childId: child.id,
      deviceId: device_id,
      familyId: child.family_id
    });

    res.json({
      success: true,
      message: 'Dispositivo registrado exitosamente',
      data: {
        token,
        child: {
          id: child.id,
          name: child.name,
          age: child.age,
          device_id: device_id
        },
        family: {
          id: child.family_id,
          name: child.family_name
        }
      }
    });

  } catch (error) {
    console.error('❌ Error registrando dispositivo:', error);
    res.status(500).json({
      success: false,
      message: 'Error registrando dispositivo',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 🔄 RE-AUTENTICAR DISPOSITIVO (cuando ya estaba registrado)
router.post('/device-login', [
  body('device_id').trim().notEmpty(),
  body('child_id').isInt()
], async (req, res) => {
  try {
    const { device_id, child_id } = req.body;

    console.log('🔄 Re-autenticación de dispositivo:', { device_id, child_id });

    // Verificar que el dispositivo existe y está asociado al niño
    const deviceResult = await query(`
      SELECT d.*, c.name as child_name, c.age, f.id as family_id, f.name as family_name
      FROM devices d
      JOIN children c ON d.child_id = c.id
      JOIN families f ON c.family_id = f.id
      WHERE d.device_id = $1 AND d.child_id = $2 AND d.is_active = true
    `, [device_id, child_id]);

    if (deviceResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Dispositivo no registrado o inactivo',
        error: 'DEVICE_NOT_FOUND'
      });
    }

    const device = deviceResult.rows[0];

    // Actualizar última conexión
    await query(
      'UPDATE devices SET last_seen = NOW() WHERE device_id = $1',
      [device_id]
    );

    // Generar nuevo token
    const token = jwt.sign(
      { 
        deviceId: device_id,
        childId: device.child_id,
        familyId: device.family_id,
        type: 'device'
      },
      process.env.JWT_SECRET || 'safekids_secret_key',
      { 
        expiresIn: '30d',
        issuer: 'safekids-api',
        audience: 'safekids-mobile'
      }
    );

    console.log('✅ Dispositivo re-autenticado:', { device_id, child_id });

    res.json({
      success: true,
      message: 'Dispositivo autenticado exitosamente',
      data: {
        token,
        child: {
          id: device.child_id,
          name: device.child_name,
          age: device.age,
          device_id: device_id
        },
        family: {
          id: device.family_id,
          name: device.family_name
        }
      }
    });

  } catch (error) {
    console.error('❌ Error en device-login:', error);
    res.status(500).json({
      success: false,
      message: 'Error autenticando dispositivo',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 🔍 VERIFICAR TOKEN DE DISPOSITIVO
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token no proporcionado',
        error: 'MISSING_TOKEN'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'safekids_secret_key',
      {
        issuer: 'safekids-api',
        audience: 'safekids-mobile'
      }
    );

    // Verificar que el dispositivo existe
    const deviceResult = await query(`
      SELECT d.*, c.name as child_name, c.id as child_id
      FROM devices d
      JOIN children c ON d.child_id = c.id
      WHERE d.device_id = $1 AND d.is_active = true
    `, [decoded.deviceId]);

    if (deviceResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Dispositivo no encontrado o inactivo',
        error: 'DEVICE_NOT_FOUND'
      });
    }

    const device = deviceResult.rows[0];

    res.json({
      success: true,
      message: 'Token válido',
      data: {
        authenticated: true,
        child: {
          id: device.child_id,
          name: device.child_name
        }
      }
    });

  } catch (error) {
    console.error('❌ Error verificando token de dispositivo:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
        error: 'TOKEN_EXPIRED'
      });
    }
    
    res.status(401).json({
      success: false,
      message: 'Token inválido',
      error: 'INVALID_TOKEN'
    });
  }
});

// 🗑️ DESVINCULAR DISPOSITIVO
router.delete('/unregister', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const deviceId = req.headers['x-device-id'];
    
    if (!authHeader || !deviceId) {
      return res.status(400).json({
        success: false,
        message: 'Faltan parámetros requeridos'
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'safekids_secret_key'
    );

    // Desactivar dispositivo
    await query(
      'UPDATE devices SET is_active = false, unregistered_at = NOW() WHERE device_id = $1',
      [deviceId]
    );

    // Limpiar device_id del niño
    await query(
      'UPDATE children SET device_id = NULL WHERE id = $1',
      [decoded.childId]
    );

    console.log('✅ Dispositivo desvinculado:', { deviceId, childId: decoded.childId });

    res.json({
      success: true,
      message: 'Dispositivo desvinculado exitosamente'
    });

  } catch (error) {
    console.error('❌ Error desvinculando dispositivo:', error);
    res.status(500).json({
      success: false,
      message: 'Error desvinculando dispositivo'
    });
  }
});

// 📱 ACTUALIZAR TOKEN PUSH
router.put('/push-token', async (req, res) => {
  try {
    const { push_token } = req.body;
    const deviceId = req.headers['x-device-id'];

    if (!push_token || !deviceId) {
      return res.status(400).json({
        success: false,
        message: 'Token push y device ID requeridos'
      });
    }

    await query(
      'UPDATE devices SET push_token = $1, updated_at = NOW() WHERE device_id = $2',
      [push_token, deviceId]
    );

    res.json({
      success: true,
      message: 'Token push actualizado'
    });

  } catch (error) {
    console.error('Error actualizando push token:', error);
    res.status(500).json({
      success: false,
      message: 'Error actualizando token push'
    });
  }
});

// 🔧 VERIFICAR PERMISOS REQUERIDOS
router.get('/check-permissions', async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    
    // Por ahora retornamos los permisos requeridos
    // En el futuro podemos personalizarlos según configuración
    res.json({
      success: true,
      data: {
        location: true,
        notifications: true,
        usage_stats: true,
        accessibility: false
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error verificando permisos'
    });
  }
});

module.exports = router;