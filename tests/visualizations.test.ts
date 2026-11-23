import test from 'node:test';
import assert from 'node:assert/strict';
import { visualizations } from '../src/visualizations/index.js';
import { renderers } from '../src/visualizations/renderers.js';
import { createRegistry } from '../src/visualizations/core/registry.js';
import { execute, initialPlayer, inputFromSpec, playerReducer, stepDuration, validateSteps } from '../src/visualizations/core/engine.js';
import { layoutForest, parseIntegers } from '../src/visualizations/core/utils.js';
import type { VisualizationDefinition } from '../src/visualizations/core/types.js';
import { SegmentTree, type SegmentEvent } from '../src/visualizations/data_structures/segment_tree/algorithm.js';
import { segmentTree, segmentTreeSvg } from '../src/visualizations/data_structures/segment_tree/visualization.js';
import { FenwickTree } from '../src/visualizations/data_structures/fenwick_tree/algorithm.js';
import { fenwickTree } from '../src/visualizations/data_structures/fenwick_tree/visualization.js';
import { DSU } from '../src/visualizations/data_structures/dsu/algorithm.js';
import { dsu } from '../src/visualizations/data_structures/dsu/visualization.js';

const values = '5, 8, 6, 3, 2, 7, 2, 6';
const last = (definition: VisualizationDefinition, input: Record<string, string | number>, operation: string, params = {}) => execute(definition, input, operation, params).steps.at(-1)! as { state: any; result?: string };

// Una visualización mínima definida fuera del proyecto: prueba que el núcleo no conoce a ninguna en particular.
const counter: VisualizationDefinition<{ limit: number }, { count: number }> = {
  id: 'counter', title: 'Contador', description: 'Cuenta hasta n.', aliases: ['contador simple'],
  inputs: [{ name: 'limit', label: 'n', kind: 'integer', default: 3 }],
  operations: [{ id: 'count', label: 'Contar', fields: [] }],
  parseInput(input) { if (!(Number(input.limit) >= 0)) throw new Error('n debe ser positivo.'); return { limit: Number(input.limit) }; },
  run: ({ limit }) => Array.from({ length: limit }, (_, index) => ({ state: { count: index + 1 }, message: `Van ${index + 1}.` }))
};

test('registro: registrar, buscar por identificador o alias, listar y quitar', () => {
  const registry = createRegistry();
  registry.register(counter);
  assert.equal(registry.get('COUNTER'), counter);
  assert.deepEqual(registry.match('Mi Contador Simple').map(item => item.id), ['counter']);
  assert.deepEqual(registry.match('encounter'), []);
  assert.throws(() => registry.register(counter), /ya está registrada/);
  assert.throws(() => registry.register({ ...counter, id: 'Con espacios' }), /no válido/);
  assert.throws(() => registry.register({ ...counter, id: 'vacia', operations: [] }), /al menos una operación/);
  assert.equal(registry.unregister('counter'), true);
  assert.equal(registry.has('counter'), false);
  assert.deepEqual(registry.list(), []);
});

test('una visualización nueva funciona sin tocar el núcleo', () => {
  assert.deepEqual(execute(counter, { limit: 2 }).steps.map(step => step.state), [{ count: 1 }, { count: 2 }]);
  assert.throws(() => execute(counter, { limit: 0 }), /no produjo ningún paso/);
  assert.throws(() => execute(counter, { limit: -1 }), /positivo/);
  assert.throws(() => execute(counter, { limit: '' }), /positivo/);
});

test('las visualizaciones registradas tienen dibujo y se ejecutan con sus valores por defecto', () => {
  assert.deepEqual(visualizations.list().map(item => item.id), ['segment-tree', 'fenwick-tree', 'dsu']);
  for (const definition of visualizations.list()) {
    assert.equal(typeof renderers[definition.id], 'function', definition.id);
    for (const operation of definition.operations) {
      const { steps } = execute(definition, {}, operation.id);
      assert.ok(steps.length > 1, `${definition.id}/${operation.id}`);
      // Los pasos son instantáneas independientes: retroceder muestra el estado anterior.
      assert.notDeepEqual(steps[0].state, steps.at(-1)!.state);
      assert.ok(steps.every(step => step.event?.type));
    }
  }
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
  assert.equal(playerReducer(state, { type: 'prev' }).index, 0);
  assert.equal(playerReducer(state, { type: 'load', total: 5 }).total, 5);
});

