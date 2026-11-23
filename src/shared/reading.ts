import type { Reference } from './types.js';
import { codeExtensions, extensionOf, isMetadataFile, isRepositoryDocument, assetExtensions } from './formats.js';

export type ReadingTabId = 'explanation' | 'code' | 'visualization' | 'examples' | 'complexity';
export type ReadingSection = { file: string; kind: string; label: string };
export type ReadingTab = { id: ReadingTabId; label: string; sections: ReadingSection[] };
export type VisualizationSpec = { type: string; title?: string; values?: number[]; operation?: string };
export type ReadingModel = {
  tabs: ReadingTab[];
  visible: string[];
  hidden: string[];
  complexity: { time?: string; space?: string; notes?: string };
  visualizations: VisualizationSpec[];
};

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const stem = (file: string) => fold((file.split('/').pop() || '').replace(/\.[^.]+$/, '')).replace(/^\d+[-_. ]*/, '');

export const sectionCatalog: { kind: string; label: string; tab: ReadingTabId; names: string[] }[] = [
  { kind: 'intro', label: 'Introducción', tab: 'explanation', names: ['introduccion', 'intro', 'introduction', 'resumen', 'summary', 'overview'] },
  { kind: 'problem', label: 'Problema', tab: 'explanation', names: ['problema', 'problem', 'enunciado', 'statement'] },
  { kind: 'intuition', label: 'Intuición', tab: 'explanation', names: ['intuicion', 'intuition', 'idea'] },
  { kind: 'explanation', label: 'Explicación', tab: 'explanation', names: ['explicacion', 'explanation', 'teoria', 'theory', 'readme', 'leeme', 'notes', 'notas', 'apuntes'] },
  { kind: 'how', label: 'Funcionamiento', tab: 'explanation', names: ['funcionamiento', 'how-it-works', 'algoritmo', 'algorithm'] },
  { kind: 'invariants', label: 'Invariantes', tab: 'explanation', names: ['invariantes', 'invariants'] },
  { kind: 'correctness', label: 'Correctitud', tab: 'explanation', names: ['correctitud', 'correctness', 'demostracion', 'proof', 'prueba'] },
  { kind: 'implementation', label: 'Implementación', tab: 'explanation', names: ['implementacion', 'implementation'] },
  { kind: 'limitations', label: 'Limitaciones', tab: 'explanation', names: ['limitaciones', 'limitations'] },
  { kind: 'pitfalls', label: 'Errores comunes', tab: 'explanation', names: ['errores', 'errores-comunes', 'pitfalls', 'common-mistakes'] },
  { kind: 'variants', label: 'Variantes', tab: 'explanation', names: ['variantes', 'variants'] },
  { kind: 'exercises', label: 'Ejercicios relacionados', tab: 'explanation', names: ['ejercicios', 'exercises', 'problemas', 'problems', 'practica', 'practice'] },
  { kind: 'examples', label: 'Ejemplos', tab: 'examples', names: ['ejemplos', 'ejemplo', 'examples', 'example', 'casos', 'tests'] },
  { kind: 'complexity', label: 'Complejidad', tab: 'complexity', names: ['complejidad', 'complexity', 'analisis', 'analysis'] }
];
const catalogOrder = new Map(sectionCatalog.map((entry, index) => [entry.kind, index]));
const tabLabels: Record<ReadingTabId, string> = { explanation: 'Explicación', code: 'Código', visualization: 'Visualización', examples: 'Ejemplos', complexity: 'Complejidad' };
const tabOrder: ReadingTabId[] = ['explanation', 'code', 'visualization', 'examples', 'complexity'];

export const isAuxiliaryFile = (file: string) => {
  const extension = extensionOf(file);
  return isMetadataFile(file) || ['.yaml', '.yml', '.json', '.toml', '.ini', '.cfg'].includes(extension) || !!assetExtensions[extension];
};

