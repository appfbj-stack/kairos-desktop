/**
 * Kairos Update Server
 *
 * Hospeda:
 * - Instaladores Windows (.exe / .exe.blockmap) e macOS (.dmg / .dmg.blockmap)
 * - Arquivos latest.yml / latest-mac.yml / latest-linux.yml (consumidos pelo electron-updater)
 * - Manifesto de versões em /api/updates/manifest.json
 *
 * Roda em:
 *   https://kairosdesktop.fbautomacao.space/downloads
 *
 * @see https://www.electron.build/configuration/publish
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOWNLOADS_DIR = resolve(__dirname, '..', 'downloads');
const PUBLIC_URL = process.env.KAIROS_PUBLIC_URL || 'https://kairosdesktop.fbautomacao.space';
const PORT = Number(process.env.PORT || 4097);
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  },
});

await fastify.register(fastifyCors, {
  origin: true,
  credentials: true,
});

// Servir arquivos estaticos (instaladores, .yml, .blockmap)
await fastify.register(fastifyStatic, {
  root: DOWNLOADS_DIR,
  prefix: '/downloads/',
  decorateReply: false,
});

/**
 * GET /health
 * Health check para o Dokploy
 */
fastify.get('/health', async () => ({
  status: 'ok',
  service: 'kairos-update-server',
  version: '0.1.0',
  timestamp: new Date().toISOString(),
}));

/**
 * GET /api/updates/manifest
 * Lista todas as versoes publicadas com metadados
 */
fastify.get('/api/updates/manifest', async () => {
  if (!existsSync(DOWNLOADS_DIR)) {
    return { versions: [] };
  }

  const entries = await readdir(DOWNLOADS_DIR, { withFileTypes: true });
  const versions: any[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const versionDir = join(DOWNLOADS_DIR, entry.name);
    const ymlPath = join(versionDir, 'latest.yml');
    if (!existsSync(ymlPath)) continue;

    try {
      const raw = await readFile(ymlPath, 'utf-8');
      const meta = parseYaml(raw) as { version: string; files: any[]; path: string; releaseDate?: string };
      versions.push({
        version: meta.version,
        path: meta.path,
        files: meta.files?.map((f: any) => f.name) || [],
        releaseDate: meta.releaseDate,
        downloadUrl: `${PUBLIC_URL}/downloads/${entry.name}/${meta.path}`,
      });
    } catch (err) {
      fastify.log.warn({ err, version: entry.name }, 'Failed to parse latest.yml');
    }
  }

  versions.sort((a, b) => b.version.localeCompare(a.version));
  return { versions, latest: versions[0] || null };
});

/**
 * GET /api/updates/check
 * Endpoint usado pelo electron-updater para checar versao nova
 * Query params: ?version=<current-version>&channel=stable
 */
const CheckQuery = z.object({
  version: z.string(),
  channel: z.enum(['stable', 'beta', 'nightly']).default('stable'),
});

fastify.get<{ Querystring: z.infer<typeof CheckQuery> }>('/api/updates/check', async (req, reply) => {
  const { version, channel } = CheckQuery.parse(req.query);
  fastify.log.info({ version, channel }, 'Update check');

  // TODO Fase 8: implementar logica de canal (stable/beta) e semver
  // Por enquanto, retorna "no update"
  return { updateAvailable: false, currentVersion: version, channel };
});

/**
 * GET /api/updates/latest
 * Retorna latest.yml da versao mais recente (electron-updater usa isso)
 */
fastify.get('/api/updates/latest', async (_req, reply) => {
  if (!existsSync(DOWNLOADS_DIR)) {
    return reply.code(404).send({ error: 'No versions published' });
  }
  const entries = await readdir(DOWNLOADS_DIR, { withFileTypes: true });
  const versionDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  versionDirs.sort().reverse();

  for (const v of versionDirs) {
    const ymlPath = join(DOWNLOADS_DIR, v, 'latest.yml');
    if (existsSync(ymlPath)) {
      const raw = await readFile(ymlPath, 'utf-8');
      reply.type('application/x-yaml');
      return raw;
    }
  }

  return reply.code(404).send({ error: 'No latest.yml found' });
});

/**
 * GET /
 * Pagina simples de status do servidor
 */
fastify.get('/', async () => ({
  service: 'Kairos Update Server',
  status: 'running',
  endpoints: {
    health: 'GET /health',
    manifest: 'GET /api/updates/manifest',
    check: 'GET /api/updates/check?version=X&channel=stable',
    latest: 'GET /api/updates/latest',
    downloads: 'GET /downloads/{version}/{file}',
  },
  publicUrl: PUBLIC_URL,
}));

/**
 * Inicializacao
 */
async function start() {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Kairos Update Server running at ${PUBLIC_URL}`);
    fastify.log.info(`Downloads served from ${DOWNLOADS_DIR}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
