import './worker-dom-shim.js';
import { z } from 'zod';
import { LibraryIndexer } from '../core/indexer.js';
import { searchReferences } from '../shared/search.js';
import type { Collection, SearchRequest } from '../shared/types.js';
import type { LibraryProvider } from '../core/provider.js';
import { isMetadataFile } from '../shared/formats.js';
import { buildDocumentModel } from '../core/documents/model.js';
import { buildLibraryIndex, assignStableIdText, stableIdPattern, referenceId } from '../core/library-index.js';
import { GitHubProvider } from './providers/github.js';
import { LocalFsProvider } from './providers/localfs.js';
import { SnapshotProvider } from './providers/snapshot.js';
import { ExampleProvider } from './providers/example.js';
import { idbGet, idbPut } from './idb.js';

export type ProviderDescriptor =
  | { kind: 'github'; owner: string; repo: string; branch?: string; subpath?: string }
  | { kind: 'local-fs'; handle: FileSystemDirectoryHandle }
  | { kind: 'local-snapshot'; files: File[] }
  | { kind: 'example'; base: string };

const ghCache = {
  async get(key: string) { return idbGet<unknown>('ghcache', key); },
  async set(key: string, value: unknown) { await idbPut('ghcache', value, key); }
};

let indexer: LibraryIndexer | undefined;
let provider: LibraryProvider | undefined;
let snapshot: Collection | undefined;
let descriptor: ProviderDescriptor | undefined;

function buildProvider(input: ProviderDescriptor): LibraryProvider {
  switch (input.kind) {
    case 'github': return new GitHubProvider({ owner: input.owner, repo: input.repo, branch: input.branch, subpath: input.subpath }, { cache: ghCache });
    case 'local-fs': {
      const local = new LocalFsProvider(input.handle);
      void local.startWatching();
      return local;
    }
    case 'local-snapshot': return new SnapshotProvider(input.files);
    case 'example': return new ExampleProvider(input.base);
  }
}

const strip = (collection: Collection) => { snapshot = collection; return { ...collection, references: collection.references.map(reference => ({ ...reference, searchText: '' })) }; };
const active = () => { if (!indexer) throw new Error('Primero abre una biblioteca.'); return indexer; };
const text = z.string().max(4 * 1024 * 1024);
const relative = z.string().max(4096);
const searchSchema = z.object({
  query: z.string().max(1000), filter: z.enum(['all', 'no-code', 'no-metadata', 'warnings']), scope: relative,
  sort: z.enum(['title', 'modified']), language: z.string().max(200).optional(), tag: z.string().max(500).optional(),
  extension: z.string().max(50).optional(), category: z.string().max(200).optional(),
  offset: z.number().int().min(0).max(100000).optional(), limit: z.number().int().min(1).max(100).optional()
});

async function assignId(directory: string): Promise<boolean> {
  const service = active();
  if (!service.writable) throw new Error('Esta biblioteca es de solo lectura.');
  const collection = await service.scan();
  const reference = collection.references.find(item => item.path === directory);
  if (!reference) throw new Error('La referencia ya no existe.');
  const metadataFile = reference.files.find(isMetadataFile);
  const id = crypto.randomUUID();
  if (metadataFile) {
    const current = await service.read(metadataFile);
    const result = assignStableIdText(current.content, id);
    if (!result.changed) return false;
    await service.save(metadataFile, result.content, current.version);
  } else {
    const result = assignStableIdText('', id);
    const target = `${directory ? directory + '/' : ''}metadata.yaml`;
    if (!service.provider.write) throw new Error('Esta biblioteca es de solo lectura.');
    await service.provider.write(target, new TextEncoder().encode(result.content), { create: true });
  }
  return true;
}

