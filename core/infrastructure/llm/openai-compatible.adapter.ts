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
  ModelTier,
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
  // Tambem detecta o tier: ':free' no id => free, senao usa o do model, senao 'paid'.
  const normalizedModels = models.map((m) => ({
    ...m,
    provider: m.provider || id,
    tier: m.tier || (m.id.includes(':free') ? 'free' : 'paid'),
  }));

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
      // User com anexos: vira multimodal (vision) se tem imagem,
      // ou texto + contexto dos anexos extraidos.
      if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
        const imageAttachments = m.attachments.filter(
          (a) => a.dataUri && a.mimeType.startsWith('image/'),
        );
        if (imageAttachments.length > 0) {
          // Multimodal: content array com image_url + texto
          const contentParts: any[] = imageAttachments.map((a) => ({
            type: 'image_url',
            image_url: { url: a.dataUri },
          }));
          // Texto com contexto dos anexos nao-imagem (PDF/TXT extraido)
          const textAttachment = m.attachments.find((a) => a.extractedText);
          const textContext = textAttachment
            ? `\n\n## Conteudo do arquivo anexado "${textAttachment.name}":\n\`\`\`\n${textAttachment.extractedText}\n\`\`\``
            : '';
          // Menciona anexos nao-imagem sem extractedText
          const otherAttachments = m.attachments.filter(
            (a) => !a.dataUri && !a.extractedText,
          );
          const otherNote = otherAttachments.length > 0
            ? `\n\n_Outros anexos salvos em disco (use as skills para processar): ${otherAttachments.map((a) => `${a.name} (${a.path})`).join(', ')}_`
            : '';
          contentParts.push({ type: 'text', text: m.content + textContext + otherNote });
          return { role: 'user', content: contentParts };
        }
        // Sem imagem: injeta contexto no texto
        let text = m.content;
        const textAtt = m.attachments.find((a) => a.extractedText);
        if (textAtt) {
          text += `\n\n## Conteudo do arquivo "${textAtt.name}":\n\`\`\`\n${textAtt.extractedText}\n\`\`\``;
        }
        const others = m.attachments.filter((a) => !a.extractedText);
        if (others.length > 0) {
          text += `\n\n_Outros anexos salvos em disco: ${others.map((a) => `${a.name} (${a.path})`).join(', ')}_`;
        }
        return { role: 'user', content: text };
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
            // Mapa de tier por id (vindo da lista hardcoded, que eh a fonte da verdade
            // ja que a API do OpenRouter nao expoe o tier).
            const tierById = new Map<string, ModelTier>();
            for (const m of normalizedModels) {
              tierById.set(m.id, m.tier || (m.id.includes(':free') ? 'free' : 'paid'));
            }
            return data.data.map((m: any) => {
              const knownTier = tierById.get(m.id);
              const tier: ModelTier = knownTier || (m.id.includes(':free') ? 'free' : 'paid');
              return {
                id: m.id,
                displayName: m.name || m.id,
                provider: id,
                contextWindow: m.context_length || 4096,
                supportsTools: !!m.supported_parameters?.includes('tools'),
                supportsVision: !!m.architecture?.input_modalities?.includes('image'),
                inputCostPerMTokens: parseFloat(m.pricing?.prompt || '0') * 1_000_000,
                outputCostPerMTokens: parseFloat(m.pricing?.completion || '0') * 1_000_000,
                tier,
              };
            });
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

      // A1 fix: timeout agressivo pra nao pendurar requests quando LLM demora muito.
      // 90s é suficiente para a maioria dos modelos (nemotron ~5-15s, gpt-oss-20b ~30-60s).
      // Se o user pedir um modelo muito lento, o erro vem rapido em vez de travar o browser.
      const LLM_TIMEOUT_MS = 90_000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getApiKey()}`,
          ...defaultHeaders,
        },
        body: JSON.stringify(finalBody),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        throw new ProviderError(`${displayName} HTTP ${res.status}: ${text}`);
      }

      if (!res.body) {
        throw new ProviderError(`${displayName}: no body`);
      }

      // Passa o AbortController pro stream pra que o timeout tambem corte o streaming
      return streamOpenAIResponse(res.body, transformChunk, controller);
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
  abortController?: AbortController,
): AsyncIterable<InvokeChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage: { inputTokens: number; outputTokens: number } | undefined;
  // Buffer de tool calls por index (streaming vem em pedacos - id no primeiro,
  // arguments em chunks subsequentes que precisam ser concatenados).
  const toolCallBuffer = new Map<number, { id: string; name: string; argsJson: string }>();

  // A1 fix: encerra o reader se o AbortController for acionado (timeout do caller)
  let onAbort: (() => void) | undefined;
  if (abortController) {
    onAbort = () => {
      try { reader.cancel(); } catch { /* ignore */ }
    };
    abortController.signal.addEventListener('abort', onAbort, { once: true });
  }

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
    if (abortController && onAbort) {
      abortController.signal.removeEventListener('abort', onAbort);
    }
  }
}

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
