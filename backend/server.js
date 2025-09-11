// backend/server.js
require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const socketIo = require('socket.io');
const WebSocketService = require('./src/services/websocket');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Configurar Socket.IO para comunicación en tiempo real
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || ["http://localhost:3001", "http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Inicializar servicio WebSocket
const wsService = new WebSocketService(io);

// Hacer io y wsService accesibles en toda la aplicación
app.set('io', io);
app.set('wsService', wsService);

server.listen(PORT, () => {
  console.log('🚀 SafeKids Backend ejecutándose en puerto', PORT);
  console.log('🌐 URL: http://localhost:' + PORT);
  console.log('📊 Health check: http://localhost:' + PORT + '/health');
  console.log('🔗 API: http://localhost:' + PORT + '/api');
  console.log('📡 WebSocket: habilitado');
  console.log('🌍 Entorno:', process.env.NODE_ENV || 'development');
});

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('Error no manejado:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('🛑 Cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
  });
});

module.exports = { server, io, wsService };