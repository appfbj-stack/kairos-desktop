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
import Fastify from 'fastify';
import { invokeLLMUseCase } from './application/llm/invoke-llm.usecase.js';
import { listProvidersUseCase } from './application/llm/select-model.usecase.js';
import { storeEntityUseCase, StoreEntityInputSchema } from './application/memory/store-entity.usecase.js';
import { searchEntitiesUseCase, SearchEntitiesInputSchema } from './application/memory/search-entities.usecase.js';
import { recallEntitiesUseCase } from './application/memory/recall-entities.usecase.js';
import { createConversationUseCase, addMessageUseCase, listConversationsUseCase, listMessagesUseCase, CreateConversationInputSchema, AddMessageInputSchema } from './application/memory/conversation.usecase.js';
import { getMemoryRepository } from './infrastructure/memory/sqlite.repository.js';
import { z } from 'zod';
const PORT = Number(process.env.KAIROS_PORT || 4096);
const HOST = process.env.KAIROS_HOST || '127.0.0.1';
const ChatInputSchema = z.object({
    messages: z.array(z.object({
        role: z.enum(['system', 'user', 'assistant', 'tool']),
        content: z.string(),
        toolCallId: z.string().optional(),
        toolCalls: z
            .array(z.object({
            id: z.string(),
            name: z.string(),
            arguments: z.record(z.unknown()),
        }))
            .optional(),
        name: z.string().optional(),
    })),
    tools: z
        .array(z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.record(z.unknown()),
    }))
        .optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    systemPrompt: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().positive().optional(),
});
export async function buildServer() {
    const app = Fastify({
        logger: {
            level: process.env.KAIROS_LOG_LEVEL || 'info',
            transport: process.env.NODE_ENV === 'production'
                ? undefined
                : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
        },
    });
    // CORS para dev local (Vite em 5173 chama Core em 4096)
    await app.register(import('@fastify/cors'), {
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        credentials: true,
    });
    // ---------- Health ----------
    app.get('/health', async () => ({
        status: 'ok',
        service: 'kairos-core',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
    }));
    // ---------- List providers ----------
    app.get('/llm/providers', async () => {
        const providers = await listProvidersUseCase.execute();
        return { providers };
    });
    // ---------- List models for a provider ----------
    app.get('/llm/models', async (req) => {
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
    app.post('/chat', async (req, reply) => {
        const parse = ChatInputSchema.safeParse(req.body);
        if (!parse.success) {
            return reply.code(400).send({ error: 'Invalid input', details: parse.error.flatten() });
        }
        const input = parse.data;
        try {
            const result = await invokeLLMUseCase.execute({
                messages: input.messages,
                tools: input.tools,
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
        }
        catch (err) {
            app.log.error({ err }, 'chat error');
            if (!reply.sent) {
                return reply.code(500).send({ error: err.message });
            }
        }
    });
    // ---------- Chat (sync, sem streaming) ----------
    app.post('/chat/sync', async (req, reply) => {
        const parse = ChatInputSchema.safeParse(req.body);
        if (!parse.success) {
            return reply.code(400).send({ error: 'Invalid input', details: parse.error.flatten() });
        }
        const input = parse.data;
        try {
            const result = await invokeLLMUseCase.execute({
                messages: input.messages,
                tools: input.tools,
                provider: input.provider,
                model: input.model,
                systemPrompt: input.systemPrompt,
                temperature: input.temperature,
                maxTokens: input.maxTokens,
            });
            let content = '';
            const toolCalls = [];
            for await (const chunk of result.stream) {
                if (chunk.type === 'content' && chunk.content)
                    content += chunk.content;
                if (chunk.type === 'tool_call' && chunk.toolCall)
                    toolCalls.push(chunk.toolCall);
            }
            return {
                provider: result.provider,
                model: result.model,
                content,
                toolCalls,
            };
        }
        catch (err) {
            app.log.error({ err }, 'chat/sync error');
            return reply.code(500).send({ error: err.message });
        }
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
        }
        catch (err) {
            app.log.error({ err }, 'store entity error');
            return reply.code(500).send({ error: err.message });
        }
    });
    app.get('/memory/entities', async (req, reply) => {
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
    });
    app.get('/memory/entities/:slug', async (req, reply) => {
        const repo = getMemoryRepository();
        const entity = repo.getEntityBySlug(req.params.slug);
        if (!entity)
            return reply.code(404).send({ error: 'Not found' });
        return entity;
    });
    // Recall (usado pelo LLM)
    app.post('/memory/recall', async (req, reply) => {
        try {
            const result = await recallEntitiesUseCase.execute({
                query: req.body.query,
                type: req.body.type,
                limit: req.body.limit || 5,
            });
            return result;
        }
        catch (err) {
            app.log.error({ err }, 'recall error');
            return reply.code(500).send({ error: err.message });
        }
    });
    // ---------- Conversations (Nivel Usuario) ----------
    app.post('/memory/conversations', async (req, reply) => {
        const parse = CreateConversationInputSchema.safeParse(req.body || {});
        if (!parse.success) {
            return reply.code(400).send({ error: 'Invalid input', details: parse.error.flatten() });
        }
        return createConversationUseCase.execute(parse.data);
    });
    app.get('/memory/conversations', async (req) => {
        const limit = req.query.limit ? Number(req.query.limit) : 50;
        const list = await listConversationsUseCase.execute(limit);
        return { conversations: list, total: list.length };
    });
    app.get('/memory/conversations/:id/messages', async (req) => {
        const limit = req.query.limit ? Number(req.query.limit) : 200;
        const messages = await listMessagesUseCase.execute(req.params.id, limit);
        return { messages, total: messages.length };
    });
    app.post('/memory/conversations/:id/messages', async (req, reply) => {
        const parse = AddMessageInputSchema.safeParse({ ...req.body, conversationId: req.params.id });
        if (!parse.success) {
            return reply.code(400).send({ error: 'Invalid input', details: parse.error.flatten() });
        }
        return addMessageUseCase.execute(parse.data);
    });
    // ---------- LGPD ----------
    app.get('/memory/export', async () => {
        return getMemoryRepository().exportAll();
    });
    app.delete('/memory/all', async (req, reply) => {
        // TODO: requer confirmacao + audit log
        getMemoryRepository().deleteAll();
        return { deleted: true, ts: Date.now() };
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