test('datos inválidos o ausentes producen errores claros', () => {
  assert.throws(() => validateSteps([]), /ningún paso/);
  assert.throws(() => validateSteps([{ message: 'sin estado' }]), /no válido/);
  assert.throws(() => execute(segmentTree, { values: '1, x' }), /enteros/);
  assert.throws(() => execute(segmentTree, { values: '' }));
  assert.throws(() => execute(segmentTree, { values: Array(17).fill(1).join(',') }), /máximo/);
  assert.throws(() => execute(segmentTree, { values }, 'query', { left: 5, right: 2 }));
  assert.throws(() => execute(segmentTree, { values }, 'query', { left: '', right: 2 }), /entero/);
  assert.throws(() => execute(segmentTree, { values }, 'update', { index: 8, value: 1 }));
  assert.throws(() => execute(fenwickTree, { values }, 'prefix', { right: 8 }));
  assert.throws(() => execute(dsu, { size: 4, unions: '0-9' }), /0 a 3/);
  assert.throws(() => execute(dsu, { size: 4, unions: 'a' }), /pares/);
  assert.deepEqual(parseIntegers('1, 2 3;4'), [1, 2, 3, 4]);
  const bad = inputFromSpec(segmentTree, { type: 'segment-tree', options: { values: ['x'] } });
  assert.match(bad.warning!, /no son válidos/);
  assert.equal(bad.values.values, values);
  assert.deepEqual(inputFromSpec(segmentTree, { type: 'segment-tree', options: { values: [1, 2], operation: 'min' } }), { values: { values: '1, 2', operation: 'min' } });
});

test('Segment Tree: el algoritmo funciona sin visualización y emite eventos', () => {
  const tree = new SegmentTree([5, 8, 6, 3, 2, 7, 2, 6], 'sum');
  assert.equal(tree.query(2, 5), 18);
  tree.update(3, 10);
  assert.equal(tree.query(2, 5), 25);
  assert.equal(new SegmentTree([5, 8, 6, 3], 'min').query(0, 3), 3);
  const events: SegmentEvent[] = [];
  new SegmentTree([1, 2, 3], 'max', event => events.push(event));
  assert.equal(events[0].type, 'build:start');
  assert.deepEqual(events.at(-1), { type: 'build:end', value: 3 });
});

test('Segment Tree: construcción, consulta y actualización producen pasos correctos', () => {
  assert.equal(last(segmentTree, { values }, 'build').state.values[1], 39);
  const query = last(segmentTree, { values }, 'query', { left: 2, right: 5 });
  assert.equal(query.state.result, 18);
  assert.ok(query.state.visited.length <= 16);
  assert.equal(last(segmentTree, { values, operation: 'min' }, 'query', { left: 0, right: 7 }).state.result, 2);
  assert.equal(last(segmentTree, { values, operation: 'max' }, 'query', { left: 1, right: 3 }).state.result, 8);
  const update = last(segmentTree, { values }, 'update', { index: 3, value: 10 });
  assert.equal(update.state.values[1], 46);
  assert.equal(update.state.array[3], 10);
  const input = segmentTree.parseInput({ values, operation: 'sum' });
  assert.deepEqual(segmentTree.commit!(input, 'update', { index: 3, value: 10 }), { values: '5, 8, 6, 10, 2, 7, 2, 6', operation: 'sum' });
  assert.match(segmentTreeSvg([1, 2, 3], 'sum'), /^<svg[^>]*>.*>6<\/text>/);
  assert.match(segmentTree.staticSvg!(input).svg, /^<svg/);
});

test('Fenwick Tree: algoritmo y pasos', () => {
  const tree = new FenwickTree([5, 8, 6, 3, 2, 7, 2, 6]);
  assert.equal(tree.prefix(7), 39);
  assert.equal(tree.range(2, 5), 18);
  tree.add(3, 7);
  assert.equal(tree.range(2, 5), 25);
  assert.match(last(fenwickTree, { values }, 'prefix', { right: 4 }).result!, /24/);
  assert.match(last(fenwickTree, { values }, 'range', { left: 2, right: 5 }).result!, /18/);
  assert.match(last(fenwickTree, { values }, 'range', { left: 0, right: 5 }).result!, /31/);
  const add = last(fenwickTree, { values }, 'add', { index: 3, delta: 7 });
  assert.equal(add.state.array[3], 10);
  assert.equal(add.state.tree[8], 46);
  assert.equal(last(fenwickTree, { values }, 'build').state.tree[8], 39);
});

test('DSU: algoritmo, pasos y distribución del bosque', () => {
  const sets = new DSU(4);
  assert.equal(sets.union(0, 1), true);
  assert.equal(sets.union(1, 0), false);
  assert.equal(sets.find(1), sets.find(0));
  assert.notEqual(sets.find(2), sets.find(0));
  const input = { size: 8, unions: '0-1, 2-3, 1-3, 4-5, 6-7, 5-7' };
  const find = execute(dsu, input, 'find', { node: 7 }).steps;
  assert.equal((find.at(-1)!.state as { parent: number[] }).parent[7], 4);
  assert.ok(find.some(step => step.event!.type === 'find:compress'));
  const union = last(dsu, input, 'union', { a: 3, b: 7 });
  assert.equal(new Set(union.state.parent.map((_: number, node: number) => { let root = node; while (union.state.parent[root] !== root) root = union.state.parent[root]; return root; })).size, 1);
  assert.match(String(dsu.commit!(dsu.parseInput(input), 'union', { a: 3, b: 7 }).unions), /5-7, 3-7$/);
  const layout = layoutForest([0, 0, 1, 3]);
  assert.equal(layout.positions.length, 4);
  assert.ok(layout.positions[2].y > layout.positions[1].y && layout.positions[1].y > layout.positions[0].y);
  assert.equal(layout.positions[3].y, layout.positions[0].y);
});
