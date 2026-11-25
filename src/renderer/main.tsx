import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'highlight.js/styles/github-dark.css';
import './style.css';
import type { Collection, Entry, Reference, Result, TextFile, LibraryCapabilities, LibraryKind } from '../shared/types.js';
import { metadataLabels } from '../shared/metadata-labels.js';
import { collator, codeExtensions, extensionOf, isEditableFile, isMetadataFile, referenceLanguages } from '../shared/formats.js';
import { referenceCategory, referencePlatform } from '../shared/search.js';
import { stableIdPattern } from '../core/library-index.js';
import { createApi } from '../web/api.js';
import { FolderTree } from './FolderTree.js';
import { useReferenceSearch } from './useReferenceSearch.js';
import { LibrariesPanel } from './LibrariesPanel.js';
import { FilterBar, emptyFilters, activeFilterCount, type Filters } from './FilterBar.js';
import { MenuBar, ContextMenu, type Menu, type ContextItem } from './MenuBar.js';
import { ReadingView } from './ReadingView.js';
import { MarkdownView } from './MarkdownView.js';
import { CodeView } from './CodeView.js';
import { FileBadge, Icon } from './icons.js';
const DocumentWorkspace = lazy(() => import('./DocumentWorkspace.js').then(module => ({ default: module.DocumentWorkspace })));

window.api = createApi(import.meta.env.BASE_URL || './');

type Mode = 'reading' | 'editing';
type OpenFile = TextFile & { draft: string; preview?: boolean };
type Operation = 'folder' | 'reference' | 'file' | 'rename';
const defaultCapabilities: LibraryCapabilities & { kind: LibraryKind; activeId?: string; dirty?: boolean } = { write: false, rename: false, watch: false, refresh: false, kind: 'example' };
const stored = <T,>(key: string, fallback: T): T => { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value) as T; } catch { return fallback; } };
const persist = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const kindLabel = (kind: LibraryKind) => kind === 'github' ? 'GitHub · solo lectura' : kind === 'local-fs' ? 'Carpeta local' : kind === 'local-snapshot' ? 'Instantánea · solo lectura' : 'Ejemplos';
const operationTitles: Record<Operation, string> = { folder: 'Nueva carpeta', reference: 'Nueva referencia', file: 'Nuevo archivo', rename: 'Mover o renombrar' };

