/**
 * office_excel_read - le dados de uma planilha Excel via exceljs (pure-Node).
 *
 * NAO requer Microsoft Excel instalado.
 * Funciona em qualquer PC Windows, Mac ou Linux.
 * Suporta .xlsx, .xlsm, .xlsb, .xls.
 *
 * WRITE esta em office-excel-write.ts (tambem pure-Node).
 */

import type { Skill } from '../types.js';
import ExcelJS from 'exceljs';

export const officeExcelRead: Skill = {
  name: 'office_excel_read',
  description:
    'Le dados de uma planilha Excel (.xlsx, .xlsm, .xls, .xlsb). ' +
    'Retorna conteudo de uma aba como matriz de linhas/celulas. ' +
    'NÃO requer Microsoft Excel instalado (usa exceljs pure-Node). ' +
    'Use quando o usuario pedir para abrir, ler, ou extrair dados de uma planilha.',
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
    const sheetName = args.sheet ? String(args.sheet) : '';
    const maxRows = Math.min(Number(args.maxRows) || 100, 1000);

    if (!rawPath) return { content: 'Erro: path vazio', error: true };

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(rawPath);

      let worksheet: ExcelJS.Worksheet | undefined;
      if (sheetName) {
        worksheet = workbook.getWorksheet(sheetName);
        if (!worksheet) {
          const available = workbook.worksheets.map((w) => w.name).join(', ');
          return {
            content: `Erro: aba "${sheetName}" nao encontrada. Abas disponiveis: ${available}`,
            error: true,
          };
        }
      } else {
        worksheet = workbook.worksheets[0];
        if (!worksheet) {
          return { content: 'Erro: planilha nao tem abas', error: true };
        }
      }

      const safeWs = worksheet!;
      const actualSheetName = safeWs.name;
      const rowCount = Math.min(safeWs.rowCount, maxRows);
      const colCount = safeWs.columnCount;

      const rows: string[][] = [];
      safeWs.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > rowCount) return;
        const rowData: string[] = [];
        // Itera todas as colunas ate colCount (preenche vazios)
        for (let c = 1; c <= colCount; c++) {
          const cell = row.getCell(c);
          let val: string;
          if (cell.value === null || cell.value === undefined) {
            val = '';
          } else if (typeof cell.value === 'object') {
            // Formula, richText, hyperlink etc
            if ('result' in (cell.value as any)) {
              val = String((cell.value as any).result ?? '');
            } else if ('richText' in (cell.value as any)) {
              val = (cell.value as any).richText.map((r: any) => r.text).join('');
            } else if ('text' in (cell.value as any)) {
              val = String((cell.value as any).text);
            } else {
              val = String(cell.value);
            }
          } else {
            val = String(cell.value);
          }
          rowData.push(val);
        }
        rows.push(rowData);
      });

      const preview = rows
        .slice(0, 10)
        .map((row, i) => `L${i + 1}: ${row.slice(0, 8).join(' | ')}${row.length > 8 ? '...' : ''}`)
        .join('\n');
      const more = rows.length > 10 ? `\n... +${rows.length - 10} linhas` : '';

      return {
        content: `Planilha "${actualSheetName}": ${rows.length} linhas x ${colCount} cols\n\n${preview}${more}`,
        data: { sheet: actualSheetName, rowCount: rows.length, colCount, rows },
      };
    } catch (err) {
      return {
        content: `Erro lendo Excel: ${(err as Error).message}. Verifique se o arquivo existe e e um .xlsx valido.`,
        error: true,
      };
    }
  },
};
