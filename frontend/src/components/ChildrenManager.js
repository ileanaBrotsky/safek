import React, { useState, useEffect } from 'react';
import { childrenService, safeZonesService } from '../services/api';

const ChildrenManager = ({ children = [], safeZones = [], onChildrenChange }) => {
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const [localSafeZones, setLocalSafeZones] = useState(safeZones);
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    deviceId: '',
    maxScreenTime: 180,
    maxSocialTime: 60,
    bedtimeHour: '22:00',
    assignedZones: []
  });

  // Solo cargar safe zones si no se pasaron como props
  useEffect(() => {
    if (safeZones.length === 0) {
      loadSafeZones();
    } else {
      setLocalSafeZones(safeZones);
    }
  }, [safeZones]);

  const loadSafeZones = async () => {
    try {
      const safeZonesRes = await safeZonesService.getAll();
      const safeZonesData = safeZonesRes.data?.safe_zones || safeZonesRes.safeZones || [];
      setLocalSafeZones(safeZonesData);
    } catch (error) {
      console.error('Error loading safe zones:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      const childData = {
        name: formData.name,
        age: parseInt(formData.age),
        device_id: formData.deviceId,
        max_screen_time: parseInt(formData.maxScreenTime),
        max_social_time: parseInt(formData.maxSocialTime),
        bedtime_hour: formData.bedtimeHour
      };

      let response;
      let updatedChildren;

      if (editingChild) {
        // Actualizar niño existente
        response = await childrenService.update(editingChild.id, childData);
        console.log('Child updated successfully:', response);
        
        // Construir datos actualizados del niño
        const updatedChild = {
          ...editingChild,
          ...childData,
          // Preservar campos que vienen del backend
          is_active: editingChild.is_active,
          risk_level: editingChild.risk_level,
          last_location: editingChild.last_location,
          created_at: editingChild.created_at,
          updated_at: new Date().toISOString()
        };

        // Actualizar en el array de children
        updatedChildren = children.map(child => 
          child.id === editingChild.id ? updatedChild : child
        );
      } else {
        // Crear nuevo niño
        response = await childrenService.create(childData);
        console.log('Child created successfully:', response);
        
        // Extraer datos del nuevo niño desde la respuesta
        const newChild = response.data?.child || response.child || { 
          id: Date.now(), // ID temporal en caso de que no venga del servidor
          ...childData,
          is_active: true,
          risk_level: 'low',
          last_location: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Agregar al array de children
        updatedChildren = [...children, newChild];
      }

      // Notificar al Dashboard con los datos actualizados
      if (onChildrenChange) {
        onChildrenChange(updatedChildren);
      }

      resetForm();
      setShowAddModal(false);
      setEditingChild(null);

    } catch (error) {
      console.error('Error saving child:', error);
      alert('Error al guardar: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (child) => {
    setEditingChild(child);
    setFormData({
      name: child.name,
      age: child.age.toString(),
      deviceId: child.device_id,
      maxScreenTime: child.max_screen_time || 180,
      maxSocialTime: child.max_social_time || 60,
      bedtimeHour: child.bedtime_hour || '22:00',
      assignedZones: []
    });
    setShowAddModal(true);
  };

  const handleDelete = async (child) => {
    if (window.confirm(`¿Estás seguro de eliminar a ${child.name}?`)) {
      try {
        setLoading(true);
        await childrenService.delete(child.id);
        
        // Eliminar del estado local
        const updatedChildren = children.filter(c => c.id !== child.id);
        
        // Notificar al Dashboard
        if (onChildrenChange) {
          onChildrenChange(updatedChildren);
        }
        
        console.log('Child deleted successfully');
      } catch (error) {
        console.error('Error deleting child:', error);
        alert('Error al eliminar: ' + (error.response?.data?.message || error.message));
      } finally {
        setLoading(false);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      age: '',
      deviceId: '',
      maxScreenTime: 180,
      maxSocialTime: 60,
      bedtimeHour: '22:00',
      assignedZones: []
    });
  };

  const getRiskColor = (level) => {
    switch (level) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading && !showAddModal) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Niños</h2>
          <p className="text-gray-600 mt-1">Administra los perfiles y configuraciones de cada niño</p>
          <p className="text-sm text-gray-500 mt-1">Total de niños: {children.length}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            console.log('Opening modal...');
            resetForm();
            setEditingChild(null);
            setShowAddModal(true);
          }}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 font-medium"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          <span>Agregar Niño</span>
        </button>
      </div>

      {/* Lista de Niños */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {children.map(child => (
          <div key={child.id} className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow">
            <div className="p-6">
              {/* Header del niño */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded-full ${child.is_active ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{child.name}</h3>
                    <p className="text-sm text-gray-600">{child.age} años</p>
                  </div>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${getRiskColor(child.risk_level)}`}>
                  {child.risk_level === 'high' ? 'Alto' :
                    child.risk_level === 'medium' ? 'Medio' : 'Bajo'}
                </span>
              </div>

              {/* Información del dispositivo */}
              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Device ID:</span>
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                    {child.device_id}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tiempo pantalla:</span>
                  <span className="font-semibold">{child.max_screen_time || 180} min/día</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Redes sociales:</span>
                  <span className="font-semibold">{child.max_social_time || 60} min/día</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Hora de descanso:</span>
                  <span className="font-semibold">{child.bedtime_hour || '22:00'}</span>
                </div>
              </div>

              {/* Última ubicación */}
              <div className="bg-gray-50 p-3 rounded-lg mb-4">
                <div className="flex items-center space-x-2 text-sm">
                  <svg className="h-4 w-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-600">Última ubicación:</span>
                </div>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {child.last_location?.address || 'Sin datos de ubicación'}
                </p>
                {child.last_location?.timestamp && (
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(child.last_location.timestamp).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Botones de acción */}
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => handleEdit(child)}
                  disabled={loading}
                  className="flex-1 bg-blue-50 text-blue-700 py-2 px-4 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm disabled:opacity-50"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(child)}
                  disabled={loading}
                  className="flex-1 bg-red-50 text-red-700 py-2 px-4 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Card para agregar niño */}
        {children.length === 0 && (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center col-span-full">
            <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 48 48">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M34 40h10v-4a6 6 0 00-10.712-3.714M34 40H14m20 0v-4M14 40H4v-4a6 6 0 0110.712-3.714M14 40v-4m0 0a4 4 0 118 0v4m-8-4V20a8 8 0 1116 0v16" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay niños registrados</h3>
            <p className="text-gray-600 mb-4">Comienza agregando el primer niño para empezar a monitorear</p>
            <button
              type="button"
              onClick={() => {
                console.log('Opening modal from empty state...');
                resetForm();
                setEditingChild(null);
                setShowAddModal(true);
              }}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Agregar Primer Niño
            </button>
          </div>
        )}
      </div>

      {/* Modal para Agregar/Editar */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">
                  {editingChild ? 'Editar Niño' : 'Agregar Nuevo Niño'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    console.log('Closing modal...');
                    setShowAddModal(false);
                    setEditingChild(null);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600 p-2"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Información Básica */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Información Básica</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ej: María García"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Edad *
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="18"
                      value={formData.age}
                      onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ej: 12"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Device ID (Identificador del Dispositivo) *
                    </label>
                    <input
                      type="text"
                      value={formData.deviceId}
                      onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ej: device_maria_001"
                      required
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Identificador único del teléfono o tablet del niño
                    </p>
                  </div>
                </div>
              </div>

              {/* Límites de Tiempo */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Límites de Tiempo</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tiempo de Pantalla (minutos/día)
                    </label>
                    <input
                      type="number"
                      min="30"
                      max="480"
                      value={formData.maxScreenTime}
                      onChange={(e) => setFormData({ ...formData, maxScreenTime: parseInt(e.target.value) })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Redes Sociales (minutos/día)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="240"
                      value={formData.maxSocialTime}
                      onChange={(e) => setFormData({ ...formData, maxSocialTime: parseInt(e.target.value) })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Hora de Descanso
                    </label>
                    <input
                      type="time"
                      value={formData.bedtimeHour}
                      onChange={(e) => setFormData({ ...formData, bedtimeHour: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Botones */}
              <div className="flex space-x-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    console.log('Cancel button clicked');
                    setShowAddModal(false);
                    setEditingChild(null);
                    resetForm();
                  }}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {loading ? 'Guardando...' : (editingChild ? 'Actualizar Niño' : 'Agregar Niño')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChildrenManager;
