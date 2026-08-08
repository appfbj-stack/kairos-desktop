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

export interface ChatAttachment {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUri?: string;
  extractedText?: string;
}

export interface ChatInput {
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    attachments?: ChatAttachment[];
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
export async function coreFetch(path: string, init?: RequestInit): Promise<any> {
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

/**
 * A3 fix: SSE real via fetch + ReadableStream.
 * Le chunks do tipo `data: {json}\n\n` ate `[DONE]`.
 * Junta todos os chunks e retorna o JSON final (mesmo shape do /chat/sync).
 */
async function coreSSE(path: string, input: unknown, timeoutMs = 120_000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${CORE_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`SSE HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    const toolCalls: any[] = [];
    const toolResults: any[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data);
          if (chunk.type === 'content' && chunk.content) content += chunk.content;
          else if (chunk.type === 'tool_call' && chunk.toolCall) toolCalls.push(chunk.toolCall);
          else if (chunk.type === 'tool_result' && chunk.toolResult) toolResults.push(chunk.toolResult);
        } catch {
          // ignora chunks malformados
        }
      }
    }
    return { content, toolCalls, toolResults, provider: 'openrouter', model: 'sse' };
  } finally {
    clearTimeout(timer);
  }
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
   * Chat streaming: tenta SSE real (POST /chat) e faz fallback para /chat/sync
   * com chunks via fetch reader. A3 fix: removeu o setTimeout(22ms) simulado.
   *
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
        // Tenta SSE primeiro; se falhar (Core antigo), cai pra /chat/sync
        try {
          result = await coreSSE('/chat', input);
        } catch {
          result = await coreFetch('/chat/sync', {
            method: 'POST',
            body: JSON.stringify(input),
          });
        }
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

    // 3. Content (sem mais setTimeout artificial)
    if (text) {
      yield { type: 'content', content: text };
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

  /**
   * Upload de arquivo via POST /upload (multipart).
   * Funciona em 2 modos:
   *  - Browser: usa FormData + fetch direto (File vem de <input type="file">)
   *  - Electron: delega via chatApi.pickAndUpload() (que abre dialog e ja retorna attachment)
   *
   * Retorna ChatAttachment com id, path, dataUri (se imagem <5MB), extractedText (PDF/TXT).
   */
  uploadFile: async (file: File | Blob, fileName?: string): Promise<ChatAttachment> => {
    logMode();

    // Modo browser: FormData + fetch direto
    const form = new FormData();
    const name = fileName || (file instanceof File ? file.name : 'arquivo');
    form.append('file', file, name);

    const res = await fetch(`${CORE_BASE_URL}/upload`, {
      method: 'POST',
      body: form,
      // NAO setar Content-Type - o browser preenche com boundary
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Upload HTTP ${res.status}: ${text}`);
    }
    const data = await res.json() as { attachments: ChatAttachment[] };
    if (!data.attachments || data.attachments.length === 0) {
      throw new Error('Upload retornou sem attachments');
    }
    return data.attachments[0];
  },

  /**
   * Modo Electron: pede pro main process abrir dialog.showOpenDialog, ler o arquivo
   * e fazer upload. Retorna o ChatAttachment pronto.
   * Em browser, retorna null (use input file + uploadFile()).
   */
  pickAndUpload: async (): Promise<ChatAttachment | null> => {
    logMode();
    if (hasIPC() && (window as any).kairos?.upload?.pickAndUpload) {
      return await (window as any).kairos.upload.pickAndUpload();
    }
    return null;
  },
};
