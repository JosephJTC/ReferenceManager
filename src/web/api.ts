import type {
  Api, Collection, LibrarySummary, GitHubLibraryInput, Result, SearchRequest, SearchResult,
  TextFile, LibraryCapabilities, LibraryKind, PracticeSelection
} from '../shared/types.js';
import type { DocumentRequest, DocumentPreview } from '../shared/document.js';
import type { ProviderDescriptor } from './library.worker.js';
import { parseGitHubInput, normalizeGitHubToken } from './providers/github.js';
import {
  listLibraryRecords, getLibraryRecord, saveLibraryRecord, removeLibraryRecord,
  getHandle, setHandle, getPractice, setPractice, getSetting, setSetting,
  newLibraryRecord, librarySummary, githubDescriptor, libraryIndexSource, type LibraryRecord
} from './libraries.js';
import { generatePreview, storedDocument, printStored } from './document.js';

type WorkerReply = { id: number; value?: unknown; error?: string };

class LibraryClient {
  private worker: Worker;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor() {
    this.worker = new Worker(new URL('./library.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      const task = this.pending.get(data.id);
      if (!task) return;
      this.pending.delete(data.id);
      if (data.error !== undefined) task.reject(new Error(data.error)); else task.resolve(data.value);
    };
  }

  request<T>(operation: string, ...args: unknown[]): Promise<T> {
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.worker.postMessage({ id, operation, args });
    });
  }
}

const client = new LibraryClient();
const snapshotFiles = new Map<string, File[]>();
let activeRecord: LibraryRecord | undefined;
let activeCapabilities: LibraryCapabilities | undefined;
let activeKind: LibraryKind | undefined;
let externalBase = '';

