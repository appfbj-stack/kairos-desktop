/**
 * search_files - busca arquivos por nome em um diretorio (recursivo opcional).
 *
 * Cross-platform (Linux + Windows + macOS): usa Node puro (fs/promises + path)
 * ao inves de PowerShell. Funciona identico no VPS (Linux) e no Electron desktop
 * (Windows). Performance similar ao find/ls atraves de fs.readdir com withFileTypes.
 *
 * Patterns suportados:
 *  - substring: "contrato" (case-insensitive)
 *  - glob: "*.docx", "notas*", "*.mp4" (matchFn simples, nao completo glob)
 *  - multiplas extensoes: "*.mp4,*.avi,*.mkv" (separadas por virgula)
 *
 * Sempre recursivo por padrao. Retorna ate `limit` resultados (default 30, max 100).
 */

import type { Skill } from '../types.js';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

interface FoundFile {
  path: string;
  size: number;
  modified: string;
}

const MAX_DEPTH = 8; // safety: nao desce mais que 8 niveis (evita loops/Recycle.Bin etc)

/**
 * Converte um pattern tipo "*.mp4" em regex (matchFn simples).
 * Suporta apenas * (qualquer chars ate o final).
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escapa regex chars
    .replace(/\*/g, '.*'); // * = qualquer coisa
  return new RegExp(`^${escaped}$`, 'i'); // case-insensitive
}

/**
 * Verifica se um nome de arquivo bate com qualquer um dos patterns.
 */
function matchesAny(name: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(name));
}

/**
 * Busca recursivamente arquivos que batem com os patterns.
 */
async function searchRecursive(
  dir: string,
  patterns: RegExp[],
  limit: number,
  results: FoundFile[],
  currentDepth = 0,
): Promise<void> {
  if (currentDepth > MAX_DEPTH) return;
  if (results.length >= limit) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // sem permissao ou diretorio nao existe - ignora
    return;
  }

  for (const entry of entries) {
    if (results.length >= limit) return;
    // Ignora diretorios de sistema / lixo (Windows + Unix)
    if (entry.name === 'System Volume Information' || entry.name === '$Recycle.Bin' ||
        entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await searchRecursive(fullPath, patterns, limit, results, currentDepth + 1);
    } else if (entry.isFile() && matchesAny(entry.name, patterns)) {
      try {
        const s = await stat(fullPath);
        results.push({
          path: fullPath,
          size: Number(s.size),
          modified: s.mtime.toISOString().replace('T', ' ').slice(0, 16),
        });
      } catch {
        results.push({ path: fullPath, size: 0, modified: 'unknown' });
      }
    }
  }
}

export const searchFiles: Skill = {
  name: 'search_files',
  description:
    'Busca arquivos por nome (substring ou padrao glob) em um diretorio. ' +
    'Recursivo por padrao. Cross-platform (Linux/Windows/macOS). ' +
    'Suporta multiplas extensoes separadas por virgula (ex: "*.mp4,*.avi,*.mkv"). ' +
    'Use quando o usuario pedir para encontrar um arquivo, listar videos/imagens/documentos, ' +
    'ou procurar arquivos por extensao em uma pasta.',
  category: 'search',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Nome ou padrao a buscar. Pode ser substring ("contrato"), glob ("*.docx"), ' +
          'ou multiplas extensoes separadas por virgula ("*.mp4,*.avi,*.mkv").',
      },
      path: {
        type: 'string',
        description: 'Diretorio onde buscar (default: home do usuario ou /).',
      },
      recursive: {
        type: 'boolean',
        description: 'Buscar em subpastas (default true). Em diretorios grandes, pode ser lento.',
        default: true,
      },
      limit: {
        type: 'number',
        description: 'Maximo de resultados (default 30, max 100).',
        default: 30,
      },
    },
    required: ['pattern'],
  },
  async execute(args) {
    const patternRaw = String(args.pattern || '').trim();
    const pathRaw = String(args.path || '').trim();
    const recursive = args.recursive !== false;
    const limit = Math.min(Number(args.limit) || 30, 100);

    if (!patternRaw) return { content: 'Erro: pattern vazio', error: true };
    if (patternRaw.length > 256) return { content: 'Erro: pattern muito longo', error: true };

    // Diretorio default: home do usuario (se nada passado)
    const searchPath = pathRaw || (process.env.HOME || process.env.USERPROFILE || '/');

    // Suporta multiplos patterns separados por virgula
    const patterns = patternRaw.split(',').map((p) => p.trim()).filter(Boolean).map(patternToRegex);
    if (patterns.length === 0) {
      return { content: 'Erro: nenhum pattern valido', error: true };
    }

    const results: FoundFile[] = [];
    const t0 = Date.now();

    if (recursive) {
      await searchRecursive(searchPath, patterns, limit, results, 0);
    } else {
      // nao recursivo: 1 nivel so
      let entries;
      try {
        entries = await readdir(searchPath, { withFileTypes: true });
      } catch (err) {
        return { content: `Erro acessando ${searchPath}: ${(err as Error).message}`, error: true };
      }
      for (const entry of entries) {
        if (results.length >= limit) break;
        if (entry.isFile() && matchesAny(entry.name, patterns)) {
          const fullPath = join(searchPath, entry.name);
          try {
            const s = await stat(fullPath);
            results.push({ path: fullPath, size: Number(s.size), modified: s.mtime.toISOString().slice(0, 10) });
          } catch {
            results.push({ path: fullPath, size: 0, modified: 'unknown' });
          }
        }
      }
    }

    const elapsed = Date.now() - t0;
    if (results.length === 0) {
      return {
        content: `Nenhum arquivo encontrado com pattern "${patternRaw}" em ${searchPath} (busca levou ${elapsed}ms).`,
      };
    }
    const lines = results.map((it) => `${it.path} (${formatSize(it.size)}, ${it.modified})`);
    const more = results.length >= limit ? `\n... (truncado em ${limit} resultados)` : '';
    return {
      content: `${results.length} resultados em ${elapsed}ms para "${patternRaw}" em ${searchPath}:\n${lines.join('\n')}${more}`,
      data: { count: results.length, elapsed, path: searchPath, items: results },
    };
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}
