// backend/server.js
require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const socketIo = require('socket.io');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Configurar Socket.IO para comunicación en tiempo real
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    methods: ["GET", "POST"]
  }
});

// Middleware para Socket.IO
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  socket.on('join_family', (familyId) => {
    socket.join(`family_${familyId}`);
    console.log(`Cliente ${socket.id} se unió a family_${familyId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Hacer io accesible en toda la aplicación
app.set('io', io);

server.listen(PORT, () => {
  console.log('🚀 SafeKids Backend ejecutándose en puerto', PORT);
  console.log('🌐 URL: http://localhost:' + PORT);
  console.log('📊 Health check: http://localhost:' + PORT + '/health');
  console.log('🔗 API: http://localhost:' + PORT + '/api');
  console.log('🌍 Entorno:', process.env.NODE_ENV || 'development');
});

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('Error no manejado:', err);
  process.exit(1);
});

module.exports = { server, io };