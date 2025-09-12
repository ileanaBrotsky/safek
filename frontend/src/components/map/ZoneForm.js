// frontend/src/components/map/ZoneForm.js
import React, { useState, useEffect } from 'react';
import { X, MapPin, Home, School, Users, Map } from 'lucide-react';

const ZoneForm = ({ 
  zone = null, 
  selectedPosition = null,
  onSave, 
  onCancel,
  loading = false 
}) => {
  const [formData, setFormData] = useState({
    name: '',
    zone_type: 'home',
    radius: 100,
    address: '',
    is_active: true
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inicializar formulario con datos de la zona existente
  useEffect(() => {
    if (zone) {
      setFormData({
        name: zone.name || '',
        zone_type: zone.zone_type || 'home',
        radius: zone.radius || 100,
        address: zone.address || '',
        is_active: zone.is_active !== undefined ? zone.is_active : true
      });
    } else {
      setFormData({
        name: '',
        zone_type: 'home',
        radius: 100,
        address: '',
        is_active: true
      });
    }
  }, [zone]);

  // Opciones de tipo de zona con iconos
  const zoneTypeOptions = [
    { value: 'home', label: 'Casa', icon: Home, color: 'text-green-600', description: 'Hogar familiar' },
    { value: 'school', label: 'Escuela', icon: School, color: 'text-blue-600', description: 'Centro educativo' },
    { value: 'family', label: 'Familiar', icon: Users, color: 'text-purple-600', description: 'Casa de familiares' },
    { value: 'custom', label: 'Personalizada', icon: Map, color: 'text-gray-600', description: 'Zona personalizada' }
  ];

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    } else if (formData.name.length < 3) {
      newErrors.name = 'El nombre debe tener al menos 3 caracteres';
    }

    if (!formData.radius || formData.radius < 10) {
      newErrors.radius = 'El radio mínimo es 10 metros';
    } else if (formData.radius > 2000) {
      newErrors.radius = 'El radio máximo es 2000 metros';
    }

    if (!zone && !selectedPosition) {
      newErrors.position = 'Selecciona una ubicación en el mapa';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      await onSave(formData);
    } catch (error) {
      console.error('Error saving zone:', error);
      setErrors({ submit: 'Error al guardar la zona. Intenta nuevamente.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Limpiar error del campo cuando el usuario empiece a escribir
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {zone ? 'Editar Zona Segura' : 'Crear Nueva Zona Segura'}
          </h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nombre de la zona */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre de la zona *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Ej: Casa de los abuelos"
              disabled={isSubmitting}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name}</p>
            )}
          </div>

          {/* Tipo de zona */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de zona
            </label>
            <div className="grid grid-cols-2 gap-2">
              {zoneTypeOptions.map((option) => {
                const IconComponent = option.icon;
                const isSelected = formData.zone_type === option.value;
                
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleInputChange('zone_type', option.value)}
                    className={`p-3 border rounded-lg transition-colors text-left ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50 text-blue-700' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    disabled={isSubmitting}
                  >
                    <div className="flex items-center gap-2">
                      <IconComponent className={`w-4 h-4 ${isSelected ? 'text-blue-600' : option.color}`} />
                      <span className="text-sm font-medium">{option.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Radio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Radio de seguridad *
            </label>
            <div className="relative">
              <input
                type="number"
                value={formData.radius}
                onChange={(e) => handleInputChange('radius', parseInt(e.target.value) || 0)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  errors.radius ? 'border-red-300' : 'border-gray-300'
                }`}
                min="10"
                max="2000"
                step="10"
                disabled={isSubmitting}
              />
              <span className="absolute right-3 top-2 text-sm text-gray-500">metros</span>
            </div>
            {errors.radius && (
              <p className="mt-1 text-xs text-red-600">{errors.radius}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Rango recomendado: 50-500 metros
            </p>
          </div>

          {/* Dirección */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Dirección (opcional)
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="Dirección exacta o referencia"
              disabled={isSubmitting}
            />
          </div>

          {/* Zona activa */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => handleInputChange('is_active', e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              disabled={isSubmitting}
            />
            <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
              Zona activa (recibir notificaciones)
            </label>
          </div>

          {/* Información de ubicación */}
          {(selectedPosition || zone) && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4" />
                <span className="font-medium">Ubicación:</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {selectedPosition 
                  ? `${selectedPosition.lat.toFixed(6)}, ${selectedPosition.lng.toFixed(6)}`
                  : zone 
                  ? `${parseFloat(zone.latitude).toFixed(6)}, ${parseFloat(zone.longitude).toFixed(6)}`
                  : 'No seleccionada'
                }
              </p>
            </div>
          )}

          {/* Errores generales */}
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}

          {errors.position && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-sm text-yellow-600">{errors.position}</p>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting || loading}
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Guardando...</span>
                </div>
              ) : (
                zone ? 'Actualizar Zona' : 'Crear Zona'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ZoneForm;