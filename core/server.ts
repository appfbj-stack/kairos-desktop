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
import { invokeLLMUseCase } from './application/llm/invoke-llm.usecase.js';
import { listProvidersUseCase } from './application/llm/select-model.usecase.js';
import { z } from 'zod';
import type { ChatMessage, ToolDefinition } from './infrastructure/llm/llm-provider.interface.js';

const PORT = Number(process.env.KAIROS_PORT || 4096);
const HOST = process.env.KAIROS_HOST || '127.0.0.1';

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
  app.post<{ Body: z.infer<typeof ChatInputSchema> }>('/chat/sync', async (req, reply) => {
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
      };
    } catch (err) {
      app.log.error({ err }, 'chat/sync error');
      return reply.code(500).send({ error: (err as Error).message });
    }
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
