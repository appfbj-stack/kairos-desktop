# Kairos Desktop - Setup do PC do usuario
# Habilita OpenSSH Server e adiciona chave publica do Kairos Core
# Rodar como ADMINISTRADOR no PowerShell

$ErrorActionPreference = 'Stop'
$pubkey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFz6PRnNaQG8dwHRP+o4zUhjsuzqMitIqjO66r580yOk kairos-core@srv1448020'

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  Kairos Desktop - Setup do PC' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

# 1. Habilitar OpenSSH Server
Write-Host '[1/4] Habilitando OpenSSH Server...' -ForegroundColor Yellow
try {
  $cap = Get-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' -ErrorAction Stop
  if ($cap.State -ne 'Installed') {
    Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' -ErrorAction Stop | Out-Null
  } else {
    Write-Host '  (ja instalado)'
  }
} catch {
  Write-Host "  ERRO ao instalar OpenSSH: $_" -ForegroundColor Red
  Write-Host '  Solucao alternativa: instale via Configuracoes > Apps > Recursos opcionais > OpenSSH Server' -ForegroundColor Yellow
  exit 1
}

# 2. Iniciar servico
Write-Host '[2/4] Iniciando servico sshd...' -ForegroundColor Yellow
try {
  Set-Service -Name sshd -StartupType 'Automatic' -ErrorAction Stop
  Start-Service sshd -ErrorAction Stop
  $svc = Get-Service sshd
  if ($svc.Status -ne 'Running') {
    throw "Servico sshd nao esta Running: $($svc.Status)"
  }
  Write-Host '  sshd: Running' -ForegroundColor Green
} catch {
  Write-Host "  ERRO: $_" -ForegroundColor Red
  exit 1
}

# 3. Firewall - abrir porta 22
Write-Host '[3/4] Abrindo porta 22 no firewall...' -ForegroundColor Yellow
try {
  $rule = Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue
  if (-not $rule) {
    New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -ErrorAction Stop | Out-Null
    Write-Host '  Regra criada' -ForegroundColor Green
  } else {
    Write-Host '  (regra ja existe)' -ForegroundColor Green
  }
} catch {
  Write-Host "  AVISO: $_" -ForegroundColor Yellow
}

# 4. Adicionar chave publica
Write-Host '[4/4] Adicionando chave publica do Kairos...' -ForegroundColor Yellow
try {
  $sshDir = Join-Path $env:USERPROFILE '.ssh'
  if (-not (Test-Path $sshDir)) {
    New-Item -Path $sshDir -ItemType Directory -Force | Out-Null
  }
  $authKeys = Join-Path $sshDir 'authorized_keys'
  $existing = if (Test-Path $authKeys) { Get-Content $authKeys -Raw } else { '' }
  if ($existing -match 'kairos-core@srv1448020') {
    Write-Host '  (chave ja estava adicionada)' -ForegroundColor Green
  } else {
    Add-Content -Path $authKeys -Value $pubkey -ErrorAction Stop
    Write-Host '  Chave adicionada' -ForegroundColor Green
  }
  # Permissao correta (SSH exige 600 no authorized_keys)
  $acl = Get-Acl $authKeys
  $acl.SetAccessRuleProtection($true, $false)
  $rule22 = New-Object System.Security.AccessControl.FileSystemAccessRule($env:USERNAME, 'FullControl', 'Allow')
  $acl.SetAccessRule($rule22)
  Set-Acl $authKeys $acl
  Write-Host '  Permissoes ajustadas' -ForegroundColor Green
} catch {
  Write-Host "  ERRO: $_" -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  Setup OK!' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ''
Write-Host 'Detalhes para o Kairos Core conectar:' -ForegroundColor Cyan
Write-Host "  IP Tailscale: $((tailscale ip -4 2>$null) -join ', ')"
Write-Host "  Usuario:      $env:USERNAME"
Write-Host "  SSH porta:    22"
Write-Host ''
