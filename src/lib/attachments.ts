export type AttachmentKind = 'image' | 'pdf' | 'text';

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  /** Base64 string for image/pdf, or UTF-8 text string for text/code files */
  data: string;
  /** Optional preview data URL for image thumbnails in UI */
  previewUrl?: string;
}

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB per file

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'ino',
  'html',
  'htm',
  'css',
  'scss',
  'xml',
  'yaml',
  'yml',
  'sql',
  'sh',
  'env',
  'log',
]);

export function classifyFileAttachment(fileName: string, mimeType: string): AttachmentKind | null {
  const lowerMime = (mimeType || '').toLowerCase().trim();
  const ext = (fileName.split('.').pop() || '').toLowerCase();

  if (lowerMime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    return 'image';
  }
  if (lowerMime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (
    lowerMime.startsWith('text/') ||
    lowerMime === 'application/json' ||
    lowerMime === 'application/javascript' ||
    lowerMime === 'application/xml' ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    return 'text';
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Strips heavy Markdown syntax (fenced code block markers, URLs, tables)
 * into clean prose for sign-language word-by-word translation.
 */
export function prepareMarkdownForSignTranslation(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' كود برمجي ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
