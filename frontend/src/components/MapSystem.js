// frontend/src/components/MapSystem.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { safeZonesService, childrenService } from '../services/api';

const MapSystem = ({ 
  mode = 'monitoring', // 'monitoring' | 'configuration' | 'hybrid'
  children = [],
  safeZones = [],
  onSafeZonesChange = null,
  height = "600px",
  enableRealTimeTracking = true
}) => {
  const mapRef = useRef(null);
  const [mapState, setMapState] = useState({
    center: { lat: -34.6037, lng: -58.3816 }, // Buenos Aires default
    zoom: 12,
    bounds: null
  });

  // Estados para monitoreo
  const [realTimeData, setRealTimeData] = useState({
    childrenLocations: [],
    alerts: [],
    lastUpdate: null
  });

  // Estados para configuración
  const [configMode, setConfigMode] = useState({
    isCreatingZone: false,
    selectedLocation: null,
    editingZone: null,
    pendingZone: null
  });

  // Estados UI
  const [selectedChild, setSelectedChild] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [showZoneDetails, setShowZoneDetails] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Inicialización del mapa
  useEffect(() => {
    initializeMap();
  }, []);

  // Actualización en tiempo real
  useEffect(() => {
    if (enableRealTimeTracking && mode !== 'configuration') {
      const interval = setInterval(fetchRealTimeData, 30000); // 30 segundos
      fetchRealTimeData(); // Primera carga
      return () => clearInterval(interval);
    }
  }, [enableRealTimeTracking, mode]);

  const initializeMap = async () => {
    try {
      // Calcular centro basado en zonas existentes
      if (safeZones.length > 0) {
        const centerLat = safeZones.reduce((sum, zone) => sum + zone.latitude, 0) / safeZones.length;
        const centerLng = safeZones.reduce((sum, zone) => sum + zone.longitude, 0) / safeZones.length;
        
        setMapState(prev => ({
          ...prev,
          center: { lat: centerLat, lng: centerLng }
        }));
      }
      
      setMapLoaded(true);
    } catch (error) {
      console.error('Error initializing map:', error);
      setMapLoaded(true); // Mostrar mapa aunque haya error
    }
  };

  const fetchRealTimeData = async () => {
    try {
      // En un entorno real, esto consultaría endpoints de ubicaciones en tiempo real
      const locations = await Promise.all(
        children.map(async (child) => {
          try {
            // Simular llamada a API de ubicación del dispositivo móvil
            // En producción: await locationService.getChildLocation(child.id)
            return {
              childId: child.id,
              childName: child.name,
              latitude: child.last_location?.latitude || (mapState.center.lat + (Math.random() - 0.5) * 0.01),
              longitude: child.last_location?.longitude || (mapState.center.lng + (Math.random() - 0.5) * 0.01),
              timestamp: new Date().toISOString(),
              accuracy: Math.floor(Math.random() * 50) + 5,
              isInSafeZone: false, // Se calculará
              currentZone: null,
              battery: Math.floor(Math.random() * 100),
              isOnline: Math.random() > 0.1 // 90% online
            };
          } catch (error) {
            console.error(`Error fetching location for child ${child.id}:`, error);
            return null;
          }
        })
      );

      const validLocations = locations.filter(loc => loc !== null);
      
      // Verificar qué niños están en zonas seguras
      const locationsWithZoneStatus = validLocations.map(location => {
        const currentZone = findZoneForLocation(location.latitude, location.longitude);
        return {
          ...location,
          isInSafeZone: currentZone !== null,
          currentZone: currentZone
        };
      });

      setRealTimeData(prev => ({
        ...prev,
        childrenLocations: locationsWithZoneStatus,
        lastUpdate: new Date().toISOString()
      }));

      // Generar alertas si hay niños fuera de zonas seguras
      generateSafetyAlerts(locationsWithZoneStatus);

    } catch (error) {
      console.error('Error fetching real-time data:', error);
    }
  };

  const findZoneForLocation = (lat, lng) => {
    return safeZones.find(zone => {
      const distance = calculateDistance(lat, lng, zone.latitude, zone.longitude);
      return distance <= zone.radius && zone.is_active;
    });
  };

  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lng2-lng1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
  };

  const generateSafetyAlerts = (locations) => {
    const newAlerts = [];
    
    locations.forEach(location => {
      if (!location.isInSafeZone && location.isOnline) {
        newAlerts.push({
          id: `alert-${location.childId}-${Date.now()}`,
          childId: location.childId,
          childName: location.childName,
          type: 'outside_safe_zone',
          severity: 'high',
          message: `${location.childName} está fuera de todas las zonas seguras`,
          location: { lat: location.latitude, lng: location.longitude },
          timestamp: new Date().toISOString()
        });
      }
    });

    if (newAlerts.length > 0) {
      setRealTimeData(prev => ({
        ...prev,
        alerts: [...prev.alerts, ...newAlerts].slice(-50) // Mantener últimas 50 alertas
      }));
    }
  };

  // Convertir coordenadas a píxeles del viewport
  const latLngToPixel = (lat, lng) => {
    if (!mapRef.current) return { x: 0, y: 0 };
    
    const rect = mapRef.current.getBoundingClientRect();
    const zoomFactor = mapState.zoom / 10;
    
    // Proyección simple basada en el centro del mapa
    const x = ((lng - mapState.center.lng) * zoomFactor * 100000) + rect.width / 2;
    const y = ((mapState.center.lat - lat) * zoomFactor * 100000) + rect.height / 2;
    
    return { x: Math.max(0, Math.min(rect.width, x)), y: Math.max(0, Math.min(rect.height, y)) };
  };

  // Manejar clic en el mapa para configuración
  const handleMapClick = (event) => {
    if (mode !== 'configuration' && !configMode.isCreatingZone) return;
    
    const rect = mapRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Convertir píxeles a coordenadas
    const zoomFactor = mapState.zoom / 10;
    const lng = mapState.center.lng + ((x - rect.width / 2) / (zoomFactor * 100000));
    const lat = mapState.center.lat - ((y - rect.height / 2) / (zoomFactor * 100000));
    
    setConfigMode(prev => ({
      ...prev,
      selectedLocation: { lat, lng }
    }));
  };

  // Crear nueva zona segura
  const createSafeZone = async (zoneData) => {
    try {
      const response = await safeZonesService.create({
        ...zoneData,
        latitude: configMode.selectedLocation.lat,
        longitude: configMode.selectedLocation.lng
      });
      
      if (onSafeZonesChange) {
        // Recargar zonas desde el componente padre
        const allZones = await safeZonesService.getAll();
        onSafeZonesChange(allZones.data?.safe_zones || []);
      }
      
      setConfigMode(prev => ({
        ...prev,
        isCreatingZone: false,
        selectedLocation: null
      }));
      
      return response;
    } catch (error) {
      console.error('Error creating safe zone:', error);
      throw error;
    }
  };

  // Controles de zoom
  const zoomIn = () => {
    setMapState(prev => ({
      ...prev,
      zoom: Math.min(18, prev.zoom + 1)
    }));
  };

  const zoomOut = () => {
    setMapState(prev => ({
      ...prev,
      zoom: Math.max(8, prev.zoom - 1)
    }));
  };

  // Centrar en ubicación específica
  const centerOnLocation = (lat, lng, zoom = null) => {
    setMapState(prev => ({
      ...prev,
      center: { lat, lng },
      zoom: zoom || prev.zoom
    }));
  };

  // Tipos de zona con estilos
  const zoneTypes = {
    home: { label: 'Casa', icon: '🏠', color: 'bg-green-500', borderColor: 'border-green-600' },
    school: { label: 'Escuela', icon: '🏫', color: 'bg-blue-500', borderColor: 'border-blue-600' },
    park: { label: 'Parque', icon: '🌳', color: 'bg-emerald-500', borderColor: 'border-emerald-600' },
    relative: { label: 'Familiar', icon: '👨‍👩‍👧‍👦', color: 'bg-purple-500', borderColor: 'border-purple-600' },
    other: { label: 'Otro', icon: '📍', color: 'bg-gray-500', borderColor: 'border-gray-600' }
  };

  if (!mapLoaded) {
    return (
      <div className="flex items-center justify-center bg-gray-50 rounded-lg border-2 border-gray-200" style={{ height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Inicializando sistema de mapas...</p>
          <p className="text-gray-500 text-sm mt-1">Cargando ubicaciones y zonas seguras</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header del sistema de mapas */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {mode === 'monitoring' ? 'Monitoreo en Tiempo Real' : 
               mode === 'configuration' ? 'Configuración de Zonas' : 'Sistema de Mapas'}
            </h3>
            <p className="text-sm text-gray-600">
              {realTimeData.lastUpdate && (
                <>Última actualización: {new Date(realTimeData.lastUpdate).toLocaleTimeString()}</>
              )}
            </p>
          </div>
          
          {mode === 'monitoring' && (
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${enableRealTimeTracking ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
              <span className="text-sm text-gray-600">
                {enableRealTimeTracking ? 'En vivo' : 'Pausado'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {mode === 'configuration' && (
            <button
              onClick={() => setConfigMode(prev => ({ ...prev, isCreatingZone: !prev.isCreatingZone }))}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                configMode.isCreatingZone
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {configMode.isCreatingZone ? 'Cancelar' : 'Nueva Zona'}
            </button>
          )}
          
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={zoomIn}
              className="px-3 py-2 bg-white hover:bg-gray-50 border-r border-gray-300 transition-colors"
              title="Acercar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
            <span className="px-3 py-2 bg-gray-50 text-sm font-medium text-gray-700">
              {mapState.zoom}x
            </span>
            <button
              onClick={zoomOut}
              className="px-3 py-2 bg-white hover:bg-gray-50 border-l border-gray-300 transition-colors"
              title="Alejar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Contenedor principal del mapa */}
      <div className="relative">
        {/* Canvas del mapa */}
        <div 
          ref={mapRef}
          onClick={handleMapClick}
          className={`relative w-full bg-gradient-to-br from-blue-50 to-green-50 rounded-lg border-2 border-gray-200 overflow-hidden ${
            configMode.isCreatingZone ? 'cursor-crosshair' : 'cursor-grab'
          }`}
          style={{ height }}
        >
          {/* Grid de fondo */}
          <div className="absolute inset-0 opacity-10">
            <div className="w-full h-full" style={{
              backgroundImage: `
                linear-gradient(90deg, rgba(59, 130, 246, 0.3) 1px, transparent 1px),
                linear-gradient(rgba(59, 130, 246, 0.3) 1px, transparent 1px)
              `,
              backgroundSize: `${20 * (mapState.zoom / 10)}px ${20 * (mapState.zoom / 10)}px`
            }}></div>
          </div>

          {/* Centro del mapa */}
          <div 
            className="absolute w-2 h-2 bg-red-500 rounded-full border border-white shadow-sm transform -translate-x-1/2 -translate-y-1/2 z-10"
            style={{
              left: '50%',
              top: '50%'
            }}
            title={`Centro: ${mapState.center.lat.toFixed(4)}, ${mapState.center.lng.toFixed(4)}`}
          ></div>

          {/* Zonas seguras */}
          {safeZones.map((zone) => {
            const position = latLngToPixel(zone.latitude, zone.longitude);
            const radiusPixels = Math.max(20, (zone.radius / 1000) * mapState.zoom * 2);
            const zoneType = zoneTypes[zone.zone_type] || zoneTypes.other;
            
            // Solo mostrar si está en viewport
            if (position.x < -radiusPixels || position.x > mapRef.current?.clientWidth + radiusPixels ||
                position.y < -radiusPixels || position.y > mapRef.current?.clientHeight + radiusPixels) {
              return null;
            }

            return (
              <div key={`zone-${zone.id}`} className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
                style={{
                  left: `${position.x}px`,
                  top: `${position.y}px`,
                  zIndex: selectedZone?.id === zone.id ? 30 : 20
                }}
              >
                {/* Área de la zona */}
                <div 
                  className={`rounded-full border-2 border-white shadow-md ${zone.is_active ? 'opacity-30' : 'opacity-15'} ${zoneType.color}`}
                  style={{
                    width: `${radiusPixels}px`,
                    height: `${radiusPixels}px`
                  }}
                ></div>
                
                {/* Marcador central */}
                <div 
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedZone(selectedZone?.id === zone.id ? null : zone);
                  }}
                >
                  <div className={`w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-sm font-medium ${zoneType.color} hover:scale-110 transition-transform`}>
                    {zoneType.icon}
                  </div>
                </div>
                
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                    <div className="font-medium">{zone.name}</div>
                    <div className="text-gray-300">Radio: {zone.radius}m</div>
                    <div className="text-gray-300">{zoneType.label}</div>
                    <div className={`text-xs ${zone.is_active ? 'text-green-300' : 'text-red-300'}`}>
                      {zone.is_active ? '● Activa' : '○ Inactiva'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Ubicaciones de niños en tiempo real */}
          {mode === 'monitoring' && realTimeData.childrenLocations.map((location) => {
            const position = latLngToPixel(location.latitude, location.longitude);
            const child = children.find(c => c.id === location.childId);
            
            if (!child || position.x < 0 || position.x > mapRef.current?.clientWidth ||
                position.y < 0 || position.y > mapRef.current?.clientHeight) {
              return null;
            }

            return (
              <div key={`child-${location.childId}`} className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
                style={{
                  left: `${position.x}px`,
                  top: `${position.y}px`,
                  zIndex: selectedChild?.id === child.id ? 40 : 35
                }}
              >
                {/* Indicador de precisión */}
                <div 
                  className={`rounded-full border-2 border-white ${location.isInSafeZone ? 'bg-green-200' : 'bg-red-200'} opacity-20`}
                  style={{
                    width: `${location.accuracy}px`,
                    height: `${location.accuracy}px`
                  }}
                ></div>
                
                {/* Avatar del niño */}
                <div 
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedChild(selectedChild?.id === child.id ? null : child);
                  }}
                >
                  <div className={`w-10 h-10 rounded-full border-3 shadow-lg flex items-center justify-center text-white text-sm font-bold hover:scale-110 transition-transform ${
                    location.isInSafeZone ? 'border-green-500 bg-green-600' : 'border-red-500 bg-red-600'
                  }`}>
                    {child.name.charAt(0).toUpperCase()}
                  </div>
                  
                  {/* Indicador de estado online */}
                  <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                    location.isOnline ? 'bg-green-400' : 'bg-gray-400'
                  }`}></div>
                </div>
                
                {/* Información del niño */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                    <div className="font-medium">{child.name}</div>
                    <div className="text-gray-300">
                      {location.isInSafeZone ? `En ${location.currentZone.name}` : 'Fuera de zonas seguras'}
                    </div>
                    <div className="text-gray-300">
                      Precisión: ±{location.accuracy}m
                    </div>
                    <div className="text-gray-300">
                      Batería: {location.battery}%
                    </div>
                    <div className="text-gray-300">
                      {new Date(location.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Ubicación seleccionada para nueva zona */}
          {configMode.selectedLocation && (
            <div 
              className="absolute transform -translate-x-1/2 -translate-y-1/2 z-50"
              style={{
                left: `${latLngToPixel(configMode.selectedLocation.lat, configMode.selectedLocation.lng).x}px`,
                top: `${latLngToPixel(configMode.selectedLocation.lat, configMode.selectedLocation.lng).y}px`
              }}
            >
              <div className="w-6 h-6 bg-yellow-500 rounded-full border-2 border-white shadow-lg animate-bounce flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          )}

          {/* Instrucciones de uso */}
          {configMode.isCreatingZone && (
            <div className="absolute bottom-4 left-4 bg-blue-100 border border-blue-300 rounded-lg p-3 text-sm text-blue-800 max-w-xs">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <strong>Modo Configuración:</strong><br />
                  Haz clic en el mapa para seleccionar la ubicación de la nueva zona segura.
                </div>
              </div>
            </div>
          )}

          {/* Información de coordenadas */}
          <div className="absolute top-4 right-4 bg-white bg-opacity-95 rounded-lg p-2 text-xs text-gray-700 font-mono">
            Centro: {mapState.center.lat.toFixed(4)}, {mapState.center.lng.toFixed(4)}
          </div>

          {/* Escala */}
          <div className="absolute bottom-4 right-4 bg-white bg-opacity-95 rounded-lg p-2 text-xs text-gray-700">
            <div className="flex items-center gap-2">
              <div className="w-10 h-1 bg-gray-600"></div>
              <span>~{Math.round(1000 / mapState.zoom)}m</span>
            </div>
          </div>
        </div>

        {/* Panel lateral para información detallada */}
        {(selectedChild || selectedZone) && (
          <div className="absolute top-0 right-0 w-80 h-full bg-white border-l border-gray-200 shadow-lg z-50 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-900">
                {selectedChild ? 'Información del Niño' : 'Detalles de la Zona'}
              </h4>
              <button
                onClick={() => {
                  setSelectedChild(null);
                  setSelectedZone(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {selectedChild && (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h5 className="font-medium text-gray-900 mb-2">{selectedChild.name}</h5>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Edad:</span>
                      <span className="font-medium">{selectedChild.age} años</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Estado:</span>
                      <span className={`font-medium ${selectedChild.is_active ? 'text-green-600' : 'text-red-600'}`}>
                        {selectedChild.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Información de ubicación en tiempo real */}
                {(() => {
                  const location = realTimeData.childrenLocations.find(loc => loc.childId === selectedChild.id);
                  if (!location) return null;

                  return (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <h6 className="font-medium text-blue-900 mb-2">Ubicación Actual</h6>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-blue-700">Estado:</span>
                          <span className={`font-medium ${location.isInSafeZone ? 'text-green-600' : 'text-red-600'}`}>
                            {location.isInSafeZone ? `En ${location.currentZone?.name}` : 'Fuera de zonas seguras'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-700">Precisión:</span>
                          <span className="font-medium">±{location.accuracy}m</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-700">Batería:</span>
                          <span className="font-medium">{location.battery}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-700">Conexión:</span>
                          <span className={`font-medium ${location.isOnline ? 'text-green-600' : 'text-red-600'}`}>
                            {location.isOnline ? 'En línea' : 'Sin conexión'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-700">Última actualización:</span>
                          <span className="font-medium text-xs">
                            {new Date(location.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => centerOnLocation(location.latitude, location.longitude, 15)}
                        className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
                      >
                        Centrar en el mapa
                      </button>
                    </div>
                  );
                })()}

                {/* Historial de alertas del niño */}
                <div className="bg-yellow-50 rounded-lg p-4">
                  <h6 className="font-medium text-yellow-900 mb-2">Alertas Recientes</h6>
                  <div className="space-y-2">
                    {realTimeData.alerts
                      .filter(alert => alert.childId === selectedChild.id)
                      .slice(0, 3)
                      .map(alert => (
                        <div key={alert.id} className="flex items-start gap-2 text-sm">
                          <div className="w-2 h-2 bg-red-500 rounded-full mt-1.5 flex-shrink-0"></div>
                          <div>
                            <p className="text-gray-900 font-medium">{alert.message}</p>
                            <p className="text-gray-600 text-xs">
                              {new Date(alert.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    {realTimeData.alerts.filter(alert => alert.childId === selectedChild.id).length === 0 && (
                      <p className="text-yellow-700 text-sm">No hay alertas recientes</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {selectedZone && (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{zoneTypes[selectedZone.zone_type]?.icon || '📍'}</span>
                    <h5 className="font-medium text-gray-900">{selectedZone.name}</h5>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tipo:</span>
                      <span className="font-medium">{zoneTypes[selectedZone.zone_type]?.label || 'Otro'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Radio:</span>
                      <span className="font-medium">{selectedZone.radius}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Estado:</span>
                      <span className={`font-medium ${selectedZone.is_active ? 'text-green-600' : 'text-red-600'}`}>
                        {selectedZone.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Coordenadas:</span>
                      <span className="font-medium text-xs">
                        {selectedZone.latitude.toFixed(4)}, {selectedZone.longitude.toFixed(4)}
                      </span>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => centerOnLocation(selectedZone.latitude, selectedZone.longitude, 15)}
                    className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
                  >
                    Centrar en el mapa
                  </button>
                </div>

                {/* Niños actualmente en esta zona */}
                <div className="bg-green-50 rounded-lg p-4">
                  <h6 className="font-medium text-green-900 mb-2">Niños en esta zona</h6>
                  <div className="space-y-2">
                    {realTimeData.childrenLocations
                      .filter(location => location.currentZone?.id === selectedZone.id)
                      .map(location => {
                        const child = children.find(c => c && c.id === location.childId);
                        return child && child.name ? (
                          <div key={location.childId} className="flex items-center gap-2 text-sm">
                            <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {child.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-gray-900 font-medium">{child.name}</p>
                              <p className="text-gray-600 text-xs">
                                Desde: {new Date(location.timestamp).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        ) : null;
                      })}
                    {realTimeData.childrenLocations.filter(location => location.currentZone?.id === selectedZone.id).length === 0 && (
                      <p className="text-green-700 text-sm">No hay niños en esta zona actualmente</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Formulario rápido para crear zona desde mapa */}
      {configMode.selectedLocation && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-lg font-semibold text-gray-900 mb-3">Crear Zona Segura</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                placeholder="Ej: Casa de María"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                onChange={(e) => setConfigMode(prev => ({ 
                  ...prev, 
                  pendingZone: { ...prev.pendingZone, name: e.target.value }
                }))}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                onChange={(e) => setConfigMode(prev => ({ 
                  ...prev, 
                  pendingZone: { ...prev.pendingZone, zone_type: e.target.value }
                }))}
              >
                {Object.entries(zoneTypes).map(([key, type]) => (
                  <option key={key} value={key}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Radio (metros)</label>
              <input
                type="number"
                min="10"
                max="5000"
                defaultValue="100"
                placeholder="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                onChange={(e) => setConfigMode(prev => ({ 
                  ...prev, 
                  pendingZone: { ...prev.pendingZone, radius: parseInt(e.target.value) }
                }))}
              />
            </div>
            
            <div className="flex items-end gap-2">
              <button
                onClick={async () => {
                  try {
                    await createSafeZone({
                      name: configMode.pendingZone?.name || 'Nueva Zona',
                      zone_type: configMode.pendingZone?.zone_type || 'other',
                      radius: configMode.pendingZone?.radius || 100
                    });
                  } catch (error) {
                    alert('Error al crear zona: ' + error.message);
                  }
                }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
              >
                Crear Zona
              </button>
              <button
                onClick={() => setConfigMode(prev => ({ 
                  ...prev, 
                  selectedLocation: null, 
                  pendingZone: null 
                }))}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
          
          <div className="mt-2 text-xs text-gray-600">
            Ubicación seleccionada: {configMode.selectedLocation.lat.toFixed(6)}, {configMode.selectedLocation.lng.toFixed(6)}
          </div>
        </div>
      )}

      {/* Panel de estadísticas en tiempo real */}
      {mode === 'monitoring' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Niños Monitoreados</p>
                <p className="text-2xl font-bold text-gray-900">
                  {realTimeData.childrenLocations.filter(loc => loc.isOnline).length}
                </p>
              </div>
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">En Zonas Seguras</p>
                <p className="text-2xl font-bold text-green-600">
                  {realTimeData.childrenLocations.filter(loc => loc.isInSafeZone && loc.isOnline).length}
                </p>
              </div>
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Alertas Activas</p>
                <p className="text-2xl font-bold text-red-600">
                  {realTimeData.alerts.filter(alert => {
                    const alertTime = new Date(alert.timestamp);
                    const now = new Date();
                    return (now - alertTime) < 300000; // Últimos 5 minutos
                  }).length}
                </p>
              </div>
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Zonas Activas</p>
                <p className="text-2xl font-bold text-purple-600">
                  {safeZones.filter(zone => zone.is_active).length}
                </p>
              </div>
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapSystem;