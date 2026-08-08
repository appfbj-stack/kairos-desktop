/**
 * Upload service.
 *
 * Recebe arquivos via multipart, salva em ~/.kairos/uploads/<YYYY-MM-DD>/,
 * e opcionalmente extrai texto (PDF, TXT, MD, JSON) para o LLM usar como contexto.
 *
 * Decisoes:
 * - Storage local (nao vai pra S3/cloud - eh desktop)
 * - Limite padrao: 25MB por arquivo, ate 4 arquivos por mensagem
 * - Tipos suportados: qualquer um (upload generico)
 * - Auto-extract: PDF/TXT/MD/JSON saem com `extractedText` preenchido
 * - Imagens: geram dataUri (base64) para multimodal/vision
 *
 * Schema LGPD: arquivos do usuario ficam so na maquina dele. Nao sincroniza.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { ChatAttachment } from '../llm/llm-provider.interface.js';

// Logger simples - core ainda nao tem logger compartilhado.
const logger = {
  info: (obj: any, msg?: string) => console.log('[upload]', msg || '', obj),
  warn: (obj: any, msg?: string) => console.warn('[upload]', msg || '', obj),
  error: (obj: any, msg?: string) => console.error('[upload]', msg || '', obj),
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const DATA_URI_LIMIT = 5 * 1024 * 1024; // imagens >5MB nao viram dataUri (economia de banda)
const TEXT_EXTRACT_LIMIT = 100 * 1024; // extrair no max 100KB de texto

const IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

const TEXT_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'text/xml',
  'application/json',
  'application/xml',
]);

const PDF_MIMES = new Set(['application/pdf']);

/** Retorna o diretorio raiz de uploads. ~/.kairos/uploads/ */
export function getUploadsRoot(): string {
  const envOverride = process.env.KAIROS_UPLOADS_DIR;
  if (envOverride) return resolve(envOverride);
  return resolve(homedir(), '.kairos', 'uploads');
}

function todayDir(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return join(getUploadsRoot(), `${yyyy}-${mm}-${dd}`);
}

function safeFilename(name: string): string {
  // Remove path traversal, caracteres problematicos
  return name
    .replace(/[\\/]/g, '_')
    .replace(/[^\w.\-À-ÿ ]/g, '_')
    .slice(0, 200) || 'arquivo';
}

function detectMime(name: string, fallback?: string): string {
  const ext = extname(name).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.doc': 'application/msword',
    '.xls': 'application/vnd.ms-excel',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
  };
  return map[ext] || fallback || 'application/octet-stream';
}

export class UploadService {
  private root = getUploadsRoot();
  /** Mapa de uploadId -> metadata (so na memoria - em prod usariamos SQLite) */
  private index = new Map<string, ChatAttachment & { dataUri?: string }>();

  constructor() {
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
      logger.info({ root: this.root }, 'Uploads dir created');
    }
  }

  /**
   * Salva um arquivo no storage e retorna o attachment metadata.
   * Aceita Buffer (ja carregado) ou um filePath (origem externa).
   */
  async save(opts: {
    buffer: Buffer;
    originalName: string;
    mimeType?: string;
  }): Promise<ChatAttachment> {
    const { buffer, originalName } = opts;
    const mimeType = opts.mimeType || detectMime(originalName);

    if (buffer.length > MAX_FILE_SIZE) {
      throw new UploadError(
        `Arquivo muito grande: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      );
    }

    const dir = todayDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const id = randomBytes(12).toString('hex');
    const safe = safeFilename(originalName);
    const filename = `${id}-${safe}`;
    const fullPath = join(dir, filename);

    writeFileSync(fullPath, buffer);
    logger.info({ id, path: fullPath, sizeBytes: buffer.length, mimeType }, 'File saved');

    const attachment: ChatAttachment & { dataUri?: string } = {
      id,
      path: fullPath,
      name: originalName,
      mimeType,
      sizeBytes: buffer.length,
    };

    // Auto-extrair texto se for PDF/TXT/etc
    const extracted = await this.tryExtractText(fullPath, mimeType);
    if (extracted) {
      attachment.extractedText = extracted;
    }

    // Gerar dataUri para imagens pequenas (multimodal)
    if (IMAGE_MIMES.has(mimeType) && buffer.length <= DATA_URI_LIMIT) {
      attachment.dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
    }

    this.index.set(id, attachment);
    return attachment;
  }

  /**
   * Resolve attachment por ID (do payload de chat). Retorna null se expirou.
   */
  get(id: string): (ChatAttachment & { dataUri?: string }) | null {
    return this.index.get(id) || null;
  }

  /**
   * Tenta extrair texto de PDF/TXT/MD/JSON/HTML. Retorna string ou null.
   */
  private async tryExtractText(filePath: string, mimeType: string): Promise<string | null> {
    try {
      if (PDF_MIMES.has(mimeType)) {
        return await this.extractPdfText(filePath);
      }
      if (TEXT_MIMES.has(mimeType)) {
        return this.extractPlainText(filePath);
      }
      return null;
    } catch (err) {
      logger.warn({ err, filePath, mimeType }, 'Text extraction failed');
      return null;
    }
  }

  private extractPlainText(filePath: string): string {
    const buf = readFileSync(filePath);
    // Remove BOM se houver
    let text = buf.toString('utf-8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.length > TEXT_EXTRACT_LIMIT) {
      text = text.slice(0, TEXT_EXTRACT_LIMIT) + '\n\n[... texto truncado em ' + TEXT_EXTRACT_LIMIT + ' bytes ...]';
    }
    return text;
  }

  private async extractPdfText(filePath: string): Promise<string> {
    // pdf-parse v2+ expoe a classe PDFParse (API mudou).
    // Import dinamico para evitar carregar no boot do Core quando nao ha uploads.
    const { PDFParse } = await import('pdf-parse') as any;
    const buf = readFileSync(filePath);
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const result = await parser.getText();
      let text = result.text || '';
      text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (text.length > TEXT_EXTRACT_LIMIT) {
        text = text.slice(0, TEXT_EXTRACT_LIMIT) + '\n\n[... texto truncado em ' + TEXT_EXTRACT_LIMIT + ' bytes ...]';
      }
      return text;
    } finally {
      await parser.destroy();
    }
  }
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

export const uploadService = new UploadService();
