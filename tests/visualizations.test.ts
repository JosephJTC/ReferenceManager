import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { definitionMeta, execute, initialPlayer, inputFromSpec, loadDefinition, playerReducer, stepDuration, validateDefinition, validateSteps } from '../src/visualizations/core/engine.js';
import { arrayCells, h, layoutForest, parseIntegers, toolkit } from '../src/visualizations/core/utils.js';
const { raw } = toolkit;
import type { VisualizationDefinition } from '../src/visualizations/core/types.js';

const examples = path.resolve('examples/coleccion/algoritmos');
const load = async (file: string) => loadDefinition(await import(pathToFileURL(path.join(examples, file)).href));
const last = (definition: VisualizationDefinition, input: Record<string, string | number>, operation: string, params = {}) => execute(definition, input, operation, params).steps.at(-1)! as { state: any; result?: string };
const values = '5, 8, 6, 3, 2, 7, 2, 6';

// Una visualización mínima escrita como lo haría una referencia: prueba que el motor no conoce ningún algoritmo.
const counter = { default: () => ({
  title: 'Contador', inputs: [{ name: 'limit', label: 'n', kind: 'integer', default: 3 }],
  operations: [{ id: 'count', label: 'Contar', fields: [] }],
  parseInput(input: { limit: number }) { if (!(Number(input.limit) >= 0)) throw new Error('n debe ser positivo.'); return { limit: Number(input.limit) }; },
  run: ({ limit }: { limit: number }) => Array.from({ length: limit }, (_, index) => ({ state: { count: index + 1 }, message: `Van ${index + 1}.` })),
  render: ({ state }: { state: { count: number } }) => `<svg viewBox="0 0 10 10"><text>${state.count}</text></svg>`
}) };

test('el motor carga una definición de una referencia y valida su forma', () => {
  const definition = loadDefinition(counter);
  assert.deepEqual(definitionMeta(definition), { title: 'Contador', description: undefined, inputs: definition.inputs, operations: definition.operations, legend: undefined, commit: false });
  assert.deepEqual(execute(definition, { limit: 2 }).steps.map(step => step.state), [{ count: 1 }, { count: 2 }]);
  assert.throws(() => execute(definition, { limit: 0 }), /no produjo ningún paso/);
  assert.throws(() => execute(definition, { limit: -1 }), /positivo/);
  assert.throws(() => loadDefinition({ default: { title: 'x' } }), /exportar por defecto una función/);
  assert.throws(() => loadDefinition({}), /exportar por defecto/);
  const base = counter.default();
  assert.throws(() => validateDefinition({ ...base, render: undefined }), /«render»/);
  assert.throws(() => validateDefinition({ ...base, title: '' }), /«title»/);
  assert.throws(() => validateDefinition({ ...base, operations: [] }), /al menos una operación/);
  assert.throws(() => validateDefinition({ ...base, operations: [...base.operations, ...base.operations] }), /repetida/);
  assert.throws(() => validateDefinition({ ...base, inputs: [{ name: 'x', label: 'x', kind: 'select', default: 'a' }] }), /options/);
});

test('reproductor: siguiente, anterior, saltar, reproducir, pausar y reiniciar', () => {
  let state = initialPlayer(3);
  state = playerReducer(state, { type: 'next' });
  assert.equal(state.index, 1);
  state = playerReducer(playerReducer(state, { type: 'next' }), { type: 'next' });
  assert.equal(state.index, 2);
  state = playerReducer(state, { type: 'prev' });
  assert.equal(state.index, 1);
  state = playerReducer(state, { type: 'seek', index: 99 });
  assert.equal(state.index, 2);
  state = playerReducer(state, { type: 'toggle' });
  assert.deepEqual([state.index, state.playing], [0, true]);
  state = playerReducer(playerReducer(state, { type: 'tick' }), { type: 'tick' });
  assert.deepEqual([state.index, state.playing], [2, false]);
  state = playerReducer(state, { type: 'speed', speed: 2 });
  assert.equal(stepDuration(state.speed), 450);
  state = playerReducer(state, { type: 'reset' });
  assert.deepEqual([state.index, state.playing, state.speed], [0, false, 2]);
  assert.equal(playerReducer(state, { type: 'load', total: 5 }).total, 5);
});

test('utilidades: plantilla segura, celdas y bosque', () => {
  assert.equal(String(h`<text>${'<b>&'}</text>${[h`<g/>`, 1]}${raw('<i/>')}${null}`), '<text>&lt;b&gt;&amp;</text><g/>1<i/>');
  assert.match(String(arrayCells([4, 7], { cell: 40, className: i => i ? 'range' : '' })), /viz-cell range.*>7<\/text>/);
  assert.deepEqual(parseIntegers('1, 2 3;4'), [1, 2, 3, 4]);
  assert.throws(() => parseIntegers('1, x'), /enteros/);
  const layout = layoutForest([0, 0, 1, 3]);
  assert.ok(layout.positions[2].y > layout.positions[1].y && layout.positions[1].y > layout.positions[0].y);
  assert.equal(layout.positions[3].y, layout.positions[0].y);
  assert.throws(() => validateSteps([{ message: 'sin estado' }]), /no válido/);
});

