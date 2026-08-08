/**
 * office_word_write - preenche um template Word com placeholders {{chave}}.
 *
 * Operacoes:
 *  - fill_template: copia o template, faz Find/Replace em {{chave}} -> valor, salva no output.
 *    Aceita replacements como objeto {chave: valor} ou como array [{find, replace}].
 *
 * Requer Microsoft Word instalado (interop COM).
 * Mantem formatacao original do template (apenas troca o texto dos placeholders).
 */

import type { Skill } from '../types.js';
import { execPowerShell, escapePsString } from '../powershell.js';

export const officeWordWrite: Skill = {
  name: 'office_word_write',
  description:
    'Preenche um template Word (.docx) com placeholders no formato {{chave}}. ' +
    'Copia o template, substitui cada {{chave}} pelo valor correspondente e salva em outputPath. ' +
    'Aceita replacements como objeto {nome: "Joao", valor: "500", data: "01/01/2026"}. ' +
    'Mantem formatacao original (fontes, paragrafos, estilos). ' +
    'Use para gerar cartas, contratos, recibos, declaracoes a partir de templates. ' +
    'Requer Microsoft Word instalado.',
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
    },
    required: ['templatePath', 'outputPath', 'replacements'],
  },
  async execute(args) {
    const templatePath = String(args.templatePath || '').trim();
    const outputPath = String(args.outputPath || '').trim();
    const replacements = args.replacements;

    if (!templatePath) return { content: 'Erro: templatePath vazio', error: true };
    if (!outputPath) return { content: 'Erro: outputPath vazio', error: true };
    if (!replacements || typeof replacements !== 'object' || Array.isArray(replacements)) {
      return { content: 'Erro: replacements deve ser um objeto {chave: valor}', error: true };
    }

    const entries = Object.entries(replacements as Record<string, unknown>);
    if (entries.length === 0) {
      return { content: 'Erro: replacements vazio (nada para substituir)', error: true };
    }

    const safeTemplate = escapePsString(templatePath);
    const safeOutput = escapePsString(outputPath);

    // Construir hashtable PS @{
    const psHash =
      '@{' +
      entries
        .map(([k, v]) => {
          const valueStr = typeof v === 'string' ? `"${escapePsString(v)}"` : String(v);
          return `"${escapePsString(k)}" = ${valueStr}`;
        })
        .join('; ') +
      '}';

    // Construir array de pares [find, replace] pros Find/Replace
    // Cada par vira uma hashtable PS @{find="..."; replace="..."}
    const pairs = entries.map(([k, v]) => {
      const find = escapePsString(`{{${k}}}`);
      const valueStr = typeof v === 'string' ? `"${escapePsString(v)}"` : String(v);
      return `@{ find = "${find}"; replace = ${valueStr} }`;
    });
    const psPairs = '@(' + pairs.join('; ') + ')';

    const script = `
$ErrorActionPreference = 'Stop'
$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application -ErrorAction Stop
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open("${safeTemplate}", $false, $true)
  $replacements = ${psHash}
  $pairs = ${psPairs}
  $applied = @()

  foreach ($pair in $pairs) {
    $findText = $pair.find
    $replaceText = $pair.replace
    $find = $doc.Content.Find
    $find.ClearFormatting()
    $find.Replacement.ClearFormatting()
    $find.Text = $findText
    $find.Replacement.Text = $replaceText
    $find.Forward = $true
    $find.Wrap = 1  # wdFindContinue
    $find.Format = $false
    $find.MatchCase = $false
    $find.MatchWholeWord = $false
    $find.MatchWildcards = $false
    $find.MatchSoundsLike = $false
    $find.MatchAllWordForms = $false
    $executed = $find.Execute($findText, $false, $false, $false, $false, $false, $true, 1, $false, $replaceText, 2)
    if ($executed) { $applied += @{ find = $findText; replace = $replaceText } }
  }

  $doc.SaveAs2("${safeOutput}", 16)
  $doc.Close($false)
  $word.Quit()
  return @{
    output = "${safeOutput}"
    requestedReplacements = $pairs.Count
    applied = $applied.Count
    details = $applied
  } | ConvertTo-Json -Depth 5 -Compress
} catch {
  return @{ error = $_.Exception.Message; line = $_.InvocationInfo.ScriptLineNumber } | ConvertTo-Json -Compress
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
      return {
        content: 'Erro: timeout preenchendo Word (60s). Arquivo muito grande ou Word nao respondeu.',
        error: true,
      };
    }
    if (!result.stdout) {
      return {
        content: `Erro PowerShell: ${result.stderr || 'sem output (Word instalado?)'}`,
        error: true,
      };
    }

    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.error) {
        return {
          content: `Erro Word: ${parsed.error}${parsed.line ? ' (linha ' + parsed.line + ')' : ''}`,
          error: true,
        };
      }

      const missing = parsed.requestedReplacements - parsed.applied;
      let msg = `Documento preenchido salvo em: ${parsed.output}\n`;
      msg += `Substituicoes aplicadas: ${parsed.applied}/${parsed.requestedReplacements}`;
      if (missing > 0) {
        msg += `\nAviso: ${missing} placeholder(s) nao encontrados no template. Verifique os nomes (case-insensitive).`;
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
