// frontend/src/components/map/MapEventHandler.js
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

const MapEventHandler = ({ 
  mode, 
  onMapClick, 
  onZoneClick,
  enableMapInteraction = true 
}) => {
  const map = useMap();
  
  useEffect(() => {
    if (!enableMapInteraction) return;
    
    // Manejar clics en el mapa para crear zonas
    const handleMapClick = (e) => {
      if (mode === 'configuration' && onMapClick) {
        onMapClick({
          latlng: {
            lat: e.latlng.lat,
            lng: e.latlng.lng
          },
          originalEvent: e.originalEvent
        });
      }
    };
    
    // Agregar listeners
    map.on('click', handleMapClick);
    
    // Cambiar cursor según el modo
    if (mode === 'configuration') {
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.getContainer().style.cursor = '';
    }
    
    // Cleanup
    return () => {
      map.off('click', handleMapClick);
      map.getContainer().style.cursor = '';
    };
  }, [map, mode, onMapClick, enableMapInteraction]);
  
  // Configurar controles del mapa según el modo
  useEffect(() => {
    if (mode === 'configuration') {
      // En modo configuración, permitir interacción total
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
    } else {
      // En modo monitoreo, permitir navegación básica
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.disable(); // Evitar zoom accidental
      map.scrollWheelZoom.enable();
      map.boxZoom.disable();
      map.keyboard.enable();
    }
  }, [map, mode]);
  
  return null;
};

export default MapEventHandler;