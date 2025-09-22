-- backend/database/migrations/004_app_monitoring.sql
-- Migración para tablas de monitoreo de aplicaciones

-- ✅ Tabla para estadísticas de uso de aplicaciones
CREATE TABLE IF NOT EXISTS app_usage_stats (
    id SERIAL PRIMARY KEY,
    child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
    package_name VARCHAR(255) NOT NULL,
    app_name VARCHAR(255),
    usage_time_ms BIGINT DEFAULT 0,
    first_timestamp TIMESTAMP,
    last_timestamp TIMESTAMP,
    total_time_foreground BIGINT DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Índices para mejorar performance
    CONSTRAINT unique_child_app_date UNIQUE (child_id, package_name, DATE(recorded_at))
);

-- ✅ Tabla para límites específicos por aplicación
CREATE TABLE IF NOT EXISTS app_limits (
    id SERIAL PRIMARY KEY,
    child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
    package_name VARCHAR(255) NOT NULL,
    daily_limit_minutes INTEGER DEFAULT 0,
    is_blocked BOOLEAN DEFAULT false,
    category VARCHAR(50) DEFAULT 'other', -- 'social', 'games', 'educational', 'productivity', 'other'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Cada niño puede tener un límite único por aplicación
    CONSTRAINT unique_child_app_limit UNIQUE (child_id, package_name)
);

