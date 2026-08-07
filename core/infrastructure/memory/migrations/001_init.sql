-- 001_init.sql
-- Esquema inicial do Kairos AI Core - 3 niveis de memoria + audit log
-- Storage: SQLite (via node:sqlite built-in, Node 22+)

-- ---------- Nivel 1: Sistema ----------
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- ---------- Nivel 2: Empresa (entities nomeadas) ----------
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,         -- 'person' | 'product' | 'process' | 'document' | 'company'
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT,                   -- JSON array
  relations TEXT,              -- JSON array de {type, target_slug}
  metadata TEXT,               -- JSON livre
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_slug ON entities(slug);

-- Full-text search (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
  name, content, tags,
  content='entities',
  content_rowid='rowid'
);

-- Triggers para manter FTS em sincronia
CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts(rowid, name, content, tags)
  VALUES (new.rowid, new.name, new.content, COALESCE(new.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, name, content, tags)
  VALUES ('delete', old.rowid, old.name, old.content, COALESCE(old.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, name, content, tags)
  VALUES ('delete', old.rowid, old.name, old.content, COALESCE(old.tags, ''));
  INSERT INTO entities_fts(rowid, name, content, tags)
  VALUES (new.rowid, new.name, new.content, COALESCE(new.tags, ''));
END;

-- ---------- Nivel 3: Usuario (conversas + preferencias) ----------
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  provider TEXT,
  model TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,           -- 'user' | 'assistant' | 'system' | 'tool'
  content TEXT NOT NULL,
  tool_calls TEXT,              -- JSON
  tool_results TEXT,            -- JSON
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  ts INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_ts ON messages(conversation_id, ts);

-- Preferencias do usuario (chave-valor)
CREATE TABLE IF NOT EXISTS user_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Audit log (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER DEFAULT (unixepoch()),
  event_type TEXT NOT NULL,
  actor TEXT,                   -- 'user' | 'system' | 'skill:<id>'
  payload TEXT,                 -- JSON
  approved_by TEXT,
  decision TEXT                 -- 'allow' | 'deny' | 'auto'
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_log(event_type);
