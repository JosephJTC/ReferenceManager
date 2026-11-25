import { escapeHtml, type DocumentModel } from '../core/documents/model.js';
import { visualizationSnapshot } from '../visualizations/core/sandbox-client.js';
import { documentHtml } from '../core/documents/html.js';
import { paginateDocument } from '../core/documents/paginate.js';
import type { DocumentPreview, TocEntry } from '../shared/document.js';

let current: { id: string; html: string; title: string } | undefined;

const base64 = (text: string) => { let binary = ''; for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte); return btoa(binary); };

/** Sustituye cada bloque de visualización por su imagen. Se incrusta como <img>, así el SVG no puede ejecutar nada en el documento. */
async function resolveVisualizations(model: DocumentModel): Promise<DocumentModel> {
  const warnings = [...model.warnings];
  const blocks = [];
  for (const block of model.blocks) {
    if (!block.visualization) { blocks.push(block); continue; }
    const { file, title, code, css, options } = block.visualization;
    try {
      const result = await visualizationSnapshot(code, css, options);
      if (!result.svg) continue;
      const caption = escapeHtml(title || result.title);
      blocks.push({ html: `<figure class="visualization"><img src="data:image/svg+xml;base64,${base64(result.svg)}" alt="${caption}"><figcaption>${caption}</figcaption></figure>` });
    } catch (error) { warnings.push(`${file}: no se pudo generar la imagen de la visualización (${(error as Error).message}).`); }
  }
  return { ...model, blocks, warnings };
}

export async function generatePreview(original: DocumentModel): Promise<DocumentPreview> {
  const model = await resolveVisualizations(original);
  const source = documentHtml(model);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin allow-modals');
  iframe.style.cssText = 'position:fixed;left:-20000px;top:0;width:1400px;height:2000px;border:0;visibility:hidden';
  document.body.append(iframe);
  try {
    iframe.srcdoc = source;
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('No se pudo componer el documento.'));
      setTimeout(() => reject(new Error('La composición del documento superó el tiempo permitido.')), 60000);
    });
    await (iframe.contentDocument!.defaultView as Window & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
    const pagination = paginateDocument(model.settings, iframe.contentDocument!);
    const serialized = '<!doctype html>' + iframe.contentDocument!.documentElement.outerHTML;
    const id = crypto.randomUUID();
    current = { id, html: serialized, title: model.settings.title };
    return {
      id, html: serialized,
      pages: pagination.pages,
      toc: pagination.toc as TocEntry[],
      warnings: [...new Set([...model.warnings, ...pagination.warnings])],
      filename: model.settings.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) || 'documento'
    };
  } finally { iframe.remove(); }
}

export function storedDocument(id: string) { return current && current.id === id ? current : undefined; }

export async function printStored(id: string): Promise<void> {
  const stored = storedDocument(id);
  if (!stored) throw new Error('Genera una vista previa válida antes de exportar.');
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin allow-modals');
  iframe.style.cssText = 'position:fixed;left:-20000px;top:0;width:1400px;height:2000px;border:0';
  document.body.append(iframe);
  try {
    iframe.srcdoc = stored.html;
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('No se pudo preparar la impresión.'));
      setTimeout(resolve, 15000);
    });
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
  } finally {
    setTimeout(() => iframe.remove(), 60000);
  }
}
