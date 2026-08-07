#!/usr/bin/env node
/**
 * Kairos Desktop AI - dev orchestrator.
 *
 * Sobe 3 processos em paralelo:
 *   1. Vite dev server (renderer) em :5173
 *   2. Kairos AI Core (Fastify) em :4096
 *   3. Electron (janela do app) - aponta para :5173
 *
 * Uso: npm run dev
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

const PROCS = [];
let shuttingDown = false;

function startProc(name, command, args, options = {}) {
  console.log(`\x1b[36m[kairos]\x1b[0m starting ${name}...`);
  const proc = spawn(command, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows,
    ...options,
  });

  const color = name === 'vite' ? '\x1b[33m' : name === 'core' ? '\x1b[35m' : '\x1b[36m';
  proc.stdout?.on('data', (d) => process.stdout.write(`${color}[${name}]\x1b[0m ${d}`));
  proc.stderr?.on('data', (d) => process.stderr.write(`${color}[${name}]\x1b[0m ${d}`));

  proc.on('exit', (code) => {
    if (!shuttingDown) {
      // Da tempo do stderr drenar
      setTimeout(() => {
        console.error(`\n\x1b[31m[kairos] ${name} exited with code ${code}\x1b[0m`);
        shutdown(code || 1);
      }, 100);
    }
  });

  PROCS.push({ name, proc });
  return proc;
}

function shutdown(code = 0) {
  shuttingDown = true;
  console.log('\n\x1b[36m[kairos]\x1b[0m shutting down...');
  for (const { proc } of PROCS) {
    try { proc.kill(); } catch {}
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// 1. Vite dev server
startProc('vite', 'npx.cmd', ['vite']);

// 2. Core (Fastify) - usa tsx para rodar TS direto
const coreEntry = join(ROOT, 'core', 'server.ts');
const envFile = join(ROOT, '.env');
const tsxArgs = ['tsx'];
if (existsSync(envFile)) tsxArgs.push(`--env-file=${envFile}`);
tsxArgs.push(coreEntry);
startProc('core', 'npx.cmd', tsxArgs);

// 3. Electron - espera Vite ficar pronto
console.log('\x1b[36m[kairos]\x1b[0m waiting for Vite on :5173...');
await new Promise((r) => setTimeout(r, 4000));

// Detecta binario do electron local
const electronBin = isWindows
  ? join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
  : join(ROOT, 'node_modules', '.bin', 'electron');

if (!existsSync(electronBin)) {
  console.error(`\x1b[31m[kairos] electron not found at ${electronBin}\x1b[0m`);
  console.error(`\x1b[31m[kairos] rode "npm install" primeiro\x1b[0m`);
  shutdown(1);
}

startProc('electron', electronBin, ['.'], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
  },
});
