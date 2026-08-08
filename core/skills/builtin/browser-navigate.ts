/**
 * browser_navigate - abre URL no navegador padrao do Windows.
 *
 * Complementa app_launcher_open: este e otimizado pra URLs
 * (valida scheme http/https, opcionalmente faz busca Google).
 *
 * MVP: nao controla browser headless. Fase 5+ adiciona Playwright/puppeteer
 * pra scraping/automatizacao de verdade.
 */

import type { Skill } from '../types.js';
import { execPowerShell, escapePsString } from '../powershell.js';

export const browserNavigate: Skill = {
  name: 'browser_navigate',
  description:
    'Abre uma URL no navegador padrao do Windows, OU faz uma busca no Google. ' +
    'Para URLs: aceita http/https. Para busca: passe query e o LLM monta ' +
    'https://www.google.com/search?q=... . ' +
    'Use quando o usuario pedir "abre isso no navegador", "pesquisa X", "vai pra esse site".',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL completa a abrir (https://exemplo.com/pagina). Se vazia, use query para busca.',
      },
      query: {
        type: 'string',
        description: 'Termo de busca. Se informado, abre https://www.google.com/search?q=<termo>.',
      },
    },
  },
  async execute(args) {
    const rawUrl = String(args.url || '').trim();
    const rawQuery = String(args.query || '').trim();

    if (!rawUrl && !rawQuery) {
      return { content: 'Erro: informe url ou query', error: true };
    }

    let finalUrl: string;
    if (rawUrl) {
      // Valida scheme
      if (!/^https?:\/\//i.test(rawUrl)) {
        return { content: `Erro: URL deve comecar com http:// ou https://. Recebido: ${rawUrl}`, error: true };
      }
      if (rawUrl.length > 2048) {
        return { content: 'Erro: URL muito longa (max 2048)', error: true };
      }
      finalUrl = rawUrl;
    } else {
      // Build Google search URL
      const encoded = encodeURIComponent(rawQuery);
      finalUrl = `https://www.google.com/search?q=${encoded}`;
    }

    const safeUrl = escapePsString(finalUrl);
    const script = `
$ErrorActionPreference = 'Stop'
try {
  Start-Process -FilePath "${safeUrl}" -ErrorAction Stop
  return @{ ok = $true; url = "${safeUrl}" } | ConvertTo-Json -Compress
} catch {
  return @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`.trim();

    const result = await execPowerShell(script, { timeoutMs: 10_000 });

    if (result.timedOut) return { content: 'Erro: timeout abrindo navegador', error: true };
    try {
      const parsed = JSON.parse(result.stdout || '{}');
      if (parsed.error) {
        return { content: `Erro abrindo navegador: ${parsed.error}`, error: true };
      }
      return {
        content: rawQuery ? `Busca aberta: "${rawQuery}" -> ${finalUrl}` : `Navegador aberto: ${finalUrl}`,
        data: { url: finalUrl, query: rawQuery || null },
      };
    } catch (err) {
      return { content: `Erro: ${(err as Error).message}`, error: true };
    }
  },
};
