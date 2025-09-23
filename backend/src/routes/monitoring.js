// backend/src/routes/monitoring.js - VERSIÓN COMPLETA
const express = require('express');
const router = express.Router();
const { query } = require('../models/database');
const { authenticateToken, authenticateDevice } = require('../middleware/auth');

// ======================================================================
// ENDPOINTS PARA RECIBIR DATOS DESDE DISPOSITIVOS
// ======================================================================

// Recibir estadísticas de uso de aplicaciones
router.post('/usage-stats', authenticateToken, async (req, res) => {
  const client = await query.pool?.connect() || await require('../models/database').pool.connect();
  
  try {
    const { 
      child_id, 
      timestamp, 
      usageData, 
      todayUsage, 
      device_info 
    } = req.body;

    // Determinar el child_id
    let childId = child_id;
    
    // Si viene desde un dispositivo autenticado
    if (req.device) {
      childId = req.device.childId;
    } else if (!childId) {
      // Si no hay child_id, buscar el primero del usuario
      const childResult = await client.query(
        'SELECT id FROM children WHERE family_id = $1 AND is_active = true LIMIT 1',
        [req.user.id]
      );
      
      if (childResult.rows.length > 0) {
        childId = childResult.rows[0].id;
      }
    }

    if (!childId) {
      return res.status(400).json({
        success: false,
        error: 'Child ID not found'
      });
    }

    await client.query('BEGIN');

    // Procesar cada aplicación
    if (usageData && Array.isArray(usageData)) {
      for (const app of usageData) {
        const {
          packageName,
          appName,
          usageTimeMs,
          firstTimestamp,
          lastTimestamp,
          totalTimeForeground
        } = app;

        // Categorizar la app si no está categorizada
        const categoryResult = await client.query(
          'SELECT category FROM app_categories WHERE package_name = $1',
          [packageName]
        );

        let category = 'other';
        if (categoryResult.rows.length > 0) {
          category = categoryResult.rows[0].category;
        } else {
          // Auto-categorizar basado en el nombre del paquete
          if (packageName.includes('game') || packageName.includes('play')) {
            category = 'games';
          } else if (packageName.includes('social') || packageName.includes('whatsapp') || 
                     packageName.includes('instagram') || packageName.includes('facebook')) {
            category = 'social';
          } else if (packageName.includes('youtube') || packageName.includes('netflix') || 
                     packageName.includes('spotify')) {
            category = 'entertainment';
          }

          // Guardar categorización
          await client.query(
            `INSERT INTO app_categories (package_name, app_name, category, is_predefined)
             VALUES ($1, $2, $3, false)
             ON CONFLICT (package_name) DO UPDATE SET app_name = EXCLUDED.app_name`,
            [packageName, appName || packageName, category]
          );
        }

        // Insertar o actualizar estadísticas
        await client.query(
          `INSERT INTO app_usage_stats 
           (child_id, package_name, app_name, usage_time_ms, 
            first_timestamp, last_timestamp, total_time_foreground,
            recorded_date, recorded_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, NOW(), NOW(), NOW())
           ON CONFLICT (child_id, package_name, recorded_date) 
           DO UPDATE SET 
             usage_time_ms = app_usage_stats.usage_time_ms + EXCLUDED.usage_time_ms,
             last_timestamp = EXCLUDED.last_timestamp,
             total_time_foreground = EXCLUDED.total_time_foreground,
             updated_at = NOW()`,
          [
            childId, 
            packageName, 
            appName || packageName,
            usageTimeMs || 0,
            firstTimestamp || new Date(),
            lastTimestamp || new Date(),
            totalTimeForeground || usageTimeMs || 0
          ]
        );

        // Verificar límites de la app
        const limitResult = await client.query(
          `SELECT daily_limit_minutes, is_blocked 
           FROM app_limits 
           WHERE child_id = $1 AND package_name = $2`,
          [childId, packageName]
        );

        if (limitResult.rows.length > 0) {
          const limit = limitResult.rows[0];
          const usedMinutes = Math.floor((totalTimeForeground || usageTimeMs) / 60000);

          // Crear alerta si excede el límite
          if (!limit.is_blocked && limit.daily_limit_minutes > 0 && 
              usedMinutes > limit.daily_limit_minutes) {
            await client.query(
              `INSERT INTO alerts 
               (family_id, child_id, alert_type, severity, title, message, metadata, created_at)
               SELECT c.family_id, $1, 'app_limit_exceeded', 'high', 
                      'Límite de aplicación excedido',
                      $2 || ' ha excedido el límite diario de ' || $3,
                      $4, NOW()
               FROM children c WHERE c.id = $1`,
              [
                childId,
                appName || packageName,
                limit.daily_limit_minutes + ' minutos',
                JSON.stringify({ 
                  packageName, 
                  usedMinutes, 
                  limitMinutes: limit.daily_limit_minutes 
                })
              ]
            );
          }
        }
      }
    }

    // Actualizar estadísticas generales del niño
    if (todayUsage) {
      const { totalScreenTime, totalSocialTime } = todayUsage;
      
      // Verificar límites generales
      const childResult = await client.query(
        'SELECT name, max_screen_time, max_social_time FROM children WHERE id = $1',
        [childId]
      );

      if (childResult.rows.length > 0) {
        const child = childResult.rows[0];
        const screenMinutes = Math.floor(totalScreenTime / 60000);
        const socialMinutes = Math.floor(totalSocialTime / 60000);

        // Alertas por exceso de tiempo
        if (child.max_screen_time > 0 && screenMinutes > child.max_screen_time) {
          await client.query(
            `INSERT INTO alerts 
             (family_id, child_id, alert_type, severity, title, message, metadata, created_at)
             SELECT family_id, $1, 'screen_time_exceeded', 'medium',
                    'Tiempo de pantalla excedido',
                    $2 || ' ha excedido el límite de tiempo de pantalla',
                    $3, NOW()
             FROM children WHERE id = $1
             AND NOT EXISTS (
               SELECT 1 FROM alerts 
               WHERE child_id = $1 
               AND alert_type = 'screen_time_exceeded'
               AND DATE(created_at) = CURRENT_DATE
             )`,
            [
              childId,
              child.name,
              JSON.stringify({ screenMinutes, limitMinutes: child.max_screen_time })
            ]
          );
        }
      }
    }

    // Actualizar información del dispositivo si se proporciona
    if (device_info) {
      await client.query(
        `UPDATE devices 
         SET battery_level = $2, last_seen = NOW() 
         WHERE child_id = $1 AND is_active = true`,
        [childId, device_info.battery_level]
      );

      await client.query(
        `UPDATE children 
         SET last_battery_level = $2, last_seen = NOW() 
         WHERE id = $1`,
        [childId, device_info.battery_level]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Usage stats processed successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Error processing usage stats'
    });
  } finally {
    client.release();
  }
});

