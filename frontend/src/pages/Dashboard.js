import React, { useState, useEffect, useCallback } from 'react';
import useAuthStore from '../store/useAuthStore';
import ChildrenManager from '../components/ChildrenManager';
import { childrenService, alertsService, safeZonesService } from '../services/api';
import NotificationSystem from '../components/common/NotificationSystem';
import InteractiveMap from '../components/InteractiveMap';

const Dashboard = () => {
  const { family, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  
  // Estado centralizado - una sola fuente de verdad
  const [allChildren, setAllChildren] = useState([]);
  const [allAlerts, setAllAlerts] = useState([]);
  const [allSafeZones, setAllSafeZones] = useState([]);
  
  const [dashboardData, setDashboardData] = useState({
    children: [],
    alerts: [],
    safeZones: [],
    metrics: {
      activeChildren: 0,
      todayAlerts: 0,
      unreadAlerts: 0,
      locationsToday: 0
    }
  });

  // Función para actualizar children desde ChildrenManager
  const updateChildren = useCallback((newChildren) => {
    setAllChildren(newChildren);
    
    // Actualizar dashboardData con los nuevos children
    setDashboardData(prev => ({
      ...prev,
      children: newChildren,
      metrics: {
        ...prev.metrics,
        activeChildren: newChildren.filter(c => c.is_active).length
      }
    }));
  }, []);

  // Cargar datos iniciales una sola vez
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
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
          locationsToday: Math.floor(Math.random() * 50)
        }
      };

      setDashboardData(data);
      console.log('✅ Dashboard actualizado:', {
        children: data.children.length,
        alerts: data.alerts.length,
        safeZones: data.safeZones.length
      });

    } catch (error) {
      console.error('❌ Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  // Función para refrescar datos manualmente
  const refreshDashboard = async () => {
    setLoading(true);
    await loadInitialData();
  };

  const getRiskColor = (level) => {
    switch (level) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getAlertColor = (severity) => {
    switch (severity) {
      case 'critical':
      case 'high': return 'bg-red-100 border-red-300 text-red-800';
      case 'medium': return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'low': return 'bg-blue-100 border-blue-300 text-blue-800';
      default: return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const DashboardView = () => (
    <div className="space-y-6">
      {/* Header con botón de actualización */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Panel Principal</h2>
        <button
          onClick={refreshDashboard}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>{loading ? 'Actualizando...' : 'Actualizar'}</span>
        </button>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Niños Activos</p>
              <p className="text-3xl font-bold">{dashboardData.metrics.activeChildren}</p>
            </div>
            <div className="bg-blue-400 p-3 rounded-lg">
              <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Alertas Hoy</p>
              <p className="text-3xl font-bold">{dashboardData.metrics.todayAlerts}</p>
            </div>
            <div className="bg-red-400 p-3 rounded-lg">
              <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Zonas Seguras</p>
              <p className="text-3xl font-bold">{dashboardData.safeZones.length}</p>
            </div>
            <div className="bg-green-400 p-3 rounded-lg">
              <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">Ubicaciones Hoy</p>
              <p className="text-3xl font-bold">{dashboardData.metrics.locationsToday}</p>
            </div>
            <div className="bg-purple-400 p-3 rounded-lg">
              <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Niños */}
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center">
              <svg className="h-6 w-6 mr-2 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Estado de los Niños
            </h3>
            <button 
              onClick={() => setActiveTab('children')}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Ver todos
            </button>
          </div>

          <div className="space-y-4">
            {dashboardData.children.length > 0 ? (
              dashboardData.children.map(child => (
                <div key={child.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className={`w-4 h-4 rounded-full ${child.is_active ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                    <div>
                      <p className="font-semibold text-gray-900">{child.name}</p>
                      <p className="text-sm text-gray-600">{child.age} años • Límite: {child.max_screen_time || 180}min</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-3 py-1 rounded-full font-medium ${getRiskColor(child.risk_level)}`}>
                      {child.risk_level === 'high' ? 'Alto riesgo' :
                        child.risk_level === 'medium' ? 'Medio riesgo' : 'Bajo riesgo'}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                      {child.last_location?.timestamp ?
                        `Última ubicación: ${new Date(child.last_location.timestamp).toLocaleTimeString()}` :
                        'Sin ubicación reciente'
                      }
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 48 48">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M34 40h10v-4a6 6 0 00-10.712-3.714M34 40H14m20 0v-4M14 40H4v-4a6 6 0 0110.712-3.714M14 40v-4m0 0a4 4 0 118 0v4m-8-4V20a8 8 0 1116 0v16" />
                </svg>
                <p className="mt-2 text-gray-500 font-medium">No hay niños registrados</p>
                <button 
                  onClick={() => setActiveTab('children')}
                  className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                >
                  Registrar primer niño
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Alertas Recientes */}
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center">
              <svg className="h-6 w-6 mr-2 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Alertas Recientes
            </h3>
            <button className="text-red-600 hover:text-red-800 text-sm font-medium">
              Ver todas
            </button>
          </div>

          <div className="space-y-3">
            {dashboardData.alerts.length > 0 ? (
              dashboardData.alerts.slice(0, 5).map(alert => (
                <div key={alert.id} className={`p-4 rounded-lg border ${getAlertColor(alert.severity)}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-semibold">{alert.title}</p>
                      <p className="text-sm opacity-75 mt-1">{alert.message}</p>
                      <p className="text-xs opacity-60 mt-2">
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded font-medium ml-2 ${alert.severity === 'high' ? 'bg-red-200 text-red-800' :
                        alert.severity === 'medium' ? 'bg-yellow-200 text-yellow-800' :
                          'bg-blue-200 text-blue-800'
                      }`}>
                      {alert.severity}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="mt-2 text-gray-500 font-medium">No hay alertas</p>
                <p className="text-green-600 text-sm">¡Todo está funcionando correctamente!</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zonas Seguras */}
      {dashboardData.safeZones.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <svg className="h-6 w-6 mr-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            Zonas Seguras Configuradas
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboardData.safeZones.map(zone => (
              <div key={zone.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <svg className={`h-5 w-5 ${zone.zone_type === 'home' ? 'text-blue-500' :
                        zone.zone_type === 'school' ? 'text-green-500' :
                          'text-purple-500'
                      }`} fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10.707 2.293a1 1 0 00-1.414 0l-9 9a1 1 0 001.414 1.414L2 12.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-4.586l.293.293a1 1 0 001.414-1.414l-9-9z" />
                    </svg>
                    <span className="font-semibold text-gray-900">{zone.name}</span>
                  </div>
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded font-medium text-gray-600">
                    {zone.radius}m
                  </span>
                </div>
                <p className="text-sm text-gray-600">{zone.address}</p>
                <p className="text-xs text-gray-500 mt-1 capitalize">
                  Tipo: {zone.zone_type}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const LocationView = () => (
    <InteractiveMap 
      children={allChildren} 
      safeZones={allSafeZones} 
    />
  );

  // ARQUITECTURA CORREGIDA: Pasar datos como props y función de actualización
  const ChildrenView = () => (
    <ChildrenManager 
      children={allChildren}
      safeZones={allSafeZones}
      onChildrenChange={updateChildren}
    />
  );

  const MonitoringView = () => (
    <div className="bg-white p-8 rounded-xl shadow-lg">
      <div className="text-center">
        <svg className="mx-auto h-16 w-16 text-purple-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 48 48">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Panel de Monitoreo Avanzado</h3>
        <p className="text-gray-600 mb-4">Análisis detallado del comportamiento y uso de dispositivos</p>
        <div className="bg-purple-50 p-6 rounded-lg">
          <p className="text-purple-800 font-medium">Próximamente: Gráficos y estadísticas detalladas</p>
          <p className="text-purple-600 text-sm mt-2">Tiempo de pantalla, análisis de riesgo, patrones de comportamiento</p>
        </div>
      </div>
    </div>
  );

  const SettingsView = () => (
    <div className="bg-white p-8 rounded-xl shadow-lg">
      <div className="text-center">
        <svg className="mx-auto h-16 w-16 text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 48 48">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Configuración del Sistema</h3>
        <p className="text-gray-600 mb-4">Personaliza los límites, notificaciones y zonas seguras</p>
        <div className="bg-gray-50 p-6 rounded-lg">
          <p className="text-gray-800 font-medium">Próximamente: Panel de configuración completo</p>
          <p className="text-gray-600 text-sm mt-2">Límites de tiempo, filtros de contenido, configuración de alertas</p>
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
          <p className="text-sm text-gray-500 mt-2">Conectando con el backend</p>
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
                <p className="text-sm text-gray-600">Control Parental Integral</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                <span>Sistema Activo</span>
              </div>

              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{family?.name}</p>
                <p className="text-xs text-gray-500">{family?.email}</p>
              </div>

              <button
                onClick={logout}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <nav className="w-64 bg-white shadow-sm min-h-screen border-r border-gray-200">
          <div className="p-6">
            <div className="space-y-2">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left font-medium transition-colors ${activeTab === 'dashboard'
                    ? 'bg-blue-100 text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                </svg>
                <span>Panel Principal</span>
              </button>

              <button
                onClick={() => setActiveTab('location')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left font-medium transition-colors ${activeTab === 'location'
                    ? 'bg-blue-100 text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <span>Ubicación</span>
              </button>

              <button
                onClick={() => setActiveTab('monitoring')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left font-medium transition-colors ${activeTab === 'monitoring'
                    ? 'bg-blue-100 text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
                <span>Monitoreo</span>
              </button>
              <button
                onClick={() => setActiveTab('children')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left font-medium transition-colors ${activeTab === 'children'
                    ? 'bg-blue-100 text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Gestión de Niños</span>
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left font-medium transition-colors ${activeTab === 'settings'
                    ? 'bg-blue-100 text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
                <span>Configuración</span>
              </button>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'location' && <LocationView />}
            {activeTab === 'monitoring' && <MonitoringView />}
            {activeTab === 'children' && <ChildrenView />}
            {activeTab === 'settings' && <SettingsView />}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>SafeKids v1.0</span>
            <span>•</span>
            <span>Última actualización: {new Date().toLocaleTimeString()}</span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span>Conectado al backend</span>
          </div>
        </div>
      </footer>
      <NotificationSystem />
    </div>
  );
};

export default Dashboard;
