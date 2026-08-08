/**
 * Cliente Kairos AI Core.
 *
 * Funciona em 3 modos:
 *  1. **Electron**: usa window.kairos (IPC bridge) - via preload em dist/preload/index.cjs
 *  2. **Dev local** (Vite em :5173): usa fetch direto pro Core em :4096
 *  3. **Produção** (https://kairosdesktop.fbautomacao.space): usa mesma origem (relative URL)
 *
 * O modo é detectado automaticamente: se window.kairos existir, usa IPC.
 * Caso contrario, se estiver em localhost:5173, faz fetch pro Core local.
 * Senão, usa URL relativa (mesma origem = o Core servindo a UI no mesmo host).
 *
 * Documentacao:
 *  - ChatInput: { messages, model?, provider?, systemPrompt?, temperature?, maxTokens?, useTools? }
 *  - ChatChunk: { type: 'content'|'tool_call'|'tool_result'|'done'|'error', ... }
 */

/**
 * Detecta o base URL do Core baseado no ambiente:
 * - Dev (Vite :5173): http://127.0.0.1:4096
 * - Producao (servido pelo proprio Core): mesma origem ('')
 */
function detectCoreBaseUrl(): string {
  if (typeof window === 'undefined') return 'http://127.0.0.1:4096';
  // Dev local: Vite serve em 5173, Core em 4096
  if (window.location.port === '5173' || window.location.port === '5174') {
    return 'http://127.0.0.1:4096';
  }
  // Producao: Core serve a UI, fetch vai pra mesma origem (relative)
  return '';
}

const CORE_BASE_URL = detectCoreBaseUrl();

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
  useTools?: boolean;
}

export interface ChatChunk {
  type: 'content' | 'tool_call' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolCall?: { id?: string; name: string; arguments?: unknown };
  toolResult?: { name: string; content: string; ok: boolean };
  error?: string;
}

/** Detecta se o preload do Electron expoe o bridge. */
function hasIPC(): boolean {
  return typeof window !== 'undefined' && !!(window as any).kairos;
}

/** Log de modo (uma vez) pra debug. */
let modeLogged = false;
function logMode(): void {
  if (modeLogged) return;
  modeLogged = true;
  if (hasIPC()) {
    // eslint-disable-next-line no-console
    console.log('[chat-api] modo: Electron IPC (window.kairos disponivel)');
  } else {
    // eslint-disable-next-line no-console
    console.warn('[chat-api] modo: Browser puro (window.kairos indisponivel, usando fetch direto pro Core em', CORE_BASE_URL + ')');
  }
}

/** Fetch direto pro Core (modo browser). */
async function coreFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${CORE_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Core HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

export const chatApi = {
  baseUrl: CORE_BASE_URL,
  isElectron: hasIPC(),

  /** Health check: tenta pingar o Core. */
  health: async (): Promise<{ ok: boolean; core?: any }> => {
    logMode();
    try {
      const r = await fetch(`${CORE_BASE_URL}/health`);
      const data = await r.json();
      return { ok: r.ok, core: data };
    } catch (err) {
      return { ok: false, core: { error: (err as Error).message } };
    }
  },

  listProviders: async () => {
    logMode();
    return coreFetch('/llm/providers');
  },

  /**
   * Chat streaming simulado: o Core retorna tudo de uma vez (/chat/sync),
   * o renderer quebra em chunks de 5 chars com pausa pra dar efeito "digitando".
   * Se o LLM chamou tools, emite tool_call e tool_result chunks antes do content.
   */
  async *chatStream(input: ChatInput): AsyncIterable<ChatChunk> {
    logMode();

    // 1. Faz o request (IPC ou fetch direto)
    let result: any;
    try {
      if (hasIPC()) {
        result = await (window as any).kairos.chat.send(input);
      } else {
        result = await coreFetch('/chat/sync', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }
    } catch (err) {
      yield { type: 'error', error: (err as Error).message };
      return;
    }

    if (!result) { yield { type: 'error', error: 'Resposta vazia do Core' }; return; }
    if (result.error) { yield { type: 'error', error: result.error }; return; }

    const text: string = result.content || result.message || '';
    const toolCalls = result.toolCalls || [];
    const toolResults = result.toolResults || [];

    // 2. Emite tool calls e results (transparencia)
    for (const tc of toolCalls) {
      yield { type: 'tool_call', toolCall: tc };
    }
    for (const tr of toolResults) {
      yield { type: 'tool_result', content: tr.content, toolResult: tr } as any;
    }

    // 3. Chunks do content final
    if (text) {
      const CHUNK_SIZE = 5;
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        yield { type: 'content', content: text.slice(i, i + CHUNK_SIZE) };
        await new Promise((r) => setTimeout(r, 22));
      }
    } else {
      yield { type: 'error', error: 'Core retornou resposta sem content' };
      return;
    }
    yield { type: 'done' };
  },

  /** Memory: recall (formato contexto markdown). */
  recall: async (query: string, _limit = 5) => {
    logMode();
    try {
      if (hasIPC()) {
        return await (window as any).kairos.memory.recall(query);
      }
      return await coreFetch('/memory/recall', {
        method: 'POST',
        body: JSON.stringify({ query, limit: _limit }),
      });
    } catch {
      return { context: '' };
    }
  },

  /** Memory: list entities. */
  listEntities: async (_q?: string, _type?: string) => {
    logMode();
    try {
      if (hasIPC()) {
        return await (window as any).kairos.memory.search('');
      }
      const params = new URLSearchParams();
      if (_q) params.set('q', _q);
      if (_type) params.set('type', _type);
      return await coreFetch(`/memory/entities?${params}`);
    } catch {
      return { entities: [] };
    }
  },

  /** Lista as skills disponiveis (Phase 4). */
  listSkills: async () => {
    logMode();
    try {
      if (hasIPC()) {
        return await (window as any).kairos.skills.list();
      }
      return await coreFetch('/skills/list');
    } catch (err) {
      return { skills: [], count: 0, error: (err as Error).message };
    }
  },
};
