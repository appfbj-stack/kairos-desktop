/**
 * Cliente HTTP para o Kairos AI Core (localhost:4096).
 *
 * Faz requests diretos do renderer para o Core.
 * O preload contextBridge expoe window.kairos para operacoes privilegiadas;
 * operacoes normais (chat, memory, etc) podem ser feitas via HTTP direto.
 */

const CORE_BASE_URL = 'http://127.0.0.1:4096';

export interface ChatInput {
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
  }>;
  model?: string;
  provider?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatChunk {
  type: 'content' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: { name: string; arguments: unknown };
  error?: string;
}

export const chatApi = {
  baseUrl: CORE_BASE_URL,

  health: () => fetch(`${CORE_BASE_URL}/health`).then((r) => r.json()),

  listProviders: () => fetch(`${CORE_BASE_URL}/llm/providers`).then((r) => r.json()),

  /**
   * Chat streaming via Server-Sent Events.
   * Retorna um AsyncIterable de chunks.
   */
  async *chatStream(input: ChatInput): AsyncIterable<ChatChunk> {
    const res = await fetch(`${CORE_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`Core HTTP ${res.status}: ${text}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data) as ChatChunk;
        } catch {
          // ignora
        }
      }
    }
  },

  /**
   * Memory: recall entities (formato contexto markdown)
   */
  recall: async (query: string, limit = 5) => {
    const res = await fetch(`${CORE_BASE_URL}/memory/recall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) return { context: '' };
    return res.json();
  },

  /**
   * Memory: list entities
   */
  listEntities: async (q?: string, type?: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (type) params.set('type', type);
    const res = await fetch(`${CORE_BASE_URL}/memory/entities?${params}`);
    return res.json();
  },
};
