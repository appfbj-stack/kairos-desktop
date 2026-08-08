-- 002_uploads.sql
-- Persiste os uploads do usuario (carta, recibo, etc) no SQLite.
-- C5 fix: antes os uploads viviam num Map em memoria, perdidos no restart.
-- C6 fix: tinha memory leak (nunca limpava). Agora tem TTL via `expires_at`.
-- A6 fix: cada upload fica atrelado a um owner (conversation ou user) para evitar
--         que outros tenham acesso via enumeração de IDs.

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,              -- 24 chars hex (randomBytes(12))
  owner_id TEXT NOT NULL,           -- conversation_id, user_id ou "anon"
  path TEXT NOT NULL,               -- path absoluto no disco
  name TEXT NOT NULL,               -- nome original do arquivo
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data_uri TEXT,                    -- base64 se imagem pequena (multimodal)
  extracted_text TEXT,              -- texto extraido de PDF/TXT
  created_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL       -- unixepoch() + TTL (default 7 dias)
);

CREATE INDEX IF NOT EXISTS idx_uploads_owner ON uploads(owner_id);
CREATE INDEX IF NOT EXISTS idx_uploads_expires ON uploads(expires_at);
