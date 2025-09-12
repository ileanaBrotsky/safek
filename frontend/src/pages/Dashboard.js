// frontend/src/pages/Dashboard.js - Versión unificada con MapSystem
import React, { useState, useEffect, useCallback } from 'react';
import useAuthStore from '../store/useAuthStore';
import ChildrenManager from '../components/ChildrenManager';
import MapSystem from '../components/MapSystem'; // ← Sistema unificado
import { childrenService, alertsService, safeZonesService } from '../services/api';
import NotificationSystem from '../components/common/NotificationSystem';

const Dashboard = () => {
  const { family, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  
  // Estado centralizado - una sola fuente de verdad
  const [allChildren, setAllChildren] = useState([]);
  const [_allAlerts, setAllAlerts] = useState([]);
  const [allSafeZones, setAllSafeZones] = useState([]);
  
  const [dashboardData, setDashboardData] = useState({
    children: [],
    alerts: [],
    safeZones: [],
    metrics: {
      activeChildren: 0,
      todayAlerts: 0,
      unreadAlerts: 0,
      locationsToday: 0,
      activeSafeZones: 0,
      childrenInSafeZones: 0
    }
  });

  // Función para actualizar children desde ChildrenManager
  const updateChildren = useCallback((newChildren) => {
    setAllChildren(newChildren);
    
    setDashboardData(prev => ({
      ...prev,
      children: newChildren,
      metrics: {
        ...prev.metrics,
        activeChildren: newChildren.filter(c => c.is_active).length
      }
    }));
  }, []);

  // Función para actualizar zonas seguras
  const updateSafeZones = useCallback((newSafeZones) => {
    setAllSafeZones(newSafeZones);
    
    setDashboardData(prev => ({
      ...prev,
      safeZones: newSafeZones,
      metrics: {
        ...prev.metrics,
        activeSafeZones: newSafeZones.filter(z => z.is_active).length
      }
    }));
  }, []);

  // Cargar datos iniciales
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      console.log('🔄 Cargando datos iniciales del dashboard...');

      const [childrenRes, alertsRes, safeZonesRes] = await Promise.all([
        childrenService.getAll().catch(e => ({ children: [] })),
        alertsService.getAll({ limit: 10 }).catch(e => ({ alerts: [] })),
        safeZonesService.getAll().catch(e => ({ safeZones: [] }))
      ]);

      const childrenData = childrenRes.data?.children || childrenRes.children || [];
      const alertsData = alertsRes.data?.alerts || alertsRes.alerts || [];
      const safeZonesData = safeZonesRes.data?.safe_zones || safeZonesRes.safeZones || [];

      // Actualizar todos los estados
      setAllChildren(childrenData);
      setAllAlerts(alertsData);
      setAllSafeZones(safeZonesData);

      const data = {
        children: childrenData,
        alerts: alertsData,
        safeZones: safeZonesData,
        metrics: {
          activeChildren: childrenData.filter(c => c.is_active).length,
          todayAlerts: alertsData.length,
          unreadAlerts: alertsData.filter(a => !a.is_read).length,
          locationsToday: Math.floor(Math.random() * 50), // Temporal
          activeSafeZones: safeZonesData.filter(z => z.is_active).length,
          childrenInSafeZones: Math.floor(Math.random() * childrenData.length) // Temporal
        }
      };

      setDashboardData(data);
      console.log('✅ Dashboard actualizado:', {
        children: data.children.length,
        alerts: data.alerts.length,
        safeZones: data.safeZones.length,
        activeSafeZones: data.metrics.activeSafeZones
      });

    } catch (error) {
      console.error('❌ Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  // Función para refrescar datos manualmente
  const refreshDashboard = () => {
    loadInitialData();
  };

  // Navegación entre tabs - Actualizada
  const navItems = [
    { id: 'dashboard', label: 'Panel Principal', icon: '📊' },
    { id: 'children', label: 'Gestión de Niños', icon: '👶' },
    { id: 'monitoring', label: 'Monitoreo en Vivo', icon: '🗺️' }, 
    { id: 'safe-zones', label: 'Configurar Zonas', icon: '⚙️' }, 
    { id: 'alerts', label: 'Alertas', icon: '🚨' },
    { id: 'reports', label: 'Reportes', icon: '📈' } 
  ];

  // Renderizar contenido según la pestaña activa
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboardOverview();
      
      case 'children':
        return (
          <ChildrenManager 
            children={allChildren} 
            safeZones={allSafeZones}
            onChildrenChange={updateChildren}
          />
        );
      
      case 'monitoring': // ← Monitoreo en tiempo real
        return (
          <MapSystem 
            mode="monitoring"
            children={allChildren}
            safeZones={allSafeZones}
            enableRealTimeTracking={true}
            height="700px"
          />
        );
      
      case 'safe-zones': // ← Configuración de zonas
        return (
          <MapSystem 
            mode="configuration"
            children={allChildren}
            safeZones={allSafeZones}
            onSafeZonesChange={updateSafeZones}
            height="600px"
          />
        );
      
      case 'alerts':
        return renderAlertsView();
      
      case 'reports':
        return renderReportsView();
      
      default:
        return renderDashboardOverview();
    }
  };

  // Renderizar vista principal del dashboard - Actualizada
  const renderDashboardOverview = () => (
    <div className="space-y-6">
      {/* Métricas principales - Ampliadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {/* Niños Activos */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Niños Activos</p>
              <p className="text-3xl font-bold text-gray-900">{dashboardData.metrics.activeChildren}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Zonas Seguras */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Zonas Activas</p>
              <p className="text-3xl font-bold text-green-600">{dashboardData.metrics.activeSafeZones}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Alertas Hoy */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Alertas Hoy</p>
              <p className="text-3xl font-bold text-yellow-600">{dashboardData.metrics.todayAlerts}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
        </div>

        {/* En Zonas Seguras */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">En Zona Segura</p>
              <p className="text-3xl font-bold text-emerald-600">{dashboardData.metrics.childrenInSafeZones}</p>
            </div>
            <div className="p-3 bg-emerald-100 rounded-full">
              <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Ubicaciones Hoy */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Ubicaciones</p>
              <p className="text-3xl font-bold text-purple-600">{dashboardData.metrics.locationsToday}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Sin Leer */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Sin Leer</p>
              <p className="text-3xl font-bold text-red-600">{dashboardData.metrics.unreadAlerts}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-5 5v-5zM5 12V7a5 5 0 1110 0v5l-5 5-5-5z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Mapa resumen */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Vista General del Monitoreo</h3>
          <button
            onClick={() => setActiveTab('monitoring')}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Ver en detalle →
          </button>
        </div>
        
        <MapSystem 
          mode="monitoring"
          children={allChildren}
          safeZones={allSafeZones}
          enableRealTimeTracking={true}
          height="400px"
        />
      </div>

      {/* Resumen de información */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resumen de niños */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Estado de los Niños</h3>
            <button
              onClick={() => setActiveTab('children')}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Gestionar →
            </button>
          </div>
          
          {dashboardData.children.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">👶</div>
              <p className="text-gray-600">No hay niños registrados</p>
              <button
                onClick={() => setActiveTab('children')}
                className="mt-3 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Agregar primer niño
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboardData.children.slice(0, 4).map((child) => (
                <div key={child.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-bold">
                        {child.name?.charAt(0)?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{child.name}</p>
                      <p className="text-sm text-gray-600">{child.age} años</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      child.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {child.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                    <button
                      onClick={() => setActiveTab('monitoring')}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Ver en mapa"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              {dashboardData.children.length > 4 && (
                <p className="text-center text-sm text-gray-500">
                  Y {dashboardData.children.length - 4} más...
                </p>
              )}
            </div>
          )}
        </div>

        {/* Resumen de zonas seguras */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Zonas Seguras</h3>
            <button
              onClick={() => setActiveTab('safe-zones')}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Configurar →
            </button>
          </div>
          
          {dashboardData.safeZones.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">🗺️</div>
              <p className="text-gray-600">No hay zonas seguras definidas</p>
              <button
                onClick={() => setActiveTab('safe-zones')}
                className="mt-3 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Crear primera zona
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboardData.safeZones.slice(0, 4).map((zone) => {
                const zoneTypes = {
                  home: { icon: '🏠', label: 'Casa', color: 'text-green-600' },
                  school: { icon: '🏫', label: 'Escuela', color: 'text-blue-600' },
                  park: { icon: '🌳', label: 'Parque', color: 'text-emerald-600' },
                  relative: { icon: '👨‍👩‍👧‍👦', label: 'Familiar', color: 'text-purple-600' },
                  other: { icon: '📍', label: 'Otro', color: 'text-gray-600' }
                };
                const zoneType = zoneTypes[zone.zone_type] || zoneTypes.other;
                
                return (
                  <div key={zone.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{zoneType.icon}</span>
                      <div>
                        <p className="font-medium text-gray-900">{zone.name}</p>
                        <p className="text-sm text-gray-600">{zone.radius}m • {zoneType.label}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        zone.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {zone.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                      <button
                        onClick={() => setActiveTab('monitoring')}
                        className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                        title="Ver en mapa"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
              {dashboardData.safeZones.length > 4 && (
                <p className="text-center text-sm text-gray-500">
                  Y {dashboardData.safeZones.length - 4} más...
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Alertas recientes */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Alertas Recientes</h3>
          <button
            onClick={() => setActiveTab('alerts')}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Ver todas →
          </button>
        </div>
        
        {dashboardData.alerts.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-gray-600">No hay alertas recientes</p>
            <p className="text-sm text-gray-500 mt-1">Todo está funcionando correctamente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dashboardData.alerts.slice(0, 5).map((alert, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className={`w-2 h-2 rounded-full ${
                  alert.severity === 'high' ? 'bg-red-500' :
                  alert.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                }`}></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                  <p className="text-xs text-gray-600">{new Date(alert.created_at).toLocaleString()}</p>
                </div>
                {!alert.is_read && (
                  <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Vista de alertas
  const renderAlertsView = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-bold text-gray-900">Sistema de Alertas</h3>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600">Monitoreo activo</span>
          </div>
        </div>
        <p className="text-gray-600 mb-6">Monitoreo en tiempo real de ubicaciones y actividades</p>
        
        {/* Panel de filtros de alertas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-700 font-medium mb-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Críticas
            </div>
            <div className="text-2xl font-bold text-red-600">
              {dashboardData.alerts.filter(a => a.severity === 'high').length}
            </div>
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-yellow-700 font-medium mb-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Advertencias
            </div>
            <div className="text-2xl font-bold text-yellow-600">
              {dashboardData.alerts.filter(a => a.severity === 'medium').length}
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-700 font-medium mb-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Informativas
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {dashboardData.alerts.filter(a => a.severity === 'low').length}
            </div>
          </div>
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-700 font-medium mb-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Sin Leer
            </div>
            <div className="text-2xl font-bold text-gray-600">
              {dashboardData.metrics.unreadAlerts}
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 p-6 rounded-lg">
          <p className="text-gray-800 font-medium mb-2">🚧 Próximamente: Panel de alertas completo</p>
          <ul className="text-gray-600 text-sm space-y-1">
            <li>• Alertas de geofencing en tiempo real</li>
            <li>• Notificaciones push al móvil</li>
            <li>• Historial detallado de eventos</li>
            <li>• Configuración de tipos de alerta</li>
            <li>• Integración con app móvil</li>
          </ul>
        </div>
      </div>
    </div>
  );

  // Vista de reportes
  const renderReportsView = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Reportes y Análisis</h3>
        <p className="text-gray-600 mb-6">Estadísticas detalladas y patrones de comportamiento</p>
        
        {/* Métricas de reportes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
            <h4 className="text-lg font-semibold mb-2">Ubicaciones Registradas</h4>
            <p className="text-3xl font-bold">{dashboardData.metrics.locationsToday * 7}</p>
            <p className="text-blue-100 text-sm">Esta semana</p>
          </div>
          
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
            <h4 className="text-lg font-semibold mb-2">Tiempo en Zonas Seguras</h4>
            <p className="text-3xl font-bold">87%</p>
            <p className="text-green-100 text-sm">Promedio semanal</p>
          </div>
          
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
            <h4 className="text-lg font-semibold mb-2">Alertas Resueltas</h4>
            <p className="text-3xl font-bold">94%</p>
            <p className="text-purple-100 text-sm">Tasa de resolución</p>
          </div>
        </div>
        
        <div className="bg-gray-50 p-6 rounded-lg">
          <p className="text-gray-800 font-medium mb-2">📊 Próximamente: Sistema de reportes avanzado</p>
          <ul className="text-gray-600 text-sm space-y-1">
            <li>• Patrones de movimiento y rutas frecuentes</li>
            <li>• Tiempo promedio en cada zona segura</li>
            <li>• Reportes semanales y mensuales automáticos</li>
            <li>• Gráficos de actividad y tendencias</li>
            <li>• Exportación de datos en PDF/Excel</li>
            <li>• Comparativas de comportamiento</li>
          </ul>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-xl text-gray-600 font-medium">Cargando SafeKids Dashboard...</p>
          <p className="text-sm text-gray-500 mt-2">Inicializando sistema de monitoreo</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">SafeKids</h1>
                <p className="text-sm text-gray-600">Sistema de Monitoreo Parental</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                👋 Hola, <span className="font-medium">{family?.family_name || 'Usuario'}</span>
              </span>
              <button
                onClick={refreshDashboard}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Actualizar datos"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={logout}
                className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex space-x-8">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === item.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {renderContent()}
      </main>

      {/* Notification System */}
      <NotificationSystem />
    </div>
  );
};

export default Dashboard;
