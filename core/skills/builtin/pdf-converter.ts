/**
 * pdf_convert - converte documentos para PDF.
 *
 * Formatos suportados no MVP:
 *  - .docx / .doc / .rtf  -> PDF  (via Word COM)
 *  - .txt / .md           -> PDF  (via Word COM: abre como texto e exporta)
 *  - .xlsx / .xls         -> PDF  (via Excel COM)
 *
 * Requer Office instalado. Cria arquivo novo (nao sobrescreve entrada).
 *
 * WRITE/CONVERSAO e destrutivo (cria arquivo) - mas nao apaga nada.
 * Aproval flow fica pra Fase 6.
 */

import type { Skill } from '../types.js';
import { execPowerShell, escapePsString } from '../powershell.js';

export const pdfConvert: Skill = {
  name: 'pdf_convert',
  description:
    'Converte um documento para PDF (.docx, .doc, .rtf, .txt, .md, .xlsx, .xls). ' +
    'Cria um novo arquivo PDF no caminho de destino. ' +
    'Use quando o usuario pedir "converte isso pra PDF", "gera um PDF desse documento", etc. ' +
    'Requer Microsoft Office instalado.',
  category: 'pdf',
  parameters: {
    type: 'object',
    properties: {
      inputPath: {
        type: 'string',
        description: 'Caminho completo do arquivo de entrada (ex: C:\\Users\\Nome\\doc.docx).',
      },
      outputPath: {
        type: 'string',
        description: 'Caminho do PDF de saida (ex: C:\\Users\\Nome\\doc.pdf). Se vazio, usa mesmo dir/troca extensao.',
      },
    },
    required: ['inputPath'],
  },
  async execute(args) {
    const inputPath = String(args.inputPath || '').trim();
    const outputPath = String(args.outputPath || '').trim() || inputPath.replace(/\.[^.]+$/, '.pdf');

    if (!inputPath) return { content: 'Erro: inputPath vazio', error: true };

    const ext = inputPath.toLowerCase().split('.').pop() || '';
    if (!['docx', 'doc', 'rtf', 'txt', 'md', 'xlsx', 'xls'].includes(ext)) {
      return { content: `Erro: extensao .${ext} nao suportada. Aceitas: docx, doc, rtf, txt, md, xlsx, xls.`, error: true };
    }

    const safeInput = escapePsString(inputPath);
    const safeOutput = escapePsString(outputPath);
    const isExcel = ext === 'xlsx' || ext === 'xls';

    // Word: SaveAs PDF = 17 (WdSaveFormat.wdFormatPDF)
    // Excel: ExportAsFixedFormat Type=0 (xlTypePDF)
    const script = isExcel
      ? `
$ErrorActionPreference = 'Stop'
$excel = $null
$wb = $null
try {
  if (Test-Path -LiteralPath "${safeOutput}") {
    return @{ error = "Arquivo de saida ja existe: ${safeOutput}. Escolha outro nome." } | ConvertTo-Json -Compress
    exit
  }
  $excel = New-Object -ComObject Excel.Application -ErrorAction Stop
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open("${safeInput}", $false, $true)
  $wb.ExportAsFixedFormat(0, "${safeOutput}")
  $wb.Close($false)
  $excel.Quit()
  $size = (Get-Item -LiteralPath "${safeOutput}").Length
  return @{ ok = $true; outputPath = "${safeOutput}"; size = $size } | ConvertTo-Json -Compress
} catch {
  return @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
} finally {
  if ($null -ne $wb) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
  if ($null -ne $excel) {
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }
  [GC]::Collect()
}
`.trim()
      : `
$ErrorActionPreference = 'Stop'
$word = $null
$doc = $null
try {
  if (Test-Path -LiteralPath "${safeOutput}") {
    return @{ error = "Arquivo de saida ja existe: ${safeOutput}. Escolha outro nome." } | ConvertTo-Json -Compress
    exit
  }
  $word = New-Object -ComObject Word.Application -ErrorAction Stop
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open("${safeInput}", $false, $true)
  $doc.SaveAs("${safeOutput}", 17)
  $doc.Close($false)
  $word.Quit()
  $size = (Get-Item -LiteralPath "${safeOutput}").Length
  return @{ ok = $true; outputPath = "${safeOutput}"; size = $size } | ConvertTo-Json -Compress
} catch {
  return @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
} finally {
  if ($null -ne $doc) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) }
  if ($null -ne $word) {
    $word.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
  [GC]::Collect()
}
`.trim();

    const result = await execPowerShell(script, { timeoutMs: 90_000 });

    if (result.timedOut) {
      return { content: 'Erro: timeout convertendo (90s). Office nao respondeu.', error: true };
    }
    if (!result.stdout) {
      return { content: `Erro PowerShell: ${result.stderr || 'sem output (Office instalado?)'}`, error: true };
    }

    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.error) {
        return { content: `Erro convertendo: ${parsed.error}`, error: true };
      }
      const sizeKb = (parsed.size / 1024).toFixed(1);
      return {
        content: `PDF gerado: ${parsed.outputPath} (${sizeKb} KB)`,
        data: { outputPath: parsed.outputPath, size: parsed.size, sourceExt: ext },
      };
    } catch (err) {
      return { content: `Erro parseando: ${(err as Error).message}\nRaw: ${result.stdout.slice(0, 300)}`, error: true };
    }
  },
};
