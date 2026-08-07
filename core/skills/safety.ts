/**
 * Skill safety - blocklist de comandos/argumentos perigosos.
 *
 * MVP: bloqueia padrões óbvios destrutivos.
 * Fase 6: substitui por approval flow + audit log + whitelist por usuario.
 */

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Apagar arquivos/pastas (recursivo)
  { pattern: /\bRemove-Item\b.*-Recurse/i, reason: 'Remove-Item -Recurse bloqueado (Fase 6 vai adicionar approval)' },
  { pattern: /\brm\s+-rf\b/i, reason: 'rm -rf bloqueado' },
  { pattern: /\bdel\s+/i, reason: 'del bloqueado' },
  { pattern: /\bRemove-Item\b.*-Force/i, reason: 'Remove-Item -Force bloqueado' },

  // Formatar/limpar disco
  { pattern: /\bFormat-Volume\b/i, reason: 'Format-Volume bloqueado' },
  { pattern: /\bClear-Disk\b/i, reason: 'Clear-Disk bloqueado' },
  { pattern: /\bdiskpart\b/i, reason: 'diskpart bloqueado' },

  // Gerenciar usuarios/senhas
  { pattern: /\bSet-LocalUser\b/i, reason: 'Set-LocalUser bloqueado (gerenciamento de usuarios)' },
  { pattern: /\bNew-LocalUser\b/i, reason: 'New-LocalUser bloqueado' },
  { pattern: /\bnet\s+user\b/i, reason: 'net user bloqueado' },

  // Registry destrutivo
  { pattern: /\bremove-itemproperty.*HKLM/i, reason: 'Edicao de HKLM bloqueada' },

  // Shutdown/restart
  { pattern: /\bStop-Computer\b/i, reason: 'Stop-Computer bloqueado' },
  { pattern: /\bRestart-Computer\b/i, reason: 'Restart-Computer bloqueado' },
  { pattern: /\bshutdown\b/i, reason: 'shutdown bloqueado' },

  // Curl/wget com pipe pra bash (RCE pattern)
  { pattern: /\bcurl\b.*\|\s*bash/i, reason: 'curl|bash bloqueado' },
  { pattern: /\biwr\b.*\|\s*iex/i, reason: 'iwr|iex bloqueado' },

  // Set-ExecutionPolicy destrutivo
  { pattern: /\bSet-ExecutionPolicy\s+Bypass/i, reason: 'Set-ExecutionPolicy Bypass bloqueado' },
];

export interface SafetyCheck {
  safe: boolean;
  reason?: string;
}

/**
 * Verifica se um script PowerShell (ou comando) tem padrão perigoso.
 * Retorna {safe: true} se ok, {safe: false, reason} se bloqueado.
 */
export function checkSafety(script: string): SafetyCheck {
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(script)) {
      return { safe: false, reason };
    }
  }
  return { safe: true };
}
