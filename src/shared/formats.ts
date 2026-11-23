import type { Reference } from './types.js';

export const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
export const extensionOf = (file: string) => file.split(/[\\/]/).pop()?.match(/\.[^.]+$/)?.[0].toLowerCase() || '';
export const isMetadataFile = (file: string) => /^metadata\.ya?ml$/i.test(file.split(/[\\/]/).pop() || '');
const systemFiles = new Set(['thumbs.db', 'desktop.ini']);
export const isIgnoredName = (name: string) => name.startsWith('.') || systemFiles.has(name.toLowerCase());
export const isRepositoryDocument = (file: string) => /^(readme|leeme|license|licence|licencia|changelog|contributing|code_of_conduct|security|authors)(\.[^.]+)?$/i.test(file.split(/[\\/]/).pop() || '');
const resourceFolders = new Set(['docs', 'assets', 'recursos', 'visualizations', 'visualizaciones', 'variants', 'variantes', 'examples', 'ejemplos']);
export const isReferenceResourceFolder = (name: string) => resourceFolders.has(name.toLowerCase());
export const assetExtensions: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
export const codeExtensions = new Set(['.cpp', '.cc', '.c', '.h', '.hpp', '.py', '.java', '.rs', '.js', '.ts', '.go', '.kt', '.cs', '.rb', '.swift']);
export const textExtensions = new Set([...codeExtensions, '.md', '.txt', '.yaml', '.yml', '.json', '.tex']);
export const isEditableFile = (file: string) => textExtensions.has(extensionOf(file));
export function referenceLanguages(reference: Reference): string[] {
  const languages: Record<string, string> = { '.cpp': 'C++', '.cc': 'C++', '.hpp': 'C++', '.h': 'C++', '.c': 'C', '.py': 'Python', '.java': 'Java', '.rs': 'Rust', '.js': 'JavaScript', '.ts': 'TypeScript', '.go': 'Go', '.kt': 'Kotlin', '.cs': 'C#', '.rb': 'Ruby', '.swift': 'Swift' };
  const result = [...new Set(reference.code.map(file => languages[extensionOf(file)]).filter(Boolean))];
  return result.length ? result : reference.metadata.language ? [reference.metadata.language] : [];
}
