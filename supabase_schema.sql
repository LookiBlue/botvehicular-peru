-- ════════════════════════════════════════════════════════════════
-- BOT VEHICULAR PERU — Schema de Supabase
-- ════════════════════════════════════════════════════════════════
-- Copia y pega este SQL en: Supabase Dashboard → SQL Editor → Run
-- ════════════════════════════════════════════════════════════════

-- ── Tabla: Usuarios ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  telegram_id   BIGINT        PRIMARY KEY,
  username      TEXT,
  credits       INTEGER       NOT NULL DEFAULT 5,
  total_queries INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Tabla: Caché de Vehículos ────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_cache (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  placa       TEXT          NOT NULL UNIQUE,
  data_json   JSONB         NOT NULL,
  score       INTEGER       NOT NULL DEFAULT 0,
  queried_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índice para búsquedas rápidas por placa
CREATE INDEX IF NOT EXISTS idx_vehicle_cache_placa ON vehicle_cache(placa);

-- ── Row Level Security (RLS) — Seguridad ─────────────────────────
-- Desactivado para que las funciones serverless puedan leer/escribir
-- con la ANON KEY. En producción puedes usar SERVICE_ROLE_KEY.
ALTER TABLE users          DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_cache  DISABLE ROW LEVEL SECURITY;

-- ── Datos de ejemplo (opcional) ───────────────────────────────────
-- Puedes insertar un usuario admin de prueba:
-- INSERT INTO users (telegram_id, username, credits)
-- VALUES (123456789, 'tu_usuario', 100);

-- ════════════════════════════════════════════════════════════════
-- ✅ Listo. Las tablas están creadas.
-- ════════════════════════════════════════════════════════════════
