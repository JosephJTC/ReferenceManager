import hljs from 'highlight.js/lib/common';

const aliases: Record<string, string> = { h: 'cpp', hpp: 'cpp', cc: 'cpp', cxx: 'cpp', 'c++': 'cpp', rs: 'rust', py: 'python', js: 'javascript', ts: 'typescript', md: 'markdown', yml: 'yaml', kt: 'kotlin', cs: 'csharp', rb: 'ruby', tex: 'latex' };
export const languageOf = (nameOrLanguage: string) => {
  const value = (nameOrLanguage.includes('.') ? nameOrLanguage.split('.').pop() : nameOrLanguage)?.toLowerCase() || '';
  return aliases[value] || value;
};
export function highlightCode(content: string, nameOrLanguage: string): string | null {
  if (content.length > 150000) return null;
  const language = languageOf(nameOrLanguage);
  return language && hljs.getLanguage(language) ? hljs.highlight(content, { language }).value : null;
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export function highlightedLines(content: string, name: string): string[] {
  const html = highlightCode(content, name) ?? escapeHtml(content);
  const lines: string[] = [], stack: string[] = [];
  let line = '';
  for (const token of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (token === '\n') { lines.push(line + '</span>'.repeat(stack.length)); line = stack.join(''); }
    else { line += token; if (token.startsWith('<span')) stack.push(token); else if (token === '</span>') stack.pop(); }
  }
  lines.push(line + '</span>'.repeat(stack.length));
  return lines;
}
