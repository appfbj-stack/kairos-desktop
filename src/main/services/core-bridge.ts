/**
 * Bridge para o Kairos AI Core (Fastify em :4096).
 *
 * No dev: o Core ja esta rodando (iniciado pelo scripts/dev.mjs).
 * Aqui apenas verificamos se esta online e encapsulamos as chamadas HTTP.
 *
 * Em prod (futuro), o Core sera importado in-process.
 */

import { logger } from './logger.js';

const CORE_PORT = Number(process.env.KAIROS_PORT || 4096);
const CORE_BASE_URL = `http://127.0.0.1:${CORE_PORT}`;

let isReady = false;

export async function startCore(): Promise<void> {
  // No dev, o Core ja esta rodando. Apenas verifica.
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`${CORE_BASE_URL}/health`);
      if (res.ok) {
        isReady = true;
        logger.info(`Kairos Core respondendo em ${CORE_BASE_URL}`);
        return;
      }
    } catch {
      // ainda nao subiu
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  logger.warn('Core nao respondeu em 5s - abrindo UI mesmo assim (Core offline)');
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

  listAllSkills: async () => {
    try {
      const res = await fetch(`${CORE_BASE_URL}/skills/list`);
      if (!res.ok) return { skills: [], count: 0 };
      return await res.json();
    } catch {
      return { skills: [], count: 0 };
    }
  },

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
