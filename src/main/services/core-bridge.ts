/**
 * Bridge para o Kairos AI Core (Fastify em localhost:4096).
 *
 * Inicia o Core como subprocesso Node ou instancia in-process.
 * Por enquanto, stub. Implementacao real vem na Fase 1.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { logger } from './logger.js';

let coreProcess: ChildProcess | null = null;

const CORE_PORT = Number(process.env.KAIROS_PORT || 4096);

export async function startCore(): Promise<void> {
  logger.info({ port: CORE_PORT }, 'Starting Kairos AI Core');

  // Em dev, o Core pode rodar via `npm run core:dev` separado
  // Em prod, embed direto (import estatico)
  // Por enquanto, placeholder
  if (process.env.KAIROS_CORE_INPROCESS === '1') {
    logger.info('Core in-process mode (TBD Fase 1)');
  } else {
    // coreProcess = spawn('node', ['dist/core/index.js'], { stdio: 'inherit' });
    logger.info('Core subprocess mode (TBD Fase 1)');
  }
}

export async function stopCore(): Promise<void> {
  if (coreProcess) {
    coreProcess.kill();
    coreProcess = null;
    logger.info('Core stopped');
  }
}

export function getCoreUrl(): string {
  return `http://localhost:${CORE_PORT}`;
}
