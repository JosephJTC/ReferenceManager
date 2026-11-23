import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import katex from 'katex';
import { buildReadingModel, readingVisualizations } from '../../shared/reading.js';
import { visualizations } from '../../visualizations/index.js';
import { inputFromSpec } from '../../visualizations/core/engine.js';
import hljs from 'highlight.js/lib/common';
import { z } from 'zod';
import { canonicalPath, documentSettingsSchema, metadataLabels, type DocumentRequest, type DocumentSettings } from '../../shared/document.js';
import type { Collection, Reference, TextFile } from '../../shared/types.js';
import { extensionOf } from '../../shared/formats.js';
import { baseName, joinRelative } from '../provider.js';

export interface DocumentSource {
  scan(): Promise<Collection>;
  read(path: string): Promise<TextFile>;
}

export type DocumentBlock = { html: string; keepNext?: boolean; pageBreak?: boolean };
export type DocumentModel = { settings: DocumentSettings; blocks: DocumentBlock[]; warnings: string[] };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const requestSchema = z.object({ selected: z.array(z.string().max(4096)).min(1).max(500), settings: documentSettingsSchema }).strict();
const byteLength = (value: string) => new TextEncoder().encode(value).length;

function readable(value: unknown): string {
  if (Array.isArray(value)) return value.map(readable).join('; ');
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${metadataLabels[key] || key}: ${readable(item)}`).join('\n');
  return value == null ? '' : String(value);
}
export function highlightedLines(source: string, filename: string, highlighting: boolean): string[] {
  const extension = extensionOf(filename).slice(1);
  const language = ({ h: 'cpp', hpp: 'cpp', cc: 'cpp', py: 'python', rs: 'rust', js: 'javascript', ts: 'typescript', kt: 'kotlin', cs: 'csharp' } as Record<string, string>)[extension] || extension;
  const html = highlighting && source.length < 250000 && hljs.getLanguage(language) ? hljs.highlight(source, { language }).value : escapeHtml(source);
  const lines: string[] = [];
  const stack: string[] = [];
  let line = '';
  for (const token of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (token === '\n') { lines.push(line + '</span>'.repeat(stack.length)); line = stack.join(''); }
    else { line += token; if (token.startsWith('<span')) stack.push(token); else if (token === '</span>') stack.pop(); }
  }
  lines.push(line + '</span>'.repeat(stack.length));
  return lines;
}
function markdownHtml(content: string) {
  return renderToStaticMarkup(createElement(Markdown, {
    skipHtml: true,
    remarkPlugins: [remarkGfm, remarkMath],
    components: {
      a: ({ children }: { children?: React.ReactNode }) => createElement('span', null, children),
      img: ({ alt }: { alt?: string }) => createElement('span', null, `[Imagen: ${alt || 'sin descripción'}]`),
      code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
        const display = /math-display/.test(className || '');
        if (!display && !/math-inline/.test(className || '')) return createElement('code', { className }, children);
        return createElement('span', { className: display ? 'math-display' : 'math-inline', dangerouslySetInnerHTML: { __html: katex.renderToString(String(children ?? ''), { displayMode: display, output: 'mathml', throwOnError: false, strict: 'ignore' }) } });
      }
    }, children: content
  }));
}
export async function buildDocumentModel(service: DocumentSource, input: DocumentRequest): Promise<DocumentModel> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new Error('La selección o la configuración del documento no son válidas. Revisa los límites de impresión.');
  const { settings, selected } = parsed.data;
  const collection = await service.scan();
  const requested = new Set(selected.map(canonicalPath));
  const references = collection.references.filter(reference => requested.has(reference.path));
  if (references.length !== requested.size) throw new Error('Una referencia seleccionada ya no existe. Actualiza la colección y vuelve a seleccionarla.');
  const blocks: DocumentBlock[] = [];
  const warnings = [...collection.warnings];
  let bytes = 0;
  const snapshot = async (file: string) => {
    const value = await service.read(file);
    bytes += byteLength(value.content);
    if (bytes > 20 * 1024 * 1024) throw new Error('La selección supera 20 MiB de texto. Genera documentos más pequeños.');
    return value.content;
  };
  type Node = { name: string; key: string; reference?: Reference; children: Map<string, Node> };
  const root: Node = { name: '', key: '', children: new Map() };
  for (const reference of references) {
    let node = root;
    const parts = canonicalPath(reference.path).split('/').filter(Boolean);
    for (const part of parts) {
      if (!node.children.has(part)) node.children.set(part, { name: part, key: node.key ? `${node.key}/${part}` : part, children: new Map() });
      node = node.children.get(part)!;
    }
    node.reference = reference;
  }
  let sectionId = 0;
  const visit = async (node: Node, number: string, depth: number) => {
    const reference = node.reference;
    const title = reference?.title || node.name;
    const label = `${number} ${title}`;
    const id = `section-${++sectionId}`;
    blocks.push({ html: `<h${Math.min(depth + 1, 5)} class="section-heading" data-section="${id}" data-depth="${depth}" data-label="${escapeHtml(label)}">${escapeHtml(label)}</h${Math.min(depth + 1, 5)}>`, keepNext: true, pageBreak: !!reference && settings.pageBreaks });
    if (reference) {
      bytes += byteLength(JSON.stringify(reference.metadata));
      if (bytes > 20 * 1024 * 1024) throw new Error('La selección supera 20 MiB de texto. Genera documentos más pequeños.');
      warnings.push(...reference.warnings.map(warning => `${reference.path || '(raíz)'}: ${warning}`));
      if (settings.subtitles && typeof reference.metadata.subtitle === 'string') blocks.push({ html: `<p class="subtitle">${escapeHtml(reference.metadata.subtitle)}</p>`, keepNext: true });
      if (settings.descriptions && reference.metadata.description) blocks.push({ html: `<p>${escapeHtml(reference.metadata.description)}</p>` });
      for (const key of settings.metadataKeys) {
        if (['title', 'subtitle', 'description', 'files', 'notes', 'schema_version'].includes(key)) continue;
        const value = reference.metadata[key];
        if (value !== undefined && value !== null && value !== '') blocks.push({ html: `<div class="metadata"><strong>${escapeHtml(metadataLabels[key] || key)}</strong><div>${escapeHtml(readable(value))}</div></div>` });
      }
      if (settings.notes) {
        const reading = buildReadingModel(reference);
        const order = reading.tabs.flatMap(tab => tab.id === 'code' ? [] : tab.sections.map(section => section.file));
        const labels = new Map(reading.tabs.flatMap(tab => tab.sections.map(section => [section.file, section.label] as const)));
        const notes = reference.files.filter(file => /\.(md|txt)$/i.test(file)).sort((a, b) => (order.indexOf(a) + 1 || 1e6) - (order.indexOf(b) + 1 || 1e6));
        if (reference.metadata.notes) {
          const declared = joinRelative(reference.path, reference.metadata.notes);
          if (notes.includes(declared)) notes.splice(notes.indexOf(declared), 1), notes.unshift(declared);
          else warnings.push(`Notas declaradas fuera de los archivos locales disponibles: ${declared}`);
        }
        for (const file of notes) {
          let content: string;
          try { content = await snapshot(file); } catch (error) { throw new Error(`No se pudieron incluir las notas ${file}: ${(error as Error).message}`); }
          blocks.push({ html: `<div class="file-title">${escapeHtml(labels.get(file) || 'Notas')} · ${escapeHtml(baseName(file))}</div>`, keepNext: true });
          blocks.push({ html: `<article class="notes">${/\.md$/i.test(file) ? markdownHtml(content) : `<p>${escapeHtml(content)}</p>`}</article>` });
        }
      }
      if (settings.code) for (const file of reference.code) {
        let content: string;
        try { content = await snapshot(file); } catch (error) { throw new Error(`No se pudo incluir el código ${file}: ${(error as Error).message}`); }
        blocks.push({ html: `<div class="file-title">${escapeHtml(baseName(file))}</div>`, keepNext: true });
        for (const [index, html] of highlightedLines(content.replace(/\r\n/g, '\n'), file, settings.highlighting).entries()) {
          if (blocks.length >= 60000) throw new Error('La selección contiene demasiadas líneas. Divide la exportación.');
          blocks.push({ html: `<div class="code-line">${settings.lineNumbers ? `<span class="line-number" aria-hidden="true">${index + 1}</span>` : ''}<code>${html || '&#8203;'}</code></div>` });
        }
      }
      if (!reference.code.length && settings.code) blocks.push({ html: '<p class="missing">Esta referencia no contiene archivos de código.</p>' });
      if (settings.visualizations !== false) for (const spec of readingVisualizations(reference)) {
        const definition = visualizations.get(spec.type);
        if (!definition?.staticSvg) continue;
        const { values, warning } = inputFromSpec(definition, spec);
        if (warning) warnings.push(`${reference.path}: ${warning}`);
        const figure = definition.staticSvg(definition.parseInput(values));
        blocks.push({ html: `<figure class="visualization">${figure.svg}<figcaption>${escapeHtml([spec.title || definition.title, figure.caption].filter(Boolean).join(' · '))}</figcaption></figure>` });
      }
    }
    const children = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
    for (const [index, child] of children.entries()) await visit(child, `${number}.${index + 1}`, depth + 1);
  };
  if (root.reference) await visit({ ...root, children: new Map() }, '1', 0);
  const offset = root.reference ? 1 : 0;
  for (const [index, child] of [...root.children.values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true })).entries()) await visit(child, String(index + 1 + offset), 0);
  if (blocks.length > 60000) throw new Error('La selección contiene demasiadas líneas. Divide la exportación.');
  return { settings, blocks, warnings: [...new Set(warnings)] };
}
