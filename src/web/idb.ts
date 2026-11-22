const database = 'referencemanager';
const version = 1;
const stores = ['libraries', 'handles', 'practice', 'ghcache', 'collections'] as const;
export type StoreName = typeof stores[number];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, version);
    request.onupgradeneeded = () => {
      for (const store of stores) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, store === 'libraries' || store === 'collections' ? { keyPath: 'id' } : undefined);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(store: StoreName, mode: IDBTransactionMode, action: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = action(tx.objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export const idbGet = <T>(store: StoreName, key: string) => transaction<T | undefined>(store, 'readonly', os => os.get(key) as IDBRequest<T | undefined>);
export const idbGetAll = <T>(store: StoreName) => transaction<T[]>(store, 'readonly', os => os.getAll() as IDBRequest<T[]>);
export const idbPut = (store: StoreName, value: unknown, key?: string) => transaction(store, 'readwrite', os => key === undefined ? os.put(value) : os.put(value, key));
export const idbDelete = (store: StoreName, key: string) => transaction(store, 'readwrite', os => os.delete(key));
