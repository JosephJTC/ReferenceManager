import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Collection } from '../shared/types.js';
import { compactDocumentSettings, defaultDocumentSettings, documentSettingsSchema, canonicalPath, metadataLabels, type DocumentSettings, type DocumentPreview } from '../shared/document.js';
import { normalizeQuery } from '../shared/search.js';

type Props = { collection: Collection; busy: boolean; onBusy: (value: boolean) => void; initialSelection?: string[] };
function initialSettings() {
  try {
    const saved = documentSettingsSchema.safeParse(JSON.parse(localStorage.getItem('document-settings') || 'null'));
    if (saved.success) return saved.data;
  } catch {}
  return { ...defaultDocumentSettings };
}

function HtmlPreview({ html, page, section }: { html: string; page: number; section?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(false); }, [html]);
  useEffect(() => {
    if (!ready || !frame.current?.contentDocument) return;
    const target = section
      ? frame.current.contentDocument.querySelector(`[data-section="${CSS.escape(section)}"]`)
      : frame.current.contentDocument.querySelector(`.sheet[data-page="${page}"]`);
    target?.scrollIntoView({ block: 'start' });
  }, [ready, page, section, html]);
  return <div className="html-preview-wrap">
    {!ready && <p>Componiendo la vista previa…</p>}
    <iframe
      ref={frame} title="Vista previa del documento" sandbox="allow-same-origin allow-modals"
      srcDoc={html} onLoad={() => setReady(true)}
      style={{ visibility: ready ? 'visible' : 'hidden' }} />
  </div>;
}

