/**
 * file_organize - organiza arquivos e pastas via PowerShell.
 *
 * Operacoes:
 *  - move_by_type: separa arquivos em subpastas por extensao (pdfs/, images/, videos/, docs/, outros/)
 *  - move_by_date: separa por ano/mes de modificacao (YYYY/, YYYY-MM/)
 *  - rename_pattern: renomeia arquivos com pattern (suporta {counter}, {date}, {name})
 *  - dedupe: lista duplicados por hash (nao deleta)
 *  - create_structure: cria arvore de pastas
 *
 * SEGURANCA:
 *  - NUNCA opera em diretorios do sistema (C:\Windows, C:\Program Files, etc)
 *  - NUNCA deleta arquivos (so move/renomeia)
 *  - Operacoes em massa >50 arquivos pedem confirmacao explicita (campo confirmBulk)
 *  - Nao usa shell:true (apenas spawn do powershell com args)
 *
 * CUIDADO: operacao modifica arquivos. Em Fase 6 vai ter approval flow visual.
 */

import type { Skill } from '../types.js';
import { execPowerShell, escapePsString } from '../powershell.js';

const BLOCKED_PATHS = [
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\System Volume Information',
  'C:\\$Recycle.Bin',
  'C:\\Boot',
];

function checkPathSafety(p: string): { safe: boolean; reason?: string } {
  if (!p) return { safe: false, reason: 'path vazio' };
  const normalized = p.toLowerCase().replace(/\//g, '\\');
  for (const blocked of BLOCKED_PATHS) {
    if (normalized.startsWith(blocked.toLowerCase() + '\\') || normalized === blocked.toLowerCase()) {
      return { safe: false, reason: `Path bloqueado por seguranca: ${blocked}` };
    }
  }
  return { safe: true };
}

export const fileOrganize: Skill = {
  name: 'file_organize',
  description:
    'Organiza arquivos e pastas no Windows. Operacoes: ' +
    'move_by_type (separa por extensao em subpastas pdfs/images/videos/docs/outros), ' +
    'move_by_date (separa por ano/mes de modificacao), ' +
    'rename_pattern (renomeia em massa com pattern tipo relatorio_{counter}_{date}), ' +
    'dedupe (lista duplicados por hash, NAO deleta), ' +
    'create_structure (cria arvore de pastas). ' +
    'NUNCA deleta arquivos. Para acoes em massa > 50 arquivos, passar confirmBulk=true. ' +
    'Paths em diretorios do sistema (Windows, Program Files) sao bloqueados.',
  category: 'file',
  parameters: {
    type: 'object',
    properties: {
      sourceDir: {
        type: 'string',
        description: 'Diretorio onde os arquivos estao (caminho completo).',
      },
      action: {
        type: 'string',
        enum: ['move_by_type', 'move_by_date', 'rename_pattern', 'dedupe', 'create_structure'],
        description: 'Acao a executar.',
      },
      destination: {
        type: 'string',
        description: 'Diretorio de destino (para move_by_type, move_by_date). Default: mesmo sourceDir.',
      },
      pattern: {
        type: 'string',
        description:
          'Pattern de renomeacao (apenas rename_pattern). Suporta: {name} nome original sem extensao, {ext} extensao, {counter:D3} contador, {date} YYYY-MM-DD, {year} YYYY, {month} MM.',
      },
      structure: {
        type: 'array',
        description: 'Array de caminhos de pasta a criar (apenas create_structure). Ex: ["Trabalho/2026", "Trabalho/2026/Clientes"].',
        items: { type: 'string' },
      },
      extensions: {
        type: 'array',
        description: 'Filtro opcional: lista de extensoes (sem ponto) a incluir. Ex: ["pdf", "docx"].',
        items: { type: 'string' },
      },
      confirmBulk: {
        type: 'boolean',
        description: 'Obrigatorio true para acoes que afetam > 50 arquivos.',
      },
      dryRun: {
        type: 'boolean',
        description: 'Se true, lista o que SERIA feito sem executar. Recomendado antes de operacoes destrutivas.',
      },
    },
    required: ['sourceDir', 'action'],
  },
  async execute(args) {
    const sourceDir = String(args.sourceDir || '').trim();
    const action = String(args.action || '').trim();
    const destination = args.destination ? String(args.destination).trim() : sourceDir;
    const pattern = args.pattern ? String(args.pattern) : '';
    const structure = args.structure;
    const extensions = Array.isArray(args.extensions) ? args.extensions.map(String) : null;
    const confirmBulk = Boolean(args.confirmBulk);
    const dryRun = Boolean(args.dryRun);

    if (!sourceDir) return { content: 'Erro: sourceDir vazio', error: true };
    if (!action) return { content: 'Erro: action obrigatoria', error: true };

    const srcSafety = checkPathSafety(sourceDir);
    if (!srcSafety.safe) return { content: `Erro seguranca: ${srcSafety.reason}`, error: true };

    const destSafety = checkPathSafety(destination);
    if (!destSafety.safe) return { content: `Erro seguranca (destino): ${destSafety.reason}`, error: true };

    const safeSrc = escapePsString(sourceDir);
    const safeDest = escapePsString(destination);
    const safePattern = escapePsString(pattern);
    const psExts = extensions ? '@(' + extensions.map((e) => `"${escapePsString(e.toLowerCase().replace(/^\./, ''))}"`).join(',') + ')' : '$null';
    const psStructure = Array.isArray(structure) ? '@(' + structure.map((s) => `"${escapePsString(String(s))}"`).join(',') + ')' : '$null';

    const script = `
$ErrorActionPreference = 'Stop'
$src = "${safeSrc}"
$dest = "${safeDest}"
$action = "${action}"
$pattern = "${safePattern}"
$exts = ${psExts}
$structure = ${psStructure}
$confirmBulk = $${confirmBulk}
$dryRun = $${dryRun}
$results = @()

if (-not (Test-Path -LiteralPath $src)) {
  return @{ error = "sourceDir nao existe: $src" } | ConvertTo-Json -Compress
}

if ($action -eq "move_by_type") {
  $files = Get-ChildItem -LiteralPath $src -File -ErrorAction SilentlyContinue
  if ($null -ne $exts -and $exts.Count -gt 0) {
    $files = $files | Where-Object { $exts -contains $_.Extension.TrimStart('.').ToLower() }
  }
  if ($files.Count -gt 50 -and -not $confirmBulk -and -not $dryRun) {
    return @{ error = "Mais de 50 arquivos ($($files.Count)). Passe confirmBulk=true ou dryRun=true." } | ConvertTo-Json -Compress
  }
  $grouped = $files | Group-Object { $_.Extension.TrimStart('.').ToLower() }
  if ($null -eq $grouped) { $grouped = @() }
  $categoryMap = @{
    "pdf"="pdfs"; "doc"="docs"; "docx"="docs"; "xls"="docs"; "xlsx"="docs"; "txt"="docs"; "rtf"="docs"; "md"="docs"
    "jpg"="images"; "jpeg"="images"; "png"="images"; "gif"="images"; "bmp"="images"; "svg"="images"; "webp"="images"
    "mp4"="videos"; "mov"="videos"; "avi"="videos"; "mkv"="videos"; "wmv"="videos"; "flv"="videos"
    "mp3"="audio"; "wav"="audio"; "flac"="audio"; "aac"="audio"; "ogg"="audio"
    "zip"="arquivos_compactados"; "rar"="arquivos_compactados"; "7z"="arquivos_compactados"; "tar"="arquivos_compactados"; "gz"="arquivos_compactados"
  }
  foreach ($g in $grouped) {
    $ext = if ($g.Name) { $g.Name } else { "sem_extensao" }
    $category = if ($categoryMap.ContainsKey($ext)) { $categoryMap[$ext] } else { "outros" }
    $targetDir = Join-Path -Path $dest -ChildPath $category
    foreach ($f in $g.Group) {
      $targetPath = Join-Path -Path $targetDir -ChildPath $f.Name
      $action_op = if ($dryRun) { "DRY_RUN" } else { "MOVED" }
      if (-not $dryRun) {
        if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
        Move-Item -LiteralPath $f.FullName -Destination $targetPath -Force
      }
      $results += @{ from = $f.FullName; to = $targetPath; ext = $ext; category = $category; op = $action_op }
    }
  }
}
elseif ($action -eq "move_by_date") {
  $files = Get-ChildItem -LiteralPath $src -File -ErrorAction SilentlyContinue
  if ($null -ne $exts -and $exts.Count -gt 0) {
    $files = $files | Where-Object { $exts -contains $_.Extension.TrimStart('.').ToLower() }
  }
  if ($files.Count -gt 50 -and -not $confirmBulk -and -not $dryRun) {
    return @{ error = "Mais de 50 arquivos ($($files.Count)). Passe confirmBulk=true ou dryRun=true." } | ConvertTo-Json -Compress
  }
  $grouped = $files | Group-Object { $_.LastWriteTime.ToString("yyyy-MM") }
  if ($null -eq $grouped) { $grouped = @() }
  foreach ($g in $grouped) {
    $yearMonth = $g.Name
    $targetDir = Join-Path -Path $dest -ChildPath $yearMonth
    foreach ($f in $g.Group) {
      $targetPath = Join-Path -Path $targetDir -ChildPath $f.Name
      $action_op = if ($dryRun) { "DRY_RUN" } else { "MOVED" }
      if (-not $dryRun) {
        if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
        Move-Item -LiteralPath $f.FullName -Destination $targetPath -Force
      }
      $results += @{ from = $f.FullName; to = $targetPath; month = $yearMonth; op = $action_op }
    }
  }
}
elseif ($action -eq "rename_pattern") {
  if (-not $pattern) { return @{ error = "rename_pattern requer parametro 'pattern'" } | ConvertTo-Json -Compress }
  $files = Get-ChildItem -LiteralPath $src -File | Sort-Object Name
  if ($null -ne $exts -and $exts.Count -gt 0) {
    $files = $files | Where-Object { $exts -contains $_.Extension.TrimStart('.').ToLower() }
  }
  if ($files.Count -gt 50 -and -not $confirmBulk -and -not $dryRun) {
    return @{ error = "Mais de 50 arquivos ($($files.Count)). Passe confirmBulk=true ou dryRun=true." } | ConvertTo-Json -Compress
  }
  $counter = 1
  foreach ($f in $files) {
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
    $ext = $f.Extension.TrimStart('.')
    $date = $f.LastWriteTime.ToString("yyyy-MM-dd")
    $year = $f.LastWriteTime.ToString("yyyy")
    $month = $f.LastWriteTime.ToString("MM")
    $newName = $pattern
    $newName = $newName -replace '\{name\}', $baseName
    $newName = $newName -replace '\{ext\}', $ext
    $newName = $newName -replace '\{date\}', $date
    $newName = $newName -replace '\{year\}', $year
    $newName = $newName -replace '\{month\}', $month
    $newName = $newName -replace '\{counter(:(\d+))?\}', $(if ($Matches[2]) { $counter.ToString("D" + [int]$Matches[2]) } else { $counter.ToString("D3") })
    if (-not $newName.EndsWith("." + $ext) -and $ext) { $newName = $newName + "." + $ext }
    $targetPath = Join-Path -Path $f.DirectoryName -ChildPath $newName
    $action_op = if ($dryRun) { "DRY_RUN" } else { "RENAMED" }
    if (-not $dryRun -and ($targetPath -ne $f.FullName)) {
      Rename-Item -LiteralPath $f.FullName -NewName $newName -Force
    }
    $results += @{ from = $f.FullName; to = $targetPath; op = $action_op }
    $counter++
  }
}
elseif ($action -eq "dedupe") {
  $files = Get-ChildItem -LiteralPath $src -File -Recurse -ErrorAction SilentlyContinue
  if ($null -ne $exts -and $exts.Count -gt 0) {
    $files = $files | Where-Object { $exts -contains $_.Extension.TrimStart('.').ToLower() }
  }
  $hashes = @{}
  foreach ($f in $files) {
    $h = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash
    if (-not $hashes.ContainsKey($h)) { $hashes[$h] = @() }
    $hashes[$h] += $f.FullName
  }
  foreach ($h in $hashes.Keys) {
    $group = $hashes[$h]
    if ($group.Count -gt 1) {
      $results += @{ hash = $h; files = $group; count = $group.Count }
    }
  }
}
elseif ($action -eq "create_structure") {
  if ($null -eq $structure -or $structure.Count -eq 0) {
    return @{ error = "create_structure requer parametro 'structure' (array de caminhos)" } | ConvertTo-Json -Compress
  }
  foreach ($path in $structure) {
    $fullPath = Join-Path -Path $src -ChildPath $path
    if ($dryRun) {
      $results += @{ path = $fullPath; op = "DRY_RUN" }
    } else {
      New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
      $results += @{ path = $fullPath; op = "CREATED" }
    }
  }
}
else {
  return @{ error = "action desconhecida: $action" } | ConvertTo-Json -Compress
}

return @{
  action = $action
  sourceDir = $src
  destination = $dest
  dryRun = $dryRun
  operations = $results.Count
  details = $results
} | ConvertTo-Json -Depth 6 -Compress
`.trim();

    const result = await execPowerShell(script, { timeoutMs: 120_000 });

    if (result.timedOut) {
      return {
        content: 'Erro: timeout organizando arquivos (120s). Diretorio muito grande.',
        error: true,
      };
    }
    if (!result.stdout) {
      return {
        content: `Erro PowerShell: ${result.stderr || 'sem output'}`,
        error: true,
      };
    }

    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.error) {
        return { content: `Erro: ${parsed.error}`, error: true };
      }

      const opLabel = dryRun ? '[DRY RUN - nada foi modificado]' : '[EXECUTADO]';
      let msg = `${opLabel} ${parsed.action} em ${parsed.sourceDir}\n`;
      msg += `Operacoes: ${parsed.operations}\n`;

      if (parsed.action === 'dedupe') {
        const dupes = (parsed.details as Array<{ count: number; files: string[] }>) || [];
        if (dupes.length === 0) {
          msg += 'Nenhum duplicado encontrado.';
        } else {
          msg += `Encontrados ${dupes.length} grupo(s) de duplicados:\n`;
          for (const d of dupes.slice(0, 5)) {
            msg += `  [${d.count} copias] ${d.files[0]}\n`;
            for (const f of d.files.slice(1, 3)) msg += `    - ${f}\n`;
          }
          if (dupes.length > 5) msg += `  ... +${dupes.length - 5} grupos\n`;
        }
      } else {
        const details = (parsed.details as Array<{ from: string; to: string; op: string }>) || [];
        if (details.length > 0) {
          msg += `Primeiras operacoes:\n`;
          for (const d of details.slice(0, 5)) {
            msg += `  ${d.op}: ${d.from} -> ${d.to}\n`;
          }
          if (details.length > 5) msg += `  ... +${details.length - 5} operacoes\n`;
        }
      }

      return { content: msg, data: parsed };
    } catch (err) {
      return {
        content: `Erro parseando resposta: ${(err as Error).message}\nRaw: ${result.stdout.slice(0, 500)}`,
        error: true,
      };
    }
  },
};
