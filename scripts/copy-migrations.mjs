#!/usr/bin/env node
/**
 * Copia os SQLs de migracao do Core para o build dir dos testes.
 * Cross-platform (substitui 'copy-item -Force' que so funciona em PowerShell).
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SRC = join('core', 'infrastructure', 'memory', 'migrations');
const DEST = join('.test-build', 'core', 'infrastructure', 'memory', 'migrations');

mkdirSync(DEST, { recursive: true });
for (const file of readdirSync(SRC)) {
  if (file.endsWith('.sql')) {
    copyFileSync(join(SRC, file), join(DEST, file));
    console.log(`[copy-migrations] ${file}`);
  }
}
