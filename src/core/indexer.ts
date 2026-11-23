import { parseDocument } from 'yaml';
import { z } from 'zod';
import type { Collection, Metadata, Reference, TextFile } from '../shared/types.js';
import { codeExtensions, textExtensions, extensionOf, isMetadataFile, isIgnoredName, isRepositoryDocument, isReferenceResourceFolder, isEditableFile, assetExtensions, collator } from '../shared/formats.js';
import {
  ignoredDirectories, textLimit, metadataLimit, indexLimit, entryLimit,
  normalizeRelative, joinRelative, parentOf, baseName, sha256Hex,
  type LibraryProvider, type ProviderEntry
} from './provider.js';

const schema = z.object({
  id: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(),
  title: z.string().max(1000).optional(),
  description: z.string().optional(),
  category: z.string().max(200).optional(),
  platform: z.string().max(200).optional(),
  url: z.string().max(2048).optional(),
  tags: z.array(z.string().max(500)).max(200).optional(),
  language: z.string().max(200).optional(),
  files: z.array(z.string().max(4096)).max(5000).optional(),
  notes: z.string().max(4096).optional(),
  schema_version: z.literal(1).optional()
}).passthrough();

export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function parseMetadata(content: string): { metadata: Metadata; warnings: string[] } {
  if (new TextEncoder().encode(content).length > metadataLimit) return { metadata: {}, warnings: ['Los metadatos superan 256 KiB. El archivo sigue disponible en el explorador.'] };
  try {
    const doc = parseDocument(content, { uniqueKeys: true });
    if (doc.errors.length) return { metadata: {}, warnings: [`YAML inválido${doc.errors[0].linePos ? ` en la línea ${doc.errors[0].linePos[0].line}` : ''}. Revisa la sintaxis y las claves repetidas.`] };
    const result = schema.safeParse(doc.toJS({ maxAliasCount: 50 }) ?? {});
    if (!result.success) return { metadata: {}, warnings: result.error.issues.slice(0, 8).map(issue => `Campo ${issue.path.join('.') || '(raíz)'} inválido. Revisa su tipo, tamaño o versión del esquema (compatible: 1).`) };
    JSON.stringify(result.data);
    return { metadata: result.data, warnings: [] };
  } catch { return { metadata: {}, warnings: ['No se pudo interpretar el YAML: estructura demasiado compleja o referencias circulares.'] }; }
}

type RawFile = { bytes: Uint8Array; content: string; version: string };

export class LibraryIndexer {
  private cache = new Map<string, { signature: string; reference: Reference }>();
  private tree = new Map<string, ProviderEntry>();

  constructor(
    readonly provider: LibraryProvider,
    readonly options: { ignore?: string[]; maxFileBytes?: number } = {}
  ) {}

  get writable() { return !!this.provider.capabilities.write; }
  get root() { return this.provider.kind; }

  private async listing() {
    const result = await this.provider.list();
    this.tree = new Map(result.entries.map(entry => [entry.path, entry]));
    return result;
  }

  private entry(path: string) { return this.tree.get(path); }