-- ✅ Tabla para sessiones de uso en tiempo real
CREATE TABLE IF NOT EXISTS app_sessions (
    id SERIAL PRIMARY KEY,
    child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
    package_name VARCHAR(255) NOT NULL,
    app_name VARCHAR(255),
    session_start TIMESTAMP DEFAULT NOW(),
    session_end TIMESTAMP,
    duration_ms BIGINT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ✅ Extender tabla children con campos de monitoreo
ALTER TABLE children 
ADD COLUMN IF NOT EXISTS max_screen_time INTEGER DEFAULT 180, -- minutos por día
ADD COLUMN IF NOT EXISTS max_social_time INTEGER DEFAULT 60,  -- minutos por día
ADD COLUMN IF NOT EXISTS bedtime_hour VARCHAR(5) DEFAULT '22:00',
ADD COLUMN IF NOT EXISTS wakeup_hour VARCHAR(5) DEFAULT '07:00',
ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_battery_level INTEGER,
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP;

-- ✅ Tabla para categorización automática de aplicaciones
CREATE TABLE IF NOT EXISTS app_categories (
    id SERIAL PRIMARY KEY,
    package_name VARCHAR(255) UNIQUE NOT NULL,
    app_name VARCHAR(255),
    category VARCHAR(50) NOT NULL, -- 'social', 'games', 'educational', 'productivity', 'entertainment', 'other'
    is_predefined BOOLEAN DEFAULT true, -- true para categorías automáticas, false para personalizadas
    created_at TIMESTAMP DEFAULT NOW()
);

-- ✅ Insertar categorías predefinidas para apps comunes
INSERT INTO app_categories (package_name, app_name, category, is_predefined) VALUES
-- Redes Sociales
('com.facebook.katana', 'Facebook', 'social', true),
('com.instagram.android', 'Instagram', 'social', true),
('com.twitter.android', 'Twitter', 'social', true),
('com.snapchat.android', 'Snapchat', 'social', true),
('com.zhiliaoapp.musically', 'TikTok', 'social', true),
('com.whatsapp', 'WhatsApp', 'social', true),
('org.telegram.messenger', 'Telegram', 'social', true),
('com.discord', 'Discord', 'social', true),

-- Juegos Populares
('com.mojang.minecraftpe', 'Minecraft', 'games', true),
('com.roblox.client', 'Roblox', 'games', true),
('com.tencent.ig', 'PUBG Mobile', 'games', true),
('com.epicgames.fortnite', 'Fortnite', 'games', true),
('com.supercell.clashofclans', 'Clash of Clans', 'games', true),
('com.king.candycrushsaga', 'Candy Crush Saga', 'games', true),

-- Educación
('com.duolingo', 'Duolingo', 'educational', true),
('org.khanacademy.android', 'Khan Academy', 'educational', true),
('com.google.android.apps.classroom', 'Google Classroom', 'educational', true),

-- Productividad
('com.google.android.apps.docs.editors.docs', 'Google Docs', 'productivity', true),
('com.microsoft.office.word', 'Microsoft Word', 'productivity', true),
('com.google.android.calendar', 'Google Calendar', 'productivity', true),

-- Entretenimiento
('com.netflix.mediaclient', 'Netflix', 'entertainment', true),
('com.google.android.youtube', 'YouTube', 'entertainment', true),
('com.spotify.music', 'Spotify', 'entertainment', true)

ON CONFLICT (package_name) DO NOTHING;

-- ✅ Índices para mejorar performance de consultas
CREATE INDEX IF NOT EXISTS idx_app_usage_child_date ON app_usage_stats(child_id, DATE(recorded_at));
CREATE INDEX IF NOT EXISTS idx_app_usage_package ON app_usage_stats(package_name);
CREATE INDEX IF NOT EXISTS idx_app_sessions_child ON app_sessions(child_id, is_active);
CREATE INDEX IF NOT EXISTS idx_app_limits_child ON app_limits(child_id);

-- ✅ Función para limpiar datos antiguos (mantener solo últimos 30 días)
CREATE OR REPLACE FUNCTION cleanup_old_app_data()
RETURNS void AS $$
BEGIN
    -- Eliminar estadísticas de uso de más de 30 días
    DELETE FROM app_usage_stats 
    WHERE recorded_at < CURRENT_DATE - INTERVAL '30 days';
    
    -- Eliminar sesiones finalizadas de más de 7 días
    DELETE FROM app_sessions 
    WHERE session_end IS NOT NULL 
    AND session_end < CURRENT_DATE - INTERVAL '7 days';
    
    RAISE NOTICE 'Cleanup completed: old app monitoring data removed';
END;
$$ LANGUAGE plpgsql;

-- ✅ Función para obtener estadísticas rápidas del día
CREATE OR REPLACE FUNCTION get_today_app_stats(child_id_param INTEGER)
RETURNS TABLE (
    total_screen_time_minutes INTEGER,
    apps_used_count INTEGER,
    social_media_minutes INTEGER,
    games_minutes INTEGER,
    most_used_app VARCHAR(255)
) AS $$
BEGIN
    RETURN QUERY
    WITH today_stats AS (
        SELECT 
            aus.package_name,
            aus.app_name,
            SUM(aus.usage_time_ms) / 1000 / 60 as minutes_used,
            COALESCE(ac.category, al.category, 'other') as category
        FROM app_usage_stats aus
        LEFT JOIN app_categories ac ON aus.package_name = ac.package_name
        LEFT JOIN app_limits al ON aus.child_id = al.child_id AND aus.package_name = al.package_name
        WHERE aus.child_id = child_id_param 
        AND DATE(aus.recorded_at) = CURRENT_DATE
        GROUP BY aus.package_name, aus.app_name, ac.category, al.category
    ),
    aggregated AS (
        SELECT 
            SUM(minutes_used)::INTEGER as total_minutes,
            COUNT(*)::INTEGER as total_apps,
            SUM(CASE WHEN category = 'social' THEN minutes_used ELSE 0 END)::INTEGER as social_minutes,
            SUM(CASE WHEN category = 'games' THEN minutes_used ELSE 0 END)::INTEGER as games_minutes,
            (SELECT app_name FROM today_stats ORDER BY minutes_used DESC LIMIT 1) as top_app
        FROM today_stats
    )
    SELECT 
        total_minutes,
        total_apps,
        social_minutes,
        games_minutes,
        COALESCE(top_app, 'Ninguna')
    FROM aggregated;
END;
$$ LANGUAGE plpgsql;

-- ✅ Trigger para actualizar timestamp de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a las tablas
DROP TRIGGER IF EXISTS update_app_usage_stats_updated_at ON app_usage_stats;
CREATE TRIGGER update_app_usage_stats_updated_at
    BEFORE UPDATE ON app_usage_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_limits_updated_at ON app_limits;
CREATE TRIGGER update_app_limits_updated_at
    BEFORE UPDATE ON app_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ✅ Vista para estadísticas rápidas de hoy
CREATE OR REPLACE VIEW today_usage_summary AS
SELECT 
    c.id as child_id,
    c.name as child_name,
    COALESCE(SUM(aus.usage_time_ms) / 1000 / 60, 0)::INTEGER as total_minutes_today,
    COUNT(DISTINCT aus.package_name)::INTEGER as apps_used_today,
    c.max_screen_time,
    c.max_social_time,
    CASE 
        WHEN c.max_screen_time > 0 THEN 
            ROUND((COALESCE(SUM(aus.usage_time_ms) / 1000 / 60, 0) * 100.0 / c.max_screen_time), 1)
        ELSE 0 
    END as screen_time_percentage
FROM children c
LEFT JOIN app_usage_stats aus ON c.id = aus.child_id 
    AND DATE(aus.recorded_at) = CURRENT_DATE
GROUP BY c.id, c.name, c.max_screen_time, c.max_social_time;

-- ✅ Comentarios para documentación
COMMENT ON TABLE app_usage_stats IS 'Estadísticas detalladas de uso de aplicaciones por día';
COMMENT ON TABLE app_limits IS 'Límites personalizados de tiempo por aplicación y niño';
COMMENT ON TABLE app_sessions IS 'Sesiones de uso en tiempo real para monitoreo activo';
COMMENT ON TABLE app_categories IS 'Categorización de aplicaciones para agrupación y análisis';

COMMENT ON COLUMN app_usage_stats.usage_time_ms IS 'Tiempo total de uso en milisegundos';
COMMENT ON COLUMN app_usage_stats.total_time_foreground IS 'Tiempo en primer plano según Android UsageStats';
COMMENT ON COLUMN app_limits.daily_limit_minutes IS 'Límite diario en minutos para esta aplicación';
COMMENT ON COLUMN children.max_screen_time IS 'Límite total de tiempo de pantalla diario en minutos';
COMMENT ON COLUMN children.max_social_time IS 'Límite específico para apps de redes sociales en minutos';

-- ✅ Datos de ejemplo para testing (solo en desarrollo)
-- NOTA: Estos INSERT se ejecutarán solo si la tabla está vacía
DO $
BEGIN
    -- Solo insertar datos de ejemplo si no hay datos existentes
    IF NOT EXISTS (SELECT 1 FROM app_usage_stats LIMIT 1) THEN
        
        -- Supongamos que tenemos un niño con ID 1
        IF EXISTS (SELECT 1 FROM children WHERE id = 1) THEN
            
            -- Estadísticas de ejemplo para hoy
            INSERT INTO app_usage_stats (child_id, package_name, app_name, usage_time_ms, first_timestamp, last_timestamp, total_time_foreground, recorded_at) VALUES
            (1, 'com.instagram.android', 'Instagram', 1800000, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '30 minutes', 1800000, NOW()),
            (1, 'com.google.android.youtube', 'YouTube', 3600000, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '1 hour', 3600000, NOW()),
            (1, 'com.whatsapp', 'WhatsApp', 900000, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '10 minutes', 900000, NOW()),
            (1, 'com.mojang.minecraftpe', 'Minecraft', 2700000, NOW() - INTERVAL '1 hour', NOW(), 2700000, NOW());
            
            -- Límites de ejemplo
            INSERT INTO app_limits (child_id, package_name, daily_limit_minutes, is_blocked, category) VALUES
            (1, 'com.instagram.android', 30, false, 'social'),
            (1, 'com.google.android.youtube', 60, false, 'entertainment'),
            (1, 'com.mojang.minecraftpe', 45, false, 'games');
            
            RAISE NOTICE 'Sample app monitoring data inserted for testing';
        END IF;
    END IF;
END $;