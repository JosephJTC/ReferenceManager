import { useEffect, useMemo, useRef, useState } from 'react';
import type { Collection, Entry } from '../shared/types.js';
import { collator } from '../shared/formats.js';
import { FileBadge, Icon } from './icons.js';

type Props = {
  collection: Collection; scope: string; busy: boolean; mode: 'reading' | 'editing'; selected?: string; collapseSignal?: { all: boolean; n: number };
  onFolder: (path: string) => void; onFile: (path: string) => void; onReference: (path: string) => void;
  onContext?: (entry: Entry | undefined, x: number, y: number) => void;
};
const rowHeight = 26;
const parentOf = (path: string) => path.split(/[\\/]/).slice(0, -1).join('/');

export function FolderTree({ collection, scope, busy, mode, selected, collapseSignal, onFolder, onFile, onReference, onContext }: Props) {
  const [collapsed, setCollapsed] = useState(() => new Set(collection.entries.length > 1000 ? collection.entries.filter(entry => entry.directory).map(entry => entry.path) : []));
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(400);
  const [focus, setFocus] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const references = useMemo(() => new Map(collection.references.map(reference => [reference.path, reference.title])), [collection]);
  const reading = mode === 'reading';
  const children = useMemo(() => {
    const withReferences = new Set<string>();
    if (reading) for (const reference of collection.references) for (let path = reference.path; path; path = parentOf(path)) withReferences.add(path);
    const insideReference = (path: string) => { for (let parent = parentOf(path); parent; parent = parentOf(parent)) if (references.has(parent)) return true; return false; };
    const map = new Map<string, Entry[]>();
    for (const entry of collection.entries) {
      if (reading && (!entry.directory || !withReferences.has(entry.path) || insideReference(entry.path))) continue;
      const parent = parentOf(entry.path);
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(entry);
    }
    for (const entries of map.values()) entries.sort((a, b) => Number(b.directory) - Number(a.directory) || collator.compare(references.get(a.path) || a.name, references.get(b.path) || b.name));
    return map;
  }, [collection, reading, references]);
  const expandable = (entry: Entry) => entry.directory && (!reading || !references.has(entry.path)) && !!children.get(entry.path)?.length;
  const rows = useMemo(() => {
    const result: { entry: Entry; depth: number }[] = [];
    const stack = (children.get('') || []).map(entry => ({ entry, depth: 0 })).reverse();
    while (stack.length) {
      const current = stack.pop()!; result.push(current);
      if (expandable(current.entry) && !collapsed.has(current.entry.path)) for (const entry of [...(children.get(current.entry.path.replaceAll('\\', '/')) || [])].reverse()) stack.push({ entry, depth: current.depth + 1 });
    }
    return result;
  }, [children, collapsed, reading]);
  useEffect(() => {
    if (!viewport.current) return;
    const element = viewport.current;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight || 400));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => { if (collapseSignal?.n) setCollapsed(collapseSignal.all ? new Set(collection.entries.filter(entry => entry.directory).map(entry => entry.path)) : new Set()); }, [collapseSignal]);
  const toggle = (path: string, force?: boolean) => setCollapsed(previous => { const next = new Set(previous); const close = force ?? !next.has(path); if (close) next.add(path); else next.delete(path); return next; });
  const activate = (entry: Entry) => entry.directory ? references.has(entry.path) ? onReference(entry.path) : onFolder(entry.path) : onFile(entry.path);
  const start = Math.max(0, Math.min(Math.floor(scroll / rowHeight) - 6, rows.length - Math.ceil(height / rowHeight) - 12));
  const moveFocus = (index: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, index)); setFocus(next);
    const element = viewport.current; if (!element) return;
    if (next * rowHeight < element.scrollTop) element.scrollTop = next * rowHeight;
    else if ((next + 1) * rowHeight > element.scrollTop + element.clientHeight) element.scrollTop = (next + 1) * rowHeight - element.clientHeight;
  };
  return <nav className="folder-tree" aria-label="Explorador de la colección">
    <div className="tree-viewport" ref={viewport} tabIndex={0} role="tree" aria-label="Árbol de archivos" onScroll={event => setScroll(event.currentTarget.scrollTop)}
      onContextMenu={event => { if (onContext && event.target === event.currentTarget) { event.preventDefault(); onContext(undefined, event.clientX, event.clientY); } }}
      onKeyDown={event => {
        const row = rows[focus]; if (!row) return;
        if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(focus + 1); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(focus - 1); }
        else if (event.key === 'ArrowRight' && expandable(row.entry)) { event.preventDefault(); toggle(row.entry.path, false); }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); if (expandable(row.entry) && !collapsed.has(row.entry.path)) toggle(row.entry.path, true); else { const parent = rows.findIndex(item => item.entry.path === parentOf(row.entry.path)); if (parent >= 0) moveFocus(parent); } }
        else if (event.key === 'Enter') { event.preventDefault(); activate(row.entry); }
      }}>
      <button className={`tree-root ${!scope ? 'selected' : ''}`} disabled={busy} onClick={() => onFolder('')} onContextMenu={event => { if (onContext) { event.preventDefault(); onContext(undefined, event.clientX, event.clientY); } }}><Icon name="libraries" size={14} /> Toda la colección</button>
      <div style={{ height: rows.length * rowHeight, position: 'relative' }}>{rows.slice(start, start + Math.ceil(height / rowHeight) + 12).map(({ entry, depth }, index) => {
        const position = start + index, open = !collapsed.has(entry.path), title = references.get(entry.path), canExpand = expandable(entry);
        const isSelected = selected === entry.path || (entry.directory && !title && scope === entry.path);
        return <div role="treeitem" aria-level={depth + 1} aria-expanded={canExpand ? open : undefined} aria-selected={isSelected} key={entry.path} style={{ position: 'absolute', top: position * rowHeight, left: 0, right: 0 }}>
          <div className={`tree-row ${entry.directory ? title ? 'tree-reference' : 'tree-folder' : 'tree-file'} ${isSelected ? 'selected' : ''} ${focus === position ? 'focused' : ''}`} style={{ paddingLeft: 4 + Math.min(depth, 12) * 12 }}
            onContextMenu={event => { if (onContext) { event.preventDefault(); setFocus(position); onContext(entry, event.clientX, event.clientY); } }}>
            {canExpand ? <button className="tree-toggle" tabIndex={-1} disabled={busy} aria-label={`${open ? 'Plegar' : 'Desplegar'} ${entry.name}`} aria-expanded={open} onClick={() => toggle(entry.path)}>{open ? '▾' : '▸'}</button> : <span className="tree-leaf" aria-hidden="true" />}
            <button className="tree-label" tabIndex={-1} title={entry.path} disabled={busy} onClick={() => { setFocus(position); activate(entry); }}>
              {entry.directory ? <Icon name={title ? 'book' : open && canExpand ? 'folderOpen' : 'folder'} size={14} /> : <FileBadge name={entry.name} />}
              <span>{title || entry.name}</span>
            </button>
          </div>
        </div>;
      })}</div>
      {!rows.length && <p className="muted tree-empty">{reading ? 'No hay referencias en esta biblioteca.' : 'La biblioteca está vacía.'}</p>}
    </div>
  </nav>;
}
