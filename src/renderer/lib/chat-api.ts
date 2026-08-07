/**
 * Cliente IPC para o Kairos AI Core.
 *
 * Todas as chamadas passam pelo bridge `window.kairos` (contextBridge) -
 * a main process do Electron faz o fetch no Core em :4096 internamente.
 *
 * Isso contorna o bloqueio CSP/CORS do Chromium no renderer, mesmo com
 * `webSecurity: false`. O fetch direto cross-origin para 127.0.0.1:4096
 * falha no Electron moderno.
 */

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

/** Verifica se o bridge IPC esta exposto (preload rodou). */
function checkBridge(): void {
  if (typeof window === 'undefined') {
    throw new Error('window indisponivel (SSR?)');
  }
  if (!window.kairos) {
    // Diagnostico: log detalhado para entender o que esta exposto
    // eslint-disable-next-line no-console
    console.error('[chat-api] window.kairos undefined. window keys:', Object.keys(window).filter((k) => k.toLowerCase().includes('kairos') || k === 'ipcRenderer' || k === 'electron'));
    throw new Error('Bridge IPC indisponivel - preload nao carregou. Abra DevTools (Ctrl+Shift+I) e veja [Kairos preload] nos logs.');
  }
}

export const chatApi = {
  baseUrl: 'ipc://kairos',

  /**
   * Health check via IPC. Pinga o Core para verificar conectividade.
   */
  health: async (): Promise<{ ok: boolean; core?: any }> => {
    try {
      checkBridge();
      // Ping Core via IPC - se o Core estiver down, o handler lanca erro
      const providers = await window.kairos.llm.listProviders();
      return { ok: true, core: { status: 'online', providers } };
    } catch (err) {
      return { ok: false, core: { status: 'offline', error: (err as Error).message } };
    }
  },

  listProviders: async () => {
    try {
      checkBridge();
      return await window.kairos.llm.listProviders();
    } catch (err) {
      return { providers: [], error: (err as Error).message };
    }
  },

  /**
   * Chat via IPC. Usa /chat/sync (sem streaming real, mas mantemos UX
   * de "digitando" chunkando a resposta final no renderer).
   *
   * Para streaming real via IPC seria necessario webContents.send
   * + ipcRenderer.on, mas para v1 isto ja entrega a experiencia desejada.
   */
  async *chatStream(input: ChatInput): AsyncIterable<ChatChunk> {
    checkBridge();
    let result: any;
    try {
      result = await window.kairos.chat.send(input);
    } catch (err) {
      yield { type: 'error', error: (err as Error).message };
      return;
    }

    if (!result) {
      yield { type: 'error', error: 'Resposta vazia do Core' };
      return;
    }
    if (result.error) {
      yield { type: 'error', error: result.error };
      return;
    }

    const text: string = result.content || result.message || '';
    if (text) {
      // Simula streaming chunk a chunk para manter efeito "digitando"
      const CHUNK_SIZE = 5;
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        yield { type: 'content', content: text.slice(i, i + CHUNK_SIZE) };
        // Pausa proporcional para parecer digitacao natural
        await new Promise((r) => setTimeout(r, 22));
      }
    } else {
      yield { type: 'error', error: 'Core retornou resposta sem content' };
      return;
    }
    yield { type: 'done' };
  },

  /**
   * Memory: recall entities (formato contexto markdown).
   */
  recall: async (query: string, _limit = 5) => {
    try {
      checkBridge();
      return await window.kairos.memory.recall(query);
    } catch {
      return { context: '' };
    }
  },

  /**
   * Memory: list entities.
   */
  listEntities: async (_q?: string, _type?: string) => {
    try {
      checkBridge();
      return await window.kairos.memory.search('');
    } catch {
      return { entities: [] };
    }
  },
};
