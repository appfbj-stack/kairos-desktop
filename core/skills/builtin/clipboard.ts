/**
 * clipboard - le e escreve no clipboard do Windows.
 *
 * Usa Get-Clipboard / Set-Clipboard (PowerShell 5+, nativo).
 * Write sobrescreve o clipboard atual do usuario - consciente disso
 * (Fase 6 adiciona approval flow se virar problema).
 */

import type { Skill } from '../types.js';
import { execPowerShell, escapePsString } from '../powershell.js';

export const clipboardRead: Skill = {
  name: 'clipboard_read',
  description:
    'Le o conteudo atual do clipboard do Windows (texto). ' +
    'Retorna string (pode estar vazia se clipboard nao tem texto). ' +
    'Use quando o usuario pedir "o que tem no clipboard", "o que copiei", etc.',
  category: 'clipboard',
  parameters: {
    type: 'object',
    properties: {
      maxChars: {
        type: 'number',
        description: 'Maximo de caracteres a retornar (default 10000, max 50000).',
        default: 10000,
      },
    },
  },
  async execute(args) {
    const maxChars = Math.min(Number(args.maxChars) || 10_000, 50_000);

    const script = `
$ErrorActionPreference = 'Stop'
try {
  $text = Get-Clipboard -Raw -ErrorAction Stop
  if ($null -eq $text) { $text = '' }
  $truncated = $false
  if ($text.Length -gt ${maxChars}) {
    $text = $text.Substring(0, ${maxChars}) + '...[truncated]'
    $truncated = $true
  }
  return @{
    length = $text.Length
    truncated = $truncated
    text = $text
  } | ConvertTo-Json -Depth 2 -Compress
} catch {
  return @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`.trim();

    const result = await execPowerShell(script, { timeoutMs: 10_000 });

    if (result.timedOut) return { content: 'Erro: timeout lendo clipboard', error: true };
    if (!result.stdout) return { content: `Erro: ${result.stderr || 'sem output'}`, error: true };

    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.error) return { content: `Erro: ${parsed.error}`, error: true };
      if (parsed.length === 0) {
        return { content: 'Clipboard vazio ou sem texto.' };
      }
      return {
        content: `Clipboard (${parsed.length} chars${parsed.truncated ? ', truncado' : ''}):\n\n${parsed.text}`,
        data: { length: parsed.length, truncated: parsed.truncated },
      };
    } catch (err) {
      return { content: `Erro parseando: ${(err as Error).message}`, error: true };
    }
  },
};

export const clipboardWrite: Skill = {
  name: 'clipboard_write',
  description:
    'Escreve texto no clipboard do Windows (substitui o conteudo atual). ' +
    'Use quando o usuario pedir "copia X pro clipboard", "cola isso", "deixa isso na area de transferencia".',
  category: 'clipboard',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Texto a colocar no clipboard.',
      },
    },
    required: ['text'],
  },
  async execute(args) {
    const text = String(args.text ?? '');

    if (text.length > 1_000_000) {
      return { content: 'Erro: texto muito grande (max 1MB)', error: true };
    }

    const safeText = escapePsString(text);
    const script = `
$ErrorActionPreference = 'Stop'
try {
  Set-Clipboard -Value "${safeText}" -ErrorAction Stop
  return @{ ok = $true; length = ${text.length} } | ConvertTo-Json -Compress
} catch {
  return @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`.trim();

    const result = await execPowerShell(script, { timeoutMs: 10_000 });

    if (result.timedOut) return { content: 'Erro: timeout escrevendo clipboard', error: true };
    try {
      const parsed = JSON.parse(result.stdout || '{}');
      if (parsed.error) return { content: `Erro: ${parsed.error}`, error: true };
      return { content: `Clipboard atualizado com ${text.length} caracteres.` };
    } catch (err) {
      return { content: `Erro: ${(err as Error).message}`, error: true };
    }
  },
};
