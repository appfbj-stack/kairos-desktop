/**
 * office_excel_write - escreve dados em uma planilha Excel via COM.
 *
 * Operacoes suportadas:
 *  - set_cell: define valor de uma celula especifica (A1 notation)
 *  - add_row: adiciona linha de dados apos a ultima linha com conteudo
 *  - add_header: escreve cabecalho na linha 1 (substitui se ja existir)
 *  - create_sheet: cria nova aba
 *
 * Requer Microsoft Excel instalado (interop COM).
 * CUIDADO: operacao destrutiva - modifica o arquivo. Em Fase 6 vai ter approval flow.
 */

import type { Skill } from '../types.js';
import { execPowerShell, escapePsString } from '../powershell.js';

/**
 * Serializa valor JS para representacao PS-side.
 * Aceita: string, number, boolean, null, Date, array.
 */
function psValue(v: unknown): string {
  if (v === null || v === undefined) return '$null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().split('T')[0]; // YYYY-MM-DD
  if (Array.isArray(v)) {
    const items = v.map((x) => psValue(x)).join(',');
    return `@(${items})`;
  }
  // string: aspas duplas escapadas
  return `"${escapePsString(String(v))}"`;
}

export const officeExcelWrite: Skill = {
  name: 'office_excel_write',
  description:
    'Escreve dados em uma planilha Excel (.xlsx, .xls). ' +
    'Suporta: set_cell (uma celula), add_row (linha de valores), add_header (cabecalho), create_sheet (nova aba). ' +
    'Use quando o usuario pedir para preencher, atualizar, ou criar dados em uma planilha. ' +
    'Requer Microsoft Excel instalado. Operacao modifica o arquivo - usar com cuidado.',
  category: 'office',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Caminho completo do arquivo Excel.',
      },
      operation: {
        type: 'string',
        enum: ['set_cell', 'add_row', 'add_header', 'create_sheet'],
        description: 'Tipo de operacao a executar.',
      },
      sheet: {
        type: 'string',
        description: 'Nome da aba (default: aba ativa / primeira).',
      },
      cell: {
        type: 'string',
        description: 'Referencia da celula em formato A1 (apenas para set_cell). Ex: B5, A1, C10.',
      },
      value: {
        type: 'string',
        description: 'Valor a escrever (apenas para set_cell). Pode ser string, number, boolean ou null. Serializado automaticamente.',
      },
      row: {
        type: 'array',
        description: 'Array de valores para add_row. Cada item pode ser string, number, boolean ou null.',
        items: {
          type: 'string',
        },
      },
      headers: {
        type: 'array',
        description: 'Array de strings para add_header (cabecalhos das colunas).',
        items: {
          type: 'string',
        },
      },
      sheetName: {
        type: 'string',
        description: 'Nome da nova aba (apenas para create_sheet).',
      },
    },
    required: ['path', 'operation'],
  },
  async execute(args) {
    const rawPath = String(args.path || '').trim();
    const operation = String(args.operation || '').trim();
    const sheet = args.sheet ? String(args.sheet) : '';
    const cell = args.cell ? String(args.cell).toUpperCase() : '';
    const value = args.value;
    const row = args.row;
    const headers = args.headers;
    const sheetName = args.sheetName ? String(args.sheetName) : '';

    if (!rawPath) return { content: 'Erro: path vazio', error: true };
    if (!operation) return { content: 'Erro: operation obrigatoria', error: true };

    // Validacoes por operacao
    if (operation === 'set_cell') {
      if (!cell) return { content: 'Erro: cell obrigatorio para set_cell (ex: B5)', error: true };
      if (value === undefined) return { content: 'Erro: value obrigatorio para set_cell', error: true };
    } else if (operation === 'add_row') {
      if (!Array.isArray(row)) return { content: 'Erro: row deve ser array para add_row', error: true };
    } else if (operation === 'add_header') {
      if (!Array.isArray(headers)) return { content: 'Erro: headers deve ser array para add_header', error: true };
    } else if (operation === 'create_sheet') {
      if (!sheetName) return { content: 'Erro: sheetName obrigatorio para create_sheet', error: true };
    } else {
      return { content: `Erro: operation desconhecida: ${operation}`, error: true };
    }

    const safePath = escapePsString(rawPath);
    const safeSheet = sheet ? escapePsString(sheet) : '';
    const safeCell = escapePsString(cell);
    const safeSheetName = escapePsString(sheetName);
    const psValueStr = value !== undefined ? psValue(value) : '$null';

    // Serializar row e headers como arrays PS
    const psRow =
      Array.isArray(row)
        ? '@(' + row.map((v) => psValue(v)).join(',') + ')'
        : '$null';
    const psHeaders =
      Array.isArray(headers)
        ? '@(' + headers.map((v) => psValue(v)).join(',') + ')'
        : '$null';

    const script = `
$ErrorActionPreference = 'Stop'
$excel = $null
$wb = $null
try {
  $excel = New-Object -ComObject Excel.Application -ErrorAction Stop
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open("${safePath}", $false, $false)
  $op = "${operation}"
  $result = @{ operation = $op }

  if ($op -eq "set_cell") {
    $ws = if ("${safeSheet}") { $wb.Worksheets.Item("${safeSheet}") } else { $wb.Worksheets.Item(1) }
    $cellRef = $ws.Range("${safeCell}")
    $cellRef.Value2 = ${psValueStr}
    $result.cell = "${safeCell}"
    $result.value = ${psValueStr}
    $result.sheet = $ws.Name

  } elseif ($op -eq "add_row") {
    $ws = if ("${safeSheet}") { $wb.Worksheets.Item("${safeSheet}") } else { $wb.Worksheets.Item(1) }
    $usedRange = $ws.UsedRange
    $lastRow = if ($null -ne $usedRange -and $usedRange.Rows.Count -gt 0) { $usedRange.Rows.Count + 1 } else { 1 }
    $rowData = ${psRow}
    for ($i = 0; $i -lt $rowData.Count; $i++) {
      $ws.Cells.Item($lastRow, $i + 1).Value2 = $rowData[$i]
    }
    $result.sheet = $ws.Name
    $result.rowWritten = $lastRow
    $result.colsWritten = $rowData.Count

  } elseif ($op -eq "add_header") {
    $ws = if ("${safeSheet}") { $wb.Worksheets.Item("${safeSheet}") } else { $wb.Worksheets.Item(1) }
    $hdrs = ${psHeaders}
    for ($i = 0; $i -lt $hdrs.Count; $i++) {
      $cell = $ws.Cells.Item(1, $i + 1)
      $cell.Value2 = $hdrs[$i]
      $cell.Font.Bold = $true
    }
    $result.sheet = $ws.Name
    $result.headersWritten = $hdrs.Count

  } elseif ($op -eq "create_sheet") {
    $existing = $wb.Worksheets.Item("${safeSheetName}")
    if ($null -ne $existing) {
      $result.warning = "Aba ja existia"
    } else {
      $newWs = $wb.Worksheets.Add()
      $newWs.Name = "${safeSheetName}"
      $result.created = $true
    }
    $result.sheet = "${safeSheetName}"
  }

  $wb.Save()
  $wb.Close($false)
  $excel.Quit()
  return $result | ConvertTo-Json -Depth 5 -Compress
} catch {
  return @{ error = $_.Exception.Message; line = $_.InvocationInfo.ScriptLineNumber } | ConvertTo-Json -Compress
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
      return {
        content: 'Erro: timeout escrevendo Excel (60s). Arquivo muito grande ou Excel nao respondeu.',
        error: true,
      };
    }
    if (!result.stdout) {
      return {
        content: `Erro PowerShell: ${result.stderr || 'sem output (Excel instalado?)'}`,
        error: true,
      };
    }

    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.error) {
        return {
          content: `Erro Excel: ${parsed.error}${parsed.line ? ' (linha ' + parsed.line + ')' : ''}`,
          error: true,
        };
      }

      // Mensagem human-friendly por operacao
      let msg = '';
      if (parsed.operation === 'set_cell') {
        msg = `Celula ${parsed.cell} da aba "${parsed.sheet}" definida com sucesso.`;
      } else if (parsed.operation === 'add_row') {
        msg = `Linha ${parsed.rowWritten} adicionada na aba "${parsed.sheet}" (${parsed.colsWritten} colunas).`;
      } else if (parsed.operation === 'add_header') {
        msg = `Cabecalho escrito na aba "${parsed.sheet}" (${parsed.headersWritten} colunas, em negrito).`;
      } else if (parsed.operation === 'create_sheet') {
        msg = parsed.warning
          ? `Aba "${parsed.sheet}" ja existia.`
          : `Aba "${parsed.sheet}" criada com sucesso.`;
      } else {
        msg = `Operacao ${parsed.operation} executada.`;
      }

      return { content: msg, data: parsed };
    } catch (err) {
      return {
        content: `Erro parseando resposta: ${(err as Error).message}\nRaw: ${result.stdout.slice(0, 300)}`,
        error: true,
      };
    }
  },
};
