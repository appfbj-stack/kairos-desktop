/**
 * search_files - busca arquivos por nome em um diretorio (recursivo opcional).
 *
 * MVP: apenas busca por nome (substring/glob). Sem content search
 * (Fase 4.1 adiciona grep-like).
 */

import type { Skill } from '../types.js';
import { execPowerShell, escapePsString } from '../powershell.js';

export const searchFiles: Skill = {
  name: 'search_files',
  description:
    'Busca arquivos por nome (substring ou padrao glob) em um diretorio. ' +
    'Pode ser recursivo. Use quando o usuario pedir para encontrar um arquivo. ' +
    'Exemplo: "achei o contrato.pdf" ou "lista todos os .docx em Documents".',
  category: 'search',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Nome ou padrao a buscar (ex: "contrato", "*.docx", "notas*").',
      },
      path: {
        type: 'string',
        description: 'Diretorio onde buscar (default: home do usuario).',
      },
      recursive: {
        type: 'boolean',
        description: 'Buscar em subpastas (default true).',
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
    const pattern = String(args.pattern || '').trim();
    const path = String(args.path || '~').trim();
    const recursive = args.recursive !== false;
    const limit = Math.min(Number(args.limit) || 30, 100);

    if (!pattern) return { content: 'Erro: pattern vazio', error: true };
    if (pattern.length > 256) return { content: 'Erro: pattern muito longo', error: true };

    const safePattern = escapePsString(pattern);
    const safePath = escapePsString(path);
    const recurseFlag = recursive ? '-Recurse' : '';
    const script = `
$ErrorActionPreference = 'Stop'
try {
  $results = Get-ChildItem -Path "${safePath}" -Filter "${safePattern}" ${recurseFlag} -File -ErrorAction Stop |
    Select-Object -First ${limit} FullName, Length, LastWriteTime |
    ForEach-Object {
      [PSCustomObject]@{
        path = $_.FullName
        size = [int64]$_.Length
        modified = $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
      }
    }
  return @{ count = $results.Count; items = $results } | ConvertTo-Json -Depth 4 -Compress
} catch {
  return @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`.trim();

    const result = await execPowerShell(script, { timeoutMs: 30_000 });

    if (result.timedOut) return { content: 'Erro: timeout na busca', error: true };
    if (!result.stdout) return { content: `Erro: ${result.stderr || 'sem output'}`, error: true };

    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.error) return { content: `Erro: ${parsed.error}`, error: true };
      if (!parsed.items || parsed.items.length === 0) {
        return { content: `Nenhum arquivo encontrado com padrao "${pattern}" em ${path}.` };
      }
      const lines = parsed.items.map((it: any) => `${it.path} (${formatSize(it.size)})`);
      const more = parsed.count >= limit ? `\n... (truncado em ${limit})` : '';
      return {
        content: `${parsed.count} resultados para "${pattern}":\n${lines.join('\n')}${more}`,
        data: parsed,
      };
    } catch (err) {
      return { content: `Erro: ${(err as Error).message}`, error: true };
    }
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}
