/**
 * PowerShell executor - roda comandos PS de forma controlada.
 *
 * Sandboxing:
 *  - Timeout de 30s (configurável)
 *  - cwd restrito (validado pela skill antes)
 *  - Output limitado a 1MB
 *  - Comando passado como array (sem shell interpolation)
 *  - Em prod (Fase 6), adiciona approval flow
 */

import { spawn } from 'node:child_process';

export interface PowerShellOptions {
  /** Timeout em ms (default 30000) */
  timeoutMs?: number;
  /** Working directory (validado antes) */
  cwd?: string;
  /** Max output bytes (default 1MB) */
  maxOutputBytes?: number;
}

export interface PowerShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Executa um script PowerShell (string) e retorna o resultado.
 * NAO usa shell:true (passa argumento direto, sem interpolation).
 */
export function execPowerShell(
  script: string,
  options: PowerShellOptions = {},
): Promise<PowerShellResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxOutput = options.maxOutputBytes ?? 1024 * 1024;
  const start = Date.now();

  return new Promise((resolve) => {
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let truncated = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    }, timeoutMs);

    proc.stdout!.on('data', (chunk: Buffer) => {
      if (truncated) return;
      const remaining = maxOutput - stdout.length;
      if (remaining <= 0) { truncated = true; return; }
      const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      stdout += slice.toString('utf-8');
      if (stdout.length >= maxOutput) truncated = true;
    });

    proc.stderr!.on('data', (chunk: Buffer) => {
      if (truncated) return;
      const remaining = maxOutput - stderr.length;
      if (remaining <= 0) { truncated = true; return; }
      const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      stderr += slice.toString('utf-8');
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        stdout: '',
        stderr: `Failed to spawn powershell: ${err.message}`,
        exitCode: -1,
        durationMs: Date.now() - start,
        timedOut: false,
      });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (truncated) {
        stderr += '\n[output truncated at 1MB]';
      }
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
        durationMs: Date.now() - start,
        timedOut,
      });
    });
  });
}

/**
 * Helper: escapa uma string pra uso seguro em aspas duplas dentro de um script PS.
 *
 * IMPORTANTE: nao escapa `\` porque o PowerShell usa `` ` `` (backtick) como escape,
 * nao `\`. Quando o Node spawn passa o script via -Command, `\U`, `\k`, `\t`, `\f`
 * sao interpretados como chars de controle (\U=null, \k=vk, \t=tab, \f=form feed).
 * Por isso usamos SEMPRE aspas SIMPLES no PS quando ha path: '$path' ao inves de "$path".
 *
 * Caracteres que precisam escape em aspas duplas PS:
 *  - " -> `" (backtick quote)
 *  - $ -> `$ (backtick dollar)
 *  - ` -> `` (double backtick)
 *
 * Para paths/argumentos do usuario, prefira aspas simples no script.
 */
export function escapePsString(s: string): string {
  return s.replace(/"/g, '`"').replace(/\$/g, '`$').replace(/`/g, '``');
}
