/**
 * office_word_read - extrai texto de um documento Word via mammoth (pure-Node).
 *
 * NAO requer Microsoft Word instalado.
 * Funciona em qualquer PC Windows, Mac ou Linux.
 * Suporta .docx (formato moderno). Para .doc antigo, nao suportado.
 *
 * WRITE esta em office-word-write.ts (tambem pure-Node).
 */

import type { Skill } from '../types.js';
import mammoth from 'mammoth';

export const officeWordRead: Skill = {
  name: 'office_word_read',
  description:
    'Extrai texto de um documento Word (.docx). ' +
    'NAO requer Microsoft Word instalado (usa mammoth pure-Node). ' +
    'Retorna o texto extraido (sem formatacao). ' +
    'Use quando o usuario pedir para abrir, ler, ou extrair texto de um documento Word.',
  category: 'office',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Caminho completo do arquivo Word (ex: C:\\Users\\Nome\\documento.docx).',
      },
      maxChars: {
        type: 'number',
        description: 'Maximo de caracteres a retornar (default 10000, max 200000).',
        default: 10000,
      },
    },
    required: ['path'],
  },
  async execute(args) {
    const rawPath = String(args.path || '').trim();
    const maxChars = Math.min(Number(args.maxChars) || 10000, 200000);

    if (!rawPath) return { content: 'Erro: path vazio', error: true };

    try {
      const result = await mammoth.extractRawText({ path: rawPath });
      let text = result.value || '';

      // Mammoth retorna \n\n entre paragrafos; mantem
      const totalLength = text.length;
      if (text.length > maxChars) {
        text = text.substring(0, maxChars);
      }

      const preview = text.split('\n').slice(0, 30).join('\n');
      const more =
        totalLength > maxChars
          ? `\n... +${totalLength - maxChars} caracteres omitidos`
          : totalLength > preview.length
          ? `\n... +${text.split('\n').length - 30} linhas omitidas`
          : '';

      const warnings = result.messages.length > 0
        ? `\n\nAvisos mammoth: ${result.messages.slice(0, 3).map(m => m.message).join('; ')}`
        : '';

      return {
        content: `Documento Word: ${totalLength} caracteres extraidos\n\n${preview}${more}${warnings}`,
        data: { length: totalLength, truncated: totalLength > maxChars, text, warnings: result.messages.map(m => m.message) },
      };
    } catch (err) {
      return {
        content: `Erro lendo Word: ${(err as Error).message}. Verifique se o arquivo existe e e um .docx valido.`,
        error: true,
      };
    }
  },
};
