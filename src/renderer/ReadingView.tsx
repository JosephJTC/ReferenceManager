import { useEffect, useMemo, useRef, useState } from 'react';
import type { Collection, Reference } from '../shared/types.js';
import { buildReadingModel, type ReadingTabId } from '../shared/reading.js';
import { referenceLanguages, codeExtensions, extensionOf } from '../shared/formats.js';
import { referencePlatform, referenceCategory } from '../shared/search.js';
import { MarkdownView, markdownHeadings, type Heading } from './MarkdownView.js';
import { CodeView } from './CodeView.js';
import { visualizations } from '../visualizations/index.js';
import { VisualizationHost } from '../visualizations/core/VisualizationHost.js';
import { Icon } from './icons.js';

type Props = {
  reference: Reference; collection: Collection; infoOpen: boolean; busy: boolean; practiced: Set<string>; externalLabel: string;
  onTogglePractice: (path: string) => void; onOpenReference: (reference: Reference) => void; onNotice: (message: string) => void; onPrint: () => void;
};
type Loaded = Record<string, { content?: string; error?: string }>;

export function relatedReferences(reference: Reference, collection: Collection, limit = 6) {
  const tags = new Set((reference.metadata.tags || []).map(tag => tag.toLowerCase()));
  const declared = Array.isArray(reference.metadata.related) ? reference.metadata.related.map(String) : [];
  const parent = reference.path.split('/').slice(0, -1).join('/');
  return collection.references.filter(item => item.path !== reference.path).map(item => {
    let score = (item.metadata.tags || []).filter(tag => tags.has(tag.toLowerCase())).length * 2;
    if (declared.some(value => value === item.path || value.toLowerCase() === item.title.toLowerCase() || value === item.metadata.id)) score += 10;
    if (parent && item.path.split('/').slice(0, -1).join('/') === parent) score += 1;
    return { item, score };
  }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title)).slice(0, limit).map(entry => entry.item);
}

