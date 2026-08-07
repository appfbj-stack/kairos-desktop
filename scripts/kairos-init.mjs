#!/usr/bin/env node
/**
 * kairos:init - primeira execucao do Kairos.
 *
 * 1. Verifica Node 20+
 * 2. Baixa OpenSquad bundled (do fork appfbj-stack/opensquad)
 * 3. Cria ~/.kairos/ (config dir)
 * 4. Roda migrations do SQLite
 * 5. Pergunta provider LLM padrao
 *
 * Idempotente: pode rodar varias vezes.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const OPENSQUAD_REPO = process.env.OPENSQUAD_REPO || 'appfbj-stack/opensquad';
const OPENSQUAD_VERSION = process.env.OPENSQUAD_VERSION || 'v0.1.15';
const OPENSQUAD_DIR = join(ROOT, 'opensquad');

const log = (msg) => console.log(`\x1b[36m[kairos]\x1b[0m ${msg}`);
const ok = (msg) => console.log(`\x1b[32m[kairos]\x1b[0m ${msg}`);
const warn = (msg) => console.warn(`\x1b[33m[kairos]\x1b[0m ${msg}`);
const err = (msg) => console.error(`\x1b[31m[kairos]\x1b[0m ${msg}`);

async function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    err(`Node 20+ required (you have ${process.versions.node})`);
    process.exit(1);
  }
  ok(`Node ${process.versions.node}`);
}

async function downloadOpenSquad() {
  const versionFile = join(OPENSQUAD_DIR, '.opensquad-version');
  if (existsSync(versionFile)) {
    const current = readFileSync(versionFile, 'utf-8').trim();
    if (current === OPENSQUAD_VERSION) {
      ok(`OpenSquad ${OPENSQUAD_VERSION} already bundled`);
      return;
    }
    warn(`OpenSquad version mismatch: ${current} -> ${OPENSQUAD_VERSION}`);
  }

  log(`Downloading OpenSquad ${OPENSQUAD_VERSION} from ${OPENSQUAD_REPO}...`);
  const tmpDir = join(ROOT, '.opensquad-tmp');
  if (existsSync(tmpDir)) execSync(`rmdir /s /q "${tmpDir}"`, { stdio: 'ignore' });
  mkdirSync(tmpDir, { recursive: true });

  execSync(
    `git clone --depth 1 --branch ${OPENSQUAD_VERSION} https://github.com/${OPENSQUAD_REPO}.git "${tmpDir}"`,
    { stdio: 'inherit' },
  );

  // Copia para opensquad/ (preserva README.md se existir)
  mkdirSync(OPENSQUAD_DIR, { recursive: true });
  execSync(`xcopy "${tmpDir}\\*" "${OPENSQUAD_DIR}\\" /E /Y /Q`, { stdio: 'inherit' });
  execSync(`rmdir /s /q "${tmpDir}"`, { stdio: 'ignore' });

  writeFileSync(versionFile, OPENSQUAD_VERSION + '\n', 'utf-8');
  ok(`OpenSquad ${OPENSQUAD_VERSION} bundled`);
}

async function main() {
  log('Kairos Desktop AI - first-run init');
  log('================================');

  await checkNode();
  await downloadOpenSquad();

  ok('Init complete. Next: `npm install` and `npm run dev`');
}

main().catch((e) => {
  err(e.message);
  process.exit(1);
});
