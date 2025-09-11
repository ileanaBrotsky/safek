// backend/src/services/websocket.js
const jwt = require('jsonwebtoken');
const { query } = require('../models/database');

class WebSocketService {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> { socketId, familyId }
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('🔗 Cliente conectado:', socket.id);

      // Autenticación del socket
      socket.on('authenticate', async (data) => {
        try {
          const { token } = data;
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'safekids_secret_key');
          
          // Verificar usuario en base de datos
          const userResult = await query(
            'SELECT id, name, email FROM families WHERE id = $1',
            [decoded.userId]
          );

          if (userResult.rows.length === 0) {
            socket.emit('auth_error', { message: 'Usuario no encontrado' });
            return;
          }

          const user = userResult.rows[0];
          
          // Almacenar información del usuario conectado
          this.connectedUsers.set(socket.id, {
            userId: user.id,
            familyId: user.id,
            userInfo: user
          });

          // Unir al room de la familia
          socket.join(`family_${user.id}`);
          
          socket.emit('authenticated', { 
            message: 'Autenticado exitosamente',
            user: user
          });

          console.log(`✅ Usuario autenticado: ${user.email} (${socket.id})`);

        } catch (error) {
          console.error('❌ Error en autenticación WebSocket:', error);
          socket.emit('auth_error', { message: 'Token inválido' });
        }
      });

      // Solicitar ubicación actual de un child
      socket.on('request_location', async (data) => {
        try {
          const userInfo = this.connectedUsers.get(socket.id);
          if (!userInfo) {
            socket.emit('error', { message: 'No autenticado' });
            return;
          }

          const { childId } = data;

          // Verificar que el child pertenece al usuario
          const childCheck = await query(
            'SELECT id, name FROM children WHERE id = $1 AND family_id = $2',
            [childId, userInfo.familyId]
          );

          if (childCheck.rows.length === 0) {
            socket.emit('error', { message: 'Child no encontrado' });
            return;
          }

          // Obtener última ubicación
          const locationResult = await query(
            `SELECT latitude, longitude, address, battery_level, accuracy, timestamp
             FROM locations 
             WHERE child_id = $1 
             ORDER BY timestamp DESC 
             LIMIT 1`,
            [childId]
          );

          if (locationResult.rows.length > 0) {
            socket.emit('location_update', {
              childId: parseInt(childId),
              location: locationResult.rows[0]
            });
          } else {
            socket.emit('no_location', { 
              childId: parseInt(childId),
              message: 'No hay ubicaciones registradas'
            });
          }

        } catch (error) {
          console.error('Error solicitando ubicación:', error);
          socket.emit('error', { message: 'Error interno del servidor' });
        }
      });

      // Manejar desconexión
      socket.on('disconnect', () => {
        const userInfo = this.connectedUsers.get(socket.id);
        if (userInfo) {
          console.log(`👋 Usuario desconectado: ${userInfo.userInfo.email}`);
          this.connectedUsers.delete(socket.id);
        } else {
          console.log('👋 Cliente desconectado:', socket.id);
        }
      });

      // Ping-pong para mantener conexión viva
      socket.on('ping', () => {
        socket.emit('pong');
      });
    });
  }

  // Emitir nueva ubicación a todos los usuarios de la familia
  emitLocationUpdate(familyId, data) {
    this.io.to(`family_${familyId}`).emit('location_update', data);
    console.log(`📍 Ubicación emitida a family_${familyId}:`, data.childId);
  }

  // Emitir nueva alerta a la familia
  emitAlert(familyId, alert) {
    this.io.to(`family_${familyId}`).emit('new_alert', {
      alert,
      timestamp: new Date().toISOString()
    });
    console.log(`🚨 Alerta emitida a family_${familyId}:`, alert.id);
  }

  // Emitir violación de zona segura
  emitSafeZoneViolation(familyId, data) {
    this.io.to(`family_${familyId}`).emit('safe_zone_violation', {
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log(`⚠️  Violación de zona segura emitida a family_${familyId}`);
  }

  // Emitir cambio en estado de child (online/offline)
  emitChildStatus(familyId, data) {
    this.io.to(`family_${familyId}`).emit('child_status_change', {
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log(`📱 Estado de child emitido a family_${familyId}:`, data.childId);
  }

  // Obtener usuarios conectados de una familia
  getConnectedUsersForFamily(familyId) {
    const connectedUsers = [];
    for (const [socketId, userInfo] of this.connectedUsers) {
      if (userInfo.familyId === familyId) {
        connectedUsers.push({
          socketId,
          userInfo: userInfo.userInfo
        });
      }
    }
    return connectedUsers;
  }

  // Verificar si hay usuarios conectados para una familia
  hasFamilyUsersConnected(familyId) {
    return this.getConnectedUsersForFamily(familyId).length > 0;
  }
}

module.exports = WebSocketService;