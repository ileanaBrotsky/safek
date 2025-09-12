// frontend/src/components/MapSystem.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { safeZonesService, childrenService } from '../services/api';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import MapEventHandler from './map/MapEventHandler';
import ZoneForm from './map/ZoneForm';

const MapSystem = ({
  mode = 'monitoring', // 'monitoring' | 'configuration' | 'hybrid'
  children = [],
  safeZones = [],
  onSafeZonesChange = null,
  height = "600px",
  enableRealTimeTracking = true
}) => {
  const [mapState, setMapState] = useState({
    center: { lat: -38.9473, lng: -68.0626 }, // Neuquén, Argentina (coordenadas válidas por defecto)
    //center: { lat: -34.6037, lng: -58.3816 }, // Buenos Aires
    zoom: 12,
    bounds: null
  });

  // Configurar iconos de Leaflet
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });

  // Iconos personalizados para children
  const createChildIcon = (child, isInSafeZone) => {
    const color = isInSafeZone ? '#10B981' : '#F59E0B'; // Verde si está en zona segura, naranja si no

    return L.divIcon({
      html: `
      <div style="
        background: ${color};
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 3px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 12px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ">
        ${child.name.charAt(0).toUpperCase()}
      </div>
    `,
      className: 'custom-child-icon',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  };

  // Iconos para zonas seguras
  const createZoneIcon = (zone) => {
    const zoneTypes = {
      home: { icon: '🏠', color: '#10B981' },
      school: { icon: '🏫', color: '#3B82F6' },
      family: { icon: '👨‍👩‍👧‍👦', color: '#8B5CF6' },
      custom: { icon: '📍', color: '#6B7280' }
    };

    const zoneType = zoneTypes[zone.zone_type] || zoneTypes.custom;

    return L.divIcon({
      html: `
      <div style="
        background: ${zoneType.color};
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 3px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      ">
        ${zoneType.icon}
      </div>
    `,
      className: 'custom-zone-icon',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
  };

  // Componente para centrar el mapa automáticamente
  const MapCenterController = ({ center, zoom }) => {
    const map = useMap();

    useEffect(() => {
      map.setView([center.lat, center.lng], zoom);
    }, [map, center.lat, center.lng, zoom]);

    return null;
  };

  // Estados para monitoreo
  const [realTimeData, setRealTimeData] = useState({
    childrenLocations: [],
    alerts: [],
    lastUpdate: null
  });


  // Estados UI
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const findZoneForLocation = useCallback((lat, lng) => {
    for (const zone of safeZones) {
      if (!zone.is_active) continue;

      // Calcular distancia usando fórmula de Haversine simplificada
      const R = 6371e3; // Radio de la Tierra en metros
      const φ1 = lat * Math.PI / 180;
      const φ2 = zone.latitude * Math.PI / 180;
      const Δφ = (zone.latitude - lat) * Math.PI / 180;
      const Δλ = (zone.longitude - lng) * Math.PI / 180;

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      const distance = R * c; // Distancia en metros

      if (distance <= zone.radius) {
        return zone;
      }
    }
    return null;
  }, [safeZones]);

  const generateSafetyAlerts = useCallback((locations) => {
    const newAlerts = [];

    locations.forEach(location => {
      // Solo generar alertas para niños que están online
      if (!location.isOnline) return;

      // Alerta si el niño está fuera de zona segura
      if (!location.isInSafeZone) {
        newAlerts.push({
          id: `alert_${location.childId}_${Date.now()}`,
          childId: location.childId,
          childName: location.childName,
          type: 'location',
          severity: 'medium',
          title: 'Fuera de zona segura',
          message: `${location.childName} está fuera de las zonas seguras configuradas`,
          timestamp: new Date().toISOString(),
          location: {
            latitude: location.latitude,
            longitude: location.longitude
          }
        });
      }

      // Alerta de batería baja
      if (location.battery < 20) {
        newAlerts.push({
          id: `battery_${location.childId}_${Date.now()}`,
          childId: location.childId,
          childName: location.childName,
          type: 'battery',
          severity: 'low',
          title: 'Batería baja',
          message: `El dispositivo de ${location.childName} tiene ${location.battery}% de batería`,
          timestamp: new Date().toISOString()
        });
      }
    });

    return newAlerts;
  }, []);

  const fetchRealTimeData = useCallback(async () => {
    try {
      // 🔥 DATOS REALES - Sin simulación
      const locations = await Promise.all(
        children.map(async (child) => {
          try {
            // ✅ USAR API REAL para obtener ubicación actual
            const locationResponse = await childrenService.getCurrentLocation(child.id);

            if (locationResponse.success && locationResponse.data.location) {
              const location = locationResponse.data.location;

              return {
                childId: child.id,
                childName: child.name,
                latitude: location.latitude,
                longitude: location.longitude,
                timestamp: location.timestamp || location.created_at,
                accuracy: location.accuracy || 10,
                isInSafeZone: false, // Se calculará después
                currentZone: null,
                battery: 100, // Esto vendrá del dispositivo móvil en el futuro
                isOnline: true, // También vendrá del dispositivo móvil
                address: location.address || 'Ubicación no disponible'
              };
            } else {
              // Si no hay ubicación real, retornar null en lugar de datos simulados
              console.warn(`No hay ubicación disponible para ${child.name}`);
              return null;
            }
          } catch (error) {
            console.error(`Error obteniendo ubicación real para ${child.name}:`, error);
            return null;
          }
        })
      );

      // Filtrar ubicaciones válidas (eliminar null)
      const validLocations = locations.filter(loc => loc !== null);

      // Verificar qué niños están en zonas seguras usando las coordenadas reales
      const locationsWithZoneStatus = validLocations.map(location => {
        const currentZone = findZoneForLocation(location.latitude, location.longitude);
        return {
          ...location,
          isInSafeZone: currentZone !== null,
          currentZone: currentZone
        };
      });

      // Generar alertas de seguridad
      const newAlerts = generateSafetyAlerts(locationsWithZoneStatus);

      // Actualizar estado con datos reales
      setRealTimeData(prev => ({
        ...prev,
        childrenLocations: locationsWithZoneStatus,
        alerts: newAlerts,
        lastUpdate: new Date().toISOString()
      }));

    } catch (error) {
      console.error('Error obteniendo datos de ubicación en tiempo real:', error);

      // En caso de error, mostrar estado offline pero NO generar datos falsos
      setRealTimeData(prev => ({
        ...prev,
        childrenLocations: children.map(child => ({
          childId: child.id,
          childName: child.name,
          latitude: null,
          longitude: null,
          timestamp: null,
          accuracy: 0,
          isInSafeZone: false,
          currentZone: null,
          battery: 0,
          isOnline: false,
          address: 'Sin conexión'
        })),
        alerts: [],
        lastUpdate: new Date().toISOString()
      }));
    }
  }, [children, findZoneForLocation, generateSafetyAlerts]);

  const initializeMap = useCallback(async () => {
    try {
      // Solo cambiar centro si hay zonas seguras Y tienen coordenadas válidas
      if (safeZones.length > 0) {
        const validZones = safeZones.filter(zone =>
          zone.latitude != null &&
          zone.longitude != null &&
          !isNaN(zone.latitude) &&
          !isNaN(zone.longitude)
        );

        if (validZones.length > 0) {
          const centerLat = validZones.reduce((sum, zone) => sum + zone.latitude, 0) / validZones.length;
          const centerLng = validZones.reduce((sum, zone) => sum + zone.longitude, 0) / validZones.length;

          // Validar que las coordenadas calculadas no sean NaN
          if (!isNaN(centerLat) && !isNaN(centerLng)) {
            setMapState(prev => ({
              ...prev,
              center: { lat: centerLat, lng: centerLng }
            }));
          }
        }
      }

      setMapLoaded(true);
    } catch (error) {
      console.error('Error initializing map:', error);
      setMapLoaded(true); // Mostrar mapa aunque haya error
    }
  }, [safeZones]);

  //validación en el MapContainer
  const isValidCoordinate = (lat, lng) => {
    return !isNaN(lat) && !isNaN(lng) &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180;
  };

  // Inicialización del mapa
  useEffect(() => {
    initializeMap();
  }, [initializeMap]);

  // Actualización en tiempo real
  useEffect(() => {
    if (enableRealTimeTracking && mode !== 'configuration') {
      const interval = setInterval(fetchRealTimeData, 30000); // 30 segundos
      fetchRealTimeData(); // Primera carga
      return () => clearInterval(interval);
    }
  }, [enableRealTimeTracking, mode, fetchRealTimeData]);


  // Manejar clic en el mapa para configuración
  const handleMapClick = useCallback((event) => {
    if (mode !== 'configuration') return;

    setSelectedPosition({
      lat: event.latlng.lat,
      lng: event.latlng.lng
    });
    setShowZoneForm(true);
  }, [mode]);

const handleZoneSave = useCallback(async (zoneData) => {
  try {
    if (editingZone) {
      // Al EDITAR, usar las coordenadas existentes de la zona
      await safeZonesService.update(editingZone.id, {
        ...zoneData,
        latitude: parseFloat(editingZone.latitude),  // Asegurar que sea número
        longitude: parseFloat(editingZone.longitude) // Asegurar que sea número
      });
    } else {
      // Al CREAR, usar la posición seleccionada
      if (!selectedPosition) {
        throw new Error('Debe seleccionar una ubicación en el mapa');
      }
      
      await safeZonesService.create({
        ...zoneData,
        latitude: selectedPosition.lat,
        longitude: selectedPosition.lng
      });
    }
    
    if (onSafeZonesChange) {
      const allZones = await safeZonesService.getAll();
      onSafeZonesChange(allZones.data?.safe_zones || []);
    }
    
    setShowZoneForm(false);
    setEditingZone(null);
    setSelectedPosition(null);
  } catch (error) {
    throw error;
  }
}, [editingZone, selectedPosition, onSafeZonesChange]);



  // Eliminar zona segura
  const deleteSafeZone = useCallback(async (zoneId) => {
    try {
      if (!window.confirm('¿Estás seguro de eliminar esta zona segura?')) return;

      await safeZonesService.delete(zoneId);

      if (onSafeZonesChange) {
        const allZones = await safeZonesService.getAll();
        onSafeZonesChange(allZones.data?.safe_zones || []);
      }
    } catch (error) {
      console.error('Error deleting safe zone:', error);
      throw error;
    }
  }, [onSafeZonesChange]);

  // Controles de zoom
  const zoomIn = useCallback(() => {
    setMapState(prev => ({
      ...prev,
      zoom: Math.min(18, prev.zoom + 1)
    }));
  }, []);


  const zoomOut = useCallback(() => {
    setMapState(prev => ({
      ...prev,
      zoom: Math.max(8, prev.zoom - 1)
    }));
  }, []);

  // Centrar en ubicación específica
  const centerOnLocation = useCallback((lat, lng, zoom = null) => {
    setMapState(prev => ({
      ...prev,
      center: { lat, lng },
      zoom: zoom || prev.zoom
    }));
  }, []);

  // // Tipos de zona con estilos
  // const zoneTypes = {
  //   home: { label: 'Casa', icon: '🏠', color: 'bg-green-500', borderColor: 'border-green-600' },
  //   school: { label: 'Escuela', icon: '🏫', color: 'bg-blue-500', borderColor: 'border-blue-600' },
  //   park: { label: 'Parque', icon: '🌳', color: 'bg-emerald-500', borderColor: 'border-emerald-600' },
  //   relative: { label: 'Familiar', icon: '👨‍👩‍👧‍👦', color: 'bg-purple-500', borderColor: 'border-purple-600' },
  //   other: { label: 'Otro', icon: '📍', color: 'bg-gray-500', borderColor: 'border-gray-600' }
  // };


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
          <span className="text-sm text-gray-600">
            Centro: {mapState.center.lat.toFixed(4)}, {mapState.center.lng.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Mapa Real con Leaflet - CON VALIDACIÓN */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden" style={{ height }}>
        {mapLoaded && isValidCoordinate(mapState.center.lat, mapState.center.lng) ? (
          <MapContainer
            center={[mapState.center.lat, mapState.center.lng]}
            zoom={mapState.zoom}
            style={{ height: '100%', width: '100%' }}
            className="z-10"
          >
            {/* Capa base del mapa */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Controlador para centrar el mapa - CON VALIDACIÓN */}
            <MapCenterController center={mapState.center} zoom={mapState.zoom} />
            <MapEventHandler
              mode={mode}
              onMapClick={handleMapClick}
            />
            {/* Zonas Seguras - CON VALIDACIÓN DE COORDENADAS */}
            {safeZones
              .filter(zone => isValidCoordinate(zone.latitude, zone.longitude))
              .map((zone) => (
                <React.Fragment key={`zone-${zone.id}`}>
                  {/* Círculo de la zona */}
                  <Circle
                    center={[zone.latitude, zone.longitude]}
                    radius={zone.radius}
                    pathOptions={{
                      color: zone.zone_type === 'home' ? '#10B981' :
                        zone.zone_type === 'school' ? '#3B82F6' :
                          zone.zone_type === 'family' ? '#8B5CF6' : '#6B7280',
                      fillColor: zone.zone_type === 'home' ? '#10B981' :
                        zone.zone_type === 'school' ? '#3B82F6' :
                          zone.zone_type === 'family' ? '#8B5CF6' : '#6B7280',
                      fillOpacity: 0.2,
                      weight: 2,
                      opacity: zone.is_active ? 0.8 : 0.3
                    }}
                  />

                  {/* Marcador central de la zona */}
                  <Marker
                    position={[zone.latitude, zone.longitude]}
                    icon={createZoneIcon(zone)}
                  >
                    <Popup>
                      <div className="text-sm">
                        <h4 className="font-semibold text-gray-900">{zone.name}</h4>
                        <p className="text-gray-600">Tipo: {zone.zone_type}</p>
                        <p className="text-gray-600">Radio: {zone.radius}m</p>
                        <p className={`text-xs ${zone.is_active ? 'text-green-600' : 'text-red-600'}`}>
                          {zone.is_active ? '● Activa' : '○ Inactiva'}
                        </p>
                        {zone.address && (
                          <p className="text-xs text-gray-500 mt-1">{zone.address}</p>
                        )}
                        {mode === 'configuration' && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => setEditingZone(zone)}
                              className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => deleteSafeZone(zone.id)}
                              className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
                            >
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                </React.Fragment>
              ))}
            {/* Ubicaciones de Niños - CON VALIDACIÓN */}
            {mode === 'monitoring' && realTimeData.childrenLocations
              .filter(location =>
                location.isOnline &&
                isValidCoordinate(location.latitude, location.longitude)
              )
              .map((location) => {
                const child = children.find(c => c.id === location.childId);

                if (!child) return null;

                return (
                  <Marker
                    key={`child-${location.childId}`}
                    position={[location.latitude, location.longitude]}
                    icon={createChildIcon(child, location.isInSafeZone)}
                  >
                    <Popup>
                      <div className="text-sm">
                        <h4 className="font-semibold text-gray-900">{child.name}</h4>
                        <div className="space-y-1">
                          <p className={`text-xs ${location.isInSafeZone ? 'text-green-600' : 'text-orange-600'}`}>
                            {location.isInSafeZone ? '✅ En zona segura' : '⚠️ Fuera de zona segura'}
                          </p>
                          {location.currentZone && (
                            <p className="text-xs text-green-600">📍 {location.currentZone.name}</p>
                          )}
                          <p className="text-xs text-gray-600">
                            Precisión: {location.accuracy}m
                          </p>
                          <p className="text-xs text-gray-600">
                            Batería: {location.battery}%
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(location.timestamp).toLocaleTimeString()}
                          </p>
                          {location.address && (
                            <p className="text-xs text-gray-500">{location.address}</p>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
          </MapContainer>
        ) : (
          <div className="flex items-center justify-center bg-gray-50 h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 font-medium">
                {!isValidCoordinate(mapState.center.lat, mapState.center.lng)
                  ? 'Validando coordenadas del mapa...'
                  : 'Inicializando mapa...'
                }
              </p>
              <p className="text-gray-500 text-sm mt-1">
                Centro: {mapState.center.lat}, {mapState.center.lng}
              </p>
            </div>
          </div>
        )}
        {/* Controles de Zoom */}
        {mode === 'configuration' && (
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
            <button
              onClick={zoomIn}
              className="bg-white border border-gray-300 rounded-md p-2 shadow-sm hover:bg-gray-50"
              title="Acercar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
            <button
              onClick={zoomOut}
              className="bg-white border border-gray-300 rounded-md p-2 shadow-sm hover:bg-gray-50"
              title="Alejar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
              </svg>
            </button>
          </div>
        )}
        {safeZones.length > 0 && (
          <button
            onClick={() => {
              const centerLat = safeZones.reduce((sum, zone) => sum + zone.latitude, 0) / safeZones.length;
              const centerLng = safeZones.reduce((sum, zone) => sum + zone.longitude, 0) / safeZones.length;
              centerOnLocation(centerLat, centerLng, 13);
            }}
            className="bg-white border border-gray-300 rounded-md p-2 shadow-sm hover:bg-gray-50"
            title="Centrar en zonas"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
          </button>
        )}

      </div>

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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Alertas Activas</p>
                <p className="text-2xl font-bold text-red-600">
                  {realTimeData.alerts.length}
                </p>
              </div>
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5C3.312 18.333 4.274 20 5.814 20z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Zonas Activas</p>
                <p className="text-2xl font-bold text-purple-600">
                  {safeZones.filter(z => z.is_active).length}
                </p>
              </div>
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}
      {(showZoneForm || editingZone) && (
        <ZoneForm
          zone={editingZone}
          selectedPosition={selectedPosition}
          onSave={handleZoneSave}
          onCancel={() => {
            setShowZoneForm(false);
            setEditingZone(null);
            setSelectedPosition(null);
          }}
        />
      )}
    </div>
  );
};

export default MapSystem;