  private async readRaw(relative: string): Promise<RawFile> {
    const normalized = normalizeRelative(relative);
    const entry = this.entry(normalized);
    if (entry && entry.directory) throw new Error('Solo se pueden leer archivos de texto regulares.');
    if (entry && entry.size !== undefined && entry.size > (this.options.maxFileBytes || textLimit)) {
      throw new Error('Solo se admiten archivos de texto de hasta 2 MiB.');
    }
    const bytes = await this.provider.read(normalized);
    if (bytes.length > (this.options.maxFileBytes || textLimit)) throw new Error('Solo se admiten archivos de texto de hasta 2 MiB.');
    if (bytes.includes(0)) throw new Error('El archivo parece binario. Ábrelo con su aplicación correspondiente.');
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('El archivo no está codificado en UTF-8. Ábrelo en tu editor.'); }
    return { bytes, content, version: await sha256Hex(bytes) };
  }

  async read(relative: string): Promise<TextFile> {
    const normalized = normalizeRelative(relative);
    const value = await this.readRaw(normalized);
    return { path: normalized, content: value.content, version: value.version };
  }

  async scan(): Promise<Collection> {
    const started = performance.now();
    const list = await this.listing();
    const collection: Collection = { root: this.describeRoot(), entries: [], references: [], warnings: [...list.warnings] };
    if (list.truncated) collection.warnings.push('El listado de la biblioteca está incompleto por los límites del origen.');
    const ignored = new Set([...ignoredDirectories, ...(this.options.ignore || [])]);
    const directories = new Map<string, ProviderEntry[]>();
    for (const entry of list.entries) {
      const segments = entry.path.split('/');
      if (segments.some(part => ignored.has(part) || isIgnoredName(part))) continue;
      if (collection.entries.length >= entryLimit) break;
      const parent = parentOf(entry.path);
      if (!directories.has(parent)) directories.set(parent, []);
      directories.get(parent)!.push(entry);
      collection.entries.push({ path: entry.path, name: baseName(entry.path), directory: entry.directory });
      if (collection.entries.length >= entryLimit) { collection.warnings.push('Se alcanzó el límite de 100 000 elementos. Abre una carpeta más específica. La exploración es parcial.'); break; }
    }
    if (!this.writable) {
      const nonEmpty = new Set<string>();
      for (const entry of collection.entries) {
        if (entry.directory) continue;
        for (let parent = parentOf(entry.path); parent && !nonEmpty.has(parent); parent = parentOf(parent)) nonEmpty.add(parent);
      }
      collection.entries = collection.entries.filter(entry => !entry.directory || nonEmpty.has(entry.path));
    }
    const nextCache = new Map<string, { signature: string; reference: Reference }>();
    let indexedBytes = 0, metadataBytes = 0, cacheHits = 0;
    const dirPaths = [...directories.keys()].sort((a, b) => collator.compare(a, b));
    const directFiles = (directory: string) => directories.get(directory)!.filter(entry => !entry.directory).map(entry => entry.path);
    const qualifies = new Map<string, boolean>();
    for (const directory of dirPaths) {
      const files = directFiles(directory);
      qualifies.set(directory, files.some(file => isMetadataFile(file) || codeExtensions.has(extensionOf(file)) || (['.md', '.txt'].includes(extensionOf(file)) && !isRepositoryDocument(file))));
    }
    const attached = new Map<string, string[]>();
    const ownerOf = (directory: string) => {
      const parts = directory ? directory.split('/') : [];
      for (let index = 0; index < parts.length; index++) {
        const parent = parts.slice(0, index).join('/');
        if (isReferenceResourceFolder(parts[index]) && qualifies.get(parent)) return parent;
      }
      return undefined;
    };
    const owned = new Set<string>();
    for (const directory of dirPaths) {
      const owner = ownerOf(directory);
      if (owner === undefined) continue;
      owned.add(directory);
      if (!attached.has(owner)) attached.set(owner, []);
      attached.get(owner)!.push(...directFiles(directory));
    }
    for (const directory of dirPaths) {
      if (owned.has(directory)) continue;
      const children = directories.get(directory)!.sort((a, b) => collator.compare(a.path, b.path));
      const files = [...children.filter(entry => !entry.directory).map(entry => entry.path), ...(attached.get(directory) || []).sort((a, b) => collator.compare(a, b))];
      const metadataFiles = files.filter(file => parentOf(file) === directory && isMetadataFile(file)).sort((a, b) => Number(extensionOf(a) !== '.yaml') - Number(extensionOf(b) !== '.yaml'));
      const metadataFile = metadataFiles[0];
      const code = files.filter(file => codeExtensions.has(extensionOf(file)));
      const notes = files.filter(file => ['.md', '.txt'].includes(extensionOf(file)));
      if (!qualifies.get(directory)) continue;
      const warnings: string[] = [];
      const sizes = new Map<string, ProviderEntry>(files.map(file => [file, this.entry(file)!]));
      const available = Math.max(0, Math.min(1000000, Math.floor((indexLimit - indexedBytes) / 2)));
      const metadataSize = metadataFile ? this.entry(metadataFile)?.size || 0 : 0;
      const parseAllowed = metadataBytes + metadataSize <= 16 * 1024 * 1024;
      const signature = JSON.stringify(files.map(file => [file, sizes.has(file) ? (this.entry(file)?.version ?? null) : null])) + `:${available}:${parseAllowed}`;
      const cached = this.cache.get(directory);
      if (cached?.signature === signature) {
        collection.references.push(cached.reference); nextCache.set(directory, cached);
        indexedBytes += cached.reference.searchText.length * 2; metadataBytes += metadataSize; cacheHits++; continue;
      }
      let metadata: Metadata = {};
      let metadataContent = '';
      if (metadataFiles.length > 1) warnings.push(`Hay varios archivos de metadatos; se utiliza ${baseName(metadataFile)}.`);
      if (metadataFile) {
        metadataBytes += metadataSize;
        if (metadataSize > metadataLimit || !parseAllowed) warnings.push('Los metadatos exceden el límite por archivo (256 KiB) o de la colección (16 MiB). Consúltalos como texto.');
        else try { metadataContent = (await this.read(metadataFile)).content; const parsed = parseMetadata(metadataContent); metadata = parsed.metadata; warnings.push(...parsed.warnings); }
        catch { warnings.push(`No se pudieron leer los metadatos: ${metadataFile}`); }
      }
      const byName = new Map(files.map(file => [file.toLowerCase(), file]));
      let selected = files.filter(file => sizes.has(file));
      if (metadata.files) {
        selected = [];
        for (const declared of metadata.files) {
          const candidate = joinRelative(directory, declared);
          const actual = byName.get(candidate.toLowerCase());
          if (parentOf(candidate) !== directory || !actual || !sizes.has(actual)) warnings.push(`Archivo declarado no disponible directamente en esta carpeta: ${declared}`);
          else selected.push(actual);
        }
        selected = [...new Set([...selected, ...notes, ...metadataFiles, ...(attached.get(directory) || [])])];
      }
      if (metadata.notes) {
        const candidate = joinRelative(directory, metadata.notes);
        if (!notes.includes(candidate)) warnings.push(`El archivo de notas declarado no está disponible directamente en esta carpeta: ${metadata.notes}`);
      }
      let searchText = normalize(`${directory} ${files.join(' ')} ${JSON.stringify(metadata)}`).slice(0, available);
      let partial = available === 0;
      for (const file of files) {
        if (!textExtensions.has(extensionOf(file))) continue;
        if (searchText.length >= available) { partial = true; continue; }
        try {
          const text = file === metadataFile ? metadataContent : (await this.read(file)).content;
          const normalized = normalize(text);
          const remaining = Math.max(0, available - searchText.length - 1);
          if (normalized.length > remaining) partial = true;
          searchText += '\n' + normalized.slice(0, remaining);
        } catch { warnings.push(`No se indexó el contenido de: ${file}`); }
      }
      if (partial) warnings.push('Búsqueda de contenido parcial: límite de 1 millón de caracteres por referencia o 128 MiB de índice. Los archivos originales no se recortan.');
      indexedBytes += searchText.length * 2;
      const reference: Reference = {
        path: directory, title: metadata.title || baseName(directory) || '(raíz)',
        files: selected, code: code.filter(file => selected.includes(file)), metadata,
        warnings: warnings.slice(0, 50), searchText,
        modified: files.reduce((latest, file) => Math.max(latest, this.entry(file)?.modified || 0), 0),
        hasMetadata: !!metadataFile
      };
      collection.references.push(reference); nextCache.set(directory, { signature, reference });
    }
    this.cache = nextCache;
    collection.stats = { durationMs: Math.round(performance.now() - started), cacheHits, indexedBytes };
    return collection;
  }

  private describeRoot() { return ''; }

  private requireWrite() {
    if (!this.provider.write || !this.provider.mkdir) throw new Error('Esta biblioteca es de solo lectura.');
  }

  async readAsset(relative: string): Promise<{ path: string; mime: string; data: string }> {
    const normalized = normalizeRelative(relative);
    const extension = extensionOf(normalized);
    const mime = assetExtensions[extension];
    if (!mime) throw new Error('Solo se pueden mostrar imágenes PNG, JPG, GIF, WebP o SVG.');
    const entry = this.entry(normalized);
    if (entry?.size !== undefined && entry.size > 1024 * 1024) throw new Error('La imagen supera 1 MiB.');
    const bytes = await this.provider.read(normalized);
    if (bytes.length > 1024 * 1024) throw new Error('La imagen supera 1 MiB.');
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return { path: normalized, mime, data: `data:${mime};base64,${btoa(binary)}` };
  }

  async remove(relative: string) {
    if (!this.provider.remove) throw new Error('Esta biblioteca no permite eliminar elementos.');
    await this.listing();
    const normalized = normalizeRelative(relative);
    if (!normalized) throw new Error('No se puede eliminar la raíz de la biblioteca.');
    if (!this.entry(normalized)) throw new Error('El elemento ya no existe.');
    await this.provider.remove(normalized);
    return this.scan();
  }

  async create(relative: string, kind: 'folder' | 'reference' | 'file') {
    this.requireWrite();
    await this.listing();
    if (!relative.trim()) throw new Error('Escribe un nombre.');
    const normalized = normalizeRelative(relative);
    if (this.entry(normalized)) throw new Error('Ya existe un archivo o carpeta con ese nombre.');
    if (kind === 'file') {
      if (!isEditableFile(normalized)) throw new Error('Usa una extensión de texto conocida (.md, .cpp, .py, .yaml, .json…).');
      await this.provider.write!(normalized, new TextEncoder().encode(''), { create: true });
      return this.scan();
    }
    await this.provider.mkdir!(normalized);
    if (kind === 'reference') {
      const title = baseName(normalized);
      await this.provider.write!(joinRelative(normalized, 'notes.md'), new TextEncoder().encode(`# ${title}\n\n`), { create: true });
      await this.provider.write!(joinRelative(normalized, 'metadata.yaml'), new TextEncoder().encode(`schema_version: 1\ntitle: ${JSON.stringify(title)}\ntags: []\n`), { create: true });
    }
    return this.scan();
  }

  async supplement(relative: string, kind: 'notes' | 'metadata') {
    this.requireWrite();
    await this.listing();
    const directory = normalizeRelative(relative);
    const children = [...this.tree.values()].filter(entry => !entry.directory && parentOf(entry.path) === directory).map(entry => entry.path);
    if (kind === 'metadata' && children.some(isMetadataFile)) throw new Error('Esta referencia ya tiene un archivo de metadatos.');
    const name = kind === 'metadata' ? 'metadata.yaml' : 'notes.md';
    const title = baseName(directory) || '(raíz)';
    const content = kind === 'metadata' ? `schema_version: 1\ntitle: ${JSON.stringify(title)}\ntags: []\n` : `# ${title}\n\n`;
    await this.provider.write!(joinRelative(directory, name), new TextEncoder().encode(content), { create: true });
    return this.scan();
  }

  async rename(relative: string, destination: string) {
    if (!this.provider.rename) throw new Error('Esta biblioteca no permite mover ni renombrar elementos.');
    await this.listing();
    if (!relative || relative === '.' || relative === './' || !destination.trim()) throw new Error('No se puede mover la raíz ni usar un destino vacío.');
    const source = normalizeRelative(relative), target = normalizeRelative(destination);
    if (!source || !target) throw new Error('No se puede mover ni reemplazar la raíz.');
    if (target === source || target.startsWith(source + '/')) throw new Error('No se puede mover una carpeta dentro de sí misma.');
    if (this.entry(target)) throw new Error('El destino ya existe. No se sobrescribirá.');
    await this.provider.rename(source, target);
    return this.scan();
  }

  async save(relative: string, content: string, expected: string) {
    if (!this.provider.write) throw new Error('Esta biblioteca es de solo lectura.');
    if (!isEditableFile(relative)) throw new Error('Solo se pueden editar archivos de texto (código, notas, metadatos y configuración).');
    if (new TextEncoder().encode(content).length > (this.options.maxFileBytes || textLimit)) throw new Error('El contenido supera 2 MiB.');
    if (isMetadataFile(relative) && parseMetadata(content).warnings.length) throw new Error('Corrige los metadatos antes de guardarlos: ' + parseMetadata(content).warnings.join(' '));
    const normalized = normalizeRelative(relative);
    const original = await this.readRaw(normalized);
    if (original.version !== expected) throw new Error('El archivo cambió externamente. Recárgalo antes de guardar.');
    const bom = original.bytes[0] === 239 && original.bytes[1] === 187 && original.bytes[2] === 191;
    const eol = original.content.includes('\r\n') && !original.content.replaceAll('\r\n', '').includes('\n') ? '\r\n' : '\n';
    const output = (bom ? '﻿' : '') + content.replace(/\r\n|\n/g, eol);
    await this.provider.write(normalized, new TextEncoder().encode(output), { create: false });
    return this.read(normalized);
  }
}