const ok = async <T>(task: () => Promise<T> | T): Promise<Result<T>> => {
  try { return { ok: true, value: await task() }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Ocurrió un error inesperado.' }; }
};

const summary = (record: LibraryRecord): LibrarySummary => librarySummary(record);

async function mark(id: string, status: LibraryRecord['status'], statusMessage?: string) {
  const record = await getLibraryRecord(id);
  if (!record) return;
  record.status = status; record.statusMessage = statusMessage;
  await saveLibraryRecord(record);
  if (activeRecord?.id === id) activeRecord = record;
}

async function descriptorFor(record: LibraryRecord, options: { files?: File[] } = {}): Promise<ProviderDescriptor> {
  switch (record.kind) {
    case 'example': return { kind: 'example', base: externalBase };
    case 'github': {
      return githubDescriptor(record);
    }
    case 'local-fs': {
      const handle = await getHandle(record.id);
      if (!handle) throw new Error('No se encontró el acceso guardado a la carpeta. Vuelve a seleccionarla.');
      const queryable = handle as FileSystemDirectoryHandle & { queryPermission?: (descriptor: { mode: string }) => Promise<PermissionState> };
      const permission = queryable.queryPermission ? await queryable.queryPermission({ mode: 'readwrite' }) : 'granted';
      if (permission !== 'granted') {
        await mark(record.id, 'requiere-permiso', 'El navegador pide autorización para usar esta carpeta.');
        throw new Error('Permiso pendiente: usa «Conceder acceso» para autorizar la carpeta.');
      }
      return { kind: 'local-fs', handle };
    }
    case 'local-snapshot': {
      const files = options.files?.length ? options.files : snapshotFiles.get(record.id);
      if (!files?.length) {
        await mark(record.id, 'requiere-reselección', 'Las instantáneas no se conservan al recargar. Vuelve a seleccionar la carpeta.');
        throw new Error('Esta biblioteca es una instantánea: vuelve a seleccionar la carpeta para consultarla.');
      }
      return { kind: 'local-snapshot', files };
    }
  }
}

async function openDescriptor(record: LibraryRecord, descriptor: ProviderDescriptor) {
  await mark(record.id, 'actualizando');
  const result = await client.request<{ collection: Collection; capabilities: LibraryCapabilities; kind: LibraryKind }>('open', descriptor, record.settings);
  activeRecord = record;
  activeCapabilities = result.capabilities;
  activeKind = result.kind;
  record.status = 'conectada'; record.statusMessage = undefined; record.updatedAt = Date.now();
  await saveLibraryRecord(record);
  return result.collection;
}

async function openRecord(id: string, files?: File[]): Promise<Collection | null> {
  const record = await getLibraryRecord(id);
  if (!record) throw new Error('La biblioteca ya no está registrada.');
  try {
    return await openDescriptor(record, await descriptorFor(record, { files }));
  } catch (error) {
    const current = await getLibraryRecord(id);
    if (current && current.status !== 'requiere-permiso' && current.status !== 'requiere-reselección') {
      await mark(id, 'error', (error as Error).message);
    }
    throw error;
  }
}

async function ensureExampleRecord(): Promise<LibraryRecord> {
  const records = await listLibraryRecords();
  const found = records.find(record => record.kind === 'example');
  if (found) return found;
  const record = newLibraryRecord({ name: 'Colección de ejemplos', kind: 'example', location: 'examples' });
  await saveLibraryRecord(record);
  return record;
}

export function createApi(base: string): Api {
  externalBase = new URL(base, location.href).href;
  const api: Api = {
    open: example => ok(async () => {
      if (example) return openRecord((await ensureExampleRecord()).id);
      const last = await getSetting('lastLibrary');
      if (last) return openRecord(last);
      return openRecord((await ensureExampleRecord()).id);
    }),
    refresh: () => ok(async () => {
      if (!activeRecord) throw new Error('Primero abre una biblioteca.');
      if (activeRecord.kind === 'local-snapshot') return client.request<Collection>('scan');
      const collection = await client.request<Collection>('scan');
      activeRecord.updatedAt = Date.now();
      await saveLibraryRecord(activeRecord);
      return collection;
    }),
    search: (request: SearchRequest) => ok(() => client.request<SearchResult>('search', request)),
    supplement: (path, kind) => ok(() => client.request<Collection>('supplement', path, kind)),
    read: (path: string) => ok(() => client.request<TextFile>('read', path)),
    save: (path, content, version) => ok(() => client.request<TextFile>('save', path, content, version)),
    create: (path, kind) => ok(() => client.request<Collection>('create', path, kind)),
    rename: (path, destination) => ok(() => client.request<Collection>('rename', path, destination)),
    reveal: (path: string) => ok(async () => { await navigator.clipboard.writeText(path); }),
    external: (path: string) => ok(async () => {
      const url = await client.request<string | undefined>('externalUrl', path);
      if (url) { window.open(url, '_blank', 'noopener'); return; }
      const file = await client.request<TextFile>('read', path);
      const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = path.split('/').pop() || 'archivo.txt';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    }),
    copy: (content: string) => ok(() => navigator.clipboard.writeText(content)),
    previewDocument: (request: DocumentRequest) => ok(async (): Promise<DocumentPreview> => {
      const model = await client.request<Parameters<typeof generatePreview>[0]>('model', request);
      return generatePreview(model);
    }),
    downloadDocument: (id: string) => ok(async () => {
      const stored = storedDocument(id);
      if (!stored) return null;
      return { filename: stored.title + '.html', html: stored.html };
    }),
    printDocument: (id: string) => ok(async () => { await printStored(id); }),
    listLibraries: () => ok(async () => (await listLibraryRecords()).map(summary)),
    addGitHubLibrary: (input: GitHubLibraryInput) => ok(async () => {
      const parsed = parseGitHubInput(input);
      const token = normalizeGitHubToken(input.token);
      const record = newLibraryRecord({
        name: input.name?.trim() || `${parsed.owner}/${parsed.repo}`,
        description: input.description?.trim() || undefined,
        kind: 'github', location: `https://github.com/${parsed.owner}/${parsed.repo}`,
        branch: parsed.branch, subpath: parsed.subpath,
        owner: parsed.owner, repo: parsed.repo, token
      });
      await saveLibraryRecord(record);
      await openRecord(record.id);
      return summary(record);
    }),
    addLocalLibrary: () => ok(async () => {
      const picker = (window as unknown as { showDirectoryPicker?: (options: { mode: string; id?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      if (!picker) throw new Error('Este navegador no admite el acceso directo a carpetas. Usa «Seleccionar instantánea».');
      let handle: FileSystemDirectoryHandle;
      try { handle = await picker({ mode: 'readwrite' }); }
      catch (error) { if ((error as DOMException).name === 'AbortError') return null; throw error; }
      const record = newLibraryRecord({ name: handle.name, kind: 'local-fs', location: handle.name });
      await setHandle(record.id, handle);
      await saveLibraryRecord(record);
      await openRecord(record.id);
      return summary(record);
    }),
    addSnapshotLibrary: ((files?: File[] | FileList, existingId?: string) => ok(async () => {
      const list = files ? [...files] as File[] : [];
      if (!list.length) throw new Error('Selecciona una carpeta con archivos.');
      let record: LibraryRecord | undefined;
      if (existingId) record = await getLibraryRecord(existingId);
      if (!record) {
        const root = (list[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0] || 'instantánea';
        record = newLibraryRecord({ name: root, kind: 'local-snapshot', location: root });
        await saveLibraryRecord(record);
      }
      snapshotFiles.set(record.id, list);
      await openDescriptor(record, { kind: 'local-snapshot', files: list });
      return summary(record);
    })) as Api['addSnapshotLibrary'],
    openLibrary: (id: string) => ok(() => openRecord(id)),
    removeLibrary: (id: string) => ok(async () => {
      await removeLibraryRecord(id);
      if (activeRecord?.id === id) { activeRecord = undefined; activeCapabilities = undefined; }
    }),
    updateLibrary: (id, patch) => ok(async () => {
      const record = await getLibraryRecord(id);
      if (!record) throw new Error('La biblioteca ya no está registrada.');
      if (patch.name !== undefined) record.name = patch.name.trim() || record.name;
      if (patch.description !== undefined) record.description = patch.description.trim() || undefined;
      await saveLibraryRecord(record);
      if (activeRecord?.id === id) activeRecord = record;
      return summary(record);
    }),
    grantAccess: (id: string) => ok(async () => {
      const record = await getLibraryRecord(id);
      if (!record || record.kind !== 'local-fs') throw new Error('Esta biblioteca no requiere permiso.');
      const handle = await getHandle(id);
      if (!handle) throw new Error('No se encontró el acceso guardado. Vuelve a seleccionar la carpeta.');
      const permission = await (handle as FileSystemDirectoryHandle & { requestPermission?(descriptor: { mode: string }): Promise<PermissionState> }).requestPermission!({ mode: 'readwrite' });
      if (permission !== 'granted') throw new Error('El navegador no concedió acceso a la carpeta.');
      await openRecord(id);
      return summary((await getLibraryRecord(id))!);
    }),
    listBranches: (input: GitHubLibraryInput) => ok(async () => {
      const parsed = parseGitHubInput(input);
      const provider: ProviderDescriptor = { kind: 'github', owner: parsed.owner, repo: parsed.repo, branch: parsed.branch, subpath: parsed.subpath, token: normalizeGitHubToken(input.token) };
      return client.request<{ branches: string[]; defaultBranch: string }>('branches', provider);
    }),
    capabilities: () => ok(async () => ({
      write: false, rename: false, watch: false, refresh: false,
      ...activeCapabilities,
      kind: activeKind || 'example',
      activeId: activeRecord?.id,
      dirty: await client.request<boolean>('changed').catch(() => false)
    })),
    exportLibraryIndex: (selection?: PracticeSelection[]) => ok(async () => {
      if (!activeRecord) throw new Error('Primero abre una biblioteca.');
      const selected = selection || await getPractice(activeRecord.id);
      const commit = await client.request<string>('latestCommit').catch(() => '');
      const index = await client.request<unknown>('exportIndex', {
        library: libraryIndexSource(activeRecord, commit),
        selection: selected
      });
      return { filename: 'referencemanager.library.json', json: JSON.stringify(index, null, 2) };
    }),
    saveLibraryIndexToRoot: (selection?: PracticeSelection[]) => ok(async () => {
      if (!activeRecord) throw new Error('Primero abre una biblioteca.');
      if (!activeCapabilities?.write) throw new Error('Esta biblioteca es de solo lectura.');
      const result = await api.exportLibraryIndex(selection);
      if (!result.ok) throw new Error(result.error);
      const bytes = new TextEncoder().encode(result.value.json);
      const descriptorHandle = await getHandle(activeRecord.id);
      if (!descriptorHandle) throw new Error('Solo se puede guardar en el índice de una carpeta local.');
      const handle = await descriptorHandle.getFileHandle('referencemanager.library.json', { create: true });
      const writable = await handle.createWritable();
      await writable.write(bytes as BufferSource);
      await writable.close();
    }),
    assignStableId: (path: string) => ok(() => client.request<Collection>('assignStableId', path)),
    assignMissingIds: () => ok(async () => (await client.request<{ collection: Collection; assigned: number }>('assignMissingIds')).collection),
    setPractice: (file: string, selected: boolean) => ok(async () => {
      if (!activeRecord) throw new Error('Primero abre una biblioteca.');
      const collection = await client.request<Collection>('scan');
      const reference = collection.references.find(item => item.files.includes(file));
      if (!reference) throw new Error('El archivo ya no pertenece a una referencia.');
      const { referenceId } = await import('../core/library-index.js');
      const identity = await referenceId(reference);
      const current = (await getPractice(activeRecord.id)).filter(item => !(item.referenceId === identity.id && item.file === file));
      if (selected) current.push({ referenceId: identity.id, file });
      await setPractice(activeRecord.id, current);
    }),
    practiceSelection: () => ok(async () => activeRecord ? getPractice(activeRecord.id) : [])
  };
  return api;
}
