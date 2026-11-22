import type { LibraryKind, LibraryStatus } from '../shared/types.js';
import type { PracticeSelection } from '../shared/types.js';
import { idbGet, idbGetAll, idbPut, idbDelete } from './idb.js';

export type LibraryRecord = {
  id: string; name: string; description?: string; kind: LibraryKind; location: string;
  branch?: string; subpath?: string; createdAt: number; updatedAt: number;
  status: LibraryStatus; statusMessage?: string;
  settings: { ignore: string[]; maxFileBytes: number };
  owner?: string; repo?: string; commit?: string;
};

export async function listLibraryRecords(): Promise<LibraryRecord[]> {
  const records = await idbGetAll<LibraryRecord>('libraries');
  return records.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getLibraryRecord(id: string) { return idbGet<LibraryRecord>('libraries', id); }

export async function saveLibraryRecord(record: LibraryRecord) {
  await idbPut('libraries', { ...record });
  await setSetting('lastLibrary', record.id);
}

export async function removeLibraryRecord(id: string) {
  await idbDelete('libraries', id);
  await idbDelete('handles', id);
  await idbDelete('practice', id);
  await idbDelete('collections', id);
  const keys = [`tree:`, `blob:`].map(() => null);
  if (await getSetting('lastLibrary') === id) await setSetting('lastLibrary', '');
}

export async function getHandle(id: string) { return idbGet<FileSystemDirectoryHandle>('handles', id); }
export async function setHandle(id: string, handle: FileSystemDirectoryHandle) { await idbPut('handles', handle, id); }

export async function getPractice(id: string): Promise<PracticeSelection[]> { return (await idbGet<PracticeSelection[]>('practice', id)) || []; }
export async function setPractice(id: string, selection: PracticeSelection[]) { await idbPut('practice', selection, id); }

export async function getSetting(key: string): Promise<string | undefined> { return idbGet<string>('ghcache', `setting:${key}`); }
export async function setSetting(key: string, value: string) { await idbPut('ghcache', value, `setting:${key}`); }

export function newLibraryRecord(partial: Omit<LibraryRecord, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'settings'> & { settings?: LibraryRecord['settings'] }): LibraryRecord {
  const now = Date.now();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, status: 'sin-conectar', settings: { ignore: [], maxFileBytes: 2 * 1024 * 1024 }, ...partial };
}
