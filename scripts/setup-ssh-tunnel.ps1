# setup-ssh-tunnel.ps1
# Cria tunel SSH reverso do PC do Pastor pro VPS.
# Apos rodar, a skill ssh_remote no Kairos (que aponta para localhost:2222 no VPS)
# vai acessar este PC como se estivesse local.
#
# Uso: powershell -ExecutionPolicy Bypass -File .\setup-ssh-tunnel.ps1
# Ou:  .\setup-ssh-tunnel.ps1 -VpsHost 187.77.229.227 -VpsUser kairos

param(
    [string]$VpsHost = "187.77.229.227",
    [string]$VpsUser = "kairos",
    [int]$RemotePort = 2222,
    [string]$KeyPath = "$env:USERPROFILE\.ssh\kairos-tunnel-key"
)

# 1. Verificar se OpenSSH Client esta instalado
$ssh = Get-Command ssh -ErrorAction SilentlyContinue
if (-not $ssh) {
    Write-Host "ERRO: OpenSSH client nao encontrado. Instale via Settings > Apps > Optional Features > OpenSSH Client" -ForegroundColor Red
    exit 1
}

# 2. Verificar se a chave publica do Kairos esta no authorized_keys do VPS
Write-Host "Verificando chave publica no VPS..." -ForegroundColor Cyan
$pubKeyPath = "$KeyPath.pub"
if (-not (Test-Path $pubKeyPath)) {
    # Pede a chave publica via skill
    Write-Host "Pedindo chave publica do Kairos..." -ForegroundColor Yellow
    try {
        $pubKeyResp = Invoke-RestMethod -Uri "https://kairosdesktop.fbautomacao.space/skills/list" -Method Get
        Write-Host "Chave publica do Kairos (pegue em /opt/kairos no VPS):" -ForegroundColor Green
        Write-Host "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFz6PRnNaQG8dwHRP+o4zUhjsuzqMitIqjO66r580yOk kairos-core@srv1448020"
    } catch {
        Write-Host "Nao consegui buscar via API. A chave eh:" -ForegroundColor Yellow
        Write-Host "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFz6PRnNaQG8dwHRP+o4zUhjsuzqMitIqjO66r580yOk kairos-core@srv1448020"
    }
    Write-Host ""
    Write-Host "O Pastor precisa adicionar essa chave em /root/.ssh/authorized_keys no VPS" -ForegroundColor Yellow
    Write-Host "Posso fazer isso se ele me passar a chave publica do PC dele." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Gerando par de chaves deste PC para o tunnel..." -ForegroundColor Cyan
    if (-not (Test-Path $KeyPath)) {
        New-Item -Path (Split-Path $KeyPath) -ItemType Directory -Force | Out-Null
        ssh-keygen -t ed25519 -f $KeyPath -N '""' -C "kairos-tunnel@$env:COMPUTERNAME" | Out-Null
    }
    Write-Host "Chave publica deste PC:" -ForegroundColor Green
    Get-Content $pubKeyPath
    Write-Host ""
    Write-Host "Adicione a chave acima em:" -ForegroundColor Yellow
    Write-Host "  VPS: /root/.ssh/authorized_keys (anexe a chave publica)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Depois rode este script novamente" -ForegroundColor Yellow
    exit 0
}

# 3. Estabelecer tunnel reverso em background
Write-Host ""
Write-Host "Estabelecendo tunnel reverso $RemotePort -> localhost:22..." -ForegroundColor Cyan
Write-Host "VPS: ${VpsUser}@${VpsHost}:$RemotePort" -ForegroundColor Cyan
Write-Host "PC local: localhost:22" -ForegroundColor Cyan
Write-Host ""

# Mata tunnel anterior se existir
Get-Process | Where-Object { $_.CommandLine -like "*$RemotePort*$VpsHost*" -or $_.CommandLine -like "*kairos-tunnel*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 2

# Inicia tunnel em background
$argList = @(
    "-i", "`"$KeyPath`"",
    "-N",
    "-R", "`"$RemotePort`:localhost:22`"",
    "-o", "ServerAliveInterval=60",
    "-o", "ServerAliveCountMax=3",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ExitOnForwardFailure=yes",
    "`"${VpsUser}@${VpsHost}`""
)

$tunnelCmd = "ssh " + ($argList -join " ")
Write-Host "Comando: $tunnelCmd" -ForegroundColor DarkGray

Start-Process -FilePath ssh -ArgumentList $argList -WindowStyle Hidden
Start-Sleep 3

# 4. Verificar
Write-Host ""
Write-Host "Verificando tunnel..." -ForegroundColor Cyan
$conn = Get-NetTCPConnection -LocalPort 22 -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "OK - SSH server escutando em :22" -ForegroundColor Green
} else {
    Write-Host "AVISO: porta 22 nao esta aberta. Certifique que o OpenSSH Server esta rodando." -ForegroundColor Yellow
}

# 5. Salvar config pra Task Scheduler
$taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
  </Settings>
  <Actions>
    <Exec>
      <Command>ssh</Command>
      <Arguments>$($argList | ConvertTo-Json -Compress)</Arguments>
    </Exec>
  </Actions>
</Task>
"@

# Registrar no Task Scheduler pra iniciar no logon
$taskName = "KairosSSHTunnel"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
Register-ScheduledTask -TaskName $taskName -Xml $taskXml -Force | Out-Null
Write-Host "Tunnel registrado no Task Scheduler (inicia no logon automaticamente)" -ForegroundColor Green

Write-Host ""
Write-Host "PROXIMO PASSO:" -ForegroundColor Yellow
Write-Host "1. Anote a chave publica do PC (mostrada acima)" -ForegroundColor White
Write-Host "2. Me mande ela pra eu adicionar em /root/.ssh/authorized_keys no VPS" -ForegroundColor White
Write-Host "3. Apos adicionar, este script ja vai estar mantendo o tunnel vivo" -ForegroundColor White
Write-Host "4. O Kairos (VPS) vai conectar em localhost:$RemotePort e acessar este PC" -ForegroundColor White
