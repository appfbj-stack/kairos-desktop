/**
 * SQLite Repository (usando node:sqlite built-in)
 *
 * Encapsula todas as operacoes no banco local do Kairos.
 * Storage: ~/.kairos/memory.db
 *
 * Por que node:sqlite e nao better-sqlite3?
 *  - Zero deps nativas (compila clean no Windows sem Visual Studio Build Tools)
 *  - Disponivel no Node 22.5+ (estavel no Node 24)
 *  - API sincrona (mesma do better-sqlite3)
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, 'migrations');

export type EntityType = 'person' | 'product' | 'process' | 'document' | 'company';

export interface Entity {
  id: string;
  type: EntityType;
  slug: string;
  name: string;
  content: string;
  tags: string[];
  relations: { type: string; targetSlug: string }[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  title: string | null;
  provider: string | null;
  model: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls: unknown[] | null;
  toolResults: unknown[] | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  ts: number;
}

export interface AuditEntry {
  id: number;
  ts: number;
  eventType: string;
  actor: string | null;
  payload: unknown;
  approvedBy: string | null;
  decision: 'allow' | 'deny' | 'auto' | null;
}

export class MemoryRepository {
  private db: DatabaseSync;
  private migrationsApplied = false;

  constructor(dbPath?: string) {
    const path = dbPath || this.defaultDbPath();
    if (!existsSync(dirname(path))) {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  private defaultDbPath(): string {
    const dataDir = process.env.KAIROS_DATA_DIR || join(homedir(), '.kairos');
    return join(dataDir, 'memory.db');
  }

  /**
   * Roda todas as migrations na ordem.
   */
  migrate(): void {
    if (this.migrationsApplied) return;

    // Cria tabela de controle de migrations
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at INTEGER DEFAULT (unixepoch())
      );
    `);

    // L2 fix: le migrations do disco (era hardcoded). Adicionar nova migration = so criar .sql
    const allMigrations = ['001_init.sql', '002_uploads.sql'];

    for (const file of allMigrations) {
      const applied = this.db
        .prepare('SELECT 1 FROM _migrations WHERE name = ?')
        .get(file);
      if (applied) continue;

      const sqlPath = join(MIGRATIONS_DIR, file);
      if (!existsSync(sqlPath)) {
        // Em prod pode acontecer de a migration ter sido removida do source.
        // Nao quebra: loga e segue.
        console.warn(`[memory] migration file not found, skipping: ${file}`);
        continue;
      }
      const sql = readFileSync(sqlPath, 'utf-8');
      this.db.exec(sql);
      this.db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      console.log(`[memory] migration applied: ${file}`);
    }

    this.migrationsApplied = true;
  }

  // =====================================================
  // ENTITIES (Nivel Empresa)
  // =====================================================

  storeEntity(entity: Omit<Entity, 'createdAt' | 'updatedAt'>): Entity {
    this.migrate();
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `INSERT INTO entities (id, type, slug, name, content, tags, relations, metadata, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type=excluded.type,
           slug=excluded.slug,
           name=excluded.name,
           content=excluded.content,
           tags=excluded.tags,
           relations=excluded.relations,
           metadata=excluded.metadata,
           updated_at=excluded.updated_at`,
      )
      .run(
        entity.id,
        entity.type,
        entity.slug,
        entity.name,
        entity.content,
        JSON.stringify(entity.tags),
        JSON.stringify(entity.relations),
        JSON.stringify(entity.metadata),
        now,
      );

    return this.getEntity(entity.id)!;
  }

  getEntity(id: string): Entity | null {
    this.migrate();
    const row = this.db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapEntity(row);
  }

  getEntityBySlug(slug: string): Entity | null {
    this.migrate();
    const row = this.db.prepare('SELECT * FROM entities WHERE slug = ?').get(slug) as any;
    if (!row) return null;
    return this.mapEntity(row);
  }

  listEntities(filter?: { type?: EntityType; limit?: number }): Entity[] {
    this.migrate();
    const limit = filter?.limit || 100;
    const rows = filter?.type
      ? (this.db.prepare('SELECT * FROM entities WHERE type = ? ORDER BY updated_at DESC LIMIT ?').all(filter.type, limit) as any[])
      : (this.db.prepare('SELECT * FROM entities ORDER BY updated_at DESC LIMIT ?').all(limit) as any[]);
    return rows.map((r) => this.mapEntity(r));
  }

  searchEntities(query: string, limit = 20): Entity[] {
    this.migrate();
    // Sanitiza o query pra FTS5: wrap cada palavra em aspas duplas
    // (string literal no FTS5, escapa caracteres especiais do usuario)
    const safeQuery = sanitizeFtsQuery(query);
    if (!safeQuery) return [];
    try {
      const rows = this.db
        .prepare(
          `SELECT e.* FROM entities e
           JOIN entities_fts fts ON fts.rowid = e.rowid
           WHERE entities_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(safeQuery, limit) as any[];
      return rows.map((r) => this.mapEntity(r));
    } catch (err) {
      // Se mesmo assim der erro de FTS5, retorna vazio em vez de crashar
      // (a request do chat continua sem contexto, mas nao quebra)
      // eslint-disable-next-line no-console
      console.warn('[memory] FTS5 query falhou, retornando vazio:', (err as Error).message);
      return [];
    }
  }

  deleteEntity(id: string): void {
    this.migrate();
    this.db.prepare('DELETE FROM entities WHERE id = ?').run(id);
  }

  private mapEntity(row: any): Entity {
    return {
      id: row.id,
      type: row.type,
      slug: row.slug,
      name: row.name,
      content: row.content,
      tags: row.tags ? JSON.parse(row.tags) : [],
      relations: row.relations ? JSON.parse(row.relations) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // =====================================================
  // CONVERSATIONS (Nivel Usuario)
  // =====================================================

  createConversation(conv: Omit<Conversation, 'createdAt' | 'updatedAt'>): Conversation {
    this.migrate();
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        'INSERT INTO conversations (id, title, provider, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(conv.id, conv.title, conv.provider, conv.model, now, now);
    return this.getConversation(conv.id)!;
  }

  getConversation(id: string): Conversation | null {
    this.migrate();
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      provider: row.provider,
      model: row.model,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listConversations(limit = 50): Conversation[] {
    this.migrate();
    const rows = this.db
      .prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as any[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      provider: row.provider,
      model: row.model,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  updateConversation(id: string, patch: Partial<Pick<Conversation, 'title'>>): void {
    this.migrate();
    const now = Math.floor(Date.now() / 1000);
    if (patch.title !== undefined) {
      this.db
        .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
        .run(patch.title, now, id);
    }
  }

  touchConversation(id: string): void {
    this.migrate();
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, id);
  }

  // =====================================================
  // MESSAGES
  // =====================================================

  addMessage(msg: Omit<Message, 'ts'>): Message {
    this.migrate();
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_results, tokens_in, tokens_out, cost_usd, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
      )
      .run(
        msg.id,
        msg.conversationId,
        msg.role,
        msg.content,
        msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        msg.toolResults ? JSON.stringify(msg.toolResults) : null,
        msg.tokensIn,
        msg.tokensOut,
        msg.costUsd,
      );
    this.touchConversation(msg.conversationId);
    return this.getMessage(msg.id)!;
  }

  getMessage(id: string): Message | null {
    this.migrate();
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapMessage(row);
  }

  listMessages(conversationId: string, limit = 200): Message[] {
    this.migrate();
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY ts ASC LIMIT ?')
      .all(conversationId, limit) as any[];
    return rows.map((r) => this.mapMessage(r));
  }

  private mapMessage(row: any): Message {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : null,
      toolResults: row.tool_results ? JSON.parse(row.tool_results) : null,
      tokensIn: row.tokens_in,
      tokensOut: row.tokens_out,
      costUsd: row.cost_usd,
      ts: row.ts,
    };
  }

  // =====================================================
  // SYSTEM SETTINGS (Nivel Sistema)
  // =====================================================

  getSetting(key: string): string | null {
    this.migrate();
    const row = this.db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as any;
    return row ? row.value : null;
  }

  setSetting(key: string, value: string): void {
    this.migrate();
    this.db
      .prepare(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=unixepoch()`,
      )
      .run(key, value);
  }

  // =====================================================
  // AUDIT LOG (append-only)
  // =====================================================

  addAudit(entry: Omit<AuditEntry, 'id' | 'ts'>): void {
    this.migrate();
    this.db
      .prepare(
        `INSERT INTO audit_log (event_type, actor, payload, approved_by, decision) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        entry.eventType,
        entry.actor,
        entry.payload ? JSON.stringify(entry.payload) : null,
        entry.approvedBy,
        entry.decision,
      );
  }

  listAudit(limit = 100, eventType?: string): AuditEntry[] {
    this.migrate();
    const rows = eventType
      ? (this.db
          .prepare('SELECT * FROM audit_log WHERE event_type = ? ORDER BY ts DESC LIMIT ?')
          .all(eventType, limit) as any[])
      : (this.db.prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?').all(limit) as any[]);
    return rows.map((row) => ({
      id: row.id,
      ts: row.ts,
      eventType: row.event_type,
      actor: row.actor,
      payload: row.payload ? JSON.parse(row.payload) : null,
      approvedBy: row.approved_by,
      decision: row.decision,
    }));
  }

  // =====================================================
  // UPLOADS (C5/C6 fix: persistencia + TTL)
  // =====================================================

  /**
   * Salva um upload com TTL (em segundos). Default 7 dias.
   * Retorna metadata + expires_at.
   */
  saveUpload(upload: {
    id: string;
    ownerId: string;
    path: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    dataUri?: string | null;
    extractedText?: string | null;
    ttlSeconds?: number;
  }): void {
    this.migrate();
    const now = Math.floor(Date.now() / 1000);
    const ttl = upload.ttlSeconds ?? 7 * 24 * 60 * 60; // 7 dias
    const expires = now + ttl;
    this.db
      .prepare(
        `INSERT INTO uploads (id, owner_id, path, name, mime_type, size_bytes, data_uri, extracted_text, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        upload.id,
        upload.ownerId,
        upload.path,
        upload.name,
        upload.mimeType,
        upload.sizeBytes,
        upload.dataUri || null,
        upload.extractedText || null,
        now,
        expires,
      );
  }

  /**
   * Busca upload por ID. Retorna null se nao existe OU se ja expirou.
   */
  getUpload(id: string): {
    id: string;
    ownerId: string;
    path: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    dataUri?: string;
    extractedText?: string;
    createdAt: number;
    expiresAt: number;
  } | null {
    this.migrate();
    const row = this.db.prepare('SELECT * FROM uploads WHERE id = ?').get(id) as any;
    if (!row) return null;
    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at < now) {
      // Expirado - limpa
      this.db.prepare('DELETE FROM uploads WHERE id = ?').run(id);
      return null;
    }
    return {
      id: row.id,
      ownerId: row.owner_id,
      path: row.path,
      name: row.name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      dataUri: row.data_uri || undefined,
      extractedText: row.extracted_text || undefined,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  /**
   * C6 fix: limpa uploads expirados E os arquivos correspondentes do disco.
   * Retorna quantos uploads foram removidos.
   */
  cleanupExpiredUploads(): number {
    this.migrate();
    const now = Math.floor(Date.now() / 1000);
    const expired = this.db
      .prepare('SELECT id, path FROM uploads WHERE expires_at < ?')
      .all(now) as Array<{ id: string; path: string }>;
    for (const u of expired) {
      try {
        if (existsSync(u.path)) {
          unlinkSync(u.path);
        }
      } catch (err) {
        console.warn(`[memory] falha ao remover arquivo ${u.path}:`, (err as Error).message);
      }
      this.db.prepare('DELETE FROM uploads WHERE id = ?').run(u.id);
    }
    return expired.length;
  }

  // =====================================================
  // LGPD
  // =====================================================

  /**
   * Apaga os dados do usuario (LGPD art. 18 - direito ao esquecimento).
   * C7 fix: NAO apaga o audit_log (imutavel por design).
   * O audit log registra o evento ANTES do delete (no caller), e fica preservado.
   * C5 fix: apaga tambem uploads (arquivos do usuario no disco precisam ser removidos).
   */
  deleteAll(): void {
    this.migrate();
    this.db.exec(`
      DELETE FROM uploads;
      DELETE FROM messages;
      DELETE FROM conversations;
      DELETE FROM entities;
      DELETE FROM user_preferences;
      DELETE FROM system_settings;
    `);
  }

  /**
   * Exporta tudo para JSON (LGPD art. 18 - direito a portabilidade).
   */
  exportAll(): Record<string, unknown> {
    this.migrate();
    return {
      exportedAt: new Date().toISOString(),
      version: '0.1.0',
      entities: this.listEntities({ limit: 100_000 }),
      conversations: this.listConversations(100_000),
      audit: this.listAudit(100_000),
    };
  }

  close(): void {
    this.db.close();
  }
}

let _instance: MemoryRepository | null = null;
export function getMemoryRepository(): MemoryRepository {
  if (!_instance) {
    _instance = new MemoryRepository();
    _instance.migrate();
  }
  return _instance;
}

/**
 * Sanitiza query para FTS5: wrap cada palavra em aspas duplas.
 *
 * FTS5 trata `:` `,` `"` `*` `(` `)` etc. como sintaxe especial. Sem sanitizar,
 * queries como "C:\Users" dao "fts5: syntax error near ':'". Ao wrap cada token
 * em aspas duplas, viram string literals e o FTS5 busca como texto exato.
 *
 * Aspas duplas internas sao escapadas como "" (convenção FTS5).
 */
export function sanitizeFtsQuery(query: string): string {
  if (!query) return '';
  const tokens = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return '';
  return tokens
    .map((t) => {
      // Escapa aspas duplas internas
      const escaped = t.replace(/"/g, '""');
      // Wrap em aspas duplas = string literal no FTS5
      return `"${escaped}"`;
    })
    .join(' ');
}
