import React, { useState, useEffect } from 'react';
import { MapPin, Home, School, AlertTriangle, Users } from 'lucide-react';

const InteractiveMap = ({ children = [], safeZones = [] }) => {
  const [selectedChild, setSelectedChild] = useState(null);
  const [mapCenter, setMapCenter] = useState([-34.6037, -58.3816]); // Buenos Aires
  const [mapLoaded, setMapLoaded] = useState(false);

  // Datos de ejemplo para mostrar funcionalidad
  const mockChildren = [
    {
      id: 1,
      name: 'María García',
      last_location: {
        latitude: -34.6037,
        longitude: -58.3816,
        address: 'Av. Corrientes 1234, Buenos Aires',
        timestamp: new Date().toISOString(),
        is_safe: true
      },
      risk_level: 'low',
      is_active: true
    },
    {
      id: 2,
      name: 'Carlos García',
      last_location: {
        latitude: -34.6118,
        longitude: -58.3960,
        address: 'Plaza de Mayo, Buenos Aires',
        timestamp: new Date(Date.now() - 300000).toISOString(), // 5 min ago
        is_safe: false
      },
      risk_level: 'high',
      is_active: true
    }
  ];

  const mockSafeZones = [
    {
      id: 1,
      name: 'Casa',
      latitude: -34.6037,
      longitude: -58.3816,
      radius: 100,
      zone_type: 'home',
      address: 'Av. Corrientes 1234'
    },
    {
      id: 2,
      name: 'Escuela Primaria',
      latitude: -34.6118,
      longitude: -58.3960,
      radius: 150,
      zone_type: 'school',
      address: 'Calle Defensa 567'
    }
  ];

  useEffect(() => {
    // Simular carga del mapa
    setTimeout(() => setMapLoaded(true), 1000);
  }, []);

  const getRiskColor = (level) => {
    switch (level) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getZoneIcon = (type) => {
    switch (type) {
      case 'home': return <Home className="h-4 w-4" />;
      case 'school': return <School className="h-4 w-4" />;
      default: return <MapPin className="h-4 w-4" />;
    }
  };

  if (!mapLoaded) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 font-medium">Cargando mapa...</p>
            <p className="text-gray-400 text-sm mt-1">Inicializando ubicaciones</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Ubicaciones en Tiempo Real</h2>
          <p className="text-gray-600 mt-1">Seguimiento de todos los niños y zonas seguras</p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <span>Actualización en vivo</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel de información */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Users className="h-5 w-5 mr-2 text-blue-500" />
            Estado de los Niños
          </h3>

          <div className="space-y-4">
            {mockChildren.map(child => (
              <div 
                key={child.id}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedChild?.id === child.id 
                    ? 'border-blue-300 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedChild(child)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${child.is_active ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                    <span className="font-semibold text-gray-900">{child.name}</span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${getRiskColor(child.risk_level)}`}>
                    {child.risk_level === 'high' ? 'Alto' :
                      child.risk_level === 'medium' ? 'Medio' : 'Bajo'}
                  </span>
                </div>

                <div className="text-sm text-gray-600">
                  <p className="flex items-center mb-1">
                    <MapPin className="h-4 w-4 mr-1" />
                    {child.last_location?.address}
                  </p>
                  <p className="text-xs text-gray-500">
                    Última actualización: {new Date(child.last_location?.timestamp).toLocaleString()}
                  </p>
                </div>

                {!child.last_location?.is_safe && (
                  <div className="mt-2 flex items-center text-red-600 text-sm">
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    Fuera de zona segura
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Zonas Seguras */}
          <div className="mt-6">
            <h4 className="text-md font-semibold text-gray-900 mb-3">Zonas Seguras</h4>
            <div className="space-y-2">
              {mockSafeZones.map(zone => (
                <div key={zone.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="text-blue-500">
                    {getZoneIcon(zone.zone_type)}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">{zone.name}</p>
                    <p className="text-xs text-gray-500">{zone.address}</p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    {zone.radius}m
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mapa */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="relative h-96 lg:h-full bg-gray-100">
            {/* Simulación del mapa */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-green-100 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="bg-white rounded-lg p-6 shadow-lg max-w-md">
                  <MapPin className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Mapa Interactivo</h3>
                  <p className="text-gray-600 text-sm mb-4">
                    Aquí se mostraría el mapa real con React-Leaflet o Google Maps
                  </p>
                  
                  {/* Simulación de marcadores */}
                  <div className="text-left space-y-2">
                    <div className="flex items-center text-sm">
                      <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                      <span>María García - En casa</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                      <span>Carlos García - Fuera de zona</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
                      <span>Zonas seguras (Casa, Escuela)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Controles del mapa */}
            <div className="absolute top-4 right-4 space-y-2">
              <button className="bg-white p-2 rounded-lg shadow-md hover:shadow-lg transition-shadow">
                <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
              <button className="bg-white p-2 rounded-lg shadow-md hover:shadow-lg transition-shadow">
                <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
            </div>

            {/* Información del niño seleccionado */}
            {selectedChild && (
              <div className="absolute bottom-4 left-4 bg-white p-4 rounded-lg shadow-lg max-w-xs">
                <h4 className="font-semibold text-gray-900 mb-2">{selectedChild.name}</h4>
                <p className="text-sm text-gray-600 mb-1">
                  {selectedChild.last_location?.address}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(selectedChild.last_location?.timestamp).toLocaleString()}
                </p>
                <div className="mt-2 flex justify-between items-center">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${getRiskColor(selectedChild.risk_level)}`}>
                    Riesgo {selectedChild.risk_level === 'high' ? 'Alto' :
                      selectedChild.risk_level === 'medium' ? 'Medio' : 'Bajo'}
                  </span>
                  <div className={`w-2 h-2 rounded-full ${selectedChild.last_location?.is_safe ? 'bg-green-400' : 'bg-red-400'}`}></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InteractiveMap;