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
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, 'migrations');
export class MemoryRepository {
    db;
    migrationsApplied = false;
    constructor(dbPath) {
        const path = dbPath || this.defaultDbPath();
        if (!existsSync(dirname(path))) {
            mkdirSync(dirname(path), { recursive: true });
        }
        this.db = new DatabaseSync(path);
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA foreign_keys = ON;');
    }
    defaultDbPath() {
        const dataDir = process.env.KAIROS_DATA_DIR || join(homedir(), '.kairos');
        return join(dataDir, 'memory.db');
    }
    /**
     * Roda todas as migrations na ordem.
     */
    migrate() {
        if (this.migrationsApplied)
            return;
        // Cria tabela de controle de migrations
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at INTEGER DEFAULT (unixepoch())
      );
    `);
        // Acha arquivos .sql no diretorio
        const migrationFiles = ['001_init.sql'];
        for (const file of migrationFiles) {
            const applied = this.db
                .prepare('SELECT 1 FROM _migrations WHERE name = ?')
                .get(file);
            if (applied)
                continue;
            const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
            this.db.exec(sql);
            this.db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
            console.log(`[memory] migration applied: ${file}`);
        }
        this.migrationsApplied = true;
    }
    // =====================================================
    // ENTITIES (Nivel Empresa)
    // =====================================================
    storeEntity(entity) {
        this.migrate();
        const now = Math.floor(Date.now() / 1000);
        this.db
            .prepare(`INSERT INTO entities (id, type, slug, name, content, tags, relations, metadata, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type=excluded.type,
           slug=excluded.slug,
           name=excluded.name,
           content=excluded.content,
           tags=excluded.tags,
           relations=excluded.relations,
           metadata=excluded.metadata,
           updated_at=excluded.updated_at`)
            .run(entity.id, entity.type, entity.slug, entity.name, entity.content, JSON.stringify(entity.tags), JSON.stringify(entity.relations), JSON.stringify(entity.metadata), now);
        return this.getEntity(entity.id);
    }
    getEntity(id) {
        this.migrate();
        const row = this.db.prepare('SELECT * FROM entities WHERE id = ?').get(id);
        if (!row)
            return null;
        return this.mapEntity(row);
    }
    getEntityBySlug(slug) {
        this.migrate();
        const row = this.db.prepare('SELECT * FROM entities WHERE slug = ?').get(slug);
        if (!row)
            return null;
        return this.mapEntity(row);
    }
    listEntities(filter) {
        this.migrate();
        const limit = filter?.limit || 100;
        const rows = filter?.type
            ? this.db.prepare('SELECT * FROM entities WHERE type = ? ORDER BY updated_at DESC LIMIT ?').all(filter.type, limit)
            : this.db.prepare('SELECT * FROM entities ORDER BY updated_at DESC LIMIT ?').all(limit);
        return rows.map((r) => this.mapEntity(r));
    }
    searchEntities(query, limit = 20) {
        this.migrate();
        const rows = this.db
            .prepare(`SELECT e.* FROM entities e
         JOIN entities_fts fts ON fts.rowid = e.rowid
         WHERE entities_fts MATCH ?
         ORDER BY rank
         LIMIT ?`)
            .all(query, limit);
        return rows.map((r) => this.mapEntity(r));
    }
    deleteEntity(id) {
        this.migrate();
        this.db.prepare('DELETE FROM entities WHERE id = ?').run(id);
    }
    mapEntity(row) {
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
    createConversation(conv) {
        this.migrate();
        const now = Math.floor(Date.now() / 1000);
        this.db
            .prepare('INSERT INTO conversations (id, title, provider, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(conv.id, conv.title, conv.provider, conv.model, now, now);
        return this.getConversation(conv.id);
    }
    getConversation(id) {
        this.migrate();
        const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
        if (!row)
            return null;
        return {
            id: row.id,
            title: row.title,
            provider: row.provider,
            model: row.model,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    listConversations(limit = 50) {
        this.migrate();
        const rows = this.db
            .prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?')
            .all(limit);
        return rows.map((row) => ({
            id: row.id,
            title: row.title,
            provider: row.provider,
            model: row.model,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }
    updateConversation(id, patch) {
        this.migrate();
        const now = Math.floor(Date.now() / 1000);
        if (patch.title !== undefined) {
            this.db
                .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
                .run(patch.title, now, id);
        }
    }
    touchConversation(id) {
        this.migrate();
        const now = Math.floor(Date.now() / 1000);
        this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, id);
    }
    // =====================================================
    // MESSAGES
    // =====================================================
    addMessage(msg) {
        this.migrate();
        this.db
            .prepare(`INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_results, tokens_in, tokens_out, cost_usd, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`)
            .run(msg.id, msg.conversationId, msg.role, msg.content, msg.toolCalls ? JSON.stringify(msg.toolCalls) : null, msg.toolResults ? JSON.stringify(msg.toolResults) : null, msg.tokensIn, msg.tokensOut, msg.costUsd);
        this.touchConversation(msg.conversationId);
        return this.getMessage(msg.id);
    }
    getMessage(id) {
        this.migrate();
        const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
        if (!row)
            return null;
        return this.mapMessage(row);
    }
    listMessages(conversationId, limit = 200) {
        this.migrate();
        const rows = this.db
            .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY ts ASC LIMIT ?')
            .all(conversationId, limit);
        return rows.map((r) => this.mapMessage(r));
    }
    mapMessage(row) {
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
    getSetting(key) {
        this.migrate();
        const row = this.db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
        return row ? row.value : null;
    }
    setSetting(key, value) {
        this.migrate();
        this.db
            .prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=unixepoch()`)
            .run(key, value);
    }
    // =====================================================
    // AUDIT LOG (append-only)
    // =====================================================
    addAudit(entry) {
        this.migrate();
        this.db
            .prepare(`INSERT INTO audit_log (event_type, actor, payload, approved_by, decision) VALUES (?, ?, ?, ?, ?)`)
            .run(entry.eventType, entry.actor, entry.payload ? JSON.stringify(entry.payload) : null, entry.approvedBy, entry.decision);
    }
    listAudit(limit = 100, eventType) {
        this.migrate();
        const rows = eventType
            ? this.db
                .prepare('SELECT * FROM audit_log WHERE event_type = ? ORDER BY ts DESC LIMIT ?')
                .all(eventType, limit)
            : this.db.prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?').all(limit);
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
    // LGPD
    // =====================================================
    /**
     * Apaga TODOS os dados do usuario (LGPD art. 18 - direito ao esquecimento).
     */
    deleteAll() {
        this.migrate();
        this.db.exec(`
      DELETE FROM audit_log;
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
    exportAll() {
        this.migrate();
        return {
            exportedAt: new Date().toISOString(),
            version: '0.1.0',
            entities: this.listEntities({ limit: 100_000 }),
            conversations: this.listConversations(100_000),
            audit: this.listAudit(100_000),
        };
    }
    close() {
        this.db.close();
    }
}
let _instance = null;
export function getMemoryRepository() {
    if (!_instance) {
        _instance = new MemoryRepository();
        _instance.migrate();
    }
    return _instance;
}
