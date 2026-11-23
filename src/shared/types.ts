import type { DocumentRequest, DocumentPreview } from './document.js';
export type Entry = { path: string; name: string; directory: boolean };
export type Metadata = { id?: string; title?: string; description?: string; category?: string; platform?: string; url?: string; tags?: string[]; language?: string; files?: string[]; notes?: string; [key: string]: unknown };
export type Reference = { path: string; title: string; files: string[]; code: string[]; metadata: Metadata; warnings: string[]; searchText: string; modified: number; hasMetadata: boolean };
export type Collection = { root: string; entries: Entry[]; references: Reference[]; warnings: string[]; stats?: { durationMs: number; cacheHits: number; indexedBytes: number } };
export type SearchRequest = { query: string; filter: string; scope: string; sort: string; language?: string; tag?: string; extension?: string; category?: string; platform?: string; offset?: number; limit?: number };
export type SearchResult = { paths: string[]; total: number; offset: number; limit: number };
export type TextFile = { path: string; content: string; version: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type LibraryKind = 'local-fs' | 'local-snapshot' | 'github' | 'example';
export type LibraryStatus = 'conectada' | 'sin-conectar' | 'requiere-permiso' | 'requiere-reselección' | 'error' | 'actualizando';
export type LibraryCapabilities = { write: boolean; rename: boolean; watch: boolean; refresh: boolean };
export type LibrarySummary = {
  id: string; name: string; description?: string; kind: LibraryKind; location: string;
  branch?: string; subpath?: string; createdAt: number; updatedAt: number;
  status: LibraryStatus; statusMessage?: string;
};
export type GitHubLibraryInput = { url?: string; owner?: string; repo?: string; branch?: string; subpath?: string; token?: string; name?: string; description?: string };
export type PracticeSelection = { referenceId: string; file: string };

export interface Api {
  open(example?: boolean): Promise<Result<Collection | null>>;
  refresh(): Promise<Result<Collection>>;
  search(request: SearchRequest): Promise<Result<SearchResult>>;
  supplement(path: string, kind: 'notes' | 'metadata'): Promise<Result<Collection>>;
  read(path: string): Promise<Result<TextFile>>;
  save(path: string, content: string, version: string): Promise<Result<TextFile>>;
  create(path: string, kind: 'folder' | 'reference' | 'file'): Promise<Result<Collection>>;
  remove(path: string): Promise<Result<Collection>>;
  readAsset(path: string): Promise<Result<{ path: string; mime: string; data: string }>>;
  rename(path: string, destination: string): Promise<Result<Collection>>;
  reveal(path: string): Promise<Result<void>>;
  external(path: string): Promise<Result<void>>;
  copy(text: string): Promise<Result<void>>;
  previewDocument(request: DocumentRequest): Promise<Result<DocumentPreview>>;
  downloadDocument(id: string): Promise<Result<{ filename: string; html: string } | null>>;
  printDocument(id: string): Promise<Result<void>>;
  listLibraries(): Promise<Result<LibrarySummary[]>>;
  addGitHubLibrary(input: GitHubLibraryInput): Promise<Result<LibrarySummary>>;
  addLocalLibrary(): Promise<Result<LibrarySummary | null>>;
  addSnapshotLibrary(files?: File[] | FileList, existingId?: string): Promise<Result<LibrarySummary | null>>;
  openLibrary(id: string): Promise<Result<Collection | null>>;
  removeLibrary(id: string): Promise<Result<void>>;
  updateLibrary(id: string, patch: { name?: string; description?: string }): Promise<Result<LibrarySummary>>;
  grantAccess(id: string): Promise<Result<LibrarySummary>>;
  listBranches(input: GitHubLibraryInput): Promise<Result<{ branches: string[]; defaultBranch: string }>>;
  capabilities(): Promise<Result<LibraryCapabilities & { kind: LibraryKind; activeId?: string; dirty?: boolean }>>;
  exportLibraryIndex(selection?: PracticeSelection[]): Promise<Result<{ filename: string; json: string }>>;
  saveLibraryIndexToRoot(selection?: PracticeSelection[]): Promise<Result<void>>;
  assignStableId(path: string): Promise<Result<Collection>>;
  assignMissingIds(): Promise<Result<Collection>>;
  setPractice(file: string, selected: boolean): Promise<Result<void>>;
  practiceSelection(): Promise<Result<PracticeSelection[]>>;
}
declare global { interface Window { api: Api } }
