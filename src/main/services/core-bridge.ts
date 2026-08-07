/**
 * Bridge para o Kairos AI Core (Fastify em :4096).
 *
 * O Core roda como subprocesso Node (tsx) ou importado in-process (Fase 3+).
 * Aqui encapsulamos as chamadas HTTP.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './logger.js';

const CORE_PORT = Number(process.env.KAIROS_PORT || 4096);
const CORE_BASE_URL = `http://127.0.0.1:${CORE_PORT}`;

let coreProcess: ChildProcess | null = null;
let isReady = false;

export async function startCore(): Promise<void> {
  if (coreProcess) return;

  // Inicia o Core como subprocesso
  const coreEntry = join(process.cwd(), 'core', 'server.ts');
  const envFile = join(process.cwd(), '.env');

  if (!existsSync(coreEntry)) {
    logger.warn(`Core nao encontrado: ${coreEntry} - assumindo Core externo`);
    return;
  }

  const args = ['tsx'];
  if (existsSync(envFile)) args.push(`--env-file=${envFile}`);
  args.push(coreEntry);

  logger.info(`Starting Kairos Core: npx ${args.join(' ')}`);

  coreProcess = spawn('npx.cmd', args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      KAIROS_PORT: String(CORE_PORT),
      KAIROS_HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  coreProcess.stdout?.on('data', (d) => logger.info({ source: 'core' }, d.toString().trim()));
  coreProcess.stderr?.on('data', (d) => logger.error({ source: 'core' }, d.toString().trim()));

  coreProcess.on('exit', (code) => {
    logger.warn({ code }, 'Core process exited');
    coreProcess = null;
    isReady = false;
  });

  // Espera ficar pronto
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (isReady) {
      logger.info(`Kairos Core pronto em ${CORE_BASE_URL}`);
      return;
    }
    try {
      const res = await fetch(`${CORE_BASE_URL}/health`);
      if (res.ok) {
        isReady = true;
        logger.info(`Kairos Core respondeu health em ${CORE_BASE_URL}`);
        return;
      }
    } catch {
      // ainda nao subiu
    }
  }
  logger.warn('Core pode nao ter iniciado completamente (timeout 15s)');
}

export async function stopCore(): Promise<void> {
  if (coreProcess) {
    coreProcess.kill();
    coreProcess = null;
    isReady = false;
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
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Core HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

export const kairosCore = {
  health: () => fetchJson('/health'),

  chatSync: (input: any) => fetchJson('/chat/sync', { method: 'POST', body: JSON.stringify(input) }),

  cancelChat: async (_id: string) => ({ cancelled: true }),

  getHistory: async (_id: string) => ({ messages: [] }),

  listSkills: () => fetchJson('/skills/list').catch(() => []),

  recallMemory: (query: string) =>
    fetchJson('/memory/recall', { method: 'POST', body: JSON.stringify({ query, limit: 5 }) }).catch(() => ({ context: '' })),

  storeMemory: (entity: unknown) =>
    fetchJson('/memory/entities', { method: 'POST', body: JSON.stringify(entity) }),

  searchMemory: (query: string) =>
    fetchJson(`/memory/entities?q=${encodeURIComponent(query)}`).catch(() => ({ entities: [] })),

  listProviders: () => fetchJson('/llm/providers').catch(() => ({ providers: [] })),
  listModels: (provider: string) => fetchJson(`/llm/models?provider=${provider}`).catch(() => ({ models: [] })),
  getSettings: () => Promise.resolve({}),
  setSetting: (_k: string, _v: unknown) => Promise.resolve({ ok: true }),
};