export function DocumentWorkspace({ collection, busy, onBusy, initialSelection }: Props) {
  const [selected, setSelected] = useState(new Set(initialSelection || (collection.references.length <= 500 ? collection.references.map(reference => reference.path) : [])));
  const [selectionQuery, setSelectionQuery] = useState('');
  const [referencePage, setReferencePage] = useState(0);
  const [folderPage, setFolderPage] = useState(0);
  const [settings, setSettings] = useState<DocumentSettings>(initialSettings);
  const [preview, setPreview] = useState<DocumentPreview>();
  const [page, setPage] = useState(1);
  const [jump, setJump] = useState<string>();
  const [notice, setNotice] = useState('Selecciona referencias y genera una vista previa. Se incluyen las versiones guardadas en disco.');
  useEffect(() => { setPreview(undefined); }, [collection]);
  const folderGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const reference of collection.references) {
      const parts = canonicalPath(reference.path).split('/').filter(Boolean);
      for (let depth = 0; depth <= parts.length; depth++) {
        const parent = parts.slice(0, depth).join('/');
        if (!groups.has(parent)) groups.set(parent, []);
        groups.get(parent)!.push(reference.path);
      }
    }
    return groups;
  }, [collection]);
  const folders = useMemo(() => collection.entries.filter(entry => entry.directory && folderGroups.has(canonicalPath(entry.path))), [collection, folderGroups]);
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const reference of collection.references) if (selected.has(reference.path)) {
      const parts = canonicalPath(reference.path).split('/').filter(Boolean);
      for (let depth = 0; depth <= parts.length; depth++) { const parent = parts.slice(0, depth).join('/'); counts.set(parent, (counts.get(parent) || 0) + 1); }
    }
    return counts;
  }, [collection, selected]);
  const selectedPaths = collection.references.filter(reference => selected.has(reference.path)).map(reference => reference.path);
  const needle = normalizeQuery(selectionQuery);
  const matchingFolders = useMemo(() => folders.filter(folder => normalizeQuery(folder.path).includes(needle)), [folders, needle]);
  const matchingReferences = useMemo(() => collection.references.filter(reference => normalizeQuery(reference.title + ' ' + reference.path).includes(needle)), [collection, needle]);
  const pager = (page: number, total: number, change: (page: number) => void, label: string) => <div className="selection-pager"><button disabled={busy || page === 0} aria-label={`${label}: anteriores`} onClick={() => change(page - 1)}>Anterior</button><span>{page + 1} / {Math.max(1, Math.ceil(total / 100))}</span><button disabled={busy || (page + 1) * 100 >= total} aria-label={`${label}: siguientes`} onClick={() => change(page + 1)}>Siguiente</button></div>;
  const metadataKeys = useMemo(() => [...new Set(['complexity', 'constraints', 'tags', 'language', 'source', 'url', 'author', 'difficulty', 'custom', ...collection.references.flatMap(reference => Object.keys(reference.metadata))])].filter(key => !['title', 'subtitle', 'description', 'schema_version', 'files', 'notes'].includes(key)), [collection]);
  function update<K extends keyof DocumentSettings>(key: K, value: DocumentSettings[K]) {
    setSettings(previous => ({ ...previous, [key]: value })); setPreview(undefined);
  }
  function selectFolder(folder: string, checked: boolean) {
    setSelected(previous => {
      const next = new Set(previous);
      for (const path of folderGroups.get(canonicalPath(folder)) || []) { if (checked) next.add(path); else next.delete(path); }
      return next;
    });
    setPreview(undefined);
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    onBusy(true); setPreview(undefined); setNotice('Componiendo páginas, índice y código…');
    try {
      const result = await window.api.previewDocument({ selected: selectedPaths, settings });
      if (!result.ok) setNotice(result.error);
      else {
        setPreview(result.value); setPage(1); setJump(undefined);
        setNotice(`Documento preparado: ${result.value.pages} páginas. Revisa el resultado antes de exportar.`);
        try { localStorage.setItem('document-settings', JSON.stringify(settings)); }
        catch { setNotice(`Documento preparado: ${result.value.pages} páginas. No se pudo recordar la configuración.`); }
      }
    } catch { setNotice('No se pudo preparar el documento. Reduce la selección o vuelve a intentarlo.'); }
    finally { onBusy(false); }
  }
  async function exportPdf() {
    if (!preview) return;
    onBusy(true);
    try {
      const result = await window.api.printDocument(preview.id);
      setNotice(result.ok ? 'En el diálogo de impresión elige «Guardar como PDF», márgenes «Ninguno» y desactiva encabezados del navegador.' : result.error);
    } catch { setNotice('No se pudo abrir el diálogo de impresión.'); }
    finally { onBusy(false); }
  }
  async function downloadHtml() {
    if (!preview) return;
    onBusy(true);
    try {
      const result = await window.api.downloadDocument(preview.id);
      if (!result.ok || !result.value) { setNotice(result.ok ? 'Genera una vista previa válida antes de descargar.' : result.error); return; }
      const blob = new Blob([result.value.html], { type: 'text/html;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = result.value.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
      setNotice(`Documento descargado: ${result.value.filename}`);
    } finally { onBusy(false); }
  }
  const checkbox = (key: keyof DocumentSettings, label: string) => <label className="check-option"><input type="checkbox" checked={Boolean(settings[key])} onChange={event => update(key, event.target.checked as never)} />{label}</label>;
  const number = (key: 'margin' | 'fontSize' | 'codeFontSize' | 'lineHeight', label: string, min: number, max: number, step: number) => <label>{label}<input type="number" min={min} max={max} step={step} required value={Number.isFinite(settings[key]) ? settings[key] : ''} onChange={event => update(key, event.target.valueAsNumber)} /></label>;
  return <section className="document-workspace" aria-label="Generador de documentos">
    <div className="document-status" role="status">{notice}</div>
    <div className="document-grid">
      <section className="document-selection"><h2>Contenido del documento</h2><p>{selectedPaths.length} de {collection.references.length} referencias seleccionadas</p>
        {selectedPaths.length > 500 && <p className="selection-limit" role="alert">El límite es de 500 referencias por documento. Reduce la selección para continuar.</p>}
        <fieldset disabled={busy}><div className="actions"><button onClick={() => selectFolder('', true)}>Seleccionar todo</button><button onClick={() => selectFolder('', false)}>Quitar selección</button></div><input className="selection-search" aria-label="Buscar contenido para el documento" placeholder="Buscar carpetas o referencias…" value={selectionQuery} onChange={event => { setSelectionQuery(event.target.value); setReferencePage(0); setFolderPage(0); }} />
        <details open><summary>Seleccionar carpetas completas</summary>{pager(folderPage, matchingFolders.length, setFolderPage, 'Carpetas')}{matchingFolders.slice(folderPage * 100, (folderPage + 1) * 100).map(folder => {
          const descendants = folderGroups.get(canonicalPath(folder.path)) || [];
          const count = folderCounts.get(canonicalPath(folder.path)) || 0;
          return <label className="selection-folder" key={folder.path} style={{ paddingLeft: (folder.path.split(/[\\/]/).length - 1) * 12 }}><input type="checkbox" checked={count === descendants.length} ref={element => { if (element) element.indeterminate = count > 0 && count < descendants.length; }} onChange={event => selectFolder(folder.path, event.target.checked)} /><span>{folder.path}<small>{count}/{descendants.length}</small></span></label>;
        })}</details>
        <details open><summary>Referencias individuales</summary>{pager(referencePage, matchingReferences.length, setReferencePage, 'Referencias')}{matchingReferences.slice(referencePage * 100, (referencePage + 1) * 100).map(reference => <label className="selection-reference" key={reference.path}><input type="checkbox" checked={selected.has(reference.path)} onChange={event => { setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(reference.path); else next.delete(reference.path); return next; }); setPreview(undefined); }} /><span><strong>{reference.title}</strong><small>{reference.path || '(raíz)'}</small></span></label>)}</details></fieldset>
      </section>
      <form className="document-settings" onSubmit={generate}><h2>Configuración de impresión</h2><fieldset disabled={busy}>
        <div className="actions"><button type="button" onClick={() => { setSettings({ ...defaultDocumentSettings }); setPreview(undefined); }}>Perfil legible</button><button type="button" onClick={() => { setSettings({ ...compactDocumentSettings }); setPreview(undefined); }}>Perfil compacto</button></div>
        <label>Título del documento<input required maxLength={200} value={settings.title} onChange={event => update('title', event.target.value)} /></label>
        <label>Subtítulo del documento<input maxLength={500} value={settings.subtitle} onChange={event => update('subtitle', event.target.value)} /></label>
        <label>Autor del documento<input maxLength={200} value={settings.author} onChange={event => update('author', event.target.value)} /></label>
        <div className="settings-pair"><label>Tamaño de papel<select value={settings.paper} onChange={event => update('paper', event.target.value as DocumentSettings['paper'])}><option>A4</option><option value="Letter">Carta</option><option>A5</option></select></label><label>Columnas<select value={settings.columns} onChange={event => update('columns', Number(event.target.value) as 1 | 2)}><option value={1}>Una columna</option><option value={2}>Dos columnas</option></select></label></div>
        <div className="settings-pair">{number('margin', 'Márgenes (mm)', 8, 35, 1)}{number('fontSize', 'Tamaño del texto (pt)', 8, 16, .5)}{number('codeFontSize', 'Tamaño del código (pt)', 6, 14, .5)}{number('lineHeight', 'Interlineado', 1, 1.8, .05)}</div>
        <label>Encabezado<input maxLength={200} value={settings.header} onChange={event => update('header', event.target.value)} /></label>
        <label>Pie de página<input maxLength={200} value={settings.footer} onChange={event => update('footer', event.target.value)} /></label>
        <h3>Contenido y formato</h3><div className="option-grid">{checkbox('toc', 'Índice con páginas')}{checkbox('subtitles', 'Subtítulos de referencias')}{checkbox('descriptions', 'Descripciones')}{checkbox('notes', 'Notas y explicaciones')}{checkbox('code', 'Código fuente')}{checkbox('pageNumbers', 'Numerar páginas')}{checkbox('pageBreaks', 'Cada referencia en página nueva')}{checkbox('lineNumbers', 'Números de línea')}{checkbox('highlighting', 'Resaltado de sintaxis')}</div>
        <h3>Metadatos que se incluirán</h3>{metadataKeys.map(key => <label className="check-option" key={key}><input type="checkbox" checked={settings.metadataKeys.includes(key)} onChange={event => update('metadataKeys', event.target.checked ? [...settings.metadataKeys, key] : settings.metadataKeys.filter(item => item !== key))} />{metadataLabels[key] || key}</label>)}
        <p className="muted">El orden sigue la jerarquía de carpetas. Las líneas largas se ajustan sin recortar el código. El perfil compacto usa dos columnas y letra pequeña: revisa la vista previa.</p>
        <button type="submit" disabled={!selectedPaths.length || selectedPaths.length > 500}>Generar vista previa</button>
      </fieldset></form>
      <section className="document-preview"><div className="preview-heading"><h2>Vista previa del documento</h2><div className="actions"><button disabled={busy || !preview} onClick={exportPdf}>Exportar PDF</button><button disabled={busy || !preview} onClick={downloadHtml}>Descargar HTML imprimible</button></div></div>
        {preview ? <><div className="preview-controls"><button disabled={page <= 1} onClick={() => { setPage(previous => previous - 1); setJump(undefined); }}>Anterior</button><label>Página<input aria-label="Página de la vista previa" type="number" min={1} max={preview.pages} value={page} onChange={event => { setPage(Math.min(preview.pages, Math.max(1, Number(event.target.value) || 1))); setJump(undefined); }} /></label><span>de {preview.pages}</span><button disabled={page >= preview.pages} onClick={() => { setPage(previous => previous + 1); setJump(undefined); }}>Siguiente</button></div>
          {!!preview.warnings.length && <details className="warning"><summary>Advertencias ({preview.warnings.length})</summary>{preview.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}
          <details className="preview-index"><summary>Ir a una sección</summary>{preview.toc.map(item => <button key={item.id} style={{ paddingLeft: 8 + item.depth * 12 }} onClick={() => { setPage(item.page); setJump(item.id); }}>{item.title} <small>p. {item.page}</small></button>)}</details>
          <HtmlPreview html={preview.html} page={page} section={jump} />
        </> : <div className="preview-empty"><h3>Revisa antes de imprimir</h3><p>La vista previa muestra el documento paginado tal como se imprimirá.</p><p>Al cambiar la selección o la configuración deberás regenerarlo.</p><p>«Exportar PDF» abre el diálogo de impresión del navegador: elige «Guardar como PDF», márgenes «Ninguno» y sin encabezados.</p></div>}
      </section>
    </div>
  </section>;
}
