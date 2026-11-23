export type ProviderEntry = {
  path: string;
  directory: boolean;
  size?: number;
  version?: string;
  modified?: number;
};

export type ProviderCapabilities = { write: boolean; rename: boolean; watch: boolean; refresh: boolean };

export interface LibraryProvider {
  readonly kind: 'local-fs' | 'local-snapshot' | 'github' | 'example';
  readonly capabilities: ProviderCapabilities;
  list(signal?: AbortSignal): Promise<{ entries: ProviderEntry[]; truncated?: boolean; warnings: string[] }>;
  read(path: string, signal?: AbortSignal): Promise<Uint8Array>;
  write?(path: string, bytes: Uint8Array, options: { create: boolean }): Promise<void>;
  mkdir?(path: string): Promise<void>;
  rename?(from: string, to: string): Promise<void>;
  remove?(path: string): Promise<void>;
  externalUrl?(path: string): string | undefined;
}

export const ignoredDirectories = new Set(['node_modules', '.git', 'dist', 'build', '.cache', 'target', 'out', 'bin', 'obj', '.venv', '__pycache__', '.idea', '.vscode']);

export const textLimit = 2 * 1024 * 1024;
export const metadataLimit = 256 * 1024;
export const indexLimit = 128 * 1024 * 1024;
export const entryLimit = 100000;

const invalidPart = /[<>:"|?*\x00-\x1f]/;
const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function validateRelativePath(relative: string): string[] {
  if (!relative) return [];
  if (/^[a-zA-Z]:/.test(relative) || relative.startsWith('/') || relative.startsWith('\\') || relative.startsWith('~')) {
    throw new Error('La ruta debe ser relativa a la colección.');
  }
  const parts = relative.split(/[\\/]/);
  for (const part of parts) {
    if (part === '..') throw new Error('La ruta sale de la colección.');
    if (!part || part === '.') throw new Error('La ruta contiene segmentos vacíos o relativos.');
    if (invalidPart.test(part) || /[. ]$/.test(part) || reserved.test(part)) {
      throw new Error('La ruta contiene un nombre no válido para Windows.');
    }
  }
  return parts;
}

export const normalizeRelative = (relative: string) => validateRelativePath(relative).join('/');

export function joinRelative(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name;
}

export function parentOf(relative: string): string {
  const index = relative.lastIndexOf('/');
  return index < 0 ? '' : relative.slice(0, index);
}

export function baseName(relative: string): string {
  const index = relative.lastIndexOf('/');
  return index < 0 ? relative : relative.slice(index + 1);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
