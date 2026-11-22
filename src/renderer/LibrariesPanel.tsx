import { useCallback, useEffect, useRef, useState } from 'react';
import type { LibrarySummary } from '../shared/types.js';

const kindLabels: Record<string, string> = {
  'local-fs': 'Carpeta local', 'local-snapshot': 'Instantánea local', github: 'GitHub', example: 'Ejemplos'
};
const statusLabels: Record<string, string> = {
  conectada: 'Conectada', 'sin-conectar': 'Sin conectar', 'requiere-permiso': 'Requiere permiso',
  'requiere-reselección': 'Requiere reselección', error: 'Error', actualizando: 'Actualizando'
};

type Props = {
  busy: boolean;
  onBusy: (value: boolean) => void;
  onOpen: (id: string) => Promise<void> | void;
  onSnapshot: (files: FileList | File[], existingId?: string) => Promise<void> | void;
  onNotice: (message: string) => void;
};

export function LibrariesPanel({ busy, onBusy, onOpen, onSnapshot, onNotice }: Props) {
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [mode, setMode] = useState<'none' | 'github' | 'edit'>('none');
  const [editing, setEditing] = useState<LibrarySummary>();
  const [url, setUrl] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [subpath, setSubpath] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState('');
  const [supportsLocal] = useState(() => typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function');
  const fileInput = useRef<HTMLInputElement>(null);
  const snapshotTarget = useRef<string | undefined>(undefined);

  const reload = useCallback(async () => {
    const result = await window.api.listLibraries();
    if (result.ok) setLibraries(result.value); else onNotice(result.error);
  }, [onNotice]);

  useEffect(() => { void reload(); }, [reload]);

  async function run(task: () => Promise<{ ok: true; value: unknown } | { ok: false; error: string } | void>) {
    onBusy(true);
    try {
      const result = await task();
      if (result && !result.ok) onNotice(result.error);
      await reload();
    } finally { onBusy(false); }
  }

  async function connectGitHub(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await window.api.addGitHubLibrary({ url: url || undefined, owner: owner || undefined, repo: repo || undefined, branch: branch || undefined, subpath: subpath || undefined, name: name || undefined, description: description || undefined });
      if (result.ok) { setMode('none'); setUrl(''); setOwner(''); setRepo(''); setBranch(''); setSubpath(''); setName(''); setDescription(''); onNotice(`Biblioteca conectada: ${result.value.name}`); await onOpen(result.value.id); }
      return result;
    });
  }

  async function loadBranches() {
    await run(async () => {
      const result = await window.api.listBranches({ url: url || undefined, owner: owner || undefined, repo: repo || undefined });
      if (result.ok) { setBranches(result.value.branches); setDefaultBranch(result.value.defaultBranch); if (!branch) setBranch(result.value.defaultBranch); }
      return result;
    });
  }

  function pickSnapshot(existingId?: string) {
    snapshotTarget.current = existingId;
    fileInput.current?.click();
  }

  async function snapshotChosen(list: FileList | null) {
    if (!list?.length) return;
    await onSnapshot(list, snapshotTarget.current);
    await reload();
  }

  async function remove(library: LibrarySummary) {
    if (!window.confirm(`¿Eliminar la conexión «${library.name}»? Los archivos de la biblioteca no se borran.`)) return;
    await run(() => window.api.removeLibrary(library.id));
  }

  const date = (value: number) => new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
  return <section className="libraries-panel">
    <h2>Bibliotecas</h2>
    <p className="muted">Conecta repositorios públicos de GitHub, carpetas locales o la colección de ejemplos. Cada biblioteca se indexa por separado.</p>
    <div className="actions library-actions">
      <button disabled={busy} onClick={() => setMode(mode === 'github' ? 'none' : 'github')}>Conectar repositorio GitHub</button>
      <button disabled={busy || !supportsLocal} title={supportsLocal ? '' : 'Este navegador no permite abrir carpetas directamente'} onClick={() => run(async () => { const result = await window.api.addLocalLibrary(); if (result.ok && result.value) { onNotice(`Carpeta conectada: ${result.value.name}`); await onOpen(result.value.id); } return result; })}>Seleccionar carpeta local</button>
      <button disabled={busy} onClick={() => pickSnapshot()}>{supportsLocal ? 'Seleccionar instantánea' : 'Seleccionar carpeta (instantánea)'}</button>
      <input ref={fileInput} type="file" multiple hidden {...{ webkitdirectory: '', directory: '' } as Record<string, string>} onChange={event => { void snapshotChosen(event.target.files); event.target.value = ''; }} />
    </div>
    {!supportsLocal && <p className="muted">Este navegador no admite la apertura directa de carpetas: la selección crea una instantánea de solo lectura que no se conserva al recargar.</p>}
    {mode === 'github' && <form className="github-form" onSubmit={connectGitHub}>
      <label>URL del repositorio<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://github.com/propietario/repositorio o propietario/repositorio" /></label>
      <div className="settings-pair"><label>Propietario<input value={owner} onChange={event => setOwner(event.target.value)} placeholder="opcional si usas URL" /></label><label>Repositorio<input value={repo} onChange={event => setRepo(event.target.value)} /></label></div>
      <div className="settings-pair"><label>Rama<select value={branch} onChange={event => setBranch(event.target.value)}><option value="">{defaultBranch ? `Predeterminada (${defaultBranch})` : 'Predeterminada'}</option>{branches.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Subcarpeta (opcional)<input value={subpath} onChange={event => setSubpath(event.target.value)} placeholder="ruta/dentro/del/repo" /></label></div>
      <button type="button" disabled={busy} onClick={loadBranches}>Cargar ramas</button>
      <div className="settings-pair"><label>Nombre de la biblioteca<input value={name} onChange={event => setName(event.target.value)} placeholder="opcional" /></label><label>Descripción<input value={description} onChange={event => setDescription(event.target.value)} placeholder="opcional" /></label></div>
      <button disabled={busy} type="submit">Conectar y abrir</button>
    </form>}
    {mode === 'edit' && editing && <form className="github-form" onSubmit={event => { event.preventDefault(); void run(async () => { const result = await window.api.updateLibrary(editing.id, { name, description }); if (result.ok) { setMode('none'); onNotice('Biblioteca actualizada.'); } return result; }); }}>
      <label>Nombre<input required value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Descripción<input value={description} onChange={event => setDescription(event.target.value)} /></label>
      <button disabled={busy} type="submit">Guardar</button>
      <button type="button" disabled={busy} onClick={() => setMode('none')}>Cancelar</button>
    </form>}
    <ul className="library-list">
      {libraries.map(library => <li className="library-item" key={library.id}>
        <div className="library-info"><strong>{library.name}</strong><span className="kind-badge">{kindLabels[library.kind] || library.kind}</span>
          <small>{library.location}{library.branch ? ` · rama ${library.branch}` : ''}{library.subpath ? ` · ${library.subpath}` : ''}</small>
          <small>{statusLabels[library.status] || library.status}{library.statusMessage ? ` — ${library.statusMessage}` : ''}</small>
          <small>Última actualización: {date(library.updatedAt)}</small>
          {library.description && <small>{library.description}</small>}
        </div>
        <div className="library-buttons">
          <button disabled={busy} onClick={() => onOpen(library.id)}>Abrir</button>
          {library.status === 'requiere-permiso' && <button disabled={busy} onClick={() => run(async () => { const result = await window.api.grantAccess(library.id); if (result.ok) await onOpen(library.id); return result; })}>Conceder acceso</button>}
          {library.status === 'requiere-reselección' && <button disabled={busy} onClick={() => pickSnapshot(library.id)}>Volver a seleccionar</button>}
          <button disabled={busy} onClick={() => run(async () => { const result = await window.api.openLibrary(library.id); return result; })}>Actualizar</button>
          <button disabled={busy} onClick={() => { setEditing(library); setName(library.name); setDescription(library.description || ''); setMode('edit'); }}>Editar nombre</button>
          <button disabled={busy} onClick={() => remove(library)}>Eliminar conexión</button>
        </div>
      </li>)}
      {!libraries.length && <li className="muted">Todavía no hay bibliotecas registradas.</li>}
    </ul>
  </section>;
}
