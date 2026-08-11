/**
 * app_list_installed - lista todos os aplicativos instalados no Windows.
 *
 * Fontes:
 *  - Registry HKLM (64-bit + WOW6432Node 32-bit): programas tradicionais (.exe installer)
 *  - Registry HKCU: programas instalados apenas para o usuario atual
 *  - Get-AppxPackage: apps Microsoft Store / UWP (modern apps)
 *
 * Retorna ate `limit` resultados (padrao 100), ordenados alfabeticamente.
 * Filtro opcional por `query` (case-insensitive, match em nome OU publisher).
 */

import type { Skill } from '../types.js';
import { execPowerShell, escapePsString } from '../powershell.js';

export const appListInstalled: Skill = {
  name: 'app_list_installed',
  description:
    'Lista todos os aplicativos instalados no computador (Windows). ' +
    'Inclui programas tradicionais (registry HKLM/HKCU) e apps Microsoft Store (UWP/Appx). ' +
    'Aceita filtro opcional por nome. Retorna nome, versao, publisher, local de instalacao, ' +
    'tamanho estimado (KB) e fonte (registry ou store).',
  category: 'app',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Filtro opcional: busca case-insensitive em nome ou publisher (ex: "chrome", "office", "adobe").',
      },
      source: {
        type: 'string',
        enum: ['all', 'registry', 'store'],
        description: 'Filtrar fonte: "all" (padrao), "registry" (programas .exe) ou "store" (Appx/UWP).',
      },
      limit: {
        type: 'number',
        description: 'Maximo de resultados retornados (padrao 100, maximo 500).',
      },
    },
    required: [],
  },
  async execute(args) {
    // Parse seguro dos parametros
    const query = typeof args.query === 'string' ? args.query.trim().slice(0, 200) : '';
    const sourceRaw = typeof args.source === 'string' ? args.source.toLowerCase() : 'all';
    const source: 'all' | 'registry' | 'store' =
      sourceRaw === 'registry' || sourceRaw === 'store' ? sourceRaw : 'all';
    const limitNum = Number(args.limit);
    const limit = Number.isFinite(limitNum) && limitNum > 0
      ? Math.min(Math.floor(limitNum), 500)
      : 100;

    if (process.platform !== 'win32') {
      return {
        content:
          'Aviso: app_list_installed funciona apenas no Windows. ' +
          `Plataforma atual: ${process.platform}. ` +
          'No Linux/macOS, use `dpkg -l`, `rpm -qa`, `brew list` ou similar.',
        error: true,
      };
    }

    const safeQuery = escapePsString(query);
    const safeLimit = String(limit);

    // Script PowerShell:
    // 1. Coleta dos 3 paths do registry (HKLM 64-bit, WOW6432Node 32-bit, HKCU)
    // 2. Coleta do Appx (Microsoft Store)
    // 3. Filtra por query se informado
    // 4. Deduplica por nome (registry pode ter duplicatas em WOW6432Node)
    // 5. Ordena alfabeticamente e pega top N
    // 6. Retorna JSON com { count, total_found, apps: [...] }
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$query = "${safeQuery}"
$limit = [int]${safeLimit}
$sourceFilter = "${source}"

$results = @()

# === Registry: HKLM 64-bit ===
$paths = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
)

if ($sourceFilter -eq 'all' -or $sourceFilter -eq 'registry') {
  foreach ($p in $paths) {
    if (-not (Test-Path $p)) { continue }
    $items = Get-ItemProperty "$p\\*" -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -and $_.DisplayName.Trim() -ne '' }
    foreach ($i in $items) {
      $size = 0
      if ($i.EstimatedSize -and ($i.EstimatedSize -as [long])) { $size = [long]$i.EstimatedSize }
      $results += [PSCustomObject]@{
        name             = ([string]$i.DisplayName).Trim()
        version          = if ($i.DisplayVersion) { [string]$i.DisplayVersion } else { '' }
        publisher        = if ($i.Publisher) { ([string]$i.Publisher).Trim() } else { '' }
        install_location = if ($i.InstallLocation) { [string]$i.InstallLocation } else { '' }
        uninstall_string = if ($i.UninstallString) { [string]$i.UninstallString } else { '' }
        estimated_size_kb = $size
        source           = 'registry'
      }
    }
  }
}

