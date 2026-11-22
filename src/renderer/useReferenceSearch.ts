import { useEffect, useState } from 'react';
import type { Collection, SearchRequest, SearchResult } from '../shared/types.js';

export function useReferenceSearch(collection: Collection | undefined, request: SearchRequest, onError: (message: string) => void) {
  const [result, setResult] = useState<SearchResult>({ paths: [], total: 0, offset: 0, limit: 100 });
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!collection) return;
    let active = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await window.api.search(request);
        if (active) { if (response.ok) setResult(response.value); else onError(response.error); }
      } catch { if (active) onError('No se pudo completar la búsqueda. Vuelve a abrir la colección.'); }
      finally { if (active) setSearching(false); }
    }, 100);
    return () => { active = false; clearTimeout(timer); };
  }, [collection, request, onError]);
  return { ...result, searching };
}
