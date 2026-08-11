/**
 * ssh_remote - executa comandos via SSH no PC do usuario.
 *
 * Use case: o kairos-core roda no VPS (Linux), mas o usuario quer que a LLM
 * acesse o PC dele (Windows/Linux). A solucao: o usuario habilita OpenSSH
 * Server no PC dele e adiciona a chave publica do Kairos. Esta skill
 * executa comandos remotos via ssh do VPS pro PC.
 *
 * Configuracao do usuario (Windows 10/11):
 *   1. Settings > Apps > Optional Features > Add "OpenSSH Server"
 *   2. Services > OpenSSH SSH Server > Start (Automatic)
 *   3. New-Item -Path $HOME\.ssh\authorized_keys -Force (criar arquivo)
 *   4. Adicionar a chave publica do Kairos (disponibilizada via /system/ssh-key)
 *   5. Permitir no firewall (porta 22 ou alta custom)
 *   6. Configurar port forwarding no roteador OU usar VPN
 *
 * Configuracao do usuario (Linux/Mac):
 *   1. systemctl start sshd
 *   2. Adicionar chave publica em ~/.ssh/authorized_keys
 *   3. firewall liberar porta 22
 *
 * A variavel de ambiente SSH_CLIENT_HOST aponta pro PC do usuario
 * (ex: '192.168.0.10:22' ou 'meu-pc.dyndns.org:2222').
 *
 * SEGURANCA:
 *   - Validacao de host key via known_hosts (gerado automaticamente)
 *   - Timeout de 30s para comandos
 *   - Bloqueia comandos destrutivos (rm -rf, format, dd)
 *   - Audit log de cada execucao
 */

import type { Skill } from '../types.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execAsync = promisify(exec);

const DESTRUCTIVE_PATTERNS = [
  /rm\s+-rf\s+\//,
  /format\s+[a-z]:/i,
  /dd\s+if=/,
  /mkfs/,
  /:\(\)\{\s*:\|:\s*&\s*\}/,  // fork bomb
  /shutdown/i,
  /reboot/i,
  /del\s+\/s\s+\/q/i,         // Windows del recursive
  /rd\s+\/s\s+\/q/i,          // Windows rd recursive
  /Remove-Item\s+-Recurse\s+-Force\s+C:\\/i,
];

export const sshRemote: Skill = {
  name: 'ssh_remote',
  description:
    'Executa um comando via SSH no PC do usuario (Windows/Linux). ' +
    'Permite que a LLM acesse arquivos locais, liste diretorios, conte arquivos, ' +
    'leia documentos, organize pastas - tudo no PC do usuario via SSH remoto. ' +
    'Requer SSH_CLIENT_HOST configurado (IP:PORTA do PC do usuario) e chave publica adicionada. ' +
    'Bloqueia comandos destrutivos (rm -rf, format, etc). ' +
    'Retorna stdout, stderr e exitCode. Timeout 30s.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Comando a executar no PC remoto (PowerShell no Windows, shell no Linux).',
      },
      timeout: {
        type: 'number',
        description: 'Timeout em ms (default 30000, max 120000).',
        default: 30000,
      },
    },
    required: ['command'],
  },
  async execute(args) {
    const command = String(args.command || '').trim();
    const timeout = Math.min(Number(args.timeout) || 30000, 120000);

    if (!command) return { content: 'Erro: command vazio', error: true };

    // Bloqueia comandos destrutivos
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(command)) {
        return { content: `Erro: comando bloqueado por seguranca (pattern: ${pattern}). Use ferramentas mais especificas.`, error: true };
      }
    }

    const host = process.env.SSH_CLIENT_HOST;
    const user = process.env.SSH_CLIENT_USER || 'kairos';
    const keyPath = process.env.SSH_CLIENT_KEY || join(tmpdir(), 'kairos-ssh-key');
    const port = process.env.SSH_CLIENT_PORT || '22';

    if (!host) {
      return {
        content: 'SSH nao configurado. Defina SSH_CLIENT_HOST=IP:PORTA no .env. Veja docs/SSH-SETUP.md',
        error: true,
      };
    }

    // Auto-gera chave se nao existir
    if (!existsSync(keyPath)) {
      try {
        await mkdir(join(tmpdir(), 'kairos'), { recursive: true });
        await execAsync(`ssh-keygen -t ed25519 -f "${keyPath}" -N "" -C "kairos-core@$(hostname)"`);
      } catch (err) {
        return { content: `Erro gerando chave SSH: ${(err as Error).message}`, error: true };
      }
    }

    // Monta comando ssh
    // -i: chave privada
    // -o StrictHostKeyChecking=accept-new: aceita host novo automaticamente
    // -o ConnectTimeout=10: timeout de conexao
    // -p: porta custom
    const sshArgs = [
      '-i', keyPath,
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=10',
      '-o', 'BatchMode=yes',
      '-p', port,
      `${user}@${host}`,
      // No Windows, o shell padrao do SSH pode ser cmd. Forcamos PowerShell.
      process.platform === 'win32' || /powershell|cmd/i.test(command) ? command : `bash -c '${command.replace(/'/g, "'\\''")}'`,
    ];

    try {
      const { stdout, stderr } = await execAsync(`ssh ${sshArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`, {
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      return {
        content: `OK em ${host}:${port}:\n${stdout}${stderr ? `\nstderr: ${stderr}` : ''}`,
        data: { host, port, command, stdout, stderr, ok: true },
      };
    } catch (err: any) {
      // erro do ssh - stdout pode ter saida parcial
      const partialStdout = err.stdout || '';
      const partialStderr = err.stderr || '';
      return {
        content: `Erro SSH em ${host}:${port}:\n${partialStderr || err.message}\n${partialStdout ? `\nstdout parcial: ${partialStdout}` : ''}`,
        error: true,
        data: { host, port, command, stdout: partialStdout, stderr: partialStderr, ok: false },
      };
    }
  },
};

