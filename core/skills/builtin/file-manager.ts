/**
 * file_manager_list - lista arquivos em um diretorio (read-only).
 *
 * Cross-platform (Linux + Windows + macOS): usa Node puro (fs/promises).
 * Funciona identico no VPS (Linux) e no Electron desktop (Windows).
 * MVP: apenas leitura. Delete/move/copy vao pra Fase 4.1 com approval flow.
 */

import type { Skill } from '../types.js';
import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execPowerShell, escapePsString } from '../powershell.js';

export const fileManagerList: Skill = {
  name: 'file_manager_list',
  description:
    'Lista arquivos e pastas em um diretorio do Windows. Retorna nome, tamanho e data de modificacao. Use quando o usuario pedir para listar, ver ou explorar o conteudo de uma pasta.',
  category: 'file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Caminho completo do diretorio (ex: C:\\Users\\Nome). Default: home do usuario.',
      },
      limit: {
        type: 'number',
        description: 'Maximo de itens a retornar (default 50, max 200).',
        default: 50,
      },
    },
    required: ['path'],
  },
  async execute(args) {
    const rawPath = String(args.path || '');
    const limit = Math.min(Number(args.limit) || 50, 200);

    // Validacao basica: nao aceita paths vazios
    if (!rawPath.trim()) {
      return { content: 'Erro: path vazio', error: true };
    }

    const searchPath = rawPath;
    let entries;
    try {
      const s = await stat(searchPath);
      if (!s.isDirectory()) {
        return { content: `Erro: caminho nao e diretorio: ${searchPath}`, error: true };
      }
    } catch (err) {
      return { content: `Erro: caminho nao existe: ${searchPath} (${(err as Error).message})`, error: true };
    }

    try {
      const all = await readdir(searchPath, { withFileTypes: true });
      const items = [];
      let i = 0;
      for (const entry of all) {
        if (i >= limit) break;
        const fullPath = resolve(searchPath, entry.name);
        let size = 0;
        let modified = 'unknown';
        try {
          const st = await stat(fullPath);
          size = Number(st.size);
          modified = st.mtime.toISOString().replace('T', ' ').slice(0, 16);
        } catch { /* ignora */ }
        items.push({
          name: entry.name,
          type: entry.isDirectory() ? 'dir' : 'file',
          size,
          modified,
        });
        i++;
      }
      if (items.length === 0) {
        return { content: `Diretorio vazio: ${searchPath}` };
      }
      const lines = items.map((it) =>
        it.type === 'dir' ? `[DIR]  ${it.name}/` : `[FILE] ${it.name} (${formatSize(it.size)})`
      );
      return {
        content: `${items.length} itens em ${searchPath}:\n${lines.join('\n')}`,
        data: { count: items.length, items, path: searchPath },
      };
    } catch (err) {
      return { content: `Erro: ${(err as Error).message}`, error: true };
    }
  },
};

/**
 * file_manager_read - le conteudo de um arquivo texto (read-only, limitado).
 */
export const fileManagerRead: Skill = {
  name: 'file_manager_read',
  description:
    'Le o conteudo de um arquivo texto (txt, md, json, csv, log, etc). Limite de 50KB. Use quando o usuario pedir para abrir, ler ou ver o conteudo de um arquivo.',
  category: 'file',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Caminho completo do arquivo (ex: C:\\Users\\Nome\\Desktop\\notas.txt).',
      },
      maxBytes: {
        type: 'number',
        description: 'Maximo de bytes a ler (default 50000, max 200000).',
        default: 50000,
      },
    },
    required: ['path'],
  },
  async execute(args) {
    const rawPath = String(args.path || '');
    const maxBytes = Math.min(Number(args.maxBytes) || 50_000, 200_000);

    if (!rawPath.trim()) {
      return { content: 'Erro: path vazio', error: true };
    }

    const safePath = escapePsString(rawPath);
    const script = `
$ErrorActionPreference = 'Stop'
try {
  if (-not (Test-Path -LiteralPath "${safePath}" -PathType Leaf)) {
    return @{ error = "Arquivo nao encontrado: ${safePath}" } | ConvertTo-Json -Compress
  }
  $content = Get-Content -LiteralPath "${safePath}" -Raw -Encoding UTF8 -ErrorAction Stop
  $size = (Get-Item -LiteralPath "${safePath}").Length
  if ($content.Length -gt ${maxBytes}) {
    $content = $content.Substring(0, ${maxBytes}) + "...[truncated at ${maxBytes} bytes]"
  }
  return @{ size = $size; content = $content } | ConvertTo-Json -Depth 3 -Compress
} catch {
  return @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`.trim();

    const result = await execPowerShell(script, { timeoutMs: 15_000 });

    if (result.timedOut) return { content: 'Erro: timeout ao ler arquivo', error: true };
    if (!result.stdout) return { content: `Erro: ${result.stderr || 'sem output'}`, error: true };

    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.error) return { content: `Erro: ${parsed.error}`, error: true };
      return {
        content: `${parsed.size} bytes lidos de ${rawPath}:\n\n${parsed.content}`,
        data: { size: parsed.size, path: rawPath },
      };
    } catch (err) {
      return { content: `Erro parseando: ${(err as Error).message}`, error: true };
    }
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}
