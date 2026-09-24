-- Estado actual del lienzo: una fila por píxel pintado.
CREATE TABLE IF NOT EXISTS pixels (
  idx INTEGER PRIMARY KEY,
  color INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL
);

-- Historial append-only: alimenta el feed en vivo y el timelapse.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idx INTEGER NOT NULL,
  color INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS events_idx ON events (idx, id);

-- Participantes: nombre, cooldown y contador.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_paint INTEGER NOT NULL DEFAULT 0,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS users_count ON users (count DESC);
