/**
 * Kairos AI Core - Fastify server
 *
 * Roda em localhost:4096 dentro do Electron (ou em standalone para testes).
 * Expoe endpoints HTTP que o renderer (React) chama via IPC no main process.
 *
 * Endpoints:
 *   GET  /health
 *   GET  /llm/providers
 *   GET  /llm/models?provider=X
 *   POST /chat (streaming SSE)
 *   POST /chat/sync (resposta completa, sem streaming)
 *
 * @see docs/PRD-TECNICO.md §7
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync, createReadStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeLLMUseCase } from './application/llm/invoke-llm.usecase.js';
import { listProvidersUseCase } from './application/llm/select-model.usecase.js';
import { storeEntityUseCase, StoreEntityInputSchema } from './application/memory/store-entity.usecase.js';
import { searchEntitiesUseCase, SearchEntitiesInputSchema } from './application/memory/search-entities.usecase.js';
import { recallEntitiesUseCase } from './application/memory/recall-entities.usecase.js';
import { createConversationUseCase, addMessageUseCase, listConversationsUseCase, listMessagesUseCase, CreateConversationInputSchema, AddMessageInputSchema } from './application/memory/conversation.usecase.js';
import { getMemoryRepository } from './infrastructure/memory/sqlite.repository.js';
import { skillRegistry } from './skills/registry.js';
import { uploadService, UploadError, getUploadsRoot } from './infrastructure/upload/upload.service.js';
import { buildSystemPrompt } from './prompts/system-prompt.js';
import { z } from 'zod';
import type { ChatMessage, ToolDefinition } from './infrastructure/llm/llm-provider.interface.js';

const PORT = Number(process.env.KAIROS_PORT || 4096);
const HOST = process.env.KAIROS_HOST || '127.0.0.1';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ChatInputSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool']),
      content: z.string(),
      toolCallId: z.string().optional(),
      toolCalls: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            arguments: z.record(z.unknown()),
          }),
        )
        .optional(),
      name: z.string().optional(),
      attachments: z
        .array(
          z.object({
            id: z.string(),
            path: z.string(),
            name: z.string(),
            mimeType: z.string(),
            sizeBytes: z.number(),
            dataUri: z.string().optional(),
            extractedText: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
  tools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.record(z.unknown()),
      }),
    )
    .optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
});

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.KAIROS_LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    },
  });

  // C9 fix: CORS restrito a origens conhecidas.
  // M5 fix: em dev, libera localhost:5173/5174; em prod, so o proprio dominio.
  const IS_DEV = process.env.NODE_ENV !== 'production';
  const ALLOWED_ORIGINS = [
    // Dev local (Vite serve o frontend, Core roda em :4096 separado)
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    // Prod (Core servindo a UI, mesma origem)
    'https://kairosdesktop.fbautomacao.space',
    'http://localhost:4098',
  ];
  await app.register(import('@fastify/cors'), {
    origin: (origin, cb) => {
      // Sem header Origin (Electron renderer, curl) = permite
      if (!origin) return cb(null, true);
      // file:// (renderer do Electron em prod) = permite
      if (origin.startsWith('file://')) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      // Em dev, libera qualquer localhost (debug)
      if (IS_DEV && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`CORS: origem bloqueada: ${origin}`), false);
    },
    credentials: true,
  });

  // Multipart para upload de arquivos
  await app.register(import('@fastify/multipart'), {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB
      files: 4,                   // ate 4 arquivos por request
    },
  });

  // ---------- Health ----------
  app.get('/health', async () => ({
    status: 'ok',
    service: 'kairos-core',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }));

  // Health detalhado: valida chave OpenRouter (precisa estar online e ter credito).
  // Util apos rotacao de chave pra confirmar que tudo funciona.
  app.get('/system/health-detailed', async () => {
    const result: {
      service: string;
      version: string;
      openrouter?: {
        ok: boolean;
        httpStatus?: number;
        limitRemaining?: number;
        usage?: number;
        planLabel?: string;
        error?: string;
      };
      skills: number;
      timestamp: string;
    } = {
      service: 'kairos-core',
      version: '0.1.0',
      skills: skillRegistry.list().length,
      timestamp: new Date().toISOString(),
    };

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      result.openrouter = { ok: false, error: 'OPENROUTER_API_KEY nao configurado' };
      return result;
    }

    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: { limit_remaining?: number; usage?: number; limit_label?: string } };
        result.openrouter = {
          ok: true,
          httpStatus: res.status,
          limitRemaining: data.data?.limit_remaining,
          usage: data.data?.usage,
          planLabel: data.data?.limit_label,
        };
      } else {
        const text = await res.text().catch(() => '');
        result.openrouter = {
          ok: false,
          httpStatus: res.status,
          error: text.slice(0, 200),
        };
      }
    } catch (err) {
      result.openrouter = { ok: false, error: (err as Error).message };
    }

    return result;
  });

  // ---------- Static (UI build) ----------
  // Quando rodando standalone (VPS ou dev sem Electron), serve o frontend Vite build.
  // Em dev (npm run dev), o Vite dev server em :5173 que serve a UI.
  const staticRoot = process.env.KAIROS_STATIC_DIR
    ? resolve(process.env.KAIROS_STATIC_DIR)
    : resolve(__dirname, '..', 'renderer');

  if (existsSync(staticRoot)) {
    await app.register(import('@fastify/static'), {
      root: staticRoot,
      prefix: '/',
      decorateReply: true, // C4 fix: precisa ser true para o setNotFoundHandler usar reply.sendFile
    });
    // SPA fallback: qualquer GET que nao foi rota da API retorna index.html
    app.setNotFoundHandler((req, reply) => {
      // Rotas da API nao caem no SPA fallback
      if (req.url.startsWith('/api/') || req.url.startsWith('/chat/') ||
          req.url.startsWith('/llm/') || req.url.startsWith('/memory/') ||
          req.url.startsWith('/skills/') || req.url.startsWith('/upload') ||
          req.url.startsWith('/system/') ||
          req.url === '/health') {
        return reply.code(404).send({ error: 'Not found' });
      }
      // SPA: serve index.html. readFile + send (mais confiavel que sendFile em alguns edge cases)
      const indexPath = resolve(staticRoot, 'index.html');
      if (existsSync(indexPath)) {
        reply.type('text/html');
        return reply.send(createReadStream(indexPath));
      }
      return reply.code(404).send({ error: 'UI not found' });
    });
    app.log.info({ staticRoot }, 'Serving UI from static dir');
  } else {
    app.log.warn({ staticRoot }, 'Static dir not found - UI not served (use Vite dev server)');
  }

  // ---------- List providers ----------
  app.get('/llm/providers', async () => {
    const providers = await listProvidersUseCase.execute();
    return { providers };
  });

  // ---------- List models for a provider ----------
  app.get<{ Querystring: { provider?: string } }>('/llm/models', async (req) => {
    const provider = req.query.provider;
    const providers = await listProvidersUseCase.execute();
    const target = provider
      ? providers.find((p) => p.id === provider)
      : providers[0];
    if (!target) {
      return { error: `Provider not found: ${provider}` };
    }
    return { provider: target.id, models: target.models };
  });

  // ---------- Chat (streaming SSE) ----------
  app.post<{ Body: z.infer<typeof ChatInputSchema> }>('/chat', async (req, reply) => {
    const parse = ChatInputSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parse.error.flatten() });
    }
    const input = parse.data;

    try {
      const result = await invokeLLMUseCase.execute({
        messages: input.messages as ChatMessage[],
        tools: input.tools as ToolDefinition[] | undefined,
        provider: input.provider,
        model: input.model,
        systemPrompt: input.systemPrompt,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Kairos-Provider', result.provider);
      reply.raw.setHeader('X-Kairos-Model', result.model);
      reply.hijack();

      for await (const chunk of result.stream) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    } catch (err) {
      app.log.error({ err }, 'chat error');
      if (!reply.sent) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  });

  // ---------- Chat (sync, sem streaming) ----------
  // Aceita opcionalmente `useTools: true` para habilitar function calling.
  // Quando useTools=true, o Core executa o tool loop e retorna toolCalls + toolResults.
  const ChatSyncSchema = ChatInputSchema.extend({
    useTools: z.boolean().optional().default(false),
  });

  app.post<{ Body: z.infer<typeof ChatSyncSchema> }>('/chat/sync', async (req, reply) => {
    const parse = ChatSyncSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parse.error.flatten() });
    }
    const input = parse.data;

    try {
      // Se useTools=true, injeta tools do registry (formato ToolDefinition,
      // o adapter mapTools faz o wrapping OpenAI)
      const tools = input.useTools ? skillRegistry.asToolDefinitions() : input.tools;

      if (input.useTools) {
        // Tool loop (consome o stream e retorna tudo no final)
        const stream = invokeLLMUseCase.executeWithTools({
          messages: input.messages as ChatMessage[],
          tools: tools as ToolDefinition[] | undefined,
          provider: input.provider,
          model: input.model,
          systemPrompt: input.systemPrompt,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        });

        let content = '';
        const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
        const toolResults: Array<{ name: string; content: string; ok: boolean }> = [];

        for await (const chunk of stream) {
          if (chunk.type === 'content' && chunk.content) {
            content += chunk.content;
          } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            toolCalls.push(chunk.toolCall);
          } else if ((chunk.type as string) === 'tool_result' && chunk.toolResult) {
            toolResults.push(chunk.toolResult);
          } else if (chunk.type === 'error') {
            return reply.code(500).send({ error: chunk.error });
          }
        }

        return {
          provider: input.provider || 'openrouter',
          model: input.model || 'unknown',
          content,
          toolCalls,
          toolResults,
          usedTools: true,
        };
      }

      // Sem tools: fluxo original
      const result = await invokeLLMUseCase.execute({
        messages: input.messages as ChatMessage[],
        tools: input.tools as ToolDefinition[] | undefined,
        provider: input.provider,
        model: input.model,
        systemPrompt: input.systemPrompt,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });

      let content = '';
      const toolCalls: any[] = [];
      for await (const chunk of result.stream) {
        if (chunk.type === 'content' && chunk.content) content += chunk.content;
        if (chunk.type === 'tool_call' && chunk.toolCall) toolCalls.push(chunk.toolCall);
      }

      return {
        provider: result.provider,
        model: result.model,
        content,
        toolCalls,
        usedTools: false,
      };
    } catch (err) {
      app.log.error({ err }, 'chat/sync error');
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // ---------- Skills registry (listagem para o renderer) ----------
  app.get('/skills/list', async () => {
    return {
      skills: skillRegistry.list().map((s) => ({
        name: s.name,
        description: s.description,
        category: s.category,
        parameters: s.parameters,
      })),
      count: skillRegistry.list().length,
    };
  });

  // C12 fix: endpoint para o frontend pegar o system prompt.
  // Centraliza a lista de skills (vinda do registry) e o template.
  app.get('/system/prompt', async (req) => {
    const recalled = (req.query as { recalled?: string }).recalled || '';
    const prompt = buildSystemPrompt({
      skills: skillRegistry.list(),
      recalledContext: recalled,
    });
    return { prompt, skillCount: skillRegistry.list().length };
  });

  // =====================================================
  // MEMORY ENDPOINTS (Fase 2)
  // =====================================================

  // ---------- Entities (Nivel Empresa) ----------
  app.post('/memory/entities', async (req, reply) => {
    const parse = StoreEntityInputSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parse.error.flatten() });
    }
    try {
      const entity = await storeEntityUseCase.execute(parse.data);
      return entity;
    } catch (err) {
      app.log.error({ err }, 'store entity error');
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  app.get<{ Querystring: { q?: string; type?: string; tag?: string; limit?: string } }>(
    '/memory/entities',
    async (req, reply) => {
      const parse = SearchEntitiesInputSchema.safeParse({
        query: req.query.q,
        type: req.query.type,
        tag: req.query.tag,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      });
      if (!parse.success) {
        return reply.code(400).send({ error: 'Invalid input', details: parse.error.flatten() });
      }
      const results = await searchEntitiesUseCase.execute(parse.data);
      return { entities: results, total: results.length };
    },
  );

  app.get<{ Params: { slug: string } }>('/memory/entities/:slug', async (req, reply) => {
    const repo = getMemoryRepository();
    const entity = repo.getEntityBySlug(req.params.slug);
    if (!entity) return reply.code(404).send({ error: 'Not found' });
    return entity;
  });

  // Recall (usado pelo LLM)
  app.post<{ Body: { query: string; type?: string; limit?: number } }>(
    '/memory/recall',
    async (req, reply) => {
      try {
        const result = await recallEntitiesUseCase.execute({
          query: req.body.query,
          type: req.body.type as any,
          limit: req.body.limit || 5,
        });
        return result;
      } catch (err) {
        app.log.error({ err }, 'recall error');
        return reply.code(500).send({ error: (err as Error).message });
      }
    },
  );

  // ---------- Conversations (Nivel Usuario) ----------
  app.post('/memory/conversations', async (req, reply) => {
    const parse = CreateConversationInputSchema.safeParse(req.body || {});
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parse.error.flatten() });
    }
    return createConversationUseCase.execute(parse.data);
  });

  app.get<{ Querystring: { limit?: string } }>('/memory/conversations', async (req) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const list = await listConversationsUseCase.execute(limit);
    return { conversations: list, total: list.length };
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/memory/conversations/:id/messages',
    async (req) => {
      const limit = req.query.limit ? Number(req.query.limit) : 200;
      const messages = await listMessagesUseCase.execute(req.params.id, limit);
      return { messages, total: messages.length };
    },
  );

  app.post<{ Params: { id: string } }>('/memory/conversations/:id/messages', async (req, reply) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const parse = AddMessageInputSchema.safeParse({ ...body, conversationId: req.params.id });
    if (!parse.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parse.error.flatten() });
    }
    return addMessageUseCase.execute(parse.data);
  });

  // ---------- LGPD ----------
  app.get('/memory/export', async () => {
    return getMemoryRepository().exportAll();
  });

  // C8 fix: deleteAll agora exige header X-Confirm explicito, faz audit log,
  // e nao apaga o audit_log em si (que eh append-only por design).
  app.delete('/memory/all', async (req, reply) => {
    const confirmed = req.headers['x-confirm'] === 'yes-delete-everything';
    if (!confirmed) {
      return reply.code(400).send({
        error: 'Cabecalho X-Confirm: yes-delete-everything obrigatorio para esta operacao destrutiva',
      });
    }
    const repo = getMemoryRepository();
    // Audit log ANTES de apagar (assim registramos a intencao)
    try {
      repo.addAudit({
        eventType: 'memory.deleteAll',
        actor: req.ip || 'unknown',
        payload: { ts: Date.now(), confirmed: true },
        approvedBy: null,
        decision: 'allow',
      });
    } catch (err) {
      app.log.warn({ err }, 'audit log antes de deleteAll falhou (continuando)');
    }
    // NUNCA apagar o audit_log em si (imutavel)
    repo.deleteAll();
    return { deleted: true, ts: Date.now() };
  });

  // =====================================================
  // UPLOAD ENDPOINTS (Fase 5 - file attachments no chat)
  // =====================================================

  /**
   * POST /upload - recebe 1-N arquivos via multipart, salva em ~/.kairos/uploads/
   * Retorna { attachments: ChatAttachment[] } com id, path, mimeType, etc.
   * Auto-extrai texto de PDF/TXT/MD/JSON. Gera dataUri para imagens pequenas.
   */
  app.post('/upload', async (req, reply) => {
    if (!req.isMultipart()) {
      return reply.code(400).send({ error: 'Esperado multipart/form-data' });
    }

    const saved: any[] = [];
    try {
      const parts = req.parts({ limits: { fileSize: 25 * 1024 * 1024 } });
      for await (const part of parts) {
        if (part.type !== 'file') continue;
        const buffer = await part.toBuffer();
        const att = await uploadService.save({
          buffer,
          originalName: part.filename || 'arquivo',
          mimeType: part.mimetype,
        });
        saved.push(att);
      }
      return { attachments: saved, count: saved.length };
    } catch (err) {
      app.log.error({ err }, 'upload error');
      if (err instanceof UploadError) {
        return reply.code(400).send({ error: err.message });
      }
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  /**
   * GET /upload/:id - serve um arquivo enviado (pra preview no chat).
   * Substitui dataUri quando o arquivo for grande demais (>5MB).
   */
  app.get<{ Params: { id: string } }>('/upload/:id', async (req, reply) => {
    const att = uploadService.get(req.params.id);
    if (!att) return reply.code(404).send({ error: 'Upload nao encontrado ou expirado' });
    if (!existsSync(att.path)) {
      return reply.code(410).send({ error: 'Arquivo removido do disco' });
    }
    reply.header('Content-Type', att.mimeType);
    reply.header('Content-Disposition', `inline; filename="${att.name}"`);
    return reply.send(createReadStream(att.path));
  });

  /**
   * GET /upload - retorna diretorio raiz (debug/info)
   */
  app.get('/upload', async () => {
    return { root: getUploadsRoot(), count: 0 };
  });

  return app;
}

// Entry point quando rodado standalone
const isDirectRun = process.argv[1]?.includes('server.ts') || process.argv[1]?.includes('server.js');
if (isDirectRun) {
  buildServer()
    .then((app) => app.listen({ port: PORT, host: HOST }))
    .then(() => {
      console.log(`\nKairos AI Core listening at http://${HOST}:${PORT}\n`);
    })
    .catch((err) => {
      console.error('Failed to start Kairos Core:', err);
      process.exit(1);
    });
}
