import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, MapPin, Clock, Shield } from 'lucide-react';

const NotificationSystem = () => {
  const [notifications, setNotifications] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Simular conexión WebSocket
    const connectWebSocket = () => {
      console.log('Conectando a WebSocket...');
      setIsConnected(true);
      
      // Simular notificaciones de ejemplo
      // const simulateNotifications = () => {
      //   const mockNotifications = [
      //     {
      //       id: Date.now() + 1,
      //       type: 'location',
      //       severity: 'high',
      //       title: 'Fuera de zona segura',
      //       message: 'María está fuera de la zona escolar autorizada',
      //       childName: 'María García',
      //       timestamp: new Date(),
      //       autoClose: false
      //     },
      //     {
      //       id: Date.now() + 2,
      //       type: 'screentime',
      //       severity: 'medium',
      //       title: 'Límite de pantalla superado',
      //       message: 'Carlos ha superado su límite diario de pantalla',
      //       childName: 'Carlos García',
      //       timestamp: new Date(),
      //       autoClose: true
      //     }
      //   ];

      //   setTimeout(() => {
      //     setNotifications(prev => [...prev, mockNotifications[0]]);
      //   }, 2000);

      //   setTimeout(() => {
      //     setNotifications(prev => [...prev, mockNotifications[1]]);
      //   }, 5000);
      // };

      // simulateNotifications();
    };

    connectWebSocket();

    return () => {
      setIsConnected(false);
    };
  }, []);

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'location':
        return <MapPin className="h-5 w-5" />;
      case 'screentime':
        return <Clock className="h-5 w-5" />;
      case 'security':
        return <Shield className="h-5 w-5" />;
      default:
        return <AlertTriangle className="h-5 w-5" />;
    }
  };

  const getNotificationColor = (severity) => {
    switch (severity) {
      case 'high':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'medium':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'low':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  return (
    <>
      {/* Indicador de conexión */}
      <div className="fixed top-4 right-4 z-50">
        <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium ${
          isConnected 
            ? 'bg-green-100 text-green-800 border border-green-200' 
            : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
          }`}></div>
          <span>{isConnected ? 'Conectado' : 'Desconectado'}</span>
        </div>
      </div>

      {/* Notificaciones */}
      <div className="fixed top-20 right-4 z-40 space-y-3 max-w-sm">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`p-4 rounded-lg border shadow-lg ${getNotificationColor(notification.severity)} transform transition-all duration-300 ease-in-out`}
            style={{
              animation: 'slideInRight 0.3s ease-out'
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className={`mt-0.5 ${
                  notification.severity === 'high' ? 'text-red-600' :
                  notification.severity === 'medium' ? 'text-yellow-600' :
                  'text-blue-600'
                }`}>
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm">{notification.title}</h4>
                  <p className="text-sm opacity-90 mt-1">{notification.message}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs font-medium">{notification.childName}</span>
                    <span className="text-xs opacity-70">
                      {notification.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => removeNotification(notification.id)}
                className="ml-2 p-1 hover:bg-black hover:bg-opacity-10 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
};

export default NotificationSystem;