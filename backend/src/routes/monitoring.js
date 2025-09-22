// backend/src/routes/monitoring.js - ACTUALIZADO con endpoints de apps
const express = require('express');
const router = express.Router();
const { query } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

// ✅ NUEVO: Recibir estadísticas de uso de aplicaciones
router.post('/usage-stats', authenticateToken, async (req, res) => {
  try {
    const { timestamp, usageData, todayUsage, device_info, child_id } = req.body;
    
    // Si viene child_id en el body, usarlo (para dispositivos)
    // Si no, buscar el primer child del usuario (para pruebas)
    let childId = child_id;
    
    if (!childId) {
      const childResult = await query('SELECT id FROM children WHERE family_id = $1 LIMIT 1', [req.user.id]);
      if (childResult.rows.length > 0) {
        childId = childResult.rows[0].id;
      }
    }

    if (!childId) {
      return res.status(400).json({
        success: false,
        error: 'Child ID not found. Provide child_id or ensure user has children.'
      });
    }

    // Validar datos requeridos
    if (!timestamp || !usageData || !Array.isArray(usageData)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid usage data format'
      });
    }

    console.log(`📊 Receiving usage stats for child ${childId}: ${usageData.length} apps`);

    // Insertar estadísticas de uso en la base de datos
    for (const app of usageData) {
      await query(`
        INSERT INTO app_usage_stats (
          child_id, 
          package_name, 
          app_name, 
          usage_time_ms, 
          first_timestamp, 
          last_timestamp,
          total_time_foreground,
          recorded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (child_id, package_name, DATE(recorded_at)) 
        DO UPDATE SET
          usage_time_ms = app_usage_stats.usage_time_ms + EXCLUDED.usage_time_ms,
          total_time_foreground = EXCLUDED.total_time_foreground,
          last_timestamp = EXCLUDED.last_timestamp,
          updated_at = NOW()
      `, [
        childId,
        app.packageName,
        app.appName,
        app.usageTime,
        new Date(app.firstTimeStamp),
        new Date(app.lastTimeStamp),
        app.totalTimeForeground,
        new Date(timestamp)
      ]);
    }

    // Actualizar información del dispositivo
    if (device_info) {
      await query(`
        UPDATE children 
        SET 
          last_battery_level = $1,
          last_seen = NOW(),
          updated_at = NOW()
        WHERE id = $2
      `, [device_info.battery_level || null, childId]);
    }

    // Verificar límites y generar alertas si es necesario
    await checkAppUsageLimits(childId, todayUsage);

    res.json({
      success: true,
      message: 'Usage stats received successfully',
      processed_apps: usageData.length
    });

  } catch (error) {
    console.error('Error processing usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Error processing usage stats'
    });
  }
});

// ✅ NUEVO: Obtener configuración de monitoreo
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const { child_id } = req.query;
    
    // Si viene child_id en query, usarlo, si no buscar el primer child del usuario
    let childId = child_id;
    
    if (!childId) {
      const childResult = await query('SELECT id FROM children WHERE family_id = $1 LIMIT 1', [req.user.id]);
      if (childResult.rows.length > 0) {
        childId = childResult.rows[0].id;
      }
    }

    if (!childId) {
      return res.status(400).json({
        success: false,
        error: 'Child ID not found. Provide child_id parameter or ensure user has children.'
      });
    }

    // Obtener configuración del niño
    const childConfig = await query(`
      SELECT 
        max_screen_time,
        max_social_time,
        bedtime_hour,
        wakeup_hour,
        monitoring_enabled
      FROM children 
      WHERE id = $1
    `, [childId]);

    // Obtener límites específicos por aplicación
    const appLimits = await query(`
      SELECT 
        package_name,
        daily_limit_minutes,
        is_blocked,
        category
      FROM app_limits 
      WHERE child_id = $1
    `, [childId]);

    const config = {
      enabled: childConfig.rows[0]?.monitoring_enabled ?? true,
      updateInterval: 30000, // 30 segundos
      socialMediaLimit: childConfig.rows[0]?.max_social_time || 60,
      gamesLimit: 120, // Por defecto 2 horas
      bedtimeStart: childConfig.rows[0]?.bedtime_hour || '22:00',
      bedtimeEnd: childConfig.rows[0]?.wakeup_hour || '07:00',
      appLimits: {}
    };

    // Convertir límites de apps a formato esperado
    appLimits.rows.forEach(limit => {
      config.appLimits[limit.package_name] = {
        dailyLimit: limit.daily_limit_minutes,
        isBlocked: limit.is_blocked,
        category: limit.category
      };
    });

    res.json({
      success: true,
      data: config
    });

  } catch (error) {
    console.error('Error getting monitoring config:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting monitoring configuration'
    });
  }
});

