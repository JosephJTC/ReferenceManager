import { Children, isValidElement, useEffect, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { headingSlug } from '../shared/reading.js';
import { highlightCode } from './highlight.js';

export type Heading = { id: string; text: string; depth: number };
const textOf = (node: ReactNode): string => Children.toArray(node).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : '').join('');
const stripInline = (text: string) => text.replace(/\$[^$]*\$/g, match => match.slice(1, -1)).replace(/[`*_~]|\[([^\]]*)\]\([^)]*\)/g, (match, label) => label ?? '').trim();

export function markdownHeadings(content: string, prefix: string): Heading[] {
  const headings: Heading[] = [];
  let fence = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const match = !fence && /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      const text = stripInline(match[2]);
      headings.push({ id: `${prefix}-${headingSlug(text)}`, text, depth: match[1].length });
    }
  }
  return headings;
}

export function resolveRelative(file: string, target: string) {
  const parts = file.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') { if (!parts.length) return undefined; parts.pop(); } else parts.push(segment);
  }
  return parts.join('/');
}

function LibraryImage({ file, src, alt }: { file: string; src?: string; alt?: string }) {
  const [state, setState] = useState<{ data?: string; error?: string }>({});
  const external = !src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//');
  useEffect(() => {
    if (external) return;
    let active = true;
    const target = resolveRelative(file, decodeURI(src!.split(/[?#]/)[0]));
    if (target === undefined) { setState({ error: 'Ruta fuera de la biblioteca' }); return; }
    void window.api.readAsset(target).then(result => { if (active) setState(result.ok ? { data: result.value.data } : { error: result.error }); });
    return () => { active = false; };
  }, [file, src, external]);
  if (external) return src && /^https:\/\//i.test(src) ? <a className="image-link" href={src} target="_blank" rel="noopener noreferrer">[Imagen externa: {alt || src}]</a> : <span className="image-link">[Imagen: {alt}]</span>;
  if (state.error) return <span className="image-link" title={state.error}>[Imagen no disponible: {alt || src}]</span>;
  return state.data ? <img className="doc-image" src={state.data} alt={alt || ''} /> : <span className="image-link">Cargando imagen…</span>;
}

export function MarkdownView({ content, file, prefix }: { content: string; file: string; prefix: string }) {
  const heading = (Tag: 'h1' | 'h2' | 'h3' | 'h4') => ({ children }: { children?: ReactNode }) => <Tag id={`${prefix}-${headingSlug(stripInline(textOf(children)))}`}>{children}</Tag>;
  return <div className="markdown"><Markdown
    skipHtml remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' }]]}
    components={{
      h1: heading('h1'), h2: heading('h2'), h3: heading('h3'), h4: heading('h4'),
      a: ({ href, children }) => href && /^https?:\/\//i.test(href) ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span className="internal-link">{children}</span>,
      img: ({ src, alt }) => <LibraryImage file={file} src={typeof src === 'string' ? src : undefined} alt={alt} />,
      code: ({ className, children }) => {
        const language = /language-([\w+#-]+)/.exec(className || '')?.[1];
        const source = String(children ?? '').replace(/\n$/, '');
        const html = language ? highlightCode(source, language) : null;
        return html ? <code className={className} dangerouslySetInnerHTML={{ __html: html }} /> : <code className={className}>{children}</code>;
      }
    }}>{content}</Markdown></div>;
}
