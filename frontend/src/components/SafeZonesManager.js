// frontend/src/components/SafeZonesManager.js
import React, { useState, useEffect, useCallback } from 'react';
import { safeZonesService } from '../services/api';

const SafeZonesManager = ({ onSafeZonesChange }) => {
  const [safeZones, setSafeZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('created_at');

  // Estado del formulario
  const [formData, setFormData] = useState({
    name: '',
    latitude: '',
    longitude: '',
    radius: 100,
    description: '',
    zone_type: 'home'
  });

  // Cargar zonas seguras al inicializar
  useEffect(() => {
    loadSafeZones();
  }, []);

  const loadSafeZones = async () => {
    try {
      setLoading(true);
      console.log('🔄 Cargando zonas seguras...');
      
      const response = await safeZonesService.getAll();
      const zones = response.data?.safe_zones || response.safeZones || [];
      
      setSafeZones(zones);
      console.log('✅ Zonas seguras cargadas:', zones.length);
      
      // Notificar al Dashboard de los cambios
      if (onSafeZonesChange) {
        onSafeZonesChange(zones);
      }
    } catch (error) {
      console.error('❌ Error loading safe zones:', error);
      alert('Error al cargar zonas seguras: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Resetear formulario
  const resetForm = () => {
    setFormData({
      name: '',
      latitude: '',
      longitude: '',
      radius: 100,
      description: '',
      zone_type: 'home'
    });
  };

  // Manejar envío del formulario
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const zoneData = {
        name: formData.name.trim(),
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        radius: parseInt(formData.radius),
        description: formData.description?.trim() || '',
        zone_type: formData.zone_type
      };

      let response;
      let updatedZones;

      if (editingZone) {
        // Actualizar zona existente
        response = await safeZonesService.update(editingZone.id, zoneData);
        console.log('Safe zone updated successfully:', response);
        
        const updatedZone = response.data?.safe_zone || response.safe_zone || { 
          ...editingZone, 
          ...zoneData,
          updated_at: new Date().toISOString()
        };

        updatedZones = safeZones.map(zone => 
          zone.id === editingZone.id ? updatedZone : zone
        );
      } else {
        // Crear nueva zona
        response = await safeZonesService.create(zoneData);
        console.log('Safe zone created successfully:', response);
        
        const newZone = response.data?.safe_zone || response.safe_zone || { 
          id: Date.now(),
          ...zoneData,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        updatedZones = [...safeZones, newZone];
      }

      setSafeZones(updatedZones);
      
      // Notificar al Dashboard
      if (onSafeZonesChange) {
        onSafeZonesChange(updatedZones);
      }

      resetForm();
      setShowAddModal(false);
      setEditingZone(null);

    } catch (error) {
      console.error('Error saving safe zone:', error);
      alert('Error al guardar: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Editar zona
  const handleEdit = (zone) => {
    setEditingZone(zone);
    setFormData({
      name: zone.name,
      latitude: zone.latitude.toString(),
      longitude: zone.longitude.toString(),
      radius: zone.radius,
      description: zone.description || '',
      zone_type: zone.zone_type || 'home'
    });
    setShowAddModal(true);
  };

  // Eliminar zona
  const handleDelete = async (zone) => {
    if (!window.confirm(`¿Estás seguro de eliminar la zona "${zone.name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      await safeZonesService.delete(zone.id);
      
      const updatedZones = safeZones.filter(z => z.id !== zone.id);
      setSafeZones(updatedZones);
      
      if (onSafeZonesChange) {
        onSafeZonesChange(updatedZones);
      }
      
      console.log('✅ Zona eliminada:', zone.name);
    } catch (error) {
      console.error('❌ Error deleting safe zone:', error);
      alert('Error al eliminar: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Activar/desactivar zona
  const handleToggle = async (zone) => {
    try {
      setLoading(true);
      await safeZonesService.toggle(zone.id);
      
      const updatedZones = safeZones.map(z => 
        z.id === zone.id ? { ...z, is_active: !z.is_active } : z
      );
      setSafeZones(updatedZones);
      
      if (onSafeZonesChange) {
        onSafeZonesChange(updatedZones);
      }
      
      console.log('✅ Zona actualizada:', zone.name);
    } catch (error) {
      console.error('❌ Error toggling safe zone:', error);
      alert('Error al actualizar: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Obtener ubicación actual
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData(prev => ({
            ...prev,
            latitude: position.coords.latitude.toString(),
            longitude: position.coords.longitude.toString()
          }));
        },
        (error) => {
          console.error('Error getting location:', error);
          alert('No se pudo obtener la ubicación actual');
        }
      );
    } else {
      alert('Geolocalización no soportada por el navegador');
    }
  };

  // Filtrar y ordenar zonas
  const filteredZones = safeZones
    .filter(zone => 
      zone.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (zone.description && zone.description.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created_at':
          return new Date(b.created_at) - new Date(a.created_at);
        case 'radius':
          return b.radius - a.radius;
        default:
          return 0;
      }
    });

  // Tipos de zona con iconos
  const zoneTypes = {
    home: { label: 'Casa', icon: '🏠', color: 'bg-green-100 text-green-800' },
    school: { label: 'Escuela', icon: '🏫', color: 'bg-blue-100 text-blue-800' },
    park: { label: 'Parque', icon: '🌳', color: 'bg-emerald-100 text-emerald-800' },
    relative: { label: 'Familiar', icon: '👨‍👩‍👧‍👦', color: 'bg-purple-100 text-purple-800' },
    other: { label: 'Otro', icon: '📍', color: 'bg-gray-100 text-gray-800' }
  };

  if (loading && safeZones.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando zonas seguras...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con acciones */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Zonas Seguras</h2>
            <p className="text-gray-600">Gestiona las ubicaciones seguras para tus hijos</p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Nueva Zona
            </button>
            
            <button
              onClick={loadSafeZones}
              disabled={loading}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualizar
            </button>
          </div>
        </div>

        {/* Filtros y búsqueda */}
        <div className="mt-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por nombre o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="created_at">Más recientes</option>
            <option value="name">Nombre A-Z</option>
            <option value="radius">Radio mayor</option>
          </select>
        </div>
      </div>

      {/* Lista de zonas seguras */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {filteredZones.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🗺️</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron zonas' : 'No hay zonas seguras'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm 
                ? 'Intenta con otros términos de búsqueda' 
                : 'Comienza creando una zona segura para proteger a tus hijos'
              }
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Crear Primera Zona
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredZones.map((zone) => {
              const zoneType = zoneTypes[zone.zone_type] || zoneTypes.other;
              
              return (
                <div key={zone.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{zoneType.icon}</span>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{zone.name}</h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${zoneType.color}`}>
                            {zoneType.label}
                          </span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Radio:</span> {zone.radius}m
                        </div>
                        <div>
                          <span className="font-medium">Latitud:</span> {zone.latitude.toFixed(6)}
                        </div>
                        <div>
                          <span className="font-medium">Longitud:</span> {zone.longitude.toFixed(6)}
                        </div>
                        <div>
                          <span className="font-medium">Estado:</span>
                          <span className={`ml-1 ${zone.is_active ? 'text-green-600' : 'text-red-600'}`}>
                            {zone.is_active ? 'Activa' : 'Inactiva'}
                          </span>
                        </div>
                      </div>
                      
                      {zone.description && (
                        <p className="mt-2 text-gray-600 text-sm">{zone.description}</p>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleToggle(zone)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          zone.is_active 
                            ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                            : 'bg-red-100 text-red-800 hover:bg-red-200'
                        }`}
                      >
                        {zone.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                      
                      <button
                        onClick={() => handleEdit(zone)}
                        className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Editar zona"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      
                      <button
                        onClick={() => handleDelete(zone)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        title="Eliminar zona"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal para agregar/editar zona */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  {editingZone ? 'Editar Zona Segura' : 'Nueva Zona Segura'}
                </h3>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingZone(null);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre de la zona *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ej: Casa de los abuelos"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de zona
                  </label>
                  <select
                    value={formData.zone_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, zone_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {Object.entries(zoneTypes).map(([key, type]) => (
                      <option key={key} value={key}>
                        {type.icon} {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Latitud *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={formData.latitude}
                      onChange={(e) => setFormData(prev => ({ ...prev, latitude: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="-34.6037"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Longitud *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={formData.longitude}
                      onChange={(e) => setFormData(prev => ({ ...prev, longitude: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="-58.3816"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={getCurrentLocation}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Usar mi ubicación actual
                </button>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Radio (metros) *
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="5000"
                    required
                    value={formData.radius}
                    onChange={(e) => setFormData(prev => ({ ...prev, radius: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Entre 10 y 5000 metros</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripción (opcional)
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows="3"
                    placeholder="Información adicional sobre esta zona..."
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditingZone(null);
                      resetForm();
                    }}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Guardando...' : (editingZone ? 'Actualizar' : 'Crear')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SafeZonesManager;