# === Appx: Microsoft Store / UWP ===
if ($sourceFilter -eq 'all' -or $sourceFilter -eq 'store') {
  $appx = Get-AppxPackage -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -and $_.Name.Trim() -ne '' }
  foreach ($a in $appx) {
    $pub = if ($a.Publisher) { ($a.Publisher -split 'OID\\.' )[0] } else { '' }
    $results += [PSCustomObject]@{
      name             = ([string]$a.Name).Trim()
      version          = if ($a.Version) { [string]$a.Version } else { '' }
      publisher        = $pub
      install_location = if ($a.InstallLocation) { [string]$a.InstallLocation } else { '' }
      uninstall_string = ''
      estimated_size_kb = 0
      source           = 'store'
    }
  }
}

$totalFound = $results.Count

# Filtro por query (case-insensitive, em nome OU publisher)
if ($query -ne '') {
  $q = $query.ToLower()
  $results = $results | Where-Object {
    $_.name.ToLower().Contains($q) -or $_.publisher.ToLower().Contains($q)
  }
}

# Deduplica por nome (mantem primeira ocorrencia)
$results = $results | Group-Object -Property name | ForEach-Object { $_.Group[0] }

# Ordena alfabeticamente (case-insensitive) e pega top N
$results = $results | Sort-Object { $_.name.ToLower() } | Select-Object -First $limit

# Serializa para JSON
$out = @{
  count      = $results.Count
  total_found = $totalFound
  query      = $query
  source     = $sourceFilter
  apps       = @($results)
}
return $out | ConvertTo-Json -Compress -Depth 4
`.trim();

    const result = await execPowerShell(script, { timeoutMs: 30_000 });

    if (result.timedOut) {
      return { content: 'Erro: timeout ao listar aplicativos instalados (30s)', error: true };
    }
    if (result.exitCode !== 0 && !result.stdout) {
      return {
        content: `Erro PowerShell (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`,
        error: true,
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.stdout || '{}');
    } catch (err) {
      return {
        content: `Erro: resposta invalida do PowerShell - ${(err as Error).message}`,
        error: true,
      };
    }

    if (parsed.error) {
      return { content: `Erro listando apps: ${parsed.error}`, error: true };
    }

    const apps: any[] = Array.isArray(parsed.apps) ? parsed.apps : [];
    const count = Number(parsed.count) || apps.length;
    const totalFound = Number(parsed.total_found) || 0;

    if (count === 0) {
      const qDesc = query ? ` (filtro: "${query}")` : '';
      return {
        content: `Nenhum aplicativo encontrado${qDesc}. Total no sistema: ${totalFound}.`,
      };
    }

    // Formata saida amigavel em markdown-like (para o LLM resumir)
    const lines: string[] = [];
    lines.push(`# Aplicativos instalados (${count}${totalFound > count ? ` de ${totalFound}` : ''})`);
    if (query) lines.push(`Filtro: "${query}"`);
    if (source !== 'all') lines.push(`Fonte: ${source}`);
    lines.push('');

    for (const a of apps) {
      const name = String(a.name || '(sem nome)');
      const ver = a.version ? ` v${a.version}` : '';
      const pub = a.publisher ? ` — ${a.publisher}` : '';
      const size = a.estimated_size_kb && Number(a.estimated_size_kb) > 0
        ? ` [${(Number(a.estimated_size_kb) / 1024).toFixed(1)} MB]`
        : '';
      const src = a.source === 'store' ? ' (Store)' : '';
      lines.push(`- **${name}**${ver}${pub}${size}${src}`);
    }

    if (totalFound > count) {
      lines.push('');
      lines.push(`_Mostrando ${count} de ${totalFound} encontrados. Aumente \`limit\` para ver mais._`);
    }

    return { content: lines.join('\n') };
  },
};
