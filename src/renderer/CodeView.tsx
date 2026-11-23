import { useMemo } from 'react';
import { highlightedLines } from './highlight.js';

export function CodeView({ content, name, numbered = true }: { content: string; name: string; numbered?: boolean }) {
  const lines = useMemo(() => content.length > 150000 ? null : highlightedLines(content, name), [content, name]);
  if (!lines) return <><p className="muted">Vista de texto simple para mantener el rendimiento con archivos grandes.</p><pre className="code"><code>{content}</code></pre></>;
  return <pre className={`code ${numbered ? 'numbered' : ''}`}><code>{lines.map((line, index) => <span className="line" key={index} dangerouslySetInnerHTML={{ __html: line || ' ' }} />)}</code></pre>;
}
