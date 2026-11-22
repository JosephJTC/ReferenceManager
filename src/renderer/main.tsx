import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Markdown from 'react-markdown';
import hljs from 'highlight.js/lib/common';
import 'highlight.js/styles/github-dark.css';
import './style.css';
import type { Collection, Reference, Result, TextFile, LibraryCapabilities, LibraryKind } from '../shared/types.js';
import { metadataLabels } from '../shared/metadata-labels.js';
import { collator, extensionOf, isMetadataFile, referenceLanguages } from '../shared/formats.js';
import { stableIdPattern } from '../core/library-index.js';
import { createApi } from '../web/api.js';
import { FolderTree } from './FolderTree.js';
import { useReferenceSearch } from './useReferenceSearch.js';
import { LibrariesPanel } from './LibrariesPanel.js';
const DocumentWorkspace = lazy(() => import('./DocumentWorkspace.js').then(module => ({ default: module.DocumentWorkspace })));

window.api = createApi(import.meta.env.BASE_URL || './');

const defaultCapabilities: LibraryCapabilities & { kind: LibraryKind; activeId?: string; dirty?: boolean } = { write: false, rename: false, watch: false, refresh: false, kind: 'example' };

function App() {
  const [collection, setCollection] = useState<Collection>();
  const [caps, setCaps] = useState(defaultCapabilities);
  const [workspace, setWorkspace] = useState<'libraries' | 'library' | 'document'>('library');
  const [documentOpened, setDocumentOpened] = useState(false);
  const [reference, setReference] = useState<Reference>();
  const [file, setFile] = useState<TextFile>();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('title');
  const [language, setLanguage] = useState('');
  const [tag, setTag] = useState('');
  const [extension, setExtension] = useState('');
  const [category, setCategory] = useState('');
  const [resultPage, setResultPage] = useState(0);
  const [tab, setTab] = useState('file');
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Conecta una biblioteca o explora los ejemplos para comenzar.');
  const [operation, setOperation] = useState<'folder' | 'reference' | 'rename'>();
  const [operationSource, setOperationSource] = useState('');
  const [destination, setDestination] = useState('');
  const [practiced, setPracticed] = useState(new Set<string>());
  const [explorerOpen, setExplorerOpen] = useState(true);
  const modal = useRef<HTMLDialogElement>(null);
  const sequence = useRef(0);
  const dirty = !!file && draft !== file.content;
  const canLeave = () => !dirty || window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?');
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
  useEffect(() => {
    if (operation && !modal.current?.open) modal.current?.showModal();
    if (!operation) modal.current?.close();
  }, [operation]);
  const request = useMemo(() => ({ query, filter, scope, sort, language, tag, extension, category, offset: resultPage * 100, limit: 100 }), [query, filter, scope, sort, language, tag, extension, category, resultPage]);
  const search = useReferenceSearch(collection, request, setNotice);
  const referenceMap = useMemo(() => new Map(collection?.references.map(item => [item.path, item]) || []), [collection]);
  const results = search.paths.map(path => referenceMap.get(path)).filter((value): value is Reference => !!value);
  const languages = useMemo(() => [...new Set(collection?.references.flatMap(referenceLanguages) || [])].sort(collator.compare), [collection]);
  const tags = useMemo(() => [...new Set(collection?.references.flatMap(item => item.metadata.tags || []) || [])].sort(collator.compare).slice(0, 100), [collection]);
  const extensions = useMemo(() => [...new Set(collection?.references.flatMap(item => item.files.map(extensionOf)) || [])].filter(Boolean).sort(), [collection]);
  const categories = useMemo(() => [...new Set(collection?.references.map(item => typeof item.metadata.category === 'string' && item.metadata.category.trim() ? item.metadata.category : item.path.split('/')[0] || '') || [])].sort(collator.compare), [collection]);
  async function refreshCapabilities() {
    const result = await window.api.capabilities();
    if (result.ok) setCaps(result.value);
  }
  async function refreshPractice() {
    const result = await window.api.practiceSelection();
    if (result.ok) setPracticed(new Set(result.value.map(item => item.file)));
  }
  async function run<T,>(task: () => Promise<Result<T>>, done?: (value: T) => void | Promise<void>, failed?: () => void) {
    setBusy(true);
    try { const result = await task(); if (!result.ok) { setNotice(result.error); failed?.(); } else await done?.(result.value); }
    catch { setNotice('No se pudo comunicar con el servicio local de la página. Recarga e inténtalo de nuevo.'); failed?.(); }
    finally { setBusy(false); }
  }
  function changeScope(path: string) { setScope(path); setResultPage(0); }
  function applyCollection(value: Collection | null, label: string) {
    if (!value) return;
    sequence.current++; setCollection(value); setReference(undefined); setFile(undefined); setScope(''); setEdit(false);
    setQuery(''); setFilter('all'); setLanguage(''); setTag(''); setExtension(''); setCategory(''); setResultPage(0); setWorkspace('library');
    setNotice(`${label}: ${value.references.length} referencias. ${value.warnings.length ? 'Revisa las advertencias del explorador.' : ''}`);
    void refreshCapabilities(); void refreshPractice();
  }
  async function openLibrary(id: string) {
    if (!canLeave()) return;
    await run(() => window.api.openLibrary(id), value => applyCollection(value, 'Biblioteca abierta'));
  }
  async function openExamples() {
    if (!canLeave()) return;
    await run(() => window.api.open(true), value => applyCollection(value, 'Ejemplos abiertos'));
  }
  async function snapshotChosen(files: FileList | File[], existingId?: string) {
    await run(() => window.api.addSnapshotLibrary(files, existingId), async value => {
      if (!value) return;
      const result = await window.api.openLibrary(existingId || value.id);
      if (result.ok) applyCollection(result.value, 'Instantánea abierta'); else setNotice(result.error);
    });
  }
  async function read(path: string, next?: Reference, editing = false) {
    if (!canLeave()) return;
    const id = ++sequence.current;
    const owner = next || collection?.references.find(item => item.files.includes(path));
    await run(() => window.api.read(path), value => {
      if (id === sequence.current) { setReference(owner); setFile(value); setDraft(value.content); setEdit(editing); setTab('file'); setNotice('Archivo cargado. El código fuente se mantiene de solo lectura.'); }
    }, () => { if (id === sequence.current) { setReference(owner); setFile(undefined); setDraft(''); setEdit(false); setTab('file'); } });
  }
  async function select(ref: Reference) {
    const first = ref.code[0] || ref.files.find(path => /\.(md|txt)$/i.test(path)) || ref.files.find(isMetadataFile);
    if (first) await read(first, ref);
    else if (canLeave()) { sequence.current++; setReference(ref); setFile(undefined); setDraft(''); setEdit(false); setTab('metadata'); }
  }
  async function refresh() {
    if (!canLeave()) return;
    await run(() => window.api.refresh(), async value => {
      sequence.current++; setCollection(value); setResultPage(0);
      setReference(value.references.find(item => item.path === reference?.path));
      if (scope && !value.entries.some(entry => entry.directory && entry.path === scope)) setScope('');
      setEdit(false);
      if (file && value.entries.some(entry => !entry.directory && entry.path === file.path)) {
        const updated = await window.api.read(file.path);
        if (updated.ok) { setFile(updated.value); setDraft(updated.value.content); }
        else { setFile(undefined); setNotice(updated.error); return; }
      } else setFile(undefined);
      setNotice(`Biblioteca actualizada en ${value.stats?.durationMs ?? '?'} ms; ${value.stats?.cacheHits ?? 0} referencias reutilizadas desde caché.`);
    });
  }
  async function save() {
    if (!file) return;
    await run(() => window.api.save(file.path, draft, file.version), async value => {
      setFile(value); setDraft(value.content); setEdit(false); setNotice('Archivo guardado.');
      const updated = await window.api.refresh();
      if (updated.ok) { setCollection(updated.value); setReference(updated.value.references.find(item => item.path === reference?.path)); }
      else setNotice(`El archivo se guardó, pero no se pudo actualizar el índice: ${updated.error}`);
    });
  }
  async function supplement(kind: 'notes' | 'metadata') {
    if (!reference || !canLeave()) return;
    const ownerPath = reference.path;
    await run(() => window.api.supplement(ownerPath, kind), async value => {
      setCollection(value);
      const owner = value.references.find(item => item.path === ownerPath);
      const target = owner?.files.find(path => kind === 'metadata' ? isMetadataFile(path) : /(?:^|[\\/])notes\.md$/i.test(path));
      if (target) {
        const loaded = await window.api.read(target);
        if (loaded.ok) { setReference(owner); setFile(loaded.value); setDraft(loaded.value.content); setEdit(true); setTab('file'); setNotice('Archivo complementario creado.'); }
        else setNotice(loaded.error);
      }
    });
  }
  async function assignId() {
    if (!reference) return;
    await run(() => window.api.assignStableId(reference.path), value => { setCollection(value); setNotice('ID estable asignado en los metadatos.'); });
  }
  async function assignAllIds() {
    if (!window.confirm('Se insertará un campo «id» en los metadatos de todas las referencias que no lo tengan. ¿Continuar?')) return;
    await run(() => window.api.assignMissingIds(), value => { setCollection(value); setNotice('IDs asignados donde faltaban.'); });
  }
  async function exportIndex() {
    await run(() => window.api.exportLibraryIndex(), value => {
      const blob = new Blob([value.json], { type: 'application/json;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = value.filename;
      link.click();
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
  const highlighted = useMemo(() => {
    if (!file || file.content.length > 150000) return null;
    const extensionValue = file.path.split('.').pop()?.toLowerCase() || '';
    const languageValue = ({ h: 'cpp', hpp: 'cpp', cc: 'cpp', rs: 'rust', py: 'python', js: 'javascript', ts: 'typescript', md: 'markdown', yml: 'yaml', kt: 'kotlin', cs: 'csharp' } as Record<string, string>)[extensionValue] || extensionValue;
    return hljs.getLanguage(languageValue) ? hljs.highlight(file.content, { language: languageValue }).value : null;
  }, [file]);
  function startOperation(kind: 'folder' | 'reference' | 'rename', source = reference?.path || scope) {
    if (!canLeave()) return;
    if (file) setDraft(file.content); setEdit(false);
    setOperationSource(source); setOperation(kind);
    setDestination(kind === 'rename' ? source : scope ? scope + '/' : '');
    setNotice('Escribe una ruta relativa a la biblioteca. No se sobrescriben destinos existentes.');
  }
  async function submitOperation(event: React.FormEvent) {
    event.preventDefault();
    if (!operation) return;
    if (operation === 'rename' && !window.confirm(`¿Mover o renombrar «${operationSource}» a «${destination}»?`)) return;
    await run(() => operation === 'rename' ? window.api.rename(operationSource, destination) : window.api.create(destination, operation), value => {
      sequence.current++; setCollection(value); setReference(undefined); setFile(undefined); setScope(''); setResultPage(0); setOperation(undefined); setNotice('Operación completada.');
    });
  }
  const metadataFile = reference?.files.find(isMetadataFile);
  const needsStableId = reference ? !(typeof reference.metadata.id === 'string' && stableIdPattern.test(reference.metadata.id)) : false;
  const externalLabel = caps.kind === 'github' ? 'Abrir en GitHub' : 'Descargar archivo';
  return <div className="app">
    <header><div><h1>Referencias de programación competitiva</h1><small>{collection ? `${caps.kind === 'github' ? 'GitHub · solo lectura' : caps.kind === 'local-fs' ? 'Carpeta local' : caps.kind === 'local-snapshot' ? 'Instantánea · solo lectura' : 'Ejemplos'} · ${caps.activeId || ''}` : 'Bibliotecas de referencias · sin servicios propios'}</small></div><div className="actions"><button disabled={busy} onClick={() => setWorkspace('libraries')}>Bibliotecas</button><button disabled={busy} onClick={openExamples}>Abrir ejemplos</button><button disabled={busy || !collection || !caps.refresh} onClick={refresh}>Actualizar</button>{caps.dirty && <span className="warning">La carpeta tiene cambios externos; usa Actualizar.</span>}</div></header>
    <div className="status" role="status" aria-live="polite">{busy ? 'Procesando… ' : ''}{notice}</div>
    {collection && <><nav className="workspace-tabs" aria-label="Espacios de trabajo"><button disabled={busy} aria-pressed={workspace === 'library'} onClick={() => setWorkspace('library')}>Biblioteca</button><button disabled={busy} aria-pressed={workspace === 'libraries'} onClick={() => setWorkspace('libraries')}>Bibliotecas</button><button disabled={busy} aria-pressed={workspace === 'document'} onClick={() => { if (canLeave()) { if (file) setDraft(file.content); setEdit(false); setDocumentOpened(true); setWorkspace('document'); } }}>Generar documento</button></nav>
    <div className="library-workspace" hidden={workspace !== 'library'}><section className="toolbar"><input aria-label="Buscar referencias" maxLength={1000} placeholder="Buscar por título, etiquetas, notas o código…" value={query} onChange={event => { setQuery(event.target.value); setResultPage(0); }} /><select aria-label="Filtrar referencias" value={filter} onChange={event => { setFilter(event.target.value); setResultPage(0); }}><option value="all">Todas las referencias</option><option value="no-code">Sin código</option><option value="no-metadata">Sin metadatos</option><option value="warnings">Con advertencias</option></select><select aria-label="Ordenar referencias" value={sort} onChange={event => { setSort(event.target.value); setResultPage(0); }}><option value="title">Ordenar por título</option><option value="modified">Modificación reciente</option></select><select aria-label="Filtrar por lenguaje" value={language} onChange={event => { setLanguage(event.target.value); setResultPage(0); }}><option value="">Todos los lenguajes</option>{languages.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Filtrar por extensión" value={extension} onChange={event => { setExtension(event.target.value); setResultPage(0); }}><option value="">Toda extensión</option>{extensions.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Filtrar por categoría" value={category} onChange={event => { setCategory(event.target.value); setResultPage(0); }}><option value="">Toda categoría</option>{categories.map(value => <option key={value}>{value || '(sin categoría)'}</option>)}</select><input className="tag-filter" aria-label="Filtrar por etiqueta" maxLength={500} placeholder="Etiqueta exacta…" list="tag-options" value={tag} onChange={event => { setTag(event.target.value); setResultPage(0); }} /><datalist id="tag-options">{tags.map(value => <option key={value}>{value}</option>)}</datalist>{caps.write && <button disabled={busy} onClick={() => startOperation('folder')}>Nueva carpeta</button>}{caps.write && <button disabled={busy} onClick={() => startOperation('reference')}>Nueva referencia</button>}{caps.write && <button disabled={busy} onClick={assignAllIds}>Asignar IDs faltantes</button>}<button disabled={busy} onClick={exportIndex}>Exportar índice de biblioteca</button></section>
    <main><aside className={explorerOpen ? '' : 'explorer-collapsed'}><h2>Explorador</h2><button className="explorer-toggle" onClick={() => setExplorerOpen(!explorerOpen)}>{explorerOpen ? 'Ocultar explorador' : 'Mostrar explorador'}</button>{caps.rename && <button disabled={busy || !scope} onClick={() => startOperation('rename', scope)}>Mover carpeta seleccionada</button>}<FolderTree key={caps.activeId || 'root'} collection={collection} scope={scope} busy={busy} onFolder={changeScope} onFile={path => read(path)} />{!!collection.warnings.length && <details className="collection-warnings"><summary>Advertencias ({collection.warnings.length})</summary>{collection.warnings.map((warning, index) => <p className="warning" key={index}>{warning}</p>)}</details>}</aside>
    <section className="list" aria-busy={search.searching}><h2>Referencias <span>{search.total}</span></h2><small>{scope || 'Toda la biblioteca'}{search.searching ? ' · Buscando…' : ''}</small><div className="result-pager"><button aria-label="Resultados anteriores" disabled={search.searching || resultPage === 0} onClick={() => setResultPage(value => value - 1)}>Anterior</button><span>{resultPage + 1} / {Math.max(1, Math.ceil(search.total / 100))}</span><button aria-label="Resultados siguientes" disabled={search.searching || (resultPage + 1) * 100 >= search.total} onClick={() => setResultPage(value => value + 1)}>Siguiente</button></div>{!results.length && !search.searching && <><p>No hay referencias que coincidan con la búsqueda.</p><button onClick={() => { setQuery(''); setFilter('all'); setScope(''); setLanguage(''); setTag(''); setExtension(''); setCategory(''); setResultPage(0); }}>Limpiar filtros</button></>}{results.map(ref => <button disabled={busy} className={'reference ' + (reference?.path === ref.path ? 'selected' : '')} key={ref.path} onClick={() => select(ref)}><strong>{ref.title}</strong><small>{ref.path || '(raíz)'}</small><span>{ref.metadata.description}</span><small>{ref.code.length} archivos de código · {ref.hasMetadata ? 'Con metadatos' : 'Sin metadatos'}</small>{!!ref.warnings.length && <small className="warning">{ref.warnings.length} advertencias</small>}</button>)}</section>
    <section className="viewer"><div className="viewer-heading"><div><h2>{reference?.title || (file ? 'Archivo de la biblioteca' : 'Selecciona una referencia')}</h2><small>{reference?.path}</small></div>{caps.rename && <button disabled={busy || !reference?.path} onClick={() => startOperation('rename', reference?.path)}>Mover / renombrar</button>}</div>
    {reference && <><div className="tabs"><button onClick={() => setTab('file')}>Archivos</button><button onClick={() => setTab('metadata')}>Metadatos</button><button onClick={() => setTab('help')}>Ayuda</button>{caps.write && <button disabled={busy} onClick={() => metadataFile ? read(metadataFile, reference, true) : supplement('metadata')}>{metadataFile ? 'Editar metadatos' : 'Añadir metadatos'}</button>}{caps.write && !reference.files.some(path => /\.md$/i.test(path)) && <button disabled={busy} onClick={() => supplement('notes')}>Añadir notas</button>}{caps.write && needsStableId && <button disabled={busy} onClick={assignId}>Asignar ID estable</button>}</div>{reference.warnings.map((warning, index) => <p className="warning" key={index}>{warning}</p>)}</>}
    {tab === 'metadata' && reference ? <dl>{Object.entries(reference.metadata).map(([key, value]) => <React.Fragment key={key}><dt>{metadataLabels[key] || key}</dt><dd><pre>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre></dd></React.Fragment>)}{!Object.keys(reference.metadata).length && <p>No hay metadatos válidos. Edita el archivo original o añade metadatos para completar esta referencia.</p>}</dl> : tab === 'help' ? <article><h3>Uso básico</h3><p>Las carpetas y las referencias no necesitan una estructura fija. Las flechas del explorador pliegan ramas; los nombres de carpetas limitan la búsqueda.</p><p>Busca por nombre, ruta, etiquetas, notas o código. La búsqueda ignora acentos y mayúsculas. Las listas muestran 100 resultados por página.</p><p>El código es de solo lectura. Las bibliotecas de GitHub e instantáneas no admiten edición; en carpetas locales puedes editar notas y metadatos.</p><p>Generar documento permite seleccionar carpetas o referencias y exportar el documento previsualizado a PDF mediante la impresión del navegador.</p><p>Consulta README.md del proyecto para despliegue, formatos y límites.</p></article> : <>
    {!!reference?.files.length && <select aria-label="Archivo de la referencia" disabled={busy} value={file && reference.files.includes(file.path) ? file.path : ''} onChange={event => read(event.target.value)}><option value="" disabled>Selecciona un archivo</option>{reference.files.map(path => <option key={path} value={path}>{path}</option>)}</select>}
    {file && <><div className="file-actions"><strong>{file.path}{dirty ? ' · Cambios sin guardar' : ''}</strong><button disabled={busy} onClick={() => run(() => window.api.copy(edit ? draft : file.content), () => setNotice('Contenido copiado al portapapeles.'))}>{edit ? 'Copiar borrador' : 'Copiar'}</button><button disabled={busy} onClick={() => run(() => window.api.external(file.path))}>{externalLabel}</button><button disabled={busy} onClick={() => run(() => window.api.reveal(file.path), () => setNotice('Ruta copiada al portapapeles.'))}>Copiar ruta</button><button disabled={busy} onClick={() => read(file.path, reference)}>Recargar archivo</button>{/\.(md|ya?ml)$/i.test(file.path) && caps.write && <button disabled={busy} onClick={() => { if (canLeave()) { setEdit(!edit); setDraft(file.content); } }}>{edit ? 'Cancelar edición' : 'Editar'}</button>}{/\.(cpp|cc|c|h|hpp|py|java|rs|js|ts|go|kt|cs|rb|swift)$/i.test(file.path) && <button aria-pressed={practiced.has(file.path)} disabled={busy} onClick={() => togglePractice(file.path)}>{practiced.has(file.path) ? '✓ Seleccionado para practicar' : 'Seleccionar para practicar'}</button>}</div>
    {edit ? <><textarea aria-label="Contenido del archivo" spellCheck={false} value={draft} onChange={event => setDraft(event.target.value)} /><button disabled={busy || !dirty} onClick={save}>Guardar cambios</button></> : /\.md$/i.test(file.path) && file.content.length <= 150000 ? <article className="markdown"><Markdown skipHtml components={{ a: ({ children }) => <span>{children}</span>, img: ({ alt }) => <span>[Imagen: {alt}]</span> }}>{file.content}</Markdown></article> : <>{file.content.length > 150000 && <p className="muted">Vista de texto simple para mantener el rendimiento con archivos grandes.</p>}<pre className="code">{highlighted ? <code dangerouslySetInnerHTML={{ __html: highlighted }} /> : <code>{file.content}</code>}</pre></>}</>}
    {!file && <p>Selecciona un archivo del explorador para leerlo. Las bibliotecas de solo lectura muestran el contenido sin opciones de edición.</p>}</>}
    </section></main><footer>{collection.references.length} referencias · {collection.entries.length} elementos · Archivos UTF-8 hasta 2 MiB · Indexación en worker{caps.write ? '' : ' · Solo lectura'}</footer></div>
    <div className="document-panel" hidden={workspace !== 'document'}>{documentOpened && <Suspense fallback={<p>Abriendo el generador de documentos…</p>}><DocumentWorkspace key={caps.activeId || 'root'} collection={collection} busy={busy} onBusy={setBusy} /></Suspense>}</div></>}
    <div className="libraries-workspace" hidden={workspace !== 'libraries'}><LibrariesPanel busy={busy} onBusy={setBusy} onOpen={openLibrary} onSnapshot={snapshotChosen} onNotice={setNotice} /></div>
    {!collection && workspace !== 'libraries' && <section className="welcome"><h2>Tu colección, en tus archivos</h2><p>Organiza algoritmos, soluciones y apuntes sin una estructura obligatoria ni una base de datos propietaria.</p><p>Conecta un repositorio público de GitHub, una carpeta local o usa la colección de ejemplos para probar el gestor.</p><p>Las consultas y la generación de documentos no escriben sobre tus referencias. Las ediciones de notas y metadatos requieren guardar explícitamente.</p><div className="actions"><button onClick={openExamples}>Abrir ejemplos</button><button onClick={() => setWorkspace('libraries')}>Conectar una biblioteca</button></div></section>}
    <dialog className="management-dialog" ref={modal} aria-label="Gestionar archivos" onCancel={() => { if (!busy) setOperation(undefined); }} onKeyDown={event => { if (busy && event.key === 'Escape') event.preventDefault(); }}><form onSubmit={submitOperation}><h2>{operation === 'folder' ? 'Nueva carpeta' : operation === 'reference' ? 'Nueva referencia' : 'Mover o renombrar'}</h2>{operation === 'rename' && <p>Origen: {operationSource}</p>}<label>Ruta relativa a la biblioteca<input autoFocus required value={destination} onChange={event => setDestination(event.target.value)} placeholder="temas/grafos/mi-referencia" /></label><p>La carpeta padre debe existir. No se sobrescriben destinos existentes.</p><p role="status">{notice}</p><button disabled={busy} type="submit">Confirmar</button><button disabled={busy} type="button" onClick={() => setOperation(undefined)}>Cancelar</button></form></dialog>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