export function ReadingView({ reference, collection, infoOpen, busy, practiced, externalLabel, onTogglePractice, onOpenReference, onNotice, onPrint }: Props) {
  const model = useMemo(() => buildReadingModel(reference), [reference]);
  const [tab, setTab] = useState<ReadingTabId>(model.tabs[0]?.id || 'explanation');
  const [loaded, setLoaded] = useState<Loaded>({});
  const [codeFile, setCodeFile] = useState<string>();
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { setTab(model.tabs[0]?.id || 'explanation'); setCodeFile(undefined); content.current?.scrollTo(0, 0); }, [reference.path, model]);
  useEffect(() => {
    let active = true;
    setLoaded({});
    void (async () => {
      for (const file of model.visible.slice(0, 60)) {
        const result = await window.api.read(file);
        if (!active) return;
        setLoaded(previous => ({ ...previous, [file]: result.ok ? { content: result.value.content } : { error: result.error } }));
      }
    })();
    return () => { active = false; };
  }, [model]);
  const current = model.tabs.find(item => item.id === tab) || model.tabs[0];
  const headings: Heading[] = useMemo(() => {
    if (!current) return [];
    if (current.id === 'code') return current.sections.map(section => ({ id: 'code-' + section.file, text: section.label, depth: 1 }));
    if (current.id === 'visualization') return model.visualizations.map((spec, index) => ({ id: `viz-${index}`, text: spec.title || visualizations.get(spec.type)?.title || spec.type, depth: 1 }));
    const list: Heading[] = current.id === 'complexity' && (model.complexity.time || model.complexity.space) ? [{ id: 'complexity-summary', text: 'Resumen', depth: 1 }] : [];
    current.sections.forEach((section, index) => {
      list.push({ id: `sec-${index}`, text: section.label, depth: 1 });
      const text = loaded[section.file]?.content;
      if (text && /\.md$/i.test(section.file)) list.push(...markdownHeadings(text, `s${index}`).filter(item => item.depth <= 3).map(item => ({ ...item, depth: item.depth + 1 })));
    });
    return list;
  }, [current, loaded, model]);
  const related = useMemo(() => relatedReferences(reference, collection), [reference, collection]);
  const languages = referenceLanguages(reference), platform = referencePlatform(reference), category = referenceCategory(reference);
  const subtitle = typeof reference.metadata.subtitle === 'string' ? reference.metadata.subtitle : '';
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const activeCode = current?.id === 'code' ? (current.sections.find(section => section.file === codeFile) || current.sections[0]) : undefined;
  const renderFile = (file: string, prefix: string) => {
    const state = loaded[file];
    if (!state) return <p className="muted">Cargando…</p>;
    if (state.error) return <p className="warning">{state.error}</p>;
    if (/\.md$/i.test(file)) return state.content!.length > 150000 ? <pre className="plain-text">{state.content}</pre> : <MarkdownView content={state.content!} file={file} prefix={prefix} />;
    if (codeExtensions.has(extensionOf(file))) return <CodeView content={state.content!} name={file} />;
    return <pre className="plain-text">{state.content}</pre>;
  };
  return <div className="reading">
    <div className="reading-main" ref={content}>
      <header className="reading-header">
        <div className="reading-path">{reference.path || '(raíz)'}</div>
        <h1>{reference.title}</h1>
        {subtitle && <p className="reading-subtitle">{subtitle}</p>}
        {reference.metadata.description && <p className="reading-description">{reference.metadata.description}</p>}
        <div className="chips">{languages.map(value => <span className="chip lang" key={value}>{value}</span>)}{platform && <span className="chip platform">{platform}</span>}{category && <span className="chip">{category}</span>}{(reference.metadata.tags || []).map(value => <span className="chip tag" key={value}>#{value}</span>)}</div>
      </header>
      {model.tabs.length > 0 ? <>
        <div className="reading-tabs" role="tablist" aria-label="Secciones de la referencia">
          {model.tabs.map(item => <button key={item.id} role="tab" aria-selected={current?.id === item.id} onClick={() => setTab(item.id)}>{item.label}{item.id === 'code' && item.sections.length > 1 ? <small>{item.sections.length}</small> : null}</button>)}
          <span className="spacer" /><button className="ghost" title="Imprimir esta referencia" onClick={onPrint}><Icon name="print" /> Imprimir</button>
        </div>
        <div className="reading-content" role="tabpanel" aria-label={current?.label}>
          {current?.id === 'code' && activeCode && <section id={'code-' + activeCode.file}>
            <div className="code-toolbar">
              {current.sections.length > 1 && <div className="code-files" role="tablist" aria-label="Archivos de código">{current.sections.map(section => <button key={section.file} role="tab" aria-selected={section.file === activeCode.file} onClick={() => setCodeFile(section.file)}>{section.label}</button>)}</div>}
              {current.sections.length === 1 && <strong className="code-title">{activeCode.label}</strong>}
              <span className="spacer" />
              <button disabled={busy || !loaded[activeCode.file]?.content} onClick={() => void window.api.copy(loaded[activeCode.file]?.content || '').then(result => onNotice(result.ok ? 'Código copiado al portapapeles.' : result.error))}><Icon name="copy" /> Copiar</button>
              <button disabled={busy} onClick={() => void window.api.external(activeCode.file)}>{externalLabel}</button>
              <button aria-pressed={practiced.has(activeCode.file)} disabled={busy} onClick={() => onTogglePractice(activeCode.file)}>{practiced.has(activeCode.file) ? '✓ Para practicar' : 'Seleccionar para practicar'}</button>
            </div>
            {renderFile(activeCode.file, 'code')}
          </section>}
          {current?.id === 'visualization' && model.visualizations.map((spec, index) => {
            const entry = visualizations.get(spec.type);
            return <section key={index} id={`viz-${index}`} className="reading-section">
              <h2 className="section-label">{spec.title || entry?.title || spec.type}</h2>
              {entry ? <><p className="muted">{entry.description}</p><VisualizationHost key={`${reference.path}:${index}`} definition={entry} spec={spec} /></> : <p className="warning">No hay una visualización registrada para «{spec.type}». Disponibles: {visualizations.list().map(item => item.id).join(', ')}.</p>}
            </section>;
          })}
          {current?.id === 'complexity' && (model.complexity.time || model.complexity.space) && <section id="complexity-summary" className="reading-section"><h2 className="section-label">Resumen</h2><table className="complexity-table"><tbody>{model.complexity.time && <tr><th>Tiempo</th><td>{model.complexity.time}</td></tr>}{model.complexity.space && <tr><th>Memoria</th><td>{model.complexity.space}</td></tr>}{model.complexity.notes && <tr><th>Notas</th><td>{model.complexity.notes}</td></tr>}</tbody></table></section>}
          {current && !['code', 'visualization'].includes(current.id) && current.sections.map((section, index) => <section key={section.file} id={`sec-${index}`} className="reading-section">
            <div className="section-label" title={section.file}>{section.label}</div>
            {renderFile(section.file, `s${index}`)}
          </section>)}
        </div>
      </> : <div className="reading-content"><p className="muted">Esta referencia no tiene código ni documentación visibles. Cambia a modo edición para ver todos sus archivos.</p></div>}
    </div>
    {infoOpen && <aside className="reading-info" aria-label="Panel de información">
      {headings.length > 0 && <section><h3>En esta sección</h3><nav className="toc">{headings.map((item, index) => <button key={item.id + index} className={`toc-${Math.min(item.depth, 4)}`} onClick={() => jump(item.id)}>{item.text}</button>)}</nav></section>}
      {(model.complexity.time || model.complexity.space) && <section><h3>Complejidad</h3><dl className="mini-dl">{model.complexity.time && <><dt>Tiempo</dt><dd>{model.complexity.time}</dd></>}{model.complexity.space && <><dt>Memoria</dt><dd>{model.complexity.space}</dd></>}</dl></section>}
      {typeof reference.metadata.url === 'string' && /^https?:\/\//.test(reference.metadata.url) && <section><h3>Enlace</h3><a href={reference.metadata.url} target="_blank" rel="noopener noreferrer">{reference.metadata.url}</a></section>}
      {related.length > 0 && <section><h3>Relacionadas</h3>{related.map(item => <button key={item.path} className="related" onClick={() => onOpenReference(item)}><strong>{item.title}</strong><small>{item.path}</small></button>)}</section>}
      {model.hidden.length > 0 && <p className="muted">{model.hidden.length} archivo(s) auxiliares ocultos en modo lectura.</p>}
    </aside>}
  </div>;
}
