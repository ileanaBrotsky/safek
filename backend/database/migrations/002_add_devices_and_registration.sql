-- backend/database/migrations/002_add_devices_and_registration.sql

-- Tabla para códigos de registro
CREATE TABLE IF NOT EXISTS registration_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(6) UNIQUE NOT NULL,
    child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP,
    created_by INTEGER REFERENCES families(id)
);

-- Índices para códigos de registro
CREATE INDEX idx_registration_codes_code ON registration_codes(code);
CREATE INDEX idx_registration_codes_child_id ON registration_codes(child_id);
CREATE INDEX idx_registration_codes_expires_at ON registration_codes(expires_at);

-- Tabla para dispositivos
CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(255) UNIQUE NOT NULL,
    child_id INTEGER REFERENCES children(id) ON DELETE SET NULL,
    device_name VARCHAR(255),
    brand VARCHAR(100),
    model VARCHAR(100),
    os VARCHAR(50),
    os_version VARCHAR(50),
    app_version VARCHAR(20),
    platform VARCHAR(20),
    push_token TEXT,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    unregistered_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    battery_level INTEGER,
    total_memory BIGINT,
    is_tablet BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para dispositivos
CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_devices_child_id ON devices(child_id);
CREATE INDEX idx_devices_is_active ON devices(is_active);
CREATE INDEX idx_devices_last_seen ON devices(last_seen);

-- Tabla para historial de sesiones de dispositivos
CREATE TABLE IF NOT EXISTS device_sessions (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL,
    child_id INTEGER REFERENCES children(id),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    duration_minutes INTEGER,
    locations_sent INTEGER DEFAULT 0,
    alerts_triggered INTEGER DEFAULT 0
);

-- Índices para sesiones
CREATE INDEX idx_device_sessions_device_id ON device_sessions(device_id);
CREATE INDEX idx_device_sessions_child_id ON device_sessions(child_id);
CREATE INDEX idx_device_sessions_started_at ON device_sessions(started_at);

-- Nota: La columna device_id en children ya existe según la migración 001

-- Trigger para actualizar updated_at en devices
CREATE OR REPLACE FUNCTION update_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_devices_updated_at();