async function execute(operation: string, args: unknown[]) {
  switch (operation) {
    case 'open': {
      descriptor = args[0] as ProviderDescriptor;
      provider = buildProvider(descriptor);
      indexer = new LibraryIndexer(provider, (args[1] as { ignore?: string[]; maxFileBytes?: number }) || {});
      return { collection: strip(await indexer.scan()), capabilities: provider.capabilities, kind: provider.kind };
    }
    case 'scan': return strip(await active().scan());
    case 'read': return active().read(relative.parse(args[0]));
    case 'save': return active().save(relative.parse(args[0]), text.parse(args[1]), z.string().regex(/^[a-f0-9]{64}$/).parse(args[2]));
    case 'create': return strip(await active().create(relative.parse(args[0]), z.enum(['folder', 'reference']).parse(args[1])));
    case 'supplement': return strip(await active().supplement(relative.parse(args[0]), z.enum(['notes', 'metadata']).parse(args[1])));
    case 'rename': return strip(await active().rename(relative.parse(args[0]), relative.parse(args[1])));
    case 'model': return buildDocumentModel(active(), args[0] as Parameters<typeof buildDocumentModel>[1]);
    case 'capabilities': return provider ? { ...provider.capabilities, kind: provider.kind } : undefined;
    case 'externalUrl': return provider?.externalUrl?.(relative.parse(args[0]));
    case 'changed': {
      const local = provider as { consumeChanged?: () => boolean } | undefined;
      return local?.consumeChanged?.() || false;
    }
    case 'previewChanges': {
      const tracked = provider as { previewChanges?: () => Promise<unknown> } | undefined;
      return tracked?.previewChanges ? tracked.previewChanges() : { changed: false };
    }
    case 'branches': {
      const git = buildProvider(args[0] as ProviderDescriptor) as GitHubProvider;
      return git.branches();
    }
    case 'latestCommit': {
      const git = provider as GitHubProvider | undefined;
      return git?.currentCommit ? git.currentCommit() : '';
    }
    case 'assignStableId': {
      await assignId(relative.parse(args[0]));
      return strip(await active().scan());
    }
    case 'assignMissingIds': {
      const service = active();
      const collection = await service.scan();
      let assigned = 0;
      for (const reference of collection.references) {
        const identity = await referenceId(reference);
        if (!identity.unstable) continue;
        if (await assignId(reference.path)) assigned++;
      }
      return { collection: strip(await service.scan()), assigned };
    }
    case 'exportIndex': {
      const service = active();
      const collection = await service.scan();
      const input = args[0] as { library: { id: string; name: string; source: { kind: string; url?: string; branch?: string; commit?: string; subpath?: string } }; selection?: { referenceId: string; file: string }[] };
      const sizes = new Map(collection.entries.filter(entry => !entry.directory).map(entry => [entry.path, 0]));
      const index = await buildLibraryIndex(collection, input.library, {
        practiceSelection: input.selection,
        fileSha: async path => {
          try {
            const bytes = await service.provider.read(path);
            const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
            sizes.set(path, bytes.length);
            return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
          } catch { return ''; }
        }
      });
      for (const reference of index.references) for (const file of reference.files) file.size = sizes.get(file.path) || 0;
      return index;
    }
    case 'search': {
      const request = searchSchema.parse(args[0]) as SearchRequest;
      if (!snapshot) snapshot = await active().scan();
      const result = searchReferences(snapshot.references, request.query, request.filter, request.scope, request.sort, request.language, request.tag, request.extension, request.category);
      const offset = request.offset || 0, limit = request.limit || 100;
      return { paths: result.slice(offset, offset + limit).map(reference => reference.path), total: result.length, offset, limit };
    }
    default: throw new Error('Operación de biblioteca no reconocida.');
  }
}

let queue = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<{ id: number; operation: string; args: unknown[] }>) => {
  const { id, operation, args } = data;
  queue = queue.then(async () => {
    try { self.postMessage({ id, value: await execute(operation, args) }); }
    catch (error) { self.postMessage({ id, error: error instanceof z.ZodError ? 'Los datos de la operación no son válidos.' : (error as Error).message }); }
  });
};

export { isMetadataFile, stableIdPattern };
