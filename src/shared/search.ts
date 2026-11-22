import type { Reference } from './types.js';
import { collator, extensionOf, referenceLanguages } from './formats.js';
export const normalizeQuery = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function referenceCategory(reference: Reference): string {
  const declared = reference.metadata.category;
  if (typeof declared === 'string' && declared.trim()) return declared;
  return reference.path.replaceAll('\\', '/').split('/')[0] || '';
}
export function searchReferences(
  references: Reference[], query: string, filter: string, scope: string, sort: string,
  language = '', tag = '', extension = '', category = ''
) {
  const terms = normalizeQuery(query).split(/\s+/).filter(Boolean);
  const prefix = scope.replaceAll('\\', '/');
  const wantedExtension = extension.toLowerCase();
  const result = references.filter(ref => {
    const current = ref.path.replaceAll('\\', '/');
    if (prefix && current !== prefix && !current.startsWith(prefix + '/')) return false;
    if (filter === 'no-code' && ref.code.length || filter === 'no-metadata' && ref.hasMetadata || filter === 'warnings' && !ref.warnings.length) return false;
    if (language && !referenceLanguages(ref).some(value => normalizeQuery(value) === normalizeQuery(language))) return false;
    if (tag && !ref.metadata.tags?.some(value => normalizeQuery(value) === normalizeQuery(tag))) return false;
    if (wantedExtension && !ref.files.some(file => extensionOf(file) === wantedExtension)) return false;
    if (category && normalizeQuery(referenceCategory(ref)) !== normalizeQuery(category)) return false;
    const fallback = normalizeQuery(`${ref.title} ${ref.path} ${ref.files.join(' ')} ${ref.metadata.tags?.join(' ') || ''}`);
    return terms.every(term => ref.searchText.includes(term) || fallback.includes(term));
  });
  return result.sort((a, b) => sort === 'modified' ? b.modified - a.modified || collator.compare(a.title, b.title) : collator.compare(a.title, b.title));
}