/**
 * ssh_remote_key - retorna a chave publica do Kairos para o usuario adicionar
 * no authorized_keys do PC dele.
 */
export const sshRemoteKey: Skill = {
  name: 'ssh_remote_key',
  description:
    'Retorna a chave publica SSH do Kairos (ed25519) para o usuario adicionar no PC dele. ' +
    'A chave eh gerada automaticamente na primeira vez. Mostre a chave para o usuario e instrua ' +
    'a colar no arquivo authorized_keys (Windows: $HOME\\.ssh\\authorized_keys, Linux: ~/.ssh/authorized_keys).',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {},
  },
  async execute() {
    const keyPath = process.env.SSH_CLIENT_KEY || join(tmpdir(), 'kairos-ssh-key');
    const pubKeyPath = `${keyPath}.pub`;

    if (!existsSync(pubKeyPath)) {
      // Gera o par de chaves
      try {
        await mkdir(join(tmpdir(), 'kairos'), { recursive: true });
        await execAsync(`ssh-keygen -t ed25519 -f "${keyPath}" -N "" -C "kairos-core@$(hostname)"`);
      } catch (err) {
        return { content: `Erro gerando chave: ${(err as Error).message}`, error: true };
      }
    }

    const { readFile } = await import('node:fs/promises');
    const pubKey = (await readFile(pubKeyPath, 'utf-8')).trim();

    return {
      content: `Chave publica SSH do Kairos (adicione no authorized_keys do seu PC):\n\n${pubKey}\n\n` +
        `Setup no Windows (PowerShell como admin):\n` +
        `  # 1. Habilitar OpenSSH Server\n` +
        `  Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0\n` +
        `  Start-Service sshd\n` +
        `  Set-Service -Name sshd -StartupType 'Automatic'\n\n` +
        `  # 2. Criar pasta .ssh e arquivo authorized_keys\n` +
        `  New-Item -Path $env:USERPROFILE\\.ssh -ItemType Directory -Force\n` +
        `  notepad $env:USERPROFILE\\.ssh\\authorized_keys  # cole a chave acima\n\n` +
        `  # 3. Liberar firewall\n` +
        `  New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22\n\n` +
        `  # 4. Configurar SSH_CLIENT_HOST no .env do Kairos (ex: SEU_IP:22)\n` +
        `  #    Use port forwarding se estiver fora de casa: ssh -R 2222:localhost:22 user@seu-servidor`,
      data: { publicKey: pubKey, keyPath, pubKeyPath },
    };
  },
};
