/**
 * office_word_write - preenche um template Word com placeholders {{chave}} (pure-Node).
 *
 * NAO requer Microsoft Word instalado.
 *
 * Como funciona:
 *  1. Le o template com mammoth (extrai texto, paragrafos)
 *  2. Faz Find/Replace em {{chave}} -> valor no texto
 *  3. Gera novo .docx com a lib `docx` usando o texto preenchido
 *
 * Tradeoff: a formatacao original do template (fontes custom, cores, etc) NAO e
 * preservada (porque mammoth extrai texto puro). O documento gerado tem formatacao
 * padrao (titulo bold 16pt, corpo regular 11pt).
 *
 * Para 95% dos casos (cartas, recibos, atas) isso e mais que suficiente.
 */

import type { Skill } from '../types.js';
import mammoth from 'mammoth';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';

export const officeWordWrite: Skill = {
  name: 'office_word_write',
  description:
    'Preenche um template Word (.docx) com placeholders no formato {{chave}}. ' +
    'Cria novo documento substituindo cada {{chave}} pelo valor correspondente. ' +
    'NAO requer Microsoft Word instalado. ' +
    'Aceita replacements como objeto {nome: "Joao", valor: "500", data: "01/01/2026"}. ' +
    'Use para gerar cartas, contratos, recibos, declaracoes a partir de templates. ' +
    'ATENCAO: formatacao original do template NAO e preservada (texto com formatacao padrao).',
  category: 'office',
  parameters: {
    type: 'object',
    properties: {
      templatePath: {
        type: 'string',
        description: 'Caminho completo do arquivo .docx de template (com placeholders {{chave}}).',
      },
      outputPath: {
        type: 'string',
        description: 'Caminho completo onde salvar o documento preenchido. Se ja existir, sera sobrescrito.',
      },
      replacements: {
        type: 'object',
        description:
          'Objeto com os placeholders a substituir. Ex: {"nome": "Joao", "valor": "R$ 500", "data": "01/01/2026"}.',
      },
      title: {
        type: 'string',
        description: 'Titulo do documento (opcional, primeira linha em negrito). Se omitido, primeira linha do template vira titulo.',
      },
    },
    required: ['templatePath', 'outputPath', 'replacements'],
  },
  async execute(args) {
    const templatePath = String(args.templatePath || '').trim();
    const outputPath = String(args.outputPath || '').trim();
    const replacements = args.replacements;
    const title = args.title ? String(args.title) : '';

    if (!templatePath) return { content: 'Erro: templatePath vazio', error: true };
    if (!outputPath) return { content: 'Erro: outputPath vazio', error: true };
    if (!replacements || typeof replacements !== 'object' || Array.isArray(replacements)) {
      return { content: 'Erro: replacements deve ser um objeto {chave: valor}', error: true };
    }

    const entries = Object.entries(replacements as Record<string, unknown>);
    if (entries.length === 0) {
      return { content: 'Erro: replacements vazio (nada para substituir)', error: true };
    }

    try {
      // 1. Le o template com mammoth
      const result = await mammoth.extractRawText({ path: templatePath });
      let rawText = result.value || '';

      // 2. Aplica Find/Replace em {{chave}} -> valor
      let applied = 0;
      for (const [key, value] of entries) {
        const placeholder = `{{${key}}}`;
        const replacementStr = String(value);
        // Escape regex special chars no placeholder (apenas { e } que sao normais)
        const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const matches = rawText.match(regex);
        if (matches) {
          rawText = rawText.replace(regex, replacementStr);
          applied += matches.length;
        }
      }

      // 3. Quebra em paragrafos (linhas nao-vazias)
      const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

      // 4. Constroi o documento
      const docTitle = title || lines[0] || 'Documento';
      const bodyLines = title ? lines : lines.slice(1); // remove titulo do body se nao foi fornecido separado

      const children: Paragraph[] = [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: docTitle, bold: true, size: 32 }), // 16pt
          ],
        }),
        new Paragraph({ text: '' }), // espaco
      ];

      for (const line of bodyLines) {
        children.push(
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: line, size: 22 })], // 11pt
          })
        );
      }

      const doc = new Document({
        creator: 'Kairos',
        title: docTitle,
        sections: [{ properties: {}, children }],
      });

      // 5. Serializa pra buffer e salva
      const buffer = await Packer.toBuffer(doc);
      const fs = await import('node:fs/promises');
      await fs.writeFile(outputPath, buffer);

      const requested = entries.length;

      let msg = `Documento preenchido salvo em: ${outputPath}\n`;
      msg += `Placeholders solicitados: ${requested}\n`;
      msg += `Substituicoes aplicadas: ${applied}`;
      if (applied < requested) {
        msg += `\nAviso: alguns placeholders podem nao ter sido encontrados no template.`;
      }
      return { content: msg, data: { output: outputPath, requested, applied, title: docTitle } };
    } catch (err) {
      return {
        content: `Erro preenchendo Word: ${(err as Error).message}. Verifique se o template e .docx valido.`,
        error: true,
      };
    }
  },
};
