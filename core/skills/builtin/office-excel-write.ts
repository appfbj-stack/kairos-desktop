/**
 * office_excel_write - escreve dados em uma planilha Excel via exceljs (pure-Node).
 *
 * NAO requer Microsoft Excel instalado.
 * Operacoes:
 *  - set_cell: define valor de uma celula especifica (A1 notation)
 *  - add_row: adiciona linha de dados apos a ultima linha com conteudo
 *  - add_header: escreve cabecalho na linha 1 (substitui se ja existir)
 *  - create_sheet: cria nova aba
 *
 * CUIDADO: operacao modifica o arquivo. Em Fase 6 vai ter approval flow.
 */

import type { Skill } from '../types.js';
import ExcelJS from 'exceljs';

export const officeExcelWrite: Skill = {
  name: 'office_excel_write',
  description:
    'Escreve dados em uma planilha Excel (.xlsx). ' +
    'Suporta: set_cell (uma celula), add_row (linha de valores), add_header (cabecalho), create_sheet (nova aba). ' +
    'NAO requer Microsoft Excel instalado (usa exceljs pure-Node). ' +
    'Use quando o usuario pedir para preencher, atualizar, ou criar dados em uma planilha. ' +
    'Operacao modifica o arquivo - usar com cuidado.',
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
        description: 'Nome da aba (default: primeira aba).',
      },
      cell: {
        type: 'string',
        description: 'Referencia da celula em formato A1 (apenas para set_cell). Ex: B5, A1, C10.',
      },
      value: {
        type: 'string',
        description: 'Valor a escrever (apenas para set_cell). Pode ser string, number ou boolean. Serializado automaticamente.',
      },
      row: {
        type: 'array',
        description: 'Array de valores para add_row. Cada item pode ser string, number, boolean ou null.',
        items: { type: 'string' },
      },
      headers: {
        type: 'array',
        description: 'Array de strings para add_header (cabecalhos das colunas).',
        items: { type: 'string' },
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
    const sheetName = args.sheet ? String(args.sheet) : '';
    const cellRef = args.cell ? String(args.cell).toUpperCase() : '';
    const value = args.value;
    const row: unknown[] = Array.isArray(args.row) ? args.row : [];
    const headers: string[] = Array.isArray(args.headers) ? (args.headers as string[]) : [];
    const newSheetName = args.sheetName ? String(args.sheetName) : '';

    if (!rawPath) return { content: 'Erro: path vazio', error: true };
    if (!operation) return { content: 'Erro: operation obrigatoria', error: true };

    if (operation === 'set_cell') {
      if (!cellRef) return { content: 'Erro: cell obrigatorio para set_cell (ex: B5)', error: true };
      if (value === undefined) return { content: 'Erro: value obrigatorio para set_cell', error: true };
    } else if (operation === 'add_row') {
      if (!Array.isArray(row)) return { content: 'Erro: row deve ser array para add_row', error: true };
    } else if (operation === 'add_header') {
      if (!Array.isArray(headers)) return { content: 'Erro: headers deve ser array para add_header', error: true };
    } else if (operation === 'create_sheet') {
      if (!newSheetName) return { content: 'Erro: sheetName obrigatorio para create_sheet', error: true };
    } else {
      return { content: `Erro: operation desconhecida: ${operation}`, error: true };
    }

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(rawPath);

      const result: any = { operation };

      if (operation === 'set_cell') {
        const ws = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
        if (!ws) return { content: `Erro: aba "${sheetName || 'primeira'}" nao encontrada`, error: true };
        ws.getCell(cellRef).value = value as any;
        result.cell = cellRef;
        result.value = value;
        result.sheet = ws.name;

      } else if (operation === 'add_row') {
        const ws = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
        if (!ws) return { content: `Erro: aba "${sheetName || 'primeira'}" nao encontrada`, error: true };
        const lastRow = ws.rowCount > 0 ? ws.rowCount + 1 : 1;
        // exceljs e 1-indexed: getCell(1) = coluna A
        row.forEach((v, i) => {
          ws.getRow(lastRow).getCell(i + 1).value = v as any;
        });
        result.sheet = ws.name;
        result.rowWritten = lastRow;
        result.colsWritten = row.length;

      } else if (operation === 'add_header') {
        const ws = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
        if (!ws) return { content: `Erro: aba "${sheetName || 'primeira'}" nao encontrada`, error: true };
        const headerRow = ws.getRow(1);
        headers.forEach((h, i) => {
          const cell = headerRow.getCell(i + 1);
          cell.value = h;
          cell.font = { bold: true };
        });
        result.sheet = ws.name;
        result.headersWritten = headers.length;

      } else if (operation === 'create_sheet') {
        const existing = workbook.getWorksheet(newSheetName);
        if (existing) {
          result.warning = 'Aba ja existia';
        } else {
          workbook.addWorksheet(newSheetName);
          result.created = true;
        }
        result.sheet = newSheetName;
      }

      await workbook.xlsx.writeFile(rawPath);

      let msg = '';
      if (result.operation === 'set_cell') {
        msg = `Celula ${result.cell} da aba "${result.sheet}" definida com sucesso.`;
      } else if (result.operation === 'add_row') {
        msg = `Linha ${result.rowWritten} adicionada na aba "${result.sheet}" (${result.colsWritten} colunas).`;
      } else if (result.operation === 'add_header') {
        msg = `Cabecalho escrito na aba "${result.sheet}" (${result.headersWritten} colunas, em negrito).`;
      } else if (result.operation === 'create_sheet') {
        msg = result.warning
          ? `Aba "${result.sheet}" ja existia.`
          : `Aba "${result.sheet}" criada com sucesso.`;
      } else {
        msg = `Operacao ${result.operation} executada.`;
      }

      return { content: msg, data: result };
    } catch (err) {
      return {
        content: `Erro Excel: ${(err as Error).message}. Verifique se o arquivo existe e e um .xlsx valido.`,
        error: true,
      };
    }
  },
};
