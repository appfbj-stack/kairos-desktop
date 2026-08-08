/**
 * Generic OpenAI-compatible adapter.
 *
 * Reaproveitado por:
 *   - OpenRouter (priority)
 *   - OpenAI nativo
 *   - Ollama (com pequenos ajustes)
 *   - Qualquer provider que siga a spec OpenAI Chat Completions
 *
 * Docs: https://platform.openai.com/docs/api-reference/chat
 */

import type {
  LLMProvider,
  ModelInfo,
  InvokeRequest,
  InvokeChunk,
  ChatMessage,
  ToolDefinition,
} from './llm-provider.interface.js';
import { ProviderError } from '../../domain/errors/domain.error.js';

export interface OpenAICompatibleConfig {
  id: 'openrouter' | 'openai' | 'anthropic' | 'ollama';
  displayName: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  models: ModelInfo[];
  defaultHeaders?: Record<string, string>;
  /**
   * Transformacao de messages (alguns providers exigem system em posicao diferente)
   */
  transformRequest?: (req: InvokeRequest) => any;
  /**
   * Transformacao de chunks do stream
   */
  transformChunk?: (chunk: any) => InvokeChunk | null;
}

export function createOpenAICompatibleAdapter(config: OpenAICompatibleConfig): LLMProvider {
  const { id, displayName, baseUrl, apiKeyEnvVar, models, defaultHeaders, transformRequest, transformChunk } = config;

  // Injeta o campo `provider` em cada model se nao estiver setado.
  // Evita ter que duplicar em cada model.
  const normalizedModels = models.map((m) => ({ ...m, provider: m.provider || id }));

  function getApiKey(): string {
    const key = process.env[apiKeyEnvVar];
    if (!key) {
      throw new ProviderError(
        `${displayName}: ${apiKeyEnvVar} nao configurado. Defina em .env ou variavel de ambiente.`,
      );
    }
    return key;
  }

  function mapMessages(messages: ChatMessage[]): any[] {
    return messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.toolCallId,
          content: m.content,
        };
      }
      if (m.role === 'assistant' && m.toolCalls) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  function mapTools(tools?: ToolDefinition[]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  return {
    id,
    displayName,

    async listModels(): Promise<ModelInfo[]> {
      // Para OpenRouter, podemos fazer GET /models dinamicamente
      // Para outros, usa a lista hardcoded
      if (id === 'openrouter') {
        try {
          const res = await fetch(`${baseUrl}/models`, {
            headers: { Authorization: `Bearer ${getApiKey()}` },
          });
          if (res.ok) {
            const data = (await res.json()) as { data: any[] };
            return data.data.map((m: any) => ({
              id: m.id,
              displayName: m.name || m.id,
              provider: id,
              contextWindow: m.context_length || 4096,
              supportsTools: !!m.supported_parameters?.includes('tools'),
              supportsVision: !!m.architecture?.input_modalities?.includes('image'),
              inputCostPerMTokens: parseFloat(m.pricing?.prompt || '0') * 1_000_000,
              outputCostPerMTokens: parseFloat(m.pricing?.completion || '0') * 1_000_000,
            }));
          }
        } catch {
          // Fallback para lista hardcoded
        }
      }
      return normalizedModels;
    },

    async invoke(request: InvokeRequest): Promise<AsyncIterable<InvokeChunk>> {
      const body: any = {
        model: request.model,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
          ...mapMessages(request.messages),
        ],
        stream: true,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        ...(request.tools ? { tools: mapTools(request.tools) } : {}),
      };

      const finalBody = transformRequest ? transformRequest({ ...request }) : body;

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getApiKey()}`,
          ...defaultHeaders,
        },
        body: JSON.stringify(finalBody),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new ProviderError(`${displayName} HTTP ${res.status}: ${text}`);
      }

      if (!res.body) {
        throw new ProviderError(`${displayName}: no body`);
      }

      return streamOpenAIResponse(res.body, transformChunk);
    },

    estimateCost(model: string, inputTokens: number, outputTokens: number): Promise<number> {
      const m = models.find((x) => x.id === model);
      if (!m) return Promise.resolve(0);
      const cost =
        (inputTokens / 1_000_000) * m.inputCostPerMTokens +
        (outputTokens / 1_000_000) * m.outputCostPerMTokens;
      return Promise.resolve(cost);
    },
  };
}

async function* streamOpenAIResponse(
  body: ReadableStream<Uint8Array>,
  transformChunk?: (chunk: any) => InvokeChunk | null,
): AsyncIterable<InvokeChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage: { inputTokens: number; outputTokens: number } | undefined;
  // Buffer de tool calls por index (streaming vem em pedacos - id no primeiro,
  // arguments em chunks subsequentes que precisam ser concatenados).
  const toolCallBuffer = new Map<number, { id: string; name: string; argsJson: string }>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          // Emite tool calls completos (com id/name/args agregados)
          for (const [, tc] of toolCallBuffer) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: tc.id,
                name: tc.name,
                arguments: tc.argsJson ? safeJsonParse(tc.argsJson) : {},
              },
            };
          }
          yield { type: 'done', usage };
          return;
        }
        try {
          const parsed = JSON.parse(data);

          // Captura usage no final
          if (parsed.usage) {
            usage = {
              inputTokens: parsed.usage.prompt_tokens || 0,
              outputTokens: parsed.usage.completion_tokens || 0,
            };
          }

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          // Content delta
          if (choice.delta?.content) {
            const c: InvokeChunk = { type: 'content', content: choice.delta.content };
            yield transformChunk ? transformChunk(parsed) || c : c;
          }

          // Tool call delta - agrega por index
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = typeof tc.index === 'number' ? tc.index : 0;
              let entry = toolCallBuffer.get(idx);
              if (!entry) {
                entry = { id: '', name: '', argsJson: '' };
                toolCallBuffer.set(idx, entry);
              }
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name = tc.function.name;
              if (tc.function?.arguments) {
                // arguments vem como string parcial - concatenar
                entry.argsJson += tc.function.arguments;
              }
            }
          }

          // Quando o delta traz finish_reason e ha tool_calls pendentes,
          // emite o tool_call completo (alguns provedores mandam finish_reason
          // ANTES do [DONE], e nao podemos esperar ate la).
          if (choice.finish_reason && toolCallBuffer.size > 0) {
            for (const [, tc] of toolCallBuffer) {
              yield {
                type: 'tool_call',
                toolCall: {
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.argsJson ? safeJsonParse(tc.argsJson) : {},
                },
              };
            }
            toolCallBuffer.clear();
          }
        } catch {
          // ignora chunks malformados
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