function useResizable(key: string, initial: number, min: number, max: number, side: 'left' | 'right') {
  const [width, setWidth] = useState(() => Math.min(max, Math.max(min, stored(key, initial))));
  const start = (event: React.PointerEvent) => {
    event.preventDefault();
    const origin = event.clientX, base = width;
    const move = (moveEvent: PointerEvent) => setWidth(Math.min(max, Math.max(min, base + (side === 'left' ? 1 : -1) * (moveEvent.clientX - origin))));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  useEffect(() => persist(key, width), [key, width]);
  const keyboard = (event: React.KeyboardEvent) => { const delta = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0; if (delta) { event.preventDefault(); setWidth(value => Math.min(max, Math.max(min, value + (side === 'left' ? delta : -delta)))); } };
  return { width, start, keyboard };
}

function App() {
  const [collection, setCollection] = useState<Collection>();
  const [caps, setCaps] = useState(defaultCapabilities);
  const [workspace, setWorkspace] = useState<'libraries' | 'library' | 'document'>('library');
  const [documentOpened, setDocumentOpened] = useState(false);
  const [printSelection, setPrintSelection] = useState<{ paths: string[]; n: number }>();
  const [mode, setModeState] = useState<Mode>(() => stored<Mode>('mode', 'reading') === 'editing' ? 'editing' : 'reading');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => stored('theme', window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  const [sidebarOpen, setSidebarOpen] = useState(() => stored('sidebar-open', true));
  const [infoOpen, setInfoOpen] = useState(() => stored('info-open', true));
  const [sideView, setSideView] = useState<'tree' | 'results'>('tree');
  const [reference, setReference] = useState<Reference>();
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [resultPage, setResultPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Conecta una biblioteca o explora los ejemplos para comenzar.');
  const [operation, setOperation] = useState<Operation>();
  const [operationSource, setOperationSource] = useState('');
  const [destination, setDestination] = useState('');
  const [practiced, setPracticed] = useState(new Set<string>());
  const [context, setContext] = useState<{ x: number; y: number; items: ContextItem[] }>();
  const [collapseSignal, setCollapseSignal] = useState({ all: false, n: 0 });
  const [filterSignal, setFilterSignal] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const sidebar = useResizable('sidebar-width', 280, 200, 520, 'left');
  const info = useResizable('info-width', 260, 200, 440, 'right');
  const modal = useRef<HTMLDialogElement>(null);
  const shortcutsModal = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const file = openFiles.find(item => item.path === activePath);
  const dirtyFiles = openFiles.filter(item => item.draft !== item.content);
  const dirty = dirtyFiles.length > 0;
  const editing = mode === 'editing';
  const canLeave = () => !dirty || window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?');
  useEffect(() => { document.documentElement.dataset.theme = theme; persist('theme', theme); }, [theme]);
  useEffect(() => persist('sidebar-open', sidebarOpen), [sidebarOpen]);
  useEffect(() => persist('info-open', infoOpen), [infoOpen]);
  useEffect(() => {
    const preventClose = (event: BeforeUnloadEvent) => {
      if (busy || dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres cerrar y descartarlos?')) {
        event.preventDefault(); event.returnValue = false;
        if (busy) setNotice('Espera a que termine la operación antes de cerrar la página.');
      }
    };
    window.addEventListener('beforeunload', preventClose);
    return () => window.removeEventListener('beforeunload', preventClose);
  }, [dirty, busy]);
  useEffect(() => { if (operation && !modal.current?.open) modal.current?.showModal(); if (!operation) modal.current?.close(); }, [operation]);
  useEffect(() => { if (shortcutsOpen && !shortcutsModal.current?.open) shortcutsModal.current?.showModal(); if (!shortcutsOpen) shortcutsModal.current?.close(); }, [shortcutsOpen]);
  const request = useMemo(() => ({ query, scope, ...filters, offset: resultPage * 100, limit: 100 }), [query, scope, filters, resultPage]);
  const onSearchError = useCallback((message: string) => setNotice(message), []);
  const search = useReferenceSearch(collection, request, onSearchError);
  const referenceMap = useMemo(() => new Map(collection?.references.map(item => [item.path, item]) || []), [collection]);
  const results = search.paths.map(path => referenceMap.get(path)).filter((value): value is Reference => !!value);
  const options = useMemo(() => {
    const unique = (values: string[]) => [...new Set(values)].sort(collator.compare);
    const references = collection?.references || [];
    return {
      languages: unique(references.flatMap(referenceLanguages)),
      tags: unique(references.flatMap(item => item.metadata.tags || [])).slice(0, 300),
      extensions: unique(references.flatMap(item => item.files.map(extensionOf))).filter(Boolean),
      categories: unique(references.map(referenceCategory)),
      platforms: unique(references.map(referencePlatform)).filter(Boolean)
    };
  }, [collection]);
  const filtering = !!query || activeFilterCount(filters) > 0;
  function setMode(next: Mode) {
    if (next === mode) return;
    setModeState(next); persist('mode', next);
    setNotice(next === 'reading' ? 'Modo lectura: solo se muestra el contenido de cada referencia. Los archivos no se modifican.' : 'Modo edición: estructura completa, metadatos y archivos auxiliares visibles.');
    if (next === 'editing' && reference && !openFiles.some(item => reference.files.includes(item.path))) void openFirst(reference);
  }
  async function refreshCapabilities() { const result = await window.api.capabilities(); if (result.ok) setCaps(result.value); }
  async function refreshPractice() { const result = await window.api.practiceSelection(); if (result.ok) setPracticed(new Set(result.value.map(item => item.file))); }
  async function run<T,>(task: () => Promise<Result<T>>, done?: (value: T) => void | Promise<void>, failed?: () => void) {
    setBusy(true);
    try { const result = await task(); if (!result.ok) { setNotice(result.error); failed?.(); } else await done?.(result.value); }
    catch { setNotice('No se pudo comunicar con el servicio local de la página. Recarga e inténtalo de nuevo.'); failed?.(); }
    finally { setBusy(false); }
  }
  function changeQuery(value: string) { setQuery(value); setResultPage(0); if (value) setSideView('results'); }
  function changeFilters(value: Filters) { setFilters(value); setResultPage(0); if (activeFilterCount(value)) setSideView('results'); }
  function clearFilters() { setQuery(''); setFilters(emptyFilters); setScope(''); setResultPage(0); }
  function changeScope(path: string) { setScope(path); setResultPage(0); }
  function applyCollection(value: Collection | null, label: string) {
    if (!value) return;
    sequence.current++; setCollection(value); setReference(undefined); setOpenFiles([]); setActivePath(undefined); setScope('');
    setQuery(''); setFilters(emptyFilters); setResultPage(0); setWorkspace('library'); setSideView('tree');
    setNotice(`${label}: ${value.references.length} referencias. ${value.warnings.length ? 'Revisa las advertencias del explorador.' : ''}`);
    void refreshCapabilities(); void refreshPractice();
  }
  async function openLibrary(id: string) { if (!canLeave()) return; await run(() => window.api.openLibrary(id), value => applyCollection(value, 'Biblioteca abierta')); }
  async function openExamples() { if (!canLeave()) return; await run(() => window.api.open(true), value => applyCollection(value, 'Ejemplos abiertos')); }
  async function snapshotChosen(files: FileList | File[], existingId?: string) {
    await run(() => window.api.addSnapshotLibrary(files, existingId), async value => {
      if (!value) return;
      const result = await window.api.openLibrary(existingId || value.id);
      if (result.ok) applyCollection(result.value, 'Instantánea abierta'); else setNotice(result.error);
    });
  }
  const ownerOf = (path: string, value = collection) => value?.references.find(item => item.files.includes(path)) || value?.references.filter(item => !item.path || path.startsWith(item.path + '/')).sort((a, b) => b.path.length - a.path.length)[0];
  async function openFile(path: string, owner?: Reference) {
    const id = ++sequence.current;
    const existing = openFiles.find(item => item.path === path);
    setReference(owner || ownerOf(path));
    if (existing) { setActivePath(path); return; }
    await run(() => window.api.read(path), value => {
      if (id !== sequence.current) return;
      setOpenFiles(previous => previous.some(item => item.path === path) ? previous : [...previous, { ...value, draft: value.content }]);
      setActivePath(path); setNotice(`Archivo abierto: ${path}`);
    });
  }
  async function openFirst(ref: Reference) {
    const first = ref.code[0] || ref.files.find(path => /\.(md|txt)$/i.test(path)) || ref.files.find(isMetadataFile);
    if (first) await openFile(first, ref); else setReference(ref);
  }
  async function select(ref: Reference) {
    if (workspace !== 'library') setWorkspace('library');
    if (editing) await openFirst(ref);
    else { sequence.current++; setReference(ref); }
  }
  function closeFile(path: string) {
    const target = openFiles.find(item => item.path === path);
    if (target && target.draft !== target.content && !window.confirm(`«${path}» tiene cambios sin guardar. ¿Cerrar y descartarlos?`)) return;
    const index = openFiles.findIndex(item => item.path === path);
    const rest = openFiles.filter(item => item.path !== path);
    setOpenFiles(rest);
    if (activePath === path) setActivePath(rest[Math.min(index, rest.length - 1)]?.path);
  }
  const updateFile = (path: string, patch: Partial<OpenFile>) => setOpenFiles(previous => previous.map(item => item.path === path ? { ...item, ...patch } : item));
  async function reloadOpenFiles(value: Collection) {
    const present = new Set(value.entries.filter(entry => !entry.directory).map(entry => entry.path));
    const next: OpenFile[] = [];
    for (const item of openFiles) {
      if (!present.has(item.path)) continue;
      if (item.draft !== item.content) { next.push(item); continue; }
      const updated = await window.api.read(item.path);
      if (updated.ok) next.push({ ...updated.value, draft: updated.value.content, preview: item.preview });
    }
    setOpenFiles(next);
    if (activePath && !next.some(item => item.path === activePath)) setActivePath(next[0]?.path);
  }
  async function refresh() {
    if (!canLeave()) return;
    await run(() => window.api.refresh(), async value => {
      sequence.current++; setCollection(value); setResultPage(0);
      setReference(value.references.find(item => item.path === reference?.path));
      if (scope && !value.entries.some(entry => entry.directory && entry.path === scope)) setScope('');
      setOpenFiles(previous => previous.map(item => ({ ...item, draft: item.content })));
      await reloadOpenFiles(value);
      setNotice(`Biblioteca actualizada en ${value.stats?.durationMs ?? '?'} ms; ${value.stats?.cacheHits ?? 0} referencias reutilizadas desde caché.`);
    });
  }
  async function save() {
    if (!file || !caps.write || file.draft === file.content) return;
    const path = file.path;
    await run(() => window.api.save(path, file.draft, file.version), async value => {
      updateFile(path, { ...value, draft: value.content }); setNotice(`Guardado: ${path}`);
      const updated = await window.api.refresh();
      if (updated.ok) { setCollection(updated.value); setReference(updated.value.references.find(item => item.path === reference?.path) || ownerOf(path, updated.value)); }
      else setNotice(`El archivo se guardó, pero no se pudo actualizar el índice: ${updated.error}`);
    });
  }
  async function supplement(kind: 'notes' | 'metadata') {
    if (!reference) return;
    const ownerPath = reference.path;
    await run(() => window.api.supplement(ownerPath, kind), async value => {
      setCollection(value);
      const owner = value.references.find(item => item.path === ownerPath);
      const target = owner?.files.find(path => kind === 'metadata' ? isMetadataFile(path) : /(?:^|[\\/])notes\.md$/i.test(path));
      if (owner) setReference(owner);
      if (target) { setModeState('editing'); persist('mode', 'editing'); await openFile(target, owner); setNotice('Archivo complementario creado.'); }
    });
  }
  async function assignId() { if (reference) await run(() => window.api.assignStableId(reference.path), value => { setCollection(value); setReference(value.references.find(item => item.path === reference.path)); setNotice('ID estable asignado en los metadatos.'); }); }
  async function assignAllIds() {
    if (!window.confirm('Se insertará un campo «id» en los metadatos de todas las referencias que no lo tengan. ¿Continuar?')) return;
    await run(() => window.api.assignMissingIds(), value => { setCollection(value); setNotice('IDs asignados donde faltaban.'); });
  }
  async function exportIndex() {
    await run(() => window.api.exportLibraryIndex(), value => {
      const blob = new Blob([value.json], { type: 'application/json;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob); link.download = value.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
      setNotice(`Índice descargado: ${value.filename}`);
    });
  }
  async function togglePractice(path: string) {
    const next = !practiced.has(path);
    await run(() => window.api.setPractice(path, next), () => {
      setPracticed(previous => { const updated = new Set(previous); if (next) updated.add(path); else updated.delete(path); return updated; });
      setNotice(next ? 'Archivo marcado para practicar.' : 'Archivo desmarcado.');
    });
  }
  function startOperation(kind: Operation, source = reference?.path || scope) {
    if (!caps.write) { setNotice('Esta biblioteca es de solo lectura.'); return; }
    if (kind === 'rename' && dirty && !canLeave()) return;
    setOperationSource(source); setOperation(kind);
    const base = kind === 'rename' ? source : source ? source + '/' : '';
    setDestination(kind === 'file' ? base + 'explicacion.md' : base);
    setNotice('Escribe una ruta relativa a la biblioteca. No se sobrescriben destinos existentes.');
  }
  async function afterStructureChange(value: Collection, message: string, open?: string) {
    sequence.current++; setCollection(value); setResultPage(0); setOperation(undefined);
    setReference(previous => previous && value.references.find(item => item.path === previous.path));
    if (scope && !value.entries.some(entry => entry.directory && entry.path === scope)) setScope('');
    const present = new Set(value.entries.filter(entry => !entry.directory).map(entry => entry.path));
    const rest = openFiles.filter(item => present.has(item.path));
    setOpenFiles(rest); if (activePath && !present.has(activePath)) setActivePath(rest[0]?.path);
    setNotice(message);
    if (open) await openFile(open, ownerOf(open, value));
  }
  async function submitOperation(event: React.FormEvent) {
    event.preventDefault();
    if (!operation) return;
    if (operation === 'rename' && !window.confirm(`¿Mover o renombrar «${operationSource}» a «${destination}»?`)) return;
    const target = destination.trim().replace(/\/+$/, '');
    await run(() => operation === 'rename' ? window.api.rename(operationSource, target) : window.api.create(target, operation), value => afterStructureChange(value, 'Operación completada.', operation === 'file' ? target : undefined));
  }
  async function removeEntry(path: string) {
    if (!caps.write || !path) return;
    const affected = openFiles.filter(item => (item.path === path || item.path.startsWith(path + '/')) && item.draft !== item.content);
    if (!window.confirm(`¿Eliminar «${path}» de la biblioteca${affected.length ? ' y descartar los cambios sin guardar' : ''}? Esta acción borra el archivo o la carpeta del disco.`)) return;
    await run(() => window.api.remove(path), value => afterStructureChange(value, `Eliminado: ${path}`));
  }
  function printReference(ref = reference) {
    if (!ref || !canLeave()) return;
    setPrintSelection({ paths: [ref.path], n: Date.now() }); setDocumentOpened(true); setWorkspace('document');
  }
  function openDocument() { if (!canLeave()) return; setPrintSelection(undefined); setDocumentOpened(true); setWorkspace('document'); }
  function treeContext(entry: Entry | undefined, x: number, y: number) {
    const path = entry?.path || '';
    const folder = entry ? entry.directory ? path : path.split('/').slice(0, -1).join('/') : '';
    const ref = entry?.directory ? referenceMap.get(path) : undefined;
    const items: ContextItem[] = [];
    if (entry && !entry.directory) items.push({ label: 'Abrir', action: () => openFile(path) });
    if (ref) items.push({ label: 'Abrir referencia', action: () => select(ref) }, { label: 'Imprimir referencia', action: () => printReference(ref) });
    if (caps.write && editing) items.push(
      { label: 'Nuevo archivo aquí…', action: () => startOperation('file', folder) },
      { label: 'Nueva carpeta aquí…', action: () => startOperation('folder', folder) },
      { label: 'Nueva referencia aquí…', action: () => startOperation('reference', folder) });
    if (caps.rename && editing && entry) items.push({ label: 'Mover / renombrar…', shortcut: 'F2', action: () => startOperation('rename', path) });
    if (caps.write && editing && entry) items.push({ label: 'Eliminar…', shortcut: 'Supr', danger: true, action: () => removeEntry(path) });
    if (entry) items.push({ label: 'Copiar ruta', action: () => run(() => window.api.reveal(path), () => setNotice('Ruta copiada al portapapeles.')) });
    if (!entry) items.push({ label: 'Plegar todo', action: () => setCollapseSignal(value => ({ all: true, n: value.n + 1 })) }, { label: 'Desplegar todo', action: () => setCollapseSignal(value => ({ all: false, n: value.n + 1 })) });
    if (items.length) setContext({ x, y, items });
  }
  const metadataFile = reference?.files.find(isMetadataFile);
  const needsStableId = reference ? !(typeof reference.metadata.id === 'string' && stableIdPattern.test(reference.metadata.id)) : false;
  const externalLabel = caps.kind === 'github' ? 'Abrir en GitHub' : 'Descargar archivo';
  const selectedPath = editing ? activePath || reference?.path : reference?.path;
  const actions = useRef<Record<string, () => void>>({});
  actions.current = {
    search: () => { setSidebarOpen(true); setWorkspace('library'); setTimeout(() => searchInput.current?.focus(), 0); },
    filters: () => { setSidebarOpen(true); setWorkspace('library'); setFilterSignal(Date.now()); },
    sidebar: () => setSidebarOpen(value => !value),
    info: () => setInfoOpen(value => !value),
    mode: () => setMode(editing ? 'reading' : 'editing'),
    save: () => void save(),
    close: () => { if (activePath && editing) closeFile(activePath); },
    print: () => { if (reference) printReference(); else if (collection) openDocument(); },
    document: () => { if (collection) openDocument(); },
    refresh: () => { if (collection && caps.refresh) void refresh(); },
    newReference: () => { if (caps.write) startOperation('reference', scope); },
    rename: () => { if (caps.rename && editing && (activePath || reference?.path)) startOperation('rename', activePath || reference!.path); },
    help: () => setShortcutsOpen(true)
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const control = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
      const typing = (event.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable=true]');
      const map: [boolean, string][] = [
        [control && !event.shiftKey && key === 'k', 'search'], [control && event.shiftKey && key === 'f', 'filters'], [control && !event.shiftKey && key === 'b', 'sidebar'],
        [event.altKey && key === 'i', 'info'], [event.altKey && key === 'm', 'mode'], [control && key === 's', 'save'], [event.altKey && key === 'w', 'close'],
        [control && !event.shiftKey && key === 'p', 'print'], [control && event.shiftKey && key === 'p', 'document'], [event.altKey && key === 'r', 'refresh'],
        [event.altKey && key === 'n', 'newReference'], [!typing && event.key === 'F2', 'rename'], [!typing && event.key === 'F1', 'help']
      ];
      const hit = map.find(([match]) => match);
      if (hit && !operation) { event.preventDefault(); actions.current[hit[1]](); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [operation]);
  const has = !!collection;
  const menus: Menu[] = [
    { label: 'Archivo', items: [
      { label: 'Abrir ejemplos', action: openExamples, disabled: busy },
      { label: 'Gestionar bibliotecas…', action: () => setWorkspace('libraries') },
      { separator: true },
      { label: 'Nueva referencia…', shortcut: 'Alt+N', action: () => startOperation('reference', scope), disabled: !has || !caps.write },
      { label: 'Nueva carpeta…', action: () => startOperation('folder', scope), disabled: !has || !caps.write },
      { label: 'Nuevo archivo…', action: () => startOperation('file', reference?.path || scope), disabled: !has || !caps.write },
      { separator: true },
      { label: 'Guardar', shortcut: 'Ctrl+S', action: save, disabled: !file || !caps.write || file.draft === file.content },
      { label: 'Cerrar pestaña', shortcut: 'Alt+W', action: () => activePath && closeFile(activePath), disabled: !activePath || !editing },
      { separator: true },
      { label: 'Exportar índice de biblioteca', action: exportIndex, disabled: !has || busy }
    ] },
    { label: 'Editar', items: [
      { label: 'Copiar contenido', action: () => file && run(() => window.api.copy(file.draft), () => setNotice('Contenido copiado al portapapeles.')), disabled: !file || !editing },
      { label: 'Copiar ruta', action: () => { const path = activePath || reference?.path; if (path !== undefined) void run(() => window.api.reveal(path), () => setNotice('Ruta copiada al portapapeles.')); }, disabled: !activePath && !reference },
      { separator: true },
      { label: 'Mover / renombrar…', shortcut: 'F2', action: actions.current.rename, disabled: !caps.rename || !editing || (!activePath && !reference?.path) },
      { label: 'Eliminar…', action: () => removeEntry(activePath || reference?.path || ''), disabled: !caps.write || !editing || (!activePath && !reference?.path) },
      { separator: true },
      { label: metadataFile ? 'Editar metadatos' : 'Añadir metadatos', action: () => metadataFile ? (setMode('editing'), openFile(metadataFile, reference)) : supplement('metadata'), disabled: !reference || !caps.write },
      { label: 'Añadir notas', action: () => supplement('notes'), disabled: !reference || !caps.write || reference.files.some(path => /\.md$/i.test(path)) },
      { label: 'Asignar ID estable', action: assignId, disabled: !reference || !caps.write || !needsStableId },
      { label: 'Asignar IDs faltantes', action: assignAllIds, disabled: !has || !caps.write }
    ] },
    { label: 'Ver', items: [
      { label: 'Modo lectura', checked: !editing, action: () => setMode('reading') },
      { label: 'Modo edición', checked: editing, shortcut: 'Alt+M', action: () => setMode('editing') },
      { separator: true },
      { label: 'Barra lateral', checked: sidebarOpen, shortcut: 'Ctrl+B', action: () => setSidebarOpen(!sidebarOpen) },
      { label: 'Panel de información', checked: infoOpen, shortcut: 'Alt+I', action: () => setInfoOpen(!infoOpen) },
      { label: 'Tema claro', checked: theme === 'light', action: () => setTheme(theme === 'light' ? 'dark' : 'light') },
      { separator: true },
      { label: 'Plegar todo el árbol', action: () => setCollapseSignal(value => ({ all: true, n: value.n + 1 })), disabled: !has },
      { label: 'Desplegar todo el árbol', action: () => setCollapseSignal(value => ({ all: false, n: value.n + 1 })), disabled: !has }
    ] },
    { label: 'Biblioteca', items: [
      { label: 'Buscar', shortcut: 'Ctrl+K', action: actions.current.search, disabled: !has },
      { label: 'Filtros…', shortcut: 'Ctrl+Shift+F', action: actions.current.filters, disabled: !has },
      { label: 'Limpiar filtros', action: clearFilters, disabled: !has || (!filtering && !scope) },
      { separator: true },
      { label: 'Actualizar', shortcut: 'Alt+R', action: refresh, disabled: !has || !caps.refresh || busy },
      { label: 'Gestionar bibliotecas…', action: () => setWorkspace('libraries') }
    ] },
    { label: 'Herramientas', items: [
      { label: file && practiced.has(file.path) ? 'Quitar de práctica' : 'Seleccionar para practicar', action: () => file && togglePractice(file.path), disabled: !file || !editing || !codeExtensions.has(extensionOf(file.path)) },
      { label: 'Abrir archivo externo', action: () => file && run(() => window.api.external(file.path)), disabled: !file || !editing }
    ] },
    { label: 'Imprimir', items: [
      { label: 'Imprimir referencia actual…', shortcut: 'Ctrl+P', action: () => printReference(), disabled: !reference },
      { label: 'Generador de documentos…', shortcut: 'Ctrl+Shift+P', action: openDocument, disabled: !has }
    ] },
    { label: 'Ayuda', items: [
      { label: 'Atajos de teclado', shortcut: 'F1', action: () => setShortcutsOpen(true) },
      { label: 'Formato de documentación', action: () => window.open('https://github.com/JosephJTC/ReferenceManager#formato-de-documentación', '_blank', 'noopener') }
    ] }
  ];
  const resultsList = <div className="results" aria-busy={search.searching}>
    <div className="results-head"><span>{search.total} referencias{scope ? ` en ${scope}` : ''}{search.searching ? ' · Buscando…' : ''}</span>{search.total > 100 && <span className="pager"><button className="icon-button" aria-label="Resultados anteriores" disabled={search.searching || resultPage === 0} onClick={() => setResultPage(value => value - 1)}>‹</button>{resultPage + 1}/{Math.ceil(search.total / 100)}<button className="icon-button" aria-label="Resultados siguientes" disabled={search.searching || (resultPage + 1) * 100 >= search.total} onClick={() => setResultPage(value => value + 1)}>›</button></span>}</div>
    {!results.length && !search.searching && <div className="empty"><p>No hay referencias que coincidan.</p><button onClick={clearFilters}>Limpiar filtros</button></div>}
    {results.map(ref => <button disabled={busy} className={'reference ' + (reference?.path === ref.path ? 'selected' : '')} key={ref.path} onClick={() => select(ref)}><strong>{ref.title}</strong><small>{ref.path || '(raíz)'}</small>{ref.metadata.description && <span>{ref.metadata.description}</span>}{editing && <small className="ref-meta">{ref.code.length} código · {ref.hasMetadata ? 'con metadatos' : 'sin metadatos'}{ref.warnings.length ? <em className="warning"> · {ref.warnings.length} advertencias</em> : null}</small>}</button>)}
  </div>;
  const editorPane = <div className="editor">
    <div className="editor-tabs" role="tablist" aria-label="Archivos abiertos">{openFiles.map(item => <div key={item.path} className={`editor-tab ${item.path === activePath ? 'active' : ''}`} role="tab" aria-selected={item.path === activePath}><button className="editor-tab-label" title={item.path} onClick={() => { setActivePath(item.path); setReference(ownerOf(item.path)); }}><FileBadge name={item.path} />{item.path.split('/').pop()}{item.draft !== item.content && <span className="dirty-dot" aria-label="Cambios sin guardar">●</span>}</button><button className="icon-button" aria-label={`Cerrar ${item.path}`} onClick={() => closeFile(item.path)}><Icon name="close" size={12} /></button></div>)}</div>
    {file ? <>
      <div className="file-actions"><span className="breadcrumbs">{file.path}{file.draft !== file.content ? ' · Cambios sin guardar' : ''}</span><span className="spacer" />
        {caps.write && isEditableFile(file.path) && <button disabled={busy || file.draft === file.content} className="primary" onClick={save}>Guardar cambios</button>}
        {caps.write && isEditableFile(file.path) && <button aria-pressed={!!file.preview} disabled={busy} onClick={() => updateFile(file.path, { preview: !file.preview })}>{file.preview ? 'Editar' : 'Vista previa'}</button>}
        <button disabled={busy} onClick={() => run(() => window.api.copy(file.draft), () => setNotice('Contenido copiado al portapapeles.'))}>Copiar</button>
        <button disabled={busy} onClick={() => run(() => window.api.external(file.path))}>{externalLabel}</button>
        <button disabled={busy} onClick={() => run(() => window.api.reveal(file.path), () => setNotice('Ruta copiada al portapapeles.'))}>Copiar ruta</button>
        {codeExtensions.has(extensionOf(file.path)) && <button aria-pressed={practiced.has(file.path)} disabled={busy} onClick={() => togglePractice(file.path)}>{practiced.has(file.path) ? '✓ Para practicar' : 'Seleccionar para practicar'}</button>}
      </div>
      <div className="editor-body">{caps.write && isEditableFile(file.path) && !file.preview
        ? <textarea aria-label="Contenido del archivo" spellCheck={false} value={file.draft} onChange={event => updateFile(file.path, { draft: event.target.value })} onKeyDown={event => { if (event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); const target = event.currentTarget, start = target.selectionStart, end = target.selectionEnd; const next = file.draft.slice(0, start) + '    ' + file.draft.slice(end); updateFile(file.path, { draft: next }); requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = start + 4; }); } }} />
        : /\.md$/i.test(file.path) && file.draft.length <= 150000 ? <article className="doc-preview"><MarkdownView content={file.draft} file={file.path} prefix="edit" /></article> : <CodeView content={file.draft} name={file.path} />}</div>
    </> : <div className="empty-editor"><p>{reference ? 'Esta referencia no tiene archivos legibles.' : 'Abre un archivo desde el explorador o selecciona una referencia.'}</p><p className="muted">Ctrl+K busca · Alt+M cambia de modo · F1 muestra los atajos</p></div>}
  </div>;
  const propertiesPane = reference && <aside className="reading-info properties" aria-label="Propiedades de la referencia">
    <section><h3>Referencia</h3><strong>{reference.title}</strong><small className="block">{reference.path || '(raíz)'}</small>
      <div className="stack-buttons">{caps.write && <button disabled={busy} onClick={() => metadataFile ? openFile(metadataFile, reference) : supplement('metadata')}>{metadataFile ? 'Editar metadatos' : 'Añadir metadatos'}</button>}{caps.write && !reference.files.some(path => /\.md$/i.test(path)) && <button disabled={busy} onClick={() => supplement('notes')}>Añadir notas</button>}{caps.write && needsStableId && <button disabled={busy} onClick={assignId}>Asignar ID estable</button>}{caps.rename && <button disabled={busy || !reference.path} onClick={() => startOperation('rename', reference.path)}>Mover / renombrar</button>}</div></section>
    {reference.warnings.length > 0 && <section><h3>Advertencias</h3>{reference.warnings.map((warning, index) => <p className="warning" key={index}>{warning}</p>)}</section>}
    <section><h3>Archivos</h3>{reference.files.map(path => <button key={path} className={`file-link ${path === activePath ? 'selected' : ''}`} onClick={() => openFile(path, reference)}><FileBadge name={path} />{path.slice(reference.path ? reference.path.length + 1 : 0)}</button>)}</section>
    <section><h3>Metadatos</h3>{Object.keys(reference.metadata).length ? <dl>{Object.entries(reference.metadata).map(([key, value]) => <React.Fragment key={key}><dt>{metadataLabels[key] || key}</dt><dd><pre>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre></dd></React.Fragment>)}</dl> : <p className="muted">No hay metadatos válidos.</p>}</section>
  </aside>;
  return <div className={`app mode-${mode}`}>
    <header className="titlebar">
      <span className="brand" title="Gestor de referencias de programación competitiva">⟨/⟩ RefManager</span>
      <MenuBar menus={menus} />
      <span className="spacer" />
      {caps.dirty && <span className="warning small">Cambios externos: usa Actualizar</span>}
      {has && <div className="mode-switch" role="radiogroup" aria-label="Modo de trabajo"><button role="radio" aria-checked={!editing} onClick={() => setMode('reading')}>Lectura</button><button role="radio" aria-checked={editing} onClick={() => setMode('editing')}>Edición</button></div>}
      <button className="icon-button" aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'} title="Cambiar tema" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
    </header>
    <div className="workbench">
      <nav className="activitybar" aria-label="Espacios de trabajo">
        <button aria-pressed={workspace === 'library'} aria-label="Biblioteca" title="Biblioteca" disabled={!has} onClick={() => { if (workspace === 'library') setSidebarOpen(!sidebarOpen); else setWorkspace('library'); }}><Icon name="explorer" size={20} /></button>
        <button aria-pressed={workspace === 'libraries'} aria-label="Bibliotecas" title="Gestionar bibliotecas" onClick={() => setWorkspace('libraries')}><Icon name="libraries" size={20} /></button>
        <button aria-pressed={workspace === 'document'} aria-label="Generar documento" title="Generar documento (Ctrl+Shift+P)" disabled={!has} onClick={openDocument}><Icon name="document" size={20} /></button>
        <span className="spacer" />
        <button aria-label="Atajos de teclado" title="Atajos de teclado (F1)" onClick={() => setShortcutsOpen(true)}><Icon name="help" size={20} /></button>
      </nav>
      {collection && <div className="library-workspace" hidden={workspace !== 'library'}>
        {sidebarOpen && <><aside className="sidebar" style={{ width: sidebar.width }} aria-label="Explorador">
          <div className="sidebar-head"><span>{caps.activeId ? kindLabel(caps.kind) : 'Biblioteca'}</span><span className="spacer" />{caps.refresh && <button className="icon-button" aria-label="Actualizar" title="Actualizar (Alt+R)" disabled={busy} onClick={refresh}><Icon name="refresh" size={14} /></button>}<button className="icon-button" aria-label="Ocultar barra lateral" title="Ocultar barra lateral (Ctrl+B)" onClick={() => setSidebarOpen(false)}><Icon name="sidebar" size={14} /></button></div>
          <FilterBar query={query} filters={filters} options={options} onQuery={changeQuery} onFilters={changeFilters} searchRef={searchInput} openSignal={filterSignal} />
          <div className="side-tabs" role="tablist"><button role="tab" aria-selected={sideView === 'tree'} onClick={() => setSideView('tree')}>Explorador</button><button role="tab" aria-selected={sideView === 'results'} onClick={() => setSideView('results')}>Resultados <span className="count">{search.total}</span></button>{editing && caps.write && <><span className="spacer" /><button className="icon-button" title="Nuevo archivo" aria-label="Nuevo archivo" onClick={() => startOperation('file', reference?.path || scope)}>+</button></>}</div>
          {sideView === 'tree' ? <FolderTree key={caps.activeId || 'root'} collection={collection} scope={scope} busy={busy} mode={mode} selected={selectedPath} collapseSignal={collapseSignal} onFolder={path => { changeScope(path); }} onFile={path => { if (!editing) setMode('editing'); void openFile(path); }} onReference={path => { const ref = referenceMap.get(path); if (ref) void select(ref); }} onContext={treeContext} /> : resultsList}
          {!!collection.warnings.length && editing && <details className="collection-warnings"><summary>Advertencias ({collection.warnings.length})</summary>{collection.warnings.map((warning, index) => <p className="warning" key={index}>{warning}</p>)}</details>}
        </aside><div className="resizer" role="separator" aria-orientation="vertical" aria-label="Redimensionar barra lateral" tabIndex={0} onPointerDown={sidebar.start} onKeyDown={sidebar.keyboard} /></>}
        <section className="content" aria-label="Contenido">
          {editing ? <div className="editing-layout">{editorPane}{infoOpen && propertiesPane && <><div className="resizer" role="separator" aria-orientation="vertical" aria-label="Redimensionar panel de propiedades" tabIndex={0} onPointerDown={info.start} onKeyDown={info.keyboard} /><div className="side-panel" style={{ width: info.width }}>{propertiesPane}</div></>}</div>
            : reference ? <ReadingView reference={reference} collection={collection} infoOpen={infoOpen} busy={busy} practiced={practiced} externalLabel={externalLabel} onTogglePractice={togglePractice} onOpenReference={select} onNotice={setNotice} onPrint={() => printReference()} />
            : <div className="home"><h1>{scope || 'Toda la colección'}</h1><p className="muted">{collection.references.length} referencias. Elige una en el explorador o en la lista.</p>{resultsList}</div>}
        </section>
      </div>}
      <div className="document-panel" hidden={workspace !== 'document'}>{documentOpened && collection && <Suspense fallback={<p>Abriendo el generador de documentos…</p>}><DocumentWorkspace key={(caps.activeId || 'root') + (printSelection?.n || '')} collection={collection} busy={busy} onBusy={setBusy} initialSelection={printSelection?.paths} /></Suspense>}</div>
      <div className="libraries-workspace" hidden={workspace !== 'libraries'}><LibrariesPanel busy={busy} onBusy={setBusy} onOpen={openLibrary} onSnapshot={snapshotChosen} onNotice={setNotice} /></div>
      {!collection && workspace !== 'libraries' && <section className="welcome"><h2>Tu colección, en tus archivos</h2><p>Organiza algoritmos, soluciones y apuntes sin una estructura obligatoria ni una base de datos propietaria.</p><p>Conecta un repositorio de GitHub, una carpeta local o usa la colección de ejemplos. El modo lectura muestra explicaciones, código y visualizaciones; el modo edición da acceso a todos los archivos.</p><div className="actions"><button className="primary" onClick={openExamples}>Abrir ejemplos</button><button onClick={() => setWorkspace('libraries')}>Conectar una biblioteca</button></div></section>}
    </div>
    <footer className="statusbar"><span className="status" role="status" aria-live="polite">{busy ? 'Procesando… ' : ''}{notice}</span><span className="spacer" />{has && <><span>{editing ? 'Edición' : 'Lectura'}</span><span>{collection!.references.length} referencias · {collection!.entries.length} elementos</span><span>{caps.write ? 'Editable' : 'Solo lectura'}</span>{dirty && <span className="warning">{dirtyFiles.length} sin guardar</span>}</>}</footer>
    {context && <ContextMenu {...context} onClose={() => setContext(undefined)} />}
    <dialog className="management-dialog" ref={modal} aria-label="Gestionar archivos" onCancel={() => { if (!busy) setOperation(undefined); }} onKeyDown={event => { if (busy && event.key === 'Escape') event.preventDefault(); }}><form onSubmit={submitOperation}><h2>{operation ? operationTitles[operation] : ''}</h2>{operation === 'rename' && <p>Origen: {operationSource}</p>}<label>Ruta relativa a la biblioteca<input autoFocus required value={destination} onChange={event => setDestination(event.target.value)} placeholder={operation === 'file' ? 'temas/grafos/bfs/explicacion.md' : 'temas/grafos/mi-referencia'} /></label><p className="muted">La carpeta padre debe existir. No se sobrescriben destinos existentes.{operation === 'file' ? ' Nombres reconocidos: explicacion.md, intuicion.md, correctitud.md, complejidad.md, ejemplos.md, variantes.md…' : ''}</p><p role="status">{notice}</p><button className="primary" disabled={busy} type="submit">Confirmar</button><button disabled={busy} type="button" onClick={() => setOperation(undefined)}>Cancelar</button></form></dialog>
    <dialog className="management-dialog shortcuts" ref={shortcutsModal} aria-label="Atajos de teclado" onClose={() => setShortcutsOpen(false)}><h2>Atajos de teclado</h2><table><tbody>{[['Ctrl+K', 'Buscar referencias'], ['Ctrl+Shift+F', 'Filtros'], ['Ctrl+B', 'Mostrar u ocultar la barra lateral'], ['Alt+I', 'Panel de información'], ['Alt+M', 'Cambiar entre lectura y edición'], ['Ctrl+S', 'Guardar el archivo activo'], ['Alt+W', 'Cerrar la pestaña activa'], ['Alt+N', 'Nueva referencia'], ['F2', 'Mover o renombrar'], ['Alt+R', 'Actualizar la biblioteca'], ['Ctrl+P', 'Imprimir la referencia actual'], ['Ctrl+Shift+P', 'Generador de documentos'], ['↑ ↓ ← → Enter', 'Navegar el árbol'], ['← → Espacio', 'Controlar una visualización enfocada']].map(([keys, label]) => <tr key={keys}><td><kbd>{keys}</kbd></td><td>{label}</td></tr>)}</tbody></table><form method="dialog"><button className="primary">Cerrar</button></form></dialog>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
