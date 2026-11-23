import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.js';

export type Filters = { filter: string; sort: string; language: string; tag: string; extension: string; category: string; platform: string };
export const emptyFilters: Filters = { filter: 'all', sort: 'title', language: '', tag: '', extension: '', category: '', platform: '' };
type Options = { languages: string[]; tags: string[]; extensions: string[]; categories: string[]; platforms: string[] };
type Props = { query: string; filters: Filters; options: Options; onQuery: (value: string) => void; onFilters: (value: Filters) => void; searchRef: React.RefObject<HTMLInputElement | null>; openSignal: number };
const stateLabels: Record<string, string> = { 'no-code': 'Sin código', 'no-metadata': 'Sin metadatos', warnings: 'Con advertencias' };

export const activeFilterCount = (filters: Filters) => Number(filters.filter !== 'all') + ['language', 'tag', 'extension', 'category', 'platform'].filter(key => !!filters[key as keyof Filters]).length;

export function FilterBar({ query, filters, options, onQuery, onFilters, searchRef, openSignal }: Props) {
  const [open, setOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const count = activeFilterCount(filters);
  const set = (key: keyof Filters, value: string) => onFilters({ ...filters, [key]: value });
  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  const chips: [keyof Filters, string][] = [];
  if (filters.filter !== 'all') chips.push(['filter', stateLabels[filters.filter] || filters.filter]);
  for (const key of ['language', 'category', 'platform', 'extension'] as const) if (filters[key]) chips.push([key, filters[key]]);
  if (filters.tag) chips.push(['tag', '#' + filters.tag]);
  const select = (key: keyof Filters, label: string, values: string[], all: string) => <label>{label}<select aria-label={`Filtrar por ${label.toLowerCase()}`} value={filters[key]} onChange={event => set(key, event.target.value)}><option value="">{all}</option>{values.map(value => <option key={value} value={value}>{value || '(sin valor)'}</option>)}</select></label>;
  const visibleTags = options.tags.filter(tag => tag.toLowerCase().includes(tagQuery.toLowerCase())).slice(0, 60);
  return <div className="filter-bar" ref={panel}>
    <div className="search-row">
      <div className="search-box"><Icon name="search" size={14} /><input ref={searchRef} aria-label="Buscar referencias" maxLength={1000} placeholder="Buscar (Ctrl+K)" value={query} onChange={event => onQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && query) { event.stopPropagation(); onQuery(''); } }} />{query && <button className="icon-button clear" aria-label="Borrar búsqueda" onClick={() => onQuery('')}><Icon name="close" size={12} /></button>}</div>
      <button className={`icon-button filter-toggle ${count ? 'has-filters' : ''}`} aria-expanded={open} aria-label={`Filtros${count ? ` (${count} activos)` : ''}`} title="Filtros (Ctrl+Shift+F)" onClick={() => setOpen(!open)}><Icon name="filter" size={14} />{count > 0 && <span className="badge">{count}</span>}</button>
    </div>
    {chips.length > 0 && <div className="active-filters">{chips.map(([key, label]) => <button key={key} className="chip removable" aria-label={`Quitar filtro ${label}`} onClick={() => set(key, key === 'filter' ? 'all' : '')}>{label} <Icon name="close" size={10} /></button>)}<button className="link-button" onClick={() => onFilters({ ...emptyFilters, sort: filters.sort })}>Limpiar</button></div>}
    {open && <div className="filter-popover" role="dialog" aria-label="Filtros avanzados">
      <div className="filter-grid">
        <label>Estado<select aria-label="Filtrar referencias" value={filters.filter} onChange={event => set('filter', event.target.value)}><option value="all">Todas</option><option value="no-code">Sin código</option><option value="no-metadata">Sin metadatos</option><option value="warnings">Con advertencias</option></select></label>
        <label>Orden<select aria-label="Ordenar referencias" value={filters.sort} onChange={event => set('sort', event.target.value)}><option value="title">Título</option><option value="modified">Modificación reciente</option></select></label>
        {select('language', 'Lenguaje', options.languages, 'Todos')}
        {select('category', 'Categoría', options.categories, 'Todas')}
        {select('platform', 'Plataforma', options.platforms, 'Todas')}
        {select('extension', 'Extensión', options.extensions, 'Todas')}
      </div>
      <div className="tag-picker"><div className="tag-picker-head"><span>Etiquetas</span>{options.tags.length > 12 && <input aria-label="Buscar etiqueta" placeholder="Buscar etiqueta…" value={tagQuery} onChange={event => setTagQuery(event.target.value)} />}</div>
        <div className="tag-list" role="listbox" aria-label="Filtrar por etiqueta">{visibleTags.map(tag => <button key={tag} role="option" aria-selected={filters.tag === tag} className={`chip tag ${filters.tag === tag ? 'selected' : ''}`} onClick={() => set('tag', filters.tag === tag ? '' : tag)}>#{tag}</button>)}{!visibleTags.length && <span className="muted">Sin etiquetas.</span>}</div>
      </div>
      <div className="filter-footer"><button className="link-button" disabled={!count} onClick={() => onFilters({ ...emptyFilters, sort: filters.sort })}>Limpiar filtros</button><button onClick={() => setOpen(false)}>Cerrar</button></div>
    </div>}
  </div>;
}
