import test from 'node:test';
import assert from 'node:assert/strict';
import type { Reference } from '../src/shared/types.js';
import { buildReadingModel, readingVisualizations } from '../src/shared/reading.js';

const reference = (path: string, files: string[], metadata: Reference['metadata'] = {}): Reference => ({ path, title: metadata.title || path, files, code: files.filter(file => /\.(cpp|py)$/.test(file)), metadata, warnings: [], searchText: '', modified: 0, hasMetadata: !!Object.keys(metadata).length });

test('una referencia con solo código muestra únicamente la pestaña Código', () => {
  const model = buildReadingModel(reference('a', ['a/code.cpp']));
  assert.deepEqual(model.tabs.map(tab => tab.id), ['code']);
  assert.deepEqual(model.hidden, []);
});

test('clasifica secciones por nombre, oculta auxiliares y ordena la explicación', () => {
  const files = ['st/metadata.yaml', 'st/code.cpp', 'st/docs/correctitud.md', 'st/docs/01-introduccion.md', 'st/notes.md', 'st/ejemplos.md', 'st/complejidad.md', 'st/assets/arbol.png', 'st/examples/in1.txt', 'st/config.json'];
  const model = buildReadingModel(reference('st', files, { complexity: { time: 'O(log n)', space: 'O(n)' } }));
  assert.deepEqual(model.tabs.map(tab => tab.id), ['explanation', 'code', 'examples', 'complexity']);
  assert.deepEqual(model.tabs[0].sections.map(section => section.kind), ['intro', 'explanation', 'correctness']);
  assert.deepEqual(model.tabs.find(tab => tab.id === 'examples')!.sections.map(section => section.file), ['st/ejemplos.md', 'st/examples/in1.txt']);
  assert.deepEqual(model.hidden.sort(), ['st/assets/arbol.png', 'st/config.json', 'st/metadata.yaml']);
  assert.deepEqual(model.complexity, { time: 'O(log n)', space: 'O(n)', notes: undefined });
});

test('las visualizaciones vienen de los archivos .viz.js de la referencia', () => {
  const files = ['st/st.cpp', 'st/segment-tree.viz.js', 'st/segment-tree.viz.css', 'st/otra.viz.js'];
  assert.deepEqual(readingVisualizations(reference('st', files)), [
    { file: 'st/segment-tree.viz.js', css: 'st/segment-tree.viz.css', options: {} },
    { file: 'st/otra.viz.js', css: undefined, options: {} }
  ]);
  // metadata.yaml elige orden, título y datos; `type` equivale a `<type>.viz.js`.
  assert.deepEqual(readingVisualizations(reference('st', files, { visualizations: [{ type: 'otra', title: 'Otra', values: [1, 2] }, 'segment-tree'] })), [
    { file: 'st/otra.viz.js', css: undefined, title: 'Otra', options: { values: [1, 2] } },
    { file: 'st/segment-tree.viz.js', css: 'st/segment-tree.viz.css', options: {} }
  ]);
  assert.deepEqual(readingVisualizations(reference('st', files, { visualizations: [{ file: './segment-tree.viz.js', operation: 'min' }] }))[0], { file: 'st/segment-tree.viz.js', css: 'st/segment-tree.viz.css', title: undefined, options: { operation: 'min' } });
  assert.deepEqual(readingVisualizations(reference('st', files, { visualizations: false })), []);
  // Sin archivo .viz.js no hay visualización, aunque el nombre coincida con un algoritmo conocido.
  assert.deepEqual(readingVisualizations(reference('x/segment-tree', ['x/segment-tree/a.cpp'])), []);
  const model = buildReadingModel(reference('st', files));
  assert.deepEqual(model.tabs.map(tab => tab.id), ['code', 'visualization']);
  assert.deepEqual(model.tabs[0].sections.map(section => section.file), ['st/st.cpp']);
  assert.ok(model.hidden.includes('st/segment-tree.viz.css'));
});


test('el campo docs define el orden explícito de la explicación', () => {
  const model = buildReadingModel(reference('r', ['r/docs/intuicion.md', 'r/docs/introduccion.md', 'r/a.cpp'], { docs: ['docs/intuicion.md', './docs/introduccion.md'] }));
  assert.deepEqual(model.tabs[0].sections.map(section => section.file), ['r/docs/intuicion.md', 'r/docs/introduccion.md']);
});
