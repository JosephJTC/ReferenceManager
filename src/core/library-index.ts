import type { Collection, Reference } from '../shared/types.js';
import { codeExtensions, extensionOf, isMetadataFile, isVisualizationAsset } from '../shared/formats.js';
import { baseName, parentOf, sha256Hex } from './provider.js';
import { parseMetadata } from './indexer.js';

export const indexSchemaId = 'referencemanager.library-index/v1';

export type LibraryIndexFile = { path: string; role: 'code' | 'notes' | 'metadata' | 'other'; language?: string; size: number; sha256: string };
export type LibraryIndexReference = {
  id: string; idSource: 'metadata' | 'path'; unstable?: boolean;
  name: string; category?: string; tags: string[]; language?: string; platform?: string; url?: string;
  path: string; files: LibraryIndexFile[]; notes?: string[]; metadata: Record<string, unknown>;
};
export type LibraryIndex = {
  schema: string; generatedAt: string; generator: 'ReferenceManager';
  library: { id: string; name: string; source: { kind: string; url?: string; branch?: string; commit?: string; subpath?: string } };
  references: LibraryIndexReference[];
  practiceSelection: { referenceId: string; file: string }[];
};

export const stableIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

const fileLanguages: Record<string, string> = { '.cpp': 'C++', '.cc': 'C++', '.hpp': 'C++', '.h': 'C++', '.c': 'C', '.py': 'Python', '.java': 'Java', '.rs': 'Rust', '.js': 'JavaScript', '.ts': 'TypeScript', '.go': 'Go', '.kt': 'Kotlin', '.cs': 'C#', '.rb': 'Ruby', '.swift': 'Swift' };

export async function referenceId(reference: Reference): Promise<{ id: string; source: 'metadata' | 'path'; unstable: boolean }> {
  const declared = reference.metadata.id;
  if (typeof declared === 'string' && stableIdPattern.test(declared)) return { id: declared, source: 'metadata', unstable: false };
  const digest = await sha256Hex(new TextEncoder().encode(reference.path));
  return { id: `path:${digest.slice(0, 24)}`, source: 'path', unstable: true };
}

export async function buildLibraryIndex(
  collection: Collection,
  library: { id: string; name: string; source: LibraryIndex['library']['source'] },
  options: { fileSize?: (path: string) => number | undefined; fileSha?: (path: string) => Promise<string>; practiceSelection?: { referenceId: string; file: string }[] } = {}
): Promise<LibraryIndex> {
  const references: LibraryIndexReference[] = [];
  for (const reference of collection.references) {
    const identity = await referenceId(reference);
    const files: LibraryIndexFile[] = [];
    const notesPaths: string[] = [];
    for (const file of reference.files) {
      const extension = extensionOf(file);
      const role = isMetadataFile(file) ? 'metadata' : codeExtensions.has(extension) && !isVisualizationAsset(file) ? 'code' : /\.(md|txt)$/i.test(file) ? 'notes' : 'other';
      if (role === 'notes') notesPaths.push(file);
      files.push({
        path: file, role,
        language: fileLanguages[extension],
        size: options.fileSize?.(file) ?? 0,
        sha256: options.fileSha ? await options.fileSha(file) : ''
      });
    }
    const { title, description, id, category, platform, url, tags, language, files: declared, notes, schema_version, ...custom } = reference.metadata;
    references.push({
      id: identity.id, idSource: identity.source, unstable: identity.unstable || undefined,
      name: reference.title,
      category: typeof category === 'string' && category ? category : reference.path.split('/')[0] || undefined,
      tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [],
      language: typeof language === 'string' ? language : undefined,
      platform: typeof platform === 'string' ? platform : undefined,
      url: typeof url === 'string' ? url : undefined,
      path: reference.path,
      files, notes: notesPaths.length ? notesPaths : undefined,
      metadata: custom as Record<string, unknown>
    });
  }
  return {
    schema: indexSchemaId,
    generatedAt: new Date().toISOString(),
    generator: 'ReferenceManager',
    library: { id: library.id, name: library.name, source: library.source },
    references,
    practiceSelection: options.practiceSelection || []
  };
}

export function insertStableId(metadataContent: string, id: string): string {
  if (!stableIdPattern.test(id)) throw new Error('El ID propuesto no es válido.');
  const lines = metadataContent.split(/\r\n|\n/);
  const hadTrailingNewline = lines.length > 1 && lines[lines.length - 1] === '';
  if (hadTrailingNewline) lines.pop();
  const eol = metadataContent.includes('\r\n') ? '\r\n' : '\n';
  let insertAt = 0;
  for (let index = 0; index < lines.length; index++) {
    if (/^schema_version\s*:/.test(lines[index])) { insertAt = index + 1; break; }
    if (lines[index].trim() && !lines[index].startsWith('#')) { insertAt = index; break; }
    if (lines[index].trim()) insertAt = index + 1;
  }
  lines.splice(insertAt, 0, `id: ${JSON.stringify(id)}`);
  return lines.join(eol) + (metadataContent === '' || hadTrailingNewline ? eol : '');
}

export function assignStableIdText(metadataContent: string, id: string): { content: string; changed: boolean } {
  if (metadataContent.trim() === '') return { content: insertStableId(`schema_version: 1\n`, id), changed: true };
  const parsed = parseMetadata(metadataContent);
  if (parsed.warnings.length) throw new Error('Corrige los metadatos antes de asignar un ID: ' + parsed.warnings.join(' '));
  if (typeof parsed.metadata.id === 'string' && stableIdPattern.test(parsed.metadata.id)) return { content: metadataContent, changed: false };
  return { content: insertStableId(metadataContent, id), changed: true };
}
