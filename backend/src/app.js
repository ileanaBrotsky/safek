// backend/src/app.js - ACTUALIZADO con ruta de monitoreo
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Importar base de datos y rutas
const { initDatabase } = require('./models/database');

const app = express();

// 🛡️ MIDDLEWARES DE SEGURIDAD
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3001', 'http://localhost:5173'],
  credentials: true
}));

// 🚦 RATE LIMITING
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // límite de 1000 requests por ventana (aumentado para monitoreo)
  message: {
    success: false,
    message: 'Demasiadas peticiones, intenta de nuevo más tarde'
  }
});
// app.use('/api/', limiter);

// 📝 MIDDLEWARES DE PARSING Y LOGGING
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined'));

// 🔗 RUTAS
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/deviceAuth')); // Rutas de autenticación para dispositivos
app.use('/api/children', require('./routes/children'));
app.use('/api/safe-zones', require('./routes/safeZones'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/devices', require('./routes/deviceAuth')); // Rutas de gestión de dispositivos

// ✅ NUEVA RUTA: Monitoreo de aplicaciones
app.use('/api/monitoring', require('./routes/monitoring'));

// 🏠 RUTA DE SALUD
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'SafeKids API funcionando correctamente',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.1.0', // Incrementamos versión
    features: {
      location_tracking: true,
      app_monitoring: true, // ✅ Nueva funcionalidad
      safe_zones: true,
      alerts: true
    }
  });
});

// 🏠 RUTA RAÍZ
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'SafeKids API v1.1 - Control Parental con Monitoreo de Apps',
    endpoints: {
      auth: '/api/auth (POST /register, POST /login, GET /verify)',
      children: '/api/children (CRUD)',
      safeZones: '/api/safe-zones (CRUD)',
      alerts: '/api/alerts (GET, POST)',
      locations: '/api/locations (GET, POST)',
      monitoring: '/api/monitoring (GET /config, POST /usage-stats)', // ✅ Nueva
      devices: '/api/devices (CRUD)',
      health: '/health'
    },
    new_features: [
      'Monitoreo de aplicaciones Android',
      'Estadísticas de tiempo de pantalla',
      'Límites por aplicación',
      'Detección de hora de dormir'
    ],
    documentation: 'Usa Postman para probar los endpoints'
  });
});

// ❌ MANEJO DE RUTAS NO ENCONTRADAS
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    availableEndpoints: [
      'GET /',
      'GET /health',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/auth/verify',
      'POST /api/monitoring/usage-stats', // ✅ Nueva
      'GET /api/monitoring/config' // ✅ Nueva
    ]
  });
});

// 🚨 MANEJO GLOBAL DE ERRORES
app.use((err, req, res, next) => {
  console.error('❌ Error global:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? {
      stack: err.stack,
      details: err
    } : undefined
  });
});

// 🚀 INICIALIZACIÓN
const startServer = async () => {
  try {
    // Inicializar base de datos
    await initDatabase();
    
    console.log('✅ Aplicación configurada correctamente');
    console.log('🔧 Funcionalidades habilitadas:');
    console.log('  📍 Seguimiento de ubicación');
    console.log('  📱 Monitoreo de aplicaciones'); // ✅ Nueva
    console.log('  🚨 Sistema de alertas');
    console.log('  🛡️ Zonas seguras');
    
    return app;
    
  } catch (error) {
    console.error('❌ Error iniciando aplicación:', error);
    process.exit(1);
  }
};

// Solo inicializar DB si no estamos en testing
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;