// ======================================================================
// ENDPOINTS PARA CONSULTAR ESTADÍSTICAS
// ======================================================================

// Obtener estadísticas de un niño
router.get('/child/:childId/stats', authenticateToken, async (req, res) => {
  try {
    const { childId } = req.params;
    const { date = new Date().toISOString().split('T')[0] } = req.query;

    // Verificar que el niño pertenece al usuario
    const childCheck = await query(
      'SELECT name FROM children WHERE id = $1 AND family_id = $2',
      [childId, req.user.id]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Niño no encontrado'
      });
    }

    // Obtener estadísticas del día
    const dailyStats = await query(
      `SELECT 
         package_name,
         app_name,
         usage_time_ms,
         first_timestamp,
         last_timestamp,
         total_time_foreground
       FROM app_usage_stats
       WHERE child_id = $1 AND recorded_date = $2
       ORDER BY usage_time_ms DESC`,
      [childId, date]
    );

    // Obtener totales por categoría
    const categoryStats = await query(
      `SELECT 
         ac.category,
         SUM(aus.usage_time_ms) as total_time_ms,
         COUNT(DISTINCT aus.package_name) as app_count
       FROM app_usage_stats aus
       JOIN app_categories ac ON aus.package_name = ac.package_name
       WHERE aus.child_id = $1 AND aus.recorded_date = $2
       GROUP BY ac.category
       ORDER BY total_time_ms DESC`,
      [childId, date]
    );

    // Obtener apps más usadas de la semana
    const weeklyTop = await query(
      `SELECT 
         package_name,
         app_name,
         SUM(usage_time_ms) as total_time_ms
       FROM app_usage_stats
       WHERE child_id = $1 
         AND recorded_date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY package_name, app_name
       ORDER BY total_time_ms DESC
       LIMIT 10`,
      [childId]
    );

    // Calcular totales
    const totalScreenTime = dailyStats.rows.reduce((sum, app) => 
      sum + parseInt(app.usage_time_ms || 0), 0
    );

    const socialTime = categoryStats.rows
      .filter(cat => cat.category === 'social')
      .reduce((sum, cat) => sum + parseInt(cat.total_time_ms || 0), 0);

    res.json({
      success: true,
      data: {
        date,
        child_name: childCheck.rows[0].name,
        daily_apps: dailyStats.rows,
        category_breakdown: categoryStats.rows,
        weekly_top_apps: weeklyTop.rows,
        totals: {
          screen_time_ms: totalScreenTime,
          social_time_ms: socialTime,
          screen_time_minutes: Math.floor(totalScreenTime / 60000),
          social_time_minutes: Math.floor(socialTime / 60000)
        }
      }
    });

  } catch (error) {
    console.error('Error getting child stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo estadísticas',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Obtener resumen familiar
router.get('/family/summary', authenticateToken, async (req, res) => {
  try {
    const familyId = req.user.id;

    // Obtener todos los niños con sus estadísticas del día
    const childrenStats = await query(
      `SELECT 
         c.id,
         c.name,
         c.age,
         c.max_screen_time,
         c.max_social_time,
         c.last_seen,
         c.last_battery_level,
         COALESCE(SUM(aus.usage_time_ms), 0) as today_usage_ms,
         COUNT(DISTINCT aus.package_name) as apps_used_today
       FROM children c
       LEFT JOIN app_usage_stats aus ON c.id = aus.child_id 
         AND aus.recorded_date = CURRENT_DATE
       WHERE c.family_id = $1 AND c.is_active = true
       GROUP BY c.id
       ORDER BY c.created_at`,
      [familyId]
    );

    // Obtener alertas no leídas
    const unreadAlerts = await query(
      `SELECT COUNT(*) as count 
       FROM alerts 
       WHERE family_id = $1 AND is_read = false`,
      [familyId]
    );

    // Obtener apps más problemáticas (más límites excedidos)
    const problematicApps = await query(
      `SELECT 
         aus.package_name,
         aus.app_name,
         COUNT(DISTINCT aus.child_id) as children_using,
         SUM(aus.usage_time_ms) as total_usage_ms
       FROM app_usage_stats aus
       JOIN children c ON aus.child_id = c.id
       WHERE c.family_id = $1 
         AND aus.recorded_date = CURRENT_DATE
       GROUP BY aus.package_name, aus.app_name
       HAVING SUM(aus.usage_time_ms) > 3600000
       ORDER BY total_usage_ms DESC
       LIMIT 5`,
      [familyId]
    );

    res.json({
      success: true,
      data: {
        children: childrenStats.rows.map(child => ({
          ...child,
          today_usage_minutes: Math.floor(child.today_usage_ms / 60000),
          is_over_limit: child.today_usage_ms > (child.max_screen_time * 60000),
          battery_status: child.last_battery_level < 20 ? 'low' : 
                         child.last_battery_level < 50 ? 'medium' : 'good'
        })),
        unread_alerts: parseInt(unreadAlerts.rows[0].count),
        problematic_apps: problematicApps.rows,
        summary: {
          total_children: childrenStats.rows.length,
          active_today: childrenStats.rows.filter(c => c.apps_used_today > 0).length,
          over_limits: childrenStats.rows.filter(c => 
            c.today_usage_ms > (c.max_screen_time * 60000)
          ).length
        }
      }
    });

  } catch (error) {
    console.error('Error getting family summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo resumen familiar',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ======================================================================
// ENDPOINTS DE CONFIGURACIÓN
// ======================================================================

// Configurar límites de aplicación
router.post('/limits', authenticateToken, async (req, res) => {
  try {
    const { 
      child_id, 
      package_name, 
      daily_limit_minutes, 
      is_blocked 
    } = req.body;

    // Verificar que el niño pertenece al usuario
    const childCheck = await query(
      'SELECT id FROM children WHERE id = $1 AND family_id = $2',
      [child_id, req.user.id]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Niño no encontrado'
      });
    }

    // Insertar o actualizar límite
    const result = await query(
      `INSERT INTO app_limits 
       (child_id, package_name, daily_limit_minutes, is_blocked, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (child_id, package_name) 
       DO UPDATE SET 
         daily_limit_minutes = EXCLUDED.daily_limit_minutes,
         is_blocked = EXCLUDED.is_blocked,
         updated_at = NOW()
       RETURNING *`,
      [child_id, package_name, daily_limit_minutes || 0, is_blocked || false]
    );

    res.json({
      success: true,
      message: 'Límite configurado exitosamente',
      data: { limit: result.rows[0] }
    });

  } catch (error) {
    console.error('Error setting app limit:', error);
    res.status(500).json({
      success: false,
      message: 'Error configurando límite',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Obtener límites de un niño
router.get('/limits/:childId', authenticateToken, async (req, res) => {
  try {
    const { childId } = req.params;

    // Verificar permisos
    const childCheck = await query(
      'SELECT name FROM children WHERE id = $1 AND family_id = $2',
      [childId, req.user.id]
    );

    if (childCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Niño no encontrado'
      });
    }

    const limits = await query(
      `SELECT 
         al.*,
         ac.app_name,
         ac.category
       FROM app_limits al
       LEFT JOIN app_categories ac ON al.package_name = ac.package_name
       WHERE al.child_id = $1
       ORDER BY al.is_blocked DESC, al.daily_limit_minutes ASC`,
      [childId]
    );

    res.json({
      success: true,
      data: {
        child_name: childCheck.rows[0].name,
        limits: limits.rows
      }
    });

  } catch (error) {
    console.error('Error getting limits:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo límites',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Endpoint de configuración general
router.get('/config', authenticateToken, async (req, res) => {
  try {
    // Obtener categorías disponibles
    const categories = await query(
      'SELECT DISTINCT category FROM app_categories ORDER BY category'
    );

    // Obtener apps predefinidas
    const predefinedApps = await query(
      'SELECT * FROM app_categories WHERE is_predefined = true ORDER BY category, app_name'
    );

    res.json({
      success: true,
      data: {
        categories: categories.rows.map(r => r.category),
        predefined_apps: predefinedApps.rows,
        limits: {
          min_age: 5,
          max_age: 18,
          default_screen_time: 180,
          default_social_time: 60,
          max_radius_meters: 5000
        }
      }
    });

  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo configuración',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;