/**
 * app_launcher_open - abre um aplicativo, URL ou arquivo com o app padrao.
 *
 * MVP: apenas Start-Process (idempotente). Sem instalacao/desinstalacao.
 */

import type { Skill } from '../types.js';
import { execPowerShell, escapePsString } from '../powershell.js';

export const appLauncherOpen: Skill = {
  name: 'app_launcher_open',
  description:
    'Abre um aplicativo, URL ou arquivo no Windows usando o programa padrao. ' +
    'Para URLs, aceita http/https. Para arquivos, abre com o app associado a extensao. ' +
    'Para apps conhecidos, pode usar o nome (ex: "notepad", "calc", "chrome").',
  category: 'app',
  parameters: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'O que abrir: URL (https://...), caminho de arquivo (C:\\...) ou nome de app (notepad, calc, etc).',
      },
    },
    required: ['target'],
  },
  async execute(args) {
    const target = String(args.target || '').trim();
    if (!target) {
      return { content: 'Erro: target vazio', error: true };
    }

    // Validacao basica
    if (target.length > 2048) {
      return { content: 'Erro: target muito longo (max 2048 chars)', error: true };
    }

    const safeTarget = escapePsString(target);
    const script = `
$ErrorActionPreference = 'Stop'
try {
  Start-Process -FilePath "${safeTarget}" -ErrorAction Stop
  return @{ ok = $true; target = "${safeTarget}" } | ConvertTo-Json -Compress
} catch {
  return @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`.trim();

    const result = await execPowerShell(script, { timeoutMs: 10_000 });

    if (result.timedOut) return { content: 'Erro: timeout ao abrir', error: true };
    try {
      const parsed = JSON.parse(result.stdout || '{}');
      if (parsed.error) {
        return { content: `Erro abrindo ${target}: ${parsed.error}`, error: true };
      }
      return { content: `Abriu: ${target}` };
    } catch (err) {
      return { content: `Erro: ${(err as Error).message}`, error: true };
    }
  },
};