function sectionOf(file: string, reference: Reference) {
  const relative = file.slice(reference.path ? reference.path.length + 1 : 0);
  const folder = fold(relative.split('/').slice(0, -1)[0] || '');
  if (['examples', 'ejemplos'].includes(folder)) return sectionCatalog.find(entry => entry.kind === 'examples')!;
  const name = stem(file);
  const found = sectionCatalog.find(entry => entry.names.includes(name));
  if (found) return found;
  if (['variantes', 'variants'].includes(folder)) return sectionCatalog.find(entry => entry.kind === 'variants')!;
  return undefined;
}

const asText = (value: unknown) => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;

export function readingComplexity(reference: Reference) {
  const raw = reference.metadata.complexity;
  if (typeof raw === 'string') return { time: raw };
  if (raw && typeof raw === 'object') {
    const value = raw as Record<string, unknown>;
    return { time: asText(value.time ?? value.tiempo), space: asText(value.space ?? value.memoria ?? value.espacio), notes: asText(value.notes ?? value.notas) };
  }
  return {};
}

const visualizationAliases: Record<string, string[]> = {
  'segment-tree': ['segment tree', 'segment-tree', 'segtree', 'arbol de segmentos', 'segmenttree']
};

export function readingVisualizations(reference: Reference): VisualizationSpec[] {
  const declared = reference.metadata.visualizations ?? reference.metadata.visualizaciones;
  const specs: VisualizationSpec[] = [];
  if (Array.isArray(declared)) {
    for (const item of declared) {
      if (typeof item === 'string' && item.trim()) specs.push({ type: item.trim() });
      else if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).type === 'string') {
        const value = item as Record<string, unknown>;
        specs.push({
          type: String(value.type), title: asText(value.title),
          values: Array.isArray(value.values) ? value.values.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry)).slice(0, 32) : undefined,
          operation: asText(value.operation)
        });
      }
    }
    return specs;
  }
  if (declared === false) return [];
  const haystack = fold(`${reference.title} ${reference.path.split('/').pop() || ''} ${(reference.metadata.tags || []).join(' ')}`).replace(/[_]/g, ' ');
  for (const [type, aliases] of Object.entries(visualizationAliases)) if (aliases.some(alias => haystack.includes(alias))) specs.push({ type });
  return specs;
}

export function buildReadingModel(reference: Reference): ReadingModel {
  const sections = new Map<ReadingTabId, ReadingSection[]>();
  const add = (tab: ReadingTabId, section: ReadingSection) => { if (!sections.has(tab)) sections.set(tab, []); sections.get(tab)!.push(section); };
  const visible: string[] = [], hidden: string[] = [];
  const order = new Map<string, number>();
  for (const file of reference.files) {
    const extension = extensionOf(file);
    if (isAuxiliaryFile(file)) { hidden.push(file); continue; }
    visible.push(file);
    if (codeExtensions.has(extension)) {
      const section = sectionOf(file, reference);
      if (section?.tab === 'examples') add('examples', { file, kind: 'examples', label: file.split('/').pop()! });
      else add('code', { file, kind: 'code', label: file.slice(reference.path ? reference.path.length + 1 : 0) });
      continue;
    }
    if (!['.md', '.txt', '.tex'].includes(extension)) { add('examples', { file, kind: 'examples', label: file.split('/').pop()! }); continue; }
    const section = sectionOf(file, reference) || { kind: 'notes', label: isRepositoryDocument(file) ? 'Explicación' : (file.split('/').pop() || '').replace(/\.[^.]+$/, ''), tab: 'explanation' as const };
    order.set(file, catalogOrder.get(section.kind) ?? 3.5);
    add(section.tab, { file, kind: section.kind, label: section.label });
  }
  const complexity = readingComplexity(reference);
  const visualizations = readingVisualizations(reference);
  const tabs: ReadingTab[] = [];
  for (const id of tabOrder) {
    const list = (sections.get(id) || []).sort((a, b) => (order.get(a.file) ?? 0) - (order.get(b.file) ?? 0));
    const present = list.length || (id === 'complexity' && (complexity.time || complexity.space)) || (id === 'visualization' && visualizations.length);
    if (present) tabs.push({ id, label: tabLabels[id], sections: list });
  }
  return { tabs, visible, hidden, complexity, visualizations };
}

export const headingSlug = (text: string) => fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'seccion';
