/**
 * Skill safety - blocklist de comandos/argumentos perigosos.
 *
 * MVP: bloqueia padrões óbvios destrutivos.
 * C10 fix: padroes expandidos para cobrir encoding bypass, exfilt de rede
 *          e persistencia (schtasks, run keys).
 * M6 fix: bloqueia network exfiltration (Invoke-WebRequest, Start-BitsTransfer).
 * Fase 6: substitui por approval flow + audit log + whitelist por usuario.
 *
 * NOTA: blocklist regex NAO e suficiente contra adversario sofisticado.
 * Para uso empresarial real, trocar por parser AST de PowerShell (PSScriptAnalyzer)
 * ou rodar scripts em container sem rede + filesystem isolado.
 */

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // ---------- Apagar/sobrescrever ----------
  { pattern: /\bRemove-Item\b.*-Recurse/i, reason: 'Remove-Item -Recurse bloqueado (Fase 6 vai adicionar approval)' },
  { pattern: /\brm\s+-rf\b/i, reason: 'rm -rf bloqueado' },
  { pattern: /\bdel\s+/i, reason: 'del bloqueado' },
  { pattern: /\bRemove-Item\b.*-Force/i, reason: 'Remove-Item -Force bloqueado' },
  { pattern: /\bdel\s+\/[sqf]/i, reason: 'del /s ou /q bloqueado (recursivo)' },
  { pattern: /\brmdir\s+\/s/i, reason: 'rmdir /s bloqueado' },

  // ---------- Disco/formatacao ----------
  { pattern: /\bFormat-Volume\b/i, reason: 'Format-Volume bloqueado' },
  { pattern: /\bClear-Disk\b/i, reason: 'Clear-Disk bloqueado' },
  { pattern: /\bdiskpart\b/i, reason: 'diskpart bloqueado' },

  // ---------- Usuarios/senhas ----------
  { pattern: /\bSet-LocalUser\b/i, reason: 'Set-LocalUser bloqueado (gerenciamento de usuarios)' },
  { pattern: /\bNew-LocalUser\b/i, reason: 'New-LocalUser bloqueado' },
  { pattern: /\bnet\s+user\b/i, reason: 'net user bloqueado' },
  { pattern: /\bnet\s+localgroup\b/i, reason: 'net localgroup bloqueado' },

  // ---------- Registry destrutivo ----------
  { pattern: /\bremove-itemproperty.*HKLM/i, reason: 'Edicao de HKLM bloqueada' },
  { pattern: /\bSet-ItemProperty.*HKLM/i, reason: 'Set-ItemProperty HKLM bloqueado' },
  { pattern: /\bNew-Item.*HKLM:\\.+\\(Run|RunOnce)/i, reason: 'Criacao de Run key persistente bloqueada' },

  // ---------- Shutdown/restart ----------
  { pattern: /\bStop-Computer\b/i, reason: 'Stop-Computer bloqueado' },
  { pattern: /\bRestart-Computer\b/i, reason: 'Restart-Computer bloqueado' },
  { pattern: /\bshutdown\b/i, reason: 'shutdown bloqueado' },

  // ---------- RCE / pipe pra shell ----------
  { pattern: /\bcurl\b.*\|\s*bash/i, reason: 'curl|bash bloqueado' },
  { pattern: /\biwr\b.*\|\s*iex/i, reason: 'iwr|iex bloqueado' },
  { pattern: /\bInvoke-Expression\b/i, reason: 'Invoke-Expression (iex) bloqueado' },
  { pattern: /\bDownloadString\b/i, reason: 'DownloadString (WebClient) bloqueado' },

  // ---------- Network exfiltration (M6) ----------
  { pattern: /\bInvoke-WebRequest\b/i, reason: 'Invoke-WebRequest bloqueado (exfil de rede)' },
  { pattern: /\bInvoke-RestMethod\b/i, reason: 'Invoke-RestMethod bloqueado (exfil de rede)' },
  { pattern: /\bStart-BitsTransfer\b/i, reason: 'Start-BitsTransfer bloqueado (downloader)' },
  { pattern: /\bWebClient\b/i, reason: 'WebClient bloqueado' },
  { pattern: /\bNet\.WebClient\b/i, reason: 'Net.WebClient bloqueado' },
  { pattern: /\bnslookup\b/i, reason: 'nslookup bloqueado (DNS exfil)' },

  // ---------- Persistencia (C10) ----------
  { pattern: /\bschtasks\b/i, reason: 'schtasks bloqueado (criacao de scheduled task)' },
  { pattern: /\bNew-ScheduledTask\b/i, reason: 'New-ScheduledTask bloqueado' },
  { pattern: /\bRegister-ScheduledTask\b/i, reason: 'Register-ScheduledTask bloqueado' },
  { pattern: /\bNew-Service\b/i, reason: 'New-Service bloqueado (instalacao de servico Windows)' },
  { pattern: /\bsc\.exe\s+create\b/i, reason: 'sc create bloqueado (criacao de servico)' },

  // ---------- Execution policy bypass ----------
  { pattern: /\bSet-ExecutionPolicy\s+Bypass/i, reason: 'Set-ExecutionPolicy Bypass bloqueado' },
  { pattern: /\bSet-MpPreference\b.*-DisableRealtimeMonitoring/i, reason: 'Desativar Defender bloqueado' },

  // ---------- C10 fix: encoding bypass ----------
  // Base64 decode + execute (PowerShell: -EncodedCommand, FromBase64String)
  { pattern: /\bFromBase64String\b/i, reason: 'FromBase64String bloqueado (encoding bypass)' },
  { pattern: /\b-DecodedCommand\b/i, reason: '-EncodedCommand/-DecodedCommand bloqueado (bypass)' },
  { pattern: /\b-ENC\b/i, reason: '-EncodedCommand/-ENC bloqueado (bypass)' },
  // Hex / char arrays (obfuscação clássica em PowerShell)
  { pattern: /\bchar\[\]\s*$/i, reason: 'Char array (obfuscação) bloqueado' },
  // Invoke com string concatenada (bypass via concat)
  { pattern: /\[\s*char\s*\]\s*\d+/i, reason: 'Char code em array (obfuscação) bloqueado' },
  // Reflection / dynamic type loading
  { pattern: /\bAdd-Type\b.*-TypeDefinition/i, reason: 'Add-Type -TypeDefinition bloqueado (RCE pattern)' },
  // Reflection via .NET
  { pattern: /\bReflection\.Assembly\b/i, reason: 'Reflection.Assembly bloqueado (RCE pattern)' },
];

export interface SafetyCheck {
  safe: boolean;
  reason?: string;
}

/**
 * Verifica se um script PowerShell (ou comando) tem padrão perigoso.
 * Retorna {safe: true} se ok, {safe: false, reason} se bloqueado.
 *
 * Limitacoes conhecidas (TODO Fase 6):
 *  - Nao pega encoding via XOR ou crypt
 *  - Nao pega download + IEX em arquivos separados
 *  - Nao pega PowerShell baixado de outro lugar
 *  Para SaaS enterprise, usar parser AST ou sandbox.
 */
export function checkSafety(script: string): SafetyCheck {
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(script)) {
      return { safe: false, reason };
    }
  }
  return { safe: true };
}
