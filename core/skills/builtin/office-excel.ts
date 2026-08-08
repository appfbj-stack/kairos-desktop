/**
 * office_excel_read - le dados de uma planilha Excel via COM.
 *
 * Requer Microsoft Excel instalado (interop COM).
 * Fica em background via ReleaseComObject + quit pra nao deixar Excel aberto.
 *
 * WRITE esta fora do MVP (Fase 6 adiciona approval flow).
 */

import type { Skill } from '../types.js';
import { execPowerShell, escapePsString } from '../powershell.js';

export const officeExcelRead: Skill = {
  name: 'office_excel_read',
  description:
    'Le dados de uma planilha Excel (.xlsx, .xls). ' +
    'Retorna conteudo de uma aba como matriz de linhas/celulas. ' +
    'Use quando o usuario pedir para abrir, ler, ou extrair dados de uma planilha. ' +
    'Requer Microsoft Excel instalado.',
  category: 'office',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Caminho completo do arquivo Excel (ex: C:\\Users\\Nome\\planilha.xlsx).',
      },
      sheet: {
        type: 'string',
        description: 'Nome da aba a ler (default: primeira aba).',
      },
      maxRows: {
        type: 'number',
        description: 'Maximo de linhas a retornar (default 100, max 1000).',
        default: 100,
      },
    },
    required: ['path'],
  },
  async execute(args) {
    const rawPath = String(args.path || '').trim();
    const sheet = args.sheet ? String(args.sheet) : '';
    const maxRows = Math.min(Number(args.maxRows) || 100, 1000);

    if (!rawPath) return { content: 'Erro: path vazio', error: true };

    const safePath = escapePsString(rawPath);
    const safeSheet = sheet ? escapePsString(sheet) : '';
    const script = `
$ErrorActionPreference = 'Stop'
$excel = $null
$wb = $null
try {
  $excel = New-Object -ComObject Excel.Application -ErrorAction Stop
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open("${safePath}", $false, $true)
  $ws = if ("${safeSheet}") { $wb.Worksheets.Item("${safeSheet}") } else { $wb.Worksheets.Item(1) }
  $sheetName = $ws.Name
  $usedRange = $ws.UsedRange
  $rowCount = $usedRange.Rows.Count
  $colCount = $usedRange.Columns.Count
  if ($rowCount -gt ${maxRows}) { $rowCount = ${maxRows} }
  $rows = @()
  for ($r = 1; $r -le $rowCount; $r++) {
    $row = @()
    for ($c = 1; $c -le $colCount; $c++) {
      $val = $ws.Cells.Item($r, $c).Text
      if ($null -eq $val) { $val = '' }
      $row += $val
    }
    $rows += ,$row
  }
  $wb.Close($false)
  $excel.Quit()
  return @{
    sheet = $sheetName
    rowCount = $rowCount
    colCount = $colCount
    rows = $rows
  } | ConvertTo-Json -Depth 5 -Compress
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
`.trim();

    const result = await execPowerShell(script, { timeoutMs: 60_000 });

    if (result.timedOut) {
      return { content: 'Erro: timeout lendo Excel (60s). Arquivo muito grande ou Excel nao respondeu.', error: true };
    }
    if (!result.stdout) {
      return { content: `Erro PowerShell: ${result.stderr || 'sem output (Excel instalado?)'}`, error: true };
    }

    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.error) {
        return { content: `Erro Excel: ${parsed.error}. Verifique se o arquivo existe e Excel esta instalado.`, error: true };
      }
      const preview = (parsed.rows as string[][])
        .slice(0, 10)
        .map((row, i) => `L${i + 1}: ${row.slice(0, 8).join(' | ')}${row.length > 8 ? '...' : ''}`)
        .join('\n');
      const more = parsed.rowCount > 10 ? `\n... +${parsed.rowCount - 10} linhas` : '';
      return {
        content: `Planilha "${parsed.sheet}": ${parsed.rowCount} linhas x ${parsed.colCount} cols\n\n${preview}${more}`,
        data: { sheet: parsed.sheet, rowCount: parsed.rowCount, colCount: parsed.colCount, rows: parsed.rows },
      };
    } catch (err) {
      return { content: `Erro parseando: ${(err as Error).message}\nRaw: ${result.stdout.slice(0, 300)}`, error: true };
    }
  },
};
