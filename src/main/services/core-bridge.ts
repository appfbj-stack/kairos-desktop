/**
 * Bridge HTTP para o Kairos AI Core.
 *
 * O Core (Fastify) roda em localhost:4096 como subprocesso Node.
 * Este bridge encapsula as chamadas HTTP com retry + logging.
 *
 * Em Fase 3+, o Core sera importado in-process (sem subprocesso).
 */

import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');

const CORE_PORT = Number(process.env.KAIROS_PORT || 4096);
const CORE_BASE_URL = `http://127.0.0.1:${CORE_PORT}`;

let coreProcess: ChildProcess | null = null;
let isReady = false;

export async function startCore(): Promise<void> {
  if (coreProcess) {
    logger.warn('Core ja esta rodando');
    return;
  }

  const coreEntry = join(PROJECT_ROOT, 'core', 'server.ts');
  const coreCompiled = join(PROJECT_ROOT, 'core', 'dist', 'server.js');

  let entry: string;
  let command: string;
  let args: string[];

  if (existsSync(coreCompiled)) {
    // Modo producao: usa build
    entry = coreCompiled;
    command = process.execPath;
    args = [entry];
    logger.info({ entry }, 'Starting Core (compiled)');
  } else if (existsSync(coreEntry)) {
    // Modo dev: usa tsx
    entry = coreEntry;
    command = 'npx';
    args = ['tsx', entry];
    logger.info({ entry }, 'Starting Core (tsx dev)');
  } else {
    logger.error('Core nao encontrado. Rode `npm run build:core` ou `npm run dev:core`');
    return;
  }

  // Carrega .env do root para o subprocesso
  const envFile = join(PROJECT_ROOT, '.env');
  const envVars: NodeJS.ProcessEnv = {
    ...process.env,
    KAIROS_PORT: String(CORE_PORT),
    NODE_ENV: process.env.NODE_ENV || 'development',
  };
  if (existsSync(envFile)) {
    // Adiciona flag --env-file se for tsx ou node 20+
    if (command === 'npx') {
      args.push('--env-file=' + envFile);
    } else {
      // Para node 20+, pode usar --env-file
      args.push('--env-file=' + envFile);
    }
  }

  coreProcess = spawn(command, args, {
    cwd: PROJECT_ROOT,
    env: envVars,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  coreProcess.stdout?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) logger.info({ source: 'core' }, msg);
    if (msg.includes('listening at')) {
      isReady = true;
    }
  });

  coreProcess.stderr?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) logger.error({ source: 'core' }, msg);
  });

  coreProcess.on('exit', (code) => {
    logger.warn({ code }, 'Core process exited');
    coreProcess = null;
    isReady = false;
  });

  // Espera o Core ficar pronto (max 10s)
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (isReady) {
      logger.info(`Kairos Core pronto em ${CORE_BASE_URL}`);
      return;
    }
  }

  logger.warn('Core pode nao ter iniciado completamente (timeout 10s)');
}

export async function stopCore(): Promise<void> {
  if (coreProcess) {
    coreProcess.kill();
    coreProcess = null;
    isReady = false;
    logger.info('Core stopped');
  }
}

export function getCoreUrl(): string {
  return CORE_BASE_URL;
}

// =====================================================
// Client HTTP simples para o Core
// =====================================================

async function fetchJson(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${CORE_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Core HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

export const kairosCore = {
  health: () => fetchJson('/health'),

  chatSync: (input: { messages: any[]; provider?: string; model?: string; systemPrompt?: string; tools?: any[] }) =>
    fetchJson('/chat/sync', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  chatStream: async function* (input: any): AsyncIterable<any> {
    const res = await fetch(`${CORE_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok || !res.body) throw new Error(`Core HTTP ${res.status}`);
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
          yield JSON.parse(data);
        } catch {
          // ignora
        }
      }
    }
  },

  cancelChat: async (conversationId: string) => {
    // TODO: implement cancelation tokens no Core
    return { cancelled: true, conversationId };
  },

  getHistory: async (conversationId: string) => {
    // TODO Fase 2: ler do SQLite
    return { conversationId, messages: [] };
  },

  listProviders: () => fetchJson('/llm/providers'),
  listModels: (provider: string) => fetchJson(`/llm/models?provider=${provider}`),
};