test('las visualizaciones de los ejemplos se ejecutan y dibujan SVG en todas sus operaciones', async () => {
  const files = ['segment-tree/segment-tree.viz.js', 'fenwick-tree/fenwick-tree.viz.js', 'dsu/dsu.viz.js', 'grafos/bfs/bfs.viz.js'];
  for (const file of files) {
    const definition = await load(file);
    for (const operation of definition.operations) {
      const { steps, input } = execute(definition, {}, operation.id);
      assert.ok(steps.length > 1, `${file}/${operation.id}`);
      assert.ok(steps.every(step => step.event?.type), `${file}/${operation.id}`);
      assert.notDeepEqual(steps[0].state, steps.at(-1)!.state);
      for (const [index, step] of steps.entries()) {
        const svg = String(definition.render(step, { index, total: steps.length, input, operation: operation.id, durationMs: 900, theme: 'dark', print: false }));
        assert.match(svg, /^<svg[^>]*viewBox="0 0 [\d.]+ [\d.]+"/, `${file}/${operation.id}/${index}`);
        assert.doesNotMatch(svg, /undefined|NaN/, `${file}/${operation.id}/${index}`);
      }
    }
    // La referencia no contamina el motor: ningún archivo de ejemplo se importa desde src/.
    assert.ok(!(await fs.readFile(path.resolve('src/visualizations/core/engine.ts'), 'utf8')).includes(path.basename(file)));
  }
});

test('Segment Tree de la referencia: construcción, consulta, actualización y datos de metadata.yaml', async () => {
  const segment = await load('segment-tree/segment-tree.viz.js');
  assert.equal(last(segment, { values }, 'build').state.values[1], 39);
  const query = last(segment, { values }, 'query', { left: 2, right: 5 });
  assert.equal(query.state.result, 18);
  assert.ok(query.state.visited.length <= 16);
  assert.equal(last(segment, { values, operation: 'min' }, 'query', { left: 0, right: 7 }).state.result, 2);
  assert.equal(last(segment, { values, operation: 'max' }, 'query', { left: 1, right: 3 }).state.result, 8);
  const update = last(segment, { values }, 'update', { index: 3, value: 10 });
  assert.deepEqual([update.state.values[1], update.state.array[3]], [46, 10]);
  assert.deepEqual(segment.commit!(segment.parseInput({ values, operation: 'sum' }), 'update', { index: 3, value: 10 }), { values: '5, 8, 6, 10, 2, 7, 2, 6', operation: 'sum' });
  assert.throws(() => execute(segment, { values: '1, x' }), /enteros/);
  assert.throws(() => execute(segment, { values: Array(17).fill(1).join(',') }), /máximo/);
  assert.throws(() => execute(segment, { values }, 'query', { left: 5, right: 2 }), /0 ≤ l ≤ r/);
  assert.throws(() => execute(segment, { values }, 'query', { left: '', right: 2 }), /entero/);
  assert.deepEqual(inputFromSpec(segment, { values: [1, 2], operation: 'min' }), { values: { values: '1, 2', operation: 'min' } });
  const bad = inputFromSpec(segment, { values: ['x'] });
  assert.match(bad.warning!, /no son válidos/);
  assert.equal(bad.values.values, values);
});

test('Fenwick Tree y DSU de las referencias', async () => {
  const fenwick = await load('fenwick-tree/fenwick-tree.viz.js');
  assert.match(last(fenwick, { values }, 'prefix', { right: 4 }).result!, /24/);
  assert.match(last(fenwick, { values }, 'range', { left: 2, right: 5 }).result!, /18/);
  assert.match(last(fenwick, { values }, 'range', { left: 0, right: 5 }).result!, /31/);
  const add = last(fenwick, { values }, 'add', { index: 3, delta: 7 });
  assert.deepEqual([add.state.array[3], add.state.tree[8]], [10, 46]);
  assert.throws(() => execute(fenwick, { values }, 'prefix', { right: 8 }), /entre 0 y 7/);
  const dsu = await load('dsu/dsu.viz.js');
  const input = { size: 8, unions: '0-1, 2-3, 1-3, 4-5, 6-7, 5-7' };
  const find = execute(dsu, input, 'find', { node: 7 }).steps;
  assert.equal((find.at(-1)!.state as { parent: number[] }).parent[7], 4);
  assert.ok(find.some(step => step.event!.type === 'find:compress'));
  const union = last(dsu, input, 'union', { a: 3, b: 7 });
  const root = (node: number) => { while (union.state.parent[node] !== node) node = union.state.parent[node]; return node; };
  assert.equal(new Set(union.state.parent.map((_: number, node: number) => root(node))).size, 1);
  assert.match(String(dsu.commit!(dsu.parseInput(input), 'union', { a: 3, b: 7 }).unions), /5-7, 3-7$/);
  assert.throws(() => execute(dsu, { size: 4, unions: '0-9' }), /0 a 3/);
  assert.throws(() => execute(dsu, { size: 4, unions: 'a' }), /pares/);
  assert.deepEqual(inputFromSpec(dsu, { size: 4, unions: [[0, 1], [2, 3]] }).values, { size: 4, unions: '0-1, 2-3' });
});

test('BFS de la referencia: distancias mínimas y cola en orden', async () => {
  const bfs = await load('grafos/bfs/bfs.viz.js');
  const steps = execute(bfs, {}, 'bfs', { source: 0 }).steps as { state: any; result?: string }[];
  assert.deepEqual(steps.at(-1)!.state.distance, [0, 1, 1, 2, 2, 3, 4]);
  assert.match(steps.at(-1)!.result!, /dist = \[0, 1, 1, 2, 2, 3, 4\]/);
  const popped = steps.filter(step => (step as any).event?.type === 'pop').map(step => (step as any).event.node);
  assert.deepEqual(popped, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual((execute(bfs, { nodes: 3, edges: '0-1' }, 'bfs', { source: 2 }).steps.at(-1)!.state as { distance: number[] }).distance, [-1, -1, 0]);
  assert.throws(() => execute(bfs, { nodes: 3, edges: '0-5' }), /0 a 2/);
  assert.deepEqual(inputFromSpec(bfs, { nodes: 3, edges: [[0, 1], [1, 2]] }).values, { nodes: 3, edges: '0-1, 1-2' });
});
