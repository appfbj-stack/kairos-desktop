/**
 * AttachmentPreview - mostra um arquivo anexado na area de input do chat.
 *
 * - Imagem: thumbnail inline (data: URI ou /upload/:id)
 * - Outros: icone por extensao + nome + tamanho + botao X
 */

import type { ChatAttachment } from '../../lib/chat-api.js';

const ICON_BY_EXT: Record<string, string> = {
  pdf: '📄',
  txt: '📃',
  md: '📝',
  json: '🧾',
  csv: '📊',
  doc: '📘',
  docx: '📘',
  xls: '📗',
  xlsx: '📗',
  ppt: '📙',
  pptx: '📙',
  zip: '🗜️',
  rar: '🗜️',
  '7z': '🗜️',
  mp3: '🎵',
  mp4: '🎬',
  mov: '🎬',
};

function fileIcon(name: string, mime: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ICON_BY_EXT[ext]) return ICON_BY_EXT[ext];
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  return '📎';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentPreview({
  attachment,
  onRemove,
  onPreview,
}: {
  attachment: ChatAttachment;
  onRemove: (id: string) => void;
  onPreview?: (a: ChatAttachment) => void;
}) {
  const isImage = attachment.mimeType.startsWith('image/');
  const previewUrl = attachment.dataUri || (isImage ? `/upload/${attachment.id}` : null);

  return (
    <div className="attachment-preview" data-mime={attachment.mimeType}>
      {isImage && previewUrl ? (
        <img
          className="attachment-thumb"
          src={previewUrl}
          alt={attachment.name}
          onClick={() => onPreview?.(attachment)}
        />
      ) : (
        <div className="attachment-icon-box">
          <span className="attachment-icon">{fileIcon(attachment.name, attachment.mimeType)}</span>
        </div>
      )}
      <div className="attachment-info">
        <div className="attachment-name" title={attachment.name}>
          {attachment.name}
        </div>
        <div className="attachment-meta">
          {formatSize(attachment.sizeBytes)}
          {attachment.extractedText && ' · texto extraído'}
        </div>
      </div>
      <button
        type="button"
        className="attachment-remove"
        onClick={() => onRemove(attachment.id)}
        title="Remover anexo"
        aria-label={`Remover ${attachment.name}`}
      >
        ✕
      </button>
    </div>
  );
}
