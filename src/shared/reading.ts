import type { Reference } from './types.js';
import type { VisualizationSpec } from '../visualizations/core/types.js';
import { codeExtensions, extensionOf, isMetadataFile, isRepositoryDocument, assetExtensions, isVisualizationAsset, isVisualizationFile } from './formats.js';

export type ReadingTabId = 'explanation' | 'code' | 'visualization' | 'examples' | 'complexity';
export type ReadingSection = { file: string; kind: string; label: string };
export type ReadingTab = { id: ReadingTabId; label: string; sections: ReadingSection[] };
export type { VisualizationSpec } from '../visualizations/core/types.js';
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

/**
 * Visualizaciones de una referencia: sus archivos `*.viz.js`. Las entradas de `visualizations` en `metadata.yaml`
 * eligen el orden, el título y los datos iniciales (`file` o `type` → `<type>.viz.js`); `visualizations: false` las oculta.
 */
export function readingVisualizations(reference: Reference): VisualizationSpec[] {
  const declared = reference.metadata.visualizations ?? reference.metadata.visualizaciones;
  if (declared === false) return [];
  const prefix = reference.path ? reference.path + '/' : '';
  const files = reference.files.filter(isVisualizationFile);
  const css = (file: string) => { const sheet = file.replace(/\.viz\.m?js$/i, '.viz.css'); return reference.files.includes(sheet) ? sheet : undefined; };
  const resolve = (name: string) => {
    const relative = name.trim().replace(/^\.\//, '');
    const candidates = isVisualizationFile(relative) ? [relative] : [`${relative}.viz.js`, `${relative}.viz.mjs`];
    const exact = candidates.map(item => prefix + item).find(item => files.includes(item));
    if (exact) return exact;
    const base = candidates[0].split('/').pop()!.toLowerCase();
    return files.find(item => item.split('/').pop()!.toLowerCase() === base) || prefix + candidates[0];
  };
  const specs: VisualizationSpec[] = [];
  for (const item of Array.isArray(declared) ? declared : []) {
    let spec: VisualizationSpec | undefined;
    if (typeof item === 'string' && item.trim()) spec = { file: resolve(item), options: {} };
    else if (item && typeof item === 'object') {
      const { file, type, title, ...options } = item as Record<string, unknown>;
      const name = typeof file === 'string' ? file : typeof type === 'string' ? type : undefined;
      if (name?.trim()) spec = { file: resolve(name), title: asText(title), options };
    }
    if (spec && !specs.some(other => other.file === spec!.file)) specs.push({ ...spec, css: css(spec.file) });
  }
  for (const file of files) if (!specs.some(spec => spec.file === file)) specs.push({ file, css: css(file), options: {} });
  return specs;
}

export function buildReadingModel(reference: Reference): ReadingModel {
  const sections = new Map<ReadingTabId, ReadingSection[]>();
  const add = (tab: ReadingTabId, section: ReadingSection) => { if (!sections.has(tab)) sections.set(tab, []); sections.get(tab)!.push(section); };
  const visible: string[] = [], hidden: string[] = [];
  const order = new Map<string, number>();
  const declaredDocs = (Array.isArray(reference.metadata.docs) ? reference.metadata.docs : []).filter((item): item is string => typeof item === 'string').map(item => (reference.path ? reference.path + '/' : '') + item.replace(/^\.\//, ''));
  for (const file of reference.files) {
    const extension = extensionOf(file);
    if (isAuxiliaryFile(file) || isVisualizationAsset(file)) { hidden.push(file); continue; }
    visible.push(file);
    if (codeExtensions.has(extension)) {
      const section = sectionOf(file, reference);
      if (section?.tab === 'examples') add('examples', { file, kind: 'examples', label: file.split('/').pop()! });
      else add('code', { file, kind: 'code', label: file.slice(reference.path ? reference.path.length + 1 : 0) });
      continue;
    }
    if (!['.md', '.txt', '.tex'].includes(extension)) { add('examples', { file, kind: 'examples', label: file.split('/').pop()! }); continue; }
    const section = sectionOf(file, reference) || { kind: 'notes', label: isRepositoryDocument(file) ? 'Explicación' : (file.split('/').pop() || '').replace(/\.[^.]+$/, ''), tab: 'explanation' as const };
    order.set(file, declaredDocs.includes(file) ? declaredDocs.indexOf(file) - 1000 : catalogOrder.get(section.kind) ?? 3.5);
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
