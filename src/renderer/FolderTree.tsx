import { useEffect, useMemo, useRef, useState } from 'react';
import type { Collection, Entry } from '../shared/types.js';
import { collator } from '../shared/formats.js';

type Props = { collection: Collection; scope: string; busy: boolean; onFolder: (path: string) => void; onFile: (path: string) => void };
export function FolderTree({ collection, scope, busy, onFolder, onFile }: Props) {
  const [collapsed, setCollapsed] = useState(() => new Set(collection.entries.length > 1000 ? collection.entries.filter(entry => entry.directory).map(entry => entry.path) : []));
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(400);
  const viewport = useRef<HTMLDivElement>(null);
  const references = useMemo(() => new Map(collection.references.map(reference => [reference.path, reference.title])), [collection]);
  const children = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of collection.entries) {
      const parent = entry.path.split(/[\\/]/).slice(0, -1).join('/');
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(entry);
    }
    for (const entries of map.values()) entries.sort((a, b) => Number(b.directory) - Number(a.directory) || collator.compare(a.name, b.name));
    return map;
  }, [collection]);
  const rows = useMemo(() => {
    const result: { entry: Entry; depth: number }[] = [];
    const stack = (children.get('') || []).map(entry => ({ entry, depth: 0 })).reverse();
    while (stack.length) {
      const current = stack.pop()!; result.push(current);
      if (current.entry.directory && !collapsed.has(current.entry.path)) for (const entry of [...(children.get(current.entry.path.replaceAll('\\', '/')) || [])].reverse()) stack.push({ entry, depth: current.depth + 1 });
    }
    return result;
  }, [children, collapsed]);
  useEffect(() => {
    if (!viewport.current) return;
    const element = viewport.current;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight || 400));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const toggle = (path: string) => setCollapsed(previous => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  const start = Math.max(0, Math.min(Math.floor(scroll / 36) - 6, rows.length - Math.ceil(height / 36) - 12));
  return <nav className="folder-tree" aria-label="Explorador de la colección">
    <button className={!scope ? 'selected' : ''} disabled={busy} onClick={() => onFolder('')}>Toda la colección</button>
    <div className="tree-legend"><span>Categoría</span><strong>Referencia</strong><code>archivo.cpp</code></div>
    <div className="tree-controls"><button disabled={busy} onClick={() => setCollapsed(new Set(collection.entries.filter(entry => entry.directory).map(entry => entry.path)))}>Plegar todo</button><button disabled={busy} onClick={() => setCollapsed(new Set())}>Desplegar todo</button></div>
    <div className="tree-viewport" ref={viewport} tabIndex={0} role="tree" aria-label="Árbol de archivos" onScroll={event => setScroll(event.currentTarget.scrollTop)}>
      <div style={{ height: rows.length * 36, position: 'relative' }}>{rows.slice(start, start + Math.ceil(height / 36) + 12).map(({ entry, depth }, index) => {
        const expanded = !collapsed.has(entry.path), title = references.get(entry.path);
        return <div role="treeitem" aria-level={depth + 1} aria-expanded={entry.directory ? expanded : undefined} aria-selected={entry.directory && scope === entry.path} key={entry.path} style={{ position: 'absolute', top: (start + index) * 36, left: 0, right: 0 }}>
          <div className={`tree-row ${entry.directory ? title ? 'tree-reference' : 'tree-folder' : 'tree-file'} ${scope === entry.path && entry.directory ? 'selected' : ''}`} style={{ paddingLeft: Math.min(depth, 10) * 12 }}>
            {entry.directory ? <button className="tree-toggle" disabled={busy} aria-label={`${expanded ? 'Plegar' : 'Desplegar'} ${entry.name}`} aria-expanded={expanded} onClick={() => toggle(entry.path)}>{expanded ? '▾' : '▸'}</button> : <span className="tree-leaf" aria-hidden="true">└</span>}
            <button className="tree-label" title={entry.path} disabled={busy} onClick={() => entry.directory ? onFolder(entry.path) : onFile(entry.path)}><span>{title || entry.name}</span>{entry.directory && <small>{title ? 'referencia' : depth === 0 ? 'categoría' : 'carpeta'}</small>}</button>
          </div>
        </div>;
      })}</div>
    </div>
  </nav>;
}
