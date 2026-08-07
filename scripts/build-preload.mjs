#!/usr/bin/env node
/**
 * Build do preload: compila TS como CommonJS e renomeia .js -> .cjs
 * (necessario porque Electron 33 nao carrega ESM preload de forma confiavel).
 */

import { execSync } from 'node:child_process';
import { renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

console.log('[build:preload] compilando TS como CommonJS...');
execSync('tsc -p tsconfig.preload.json', { stdio: 'inherit' });

const src = join('dist', 'preload', 'index.js');
const dst = join('dist', 'preload', 'index.cjs');

if (existsSync(src)) {
  renameSync(src, dst);
  console.log(`[build:preload] renomeado: ${src} -> ${dst}`);
} else {
  console.error(`[build:preload] ERRO: ${src} nao foi gerado`);
  process.exit(1);
}