// ✅ NUEVO: Actualizar configuración de monitoreo
router.put('/config', authenticateToken, async (req, res) => {
  try {
    const { 
      enabled, 
      socialMediaLimit, 
      gamesLimit, 
      bedtimeStart, 
      bedtimeEnd,
      child_id 
    } = req.body;

    // Si viene child_id en body, usarlo, si no buscar el primer child del usuario
    let childId = child_id;
    
    if (!childId) {
      const childResult = await query('SELECT id FROM children WHERE family_id = $1 LIMIT 1', [req.user.id]);
      if (childResult.rows.length > 0) {
        childId = childResult.rows[0].id;
      }
    }

    if (!childId) {
      return res.status(400).json({
        success: false,
        error: 'Child ID not found. Provide child_id or ensure user has children.'
      });
    }

    // Actualizar configuración del niño
    await query(`
      UPDATE children 
      SET 
        monitoring_enabled = $1,
        max_social_time = $2,
        bedtime_hour = $3,
        wakeup_hour = $4,
        updated_at = NOW()
      WHERE id = $5
    `, [
      enabled,
      socialMediaLimit,
      bedtimeStart,
      bedtimeEnd,
      childId
    ]);

    res.json({
      success: true,
      message: 'Configuration updated successfully'
    });

  } catch (error) {
    console.error('Error updating monitoring config:', error);
    res.status(500).json({
      success: false,
      error: 'Error updating monitoring configuration'
    });
  }
});

// Función auxiliar para obtener child_id
async function getChildId(req, childIdFromParam = null) {
  let childId = childIdFromParam;
  
  if (!childId) {
    // Buscar en family_id primero, luego en user_id como fallback
    let childResult = await query('SELECT id FROM children WHERE family_id = $1 LIMIT 1', [req.user.id]);
    
    if (childResult.rows.length === 0) {
      // Fallback a user_id si family_id no existe o no tiene resultados
      childResult = await query('SELECT id FROM children WHERE user_id = $1 LIMIT 1', [req.user.id]);
    }
    
    if (childResult.rows.length > 0) {
      childId = childResult.rows[0].id;
    }
  }
  
  return childId;
}

// ✅ NUEVO: Obtener estadísticas de uso por fecha
router.get('/usage-stats/:date?', authenticateToken, async (req, res) => {
  try {
    const date = req.params.date || new Date().toISOString().split('T')[0];
    const childId = await getChildId(req, req.query.child_id);

    if (!childId) {
      return res.status(400).json({
        success: false,
        error: 'Child ID not found'
      });
    }

    const usageStats = await query(`
      SELECT 
        package_name,
        app_name,
        SUM(usage_time_ms) as total_usage_ms,
        MAX(last_timestamp) as last_used,
        COUNT(*) as usage_sessions
      FROM app_usage_stats
      WHERE child_id = $1 
        AND DATE(recorded_at) = $2
      GROUP BY package_name, app_name
      ORDER BY total_usage_ms DESC
    `, [childId, date]);

    res.json({
      success: true,
      date: date,
      stats: usageStats.rows
    });

  } catch (error) {
    console.error('Error getting usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting usage statistics'
    });
  }
});

// ✅ NUEVO: Establecer límites para aplicaciones específicas
router.post('/app-limits', authenticateToken, async (req, res) => {
  try {
    const { packageName, dailyLimitMinutes, isBlocked, category, child_id } = req.body;
    const childId = await getChildId(req, child_id);

    if (!childId) {
      return res.status(400).json({
        success: false,
        error: 'Child ID not found'
      });
    }

    await query(`
      INSERT INTO app_limits (
        child_id, 
        package_name, 
        daily_limit_minutes, 
        is_blocked, 
        category,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (child_id, package_name) 
      DO UPDATE SET
        daily_limit_minutes = EXCLUDED.daily_limit_minutes,
        is_blocked = EXCLUDED.is_blocked,
        category = EXCLUDED.category,
        updated_at = NOW()
    `, [childId, packageName, dailyLimitMinutes, isBlocked, category]);

    res.json({
      success: true,
      message: 'App limit set successfully'
    });

  } catch (error) {
    console.error('Error setting app limit:', error);
    res.status(500).json({
      success: false,
      error: 'Error setting app limit'
    });
  }
});

