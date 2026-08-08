/**
 * office_word_read - extrai texto de um documento Word (.docx, .doc) via COM.
 *
 * Requer Microsoft Word instalado.
 * Mantem Word em background via ReleaseComObject + quit pra nao deixar processo preso.
 *
 * WRITE esta fora do MVP (Fase 6 adiciona approval flow).
 */

import type { Skill } from '../types.js';
import { execPowerShell, escapePsString } from '../powershell.js';

export const officeWordRead: Skill = {
  name: 'office_word_read',
  description:
    'Extrai o texto de um documento Word (.docx, .doc, .rtf). ' +
    'Retorna o conteudo em texto puro (sem formatacao). ' +
    'Use quando o usuario pedir para ler, abrir, ou extrair texto de um documento Word. ' +
    'Requer Microsoft Word instalado.',
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
        description: 'Maximo de caracteres a retornar (default 20000, max 200000).',
        default: 20000,
      },
    },
    required: ['path'],
  },
  async execute(args) {
    const rawPath = String(args.path || '').trim();
    const maxChars = Math.min(Number(args.maxChars) || 20_000, 200_000);

    if (!rawPath) return { content: 'Erro: path vazio', error: true };

    const safePath = escapePsString(rawPath);
    const script = `
$ErrorActionPreference = 'Stop'
$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application -ErrorAction Stop
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open("${safePath}", $false, $true)
  $text = $doc.Content.Text
  $charCount = $text.Length
  $truncated = $false
  if ($text.Length -gt ${maxChars}) {
    $text = $text.Substring(0, ${maxChars}) + '...[truncated]'
    $truncated = $true
  }
  $doc.Close($false)
  $word.Quit()
  return @{
    charCount = $charCount
    truncated = $truncated
    text = $text
  } | ConvertTo-Json -Depth 3 -Compress
} catch {
  return @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
} finally {
  if ($null -ne $doc) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) }
  if ($null -ne $word) {
    $word.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
  [GC]::Collect()
}
`.trim();

    const result = await execPowerShell(script, { timeoutMs: 60_000 });

    if (result.timedOut) {
      return { content: 'Erro: timeout lendo Word (60s). Documento muito grande ou Word nao respondeu.', error: true };
    }
    if (!result.stdout) {
      return { content: `Erro PowerShell: ${result.stderr || 'sem output (Word instalado?)'}`, error: true };
    }

    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.error) {
        return { content: `Erro Word: ${parsed.error}. Verifique se o arquivo existe e Word esta instalado.`, error: true };
      }
      if (parsed.charCount === 0) {
        return { content: `Documento Word vazio ou sem texto extraivel: ${rawPath}` };
      }
      const preview = parsed.text.length > 1500
        ? parsed.text.slice(0, 1500) + `\n... [+${parsed.charCount - 1500} chars]`
        : parsed.text;
      return {
        content: `Word (${parsed.charCount} chars${parsed.truncated ? ', truncado' : ''}): ${rawPath}\n\n${preview}`,
        data: { charCount: parsed.charCount, truncated: parsed.truncated, path: rawPath },
      };
    } catch (err) {
      return { content: `Erro parseando: ${(err as Error).message}\nRaw: ${result.stdout.slice(0, 300)}`, error: true };
    }
  },
};
