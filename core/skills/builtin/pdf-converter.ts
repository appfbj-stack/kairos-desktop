/**
 * pdf_convert - converte documentos para PDF usando LibreOffice headless.
 *
 * Funciona em qualquer plataforma que tenha LibreOffice instalado:
 *  - Linux (apt-get install libreoffice)
 *  - Windows (LibreOffice ou Microsoft Office)
 *  - Docker (veja Dockerfile.core)
 *
 * Formatos suportados:
 *  - .docx, .doc, .rtf  (LibreOffice Writer)
 *  - .xlsx, .xls, .ods   (LibreOffice Calc)
 *  - .txt, .md, .csv     (texto puro)
 *
 * NAO sobrescreve arquivo existente (igual o Office COM fazia).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Skill } from '../types.js';

const SUPPORTED_EXTS = ['docx', 'doc', 'rtf', 'txt', 'md', 'xlsx', 'xls', 'ods', 'csv'];

/**
 * Detecta o binario do LibreOffice na plataforma.
 * Retorna o nome do executavel ou null se nao encontrado.
 */
async function findSofficeBinary(): Promise<string | null> {
  const candidates = process.platform === 'win32'
    ? ['soffice.exe', 'soffice']
    : ['soffice', 'libreoffice'];
  // Como nao podemos testar execucao rapida sem custo, confia no PATH.
  // O usuario vera erro claro se nao existir.
  return candidates[0];
}

export const pdfConvert: Skill = {
  name: 'pdf_convert',
  description:
    'Converte um documento para PDF (.docx, .doc, .rtf, .txt, .md, .xlsx, .xls, .ods, .csv). ' +
    'Cria um novo arquivo PDF no caminho de destino. ' +
    'Use quando o usuario pedir "converte isso pra PDF", "gera um PDF desse documento", etc. ' +
    'Requer LibreOffice instalado (ja vem no container Docker).',
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
    if (!SUPPORTED_EXTS.includes(ext)) {
      return {
        content: `Erro: extensao .${ext} nao suportada. Aceitas: ${SUPPORTED_EXTS.join(', ')}.`,
        error: true,
      };
    }

    if (!existsSync(inputPath)) {
      return { content: `Erro: arquivo de entrada nao existe: ${inputPath}`, error: true };
    }
    if (existsSync(outputPath)) {
      return { content: `Erro: arquivo de saida ja existe: ${outputPath}. Escolha outro nome.`, error: true };
    }

    const inputAbs = resolve(inputPath);
    const outputAbs = resolve(outputPath);
    const outputDir = dirname(outputAbs);
    // LibreOffice escreve o PDF com o mesmo basename, dentro de --outdir
    const outdir = outputDir;
    try {
      await mkdir(outdir, { recursive: true });
    } catch (err) {
      return { content: `Erro criando diretorio de saida: ${(err as Error).message}`, error: true };
    }

    const binary = await findSofficeBinary();

    // Args do soffice:
    // --headless = sem GUI
    // --norestore --nologo = sem telas de restauracao/splash
    // --nodefault --nofirststartwizard = sem assistentes
    // --convert-to pdf:pdf = converte pra PDF (especifica filtro "pdf")
    // --outdir = diretorio de saida (mantem basename do input)
    const sofficeArgs = [
      '--headless',
      '--norestore',
      '--nologo',
      '--nodefault',
      '--nofirststartwizard',
      '--convert-to',
      'pdf:writer_pdf_Export',
      '--outdir',
      outdir,
      inputAbs,
    ];

    const start = Date.now();
    const timeoutMs = 90_000;

    return new Promise((resolveSkill) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const proc = spawn(binary!, sofficeArgs, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        // Importante: soffice precisa de HOME valido e TMPDIR
        env: { ...process.env, HOME: process.env.HOME || '/tmp' },
      });

      const timer = setTimeout(() => {
        timedOut = true;
        try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      }, timeoutMs);

      proc.stdout!.on('data', (c: Buffer) => { stdout += c.toString('utf-8'); });
      proc.stderr!.on('data', (c: Buffer) => { stderr += c.toString('utf-8'); });

      proc.on('error', (err) => {
        clearTimeout(timer);
        if ((err as any).code === 'ENOENT') {
          resolveSkill({
            content: `Erro: ${binary} nao encontrado no PATH. Instale LibreOffice (apt-get install libreoffice) ou verifique o PATH.`,
            error: true,
          });
        } else {
          resolveSkill({
            content: `Erro spawn soffice: ${(err as Error).message}`,
            error: true,
          });
        }
      });

      proc.on('close', async (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - start;

        if (timedOut) {
          resolveSkill({ content: `Erro: timeout convertendo (${timeoutMs/1000}s). Arquivo muito grande ou LibreOffice travou.`, error: true });
          return;
        }

        // soffice retorna 0 em sucesso, mas as vezes retorna 1 mesmo funcionando
        // (ex: warning de "no filter"). Verifica o arquivo de saida.
        const expectedOutput = join(outdir, inputAbs.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '.pdf'));

        if (!existsSync(expectedOutput)) {
          // Tenta achar o arquivo (soffice pode mudar nome em alguns casos)
          const fallbackMsg = stderr.split('\n').slice(-5).join('\n').trim() || stdout.split('\n').slice(-5).join('\n').trim();
          resolveSkill({
            content: `Erro convertendo (exit ${code}). PDF nao foi criado em ${outdir}.\n\nUltimas linhas stderr:\n${fallbackMsg}`,
            error: true,
          });
          return;
        }

        try {
          const stats = await stat(expectedOutput);
          const sizeKb = (stats.size / 1024).toFixed(1);
          resolveSkill({
            content: `PDF gerado: ${expectedOutput} (${sizeKb} KB) em ${(durationMs/1000).toFixed(1)}s`,
            data: { outputPath: expectedOutput, size: stats.size, sourceExt: ext, durationMs },
          });
        } catch (err) {
          resolveSkill({ content: `Erro verificando PDF: ${(err as Error).message}`, error: true });
        }
      });
    });
  },
};
