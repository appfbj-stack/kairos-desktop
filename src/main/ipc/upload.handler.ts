/**
 * Upload handlers (Fase 5).
 *
 * Expõe `upload:pick` que abre dialog.showOpenDialog, lê o arquivo,
 * e faz POST /upload no Core. Retorna o ChatAttachment (com id, path,
 * dataUri se imagem <5MB, extractedText se PDF/TXT).
 */

import { dialog, ipcMain, BrowserWindow } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { extname, basename } from 'node:path';
import { logger } from '../services/logger.js';

const CORE_BASE_URL = `http://127.0.0.1:${Number(process.env.KAIROS_PORT || 4096)}`;

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
};

function detectMime(name: string): string {
  return MIME_BY_EXT[extname(name).toLowerCase()] || 'application/octet-stream';
}

export function registerUploadHandlers(ipc: typeof ipcMain): void {
  /**
   * upload:pick
   * Abre dialog.showOpenDialog, lê o arquivo selecionado, faz upload pro Core.
   * Retorna ChatAttachment ou null se cancelou.
   */
  ipc.handle('upload:pick', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || undefined;
    const result = await dialog.showOpenDialog(win!, {
      title: 'Anexar arquivo ao chat',
      properties: ['openFile'],
      filters: [
        { name: 'Todos os arquivos', extensions: ['*'] },
        { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        { name: 'Documentos', extensions: ['pdf', 'txt', 'md', 'json', 'csv', 'html', 'docx', 'xlsx'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const name = basename(filePath);
    const mimeType = detectMime(name);

    // Validar tamanho
    const stats = await stat(filePath);
    if (stats.size > 25 * 1024 * 1024) {
      throw new Error(`Arquivo muito grande: ${(stats.size / 1024 / 1024).toFixed(1)}MB (max 25MB)`);
    }

    // Ler bytes
    const buffer = await readFile(filePath);

    // POST /upload como multipart
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), name);

    const res = await fetch(`${CORE_BASE_URL}/upload`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upload HTTP ${res.status}: ${text}`);
    }

    const data = await res.json() as { attachments: any[] };
    if (!data.attachments || data.attachments.length === 0) {
      throw new Error('Upload retornou sem attachments');
    }

    logger.info({ name, sizeBytes: stats.size, mimeType }, 'File uploaded via Electron');
    return data.attachments[0];
  });
}