// ✅ NUEVO: Obtener resumen de uso semanal
router.get('/weekly-summary', authenticateToken, async (req, res) => {
  try {
    const childId = await getChildId(req, req.query.child_id);

    if (!childId) {
      return res.status(400).json({
        success: false,
        error: 'Child ID not found'
      });
    }

    // Últimos 7 días
    const weeklyStats = await query(`
      SELECT 
        DATE(recorded_at) as date,
        SUM(usage_time_ms) / 1000 / 60 as total_minutes,
        COUNT(DISTINCT package_name) as apps_used
      FROM app_usage_stats
      WHERE child_id = $1 
        AND recorded_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(recorded_at)
      ORDER BY date DESC
    `, [childId]);

    // Apps más usadas de la semana
    const topApps = await query(`
      SELECT 
        package_name,
        app_name,
        SUM(usage_time_ms) / 1000 / 60 as total_minutes
      FROM app_usage_stats
      WHERE child_id = $1 
        AND recorded_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY package_name, app_name
      ORDER BY total_minutes DESC
      LIMIT 10
    `, [childId]);

    res.json({
      success: true,
      weekly_stats: weeklyStats.rows,
      top_apps: topApps.rows
    });

  } catch (error) {
    console.error('Error getting weekly summary:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting weekly summary'
    });
  }
});

// Función auxiliar para verificar límites de uso
async function checkAppUsageLimits(childId, todayUsage) {
  try {
    if (!todayUsage) return;

    // Obtener límites configurados
    const limits = await query(`
      SELECT 
        package_name,
        daily_limit_minutes,
        category
      FROM app_limits 
      WHERE child_id = $1 AND is_blocked = false
    `, [childId]);

    // Obtener configuración general del niño
    const childConfig = await query(`
      SELECT max_screen_time, max_social_time 
      FROM children 
      WHERE id = $1
    `, [childId]);

    const config = childConfig.rows[0] || {};

    for (const [packageName, usageMs] of Object.entries(todayUsage)) {
      const usageMinutes = usageMs / (1000 * 60);
      
      // Verificar límite específico de la app
      const appLimit = limits.rows.find(l => l.package_name === packageName);
      
      if (appLimit && usageMinutes >= appLimit.daily_limit_minutes) {
        await createAlert(childId, 'app_limit_exceeded', 'medium', {
          package_name: packageName,
          used_minutes: Math.round(usageMinutes),
          limit_minutes: appLimit.daily_limit_minutes
        });
      }
    }

    // Verificar límite total de tiempo de pantalla
    const totalUsageMinutes = Object.values(todayUsage)
      .reduce((sum, ms) => sum + (ms / (1000 * 60)), 0);

    if (config.max_screen_time && totalUsageMinutes >= config.max_screen_time) {
      await createAlert(childId, 'screen_time_limit_exceeded', 'high', {
        used_minutes: Math.round(totalUsageMinutes),
        limit_minutes: config.max_screen_time
      });
    }

  } catch (error) {
    console.error('Error checking app usage limits:', error);
  }
}

// Función auxiliar para crear alertas
async function createAlert(childId, type, severity, data) {
  try {
    // Obtener el family_id del niño
    const familyResult = await query(`
      SELECT user_id as family_id FROM children WHERE id = $1
    `, [childId]);

    if (familyResult.rows.length === 0) return;

    const familyId = familyResult.rows[0].family_id;

    await query(`
      INSERT INTO alerts (
        family_id,
        child_id,
        alert_type,
        severity,
        message,
        data,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      familyId,
      childId,
      type,
      severity,
      `App usage limit exceeded`,
      JSON.stringify(data)
    ]);

    console.log(`🚨 Alert created: ${type} for child ${childId}`);
  } catch (error) {
    console.error('Error creating alert:', error);
  }
}

module.exports = router;