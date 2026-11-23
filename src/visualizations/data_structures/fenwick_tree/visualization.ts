// Visualización de Fenwick Tree: eventos de algorithm.ts → pasos. Es el ejemplo de la guía
// docs/VISUALIZATION_GUIDE.md; sirve de plantilla para una visualización nueva.
import type { Step, VisualizationDefinition } from '../../core/types.js';
import { integerParam, interval, numbersToText, parseIntegers } from '../../core/utils.js';
import { FenwickTree, lowbit, type FenwickEvent } from './algorithm.js';

export type FenwickInput = { array: number[] };
export type FenwickState = {
  array: number[];
  /** tree[i] para i en 1..n (tree[0] no se usa); `null` si aún no se calculó. */
  tree: (number | null)[];
  active?: number;
  /** Nodos ya sumados o modificados en la operación. */
  used: number[];
  /** Posiciones del arreglo (0..n-1) resaltadas. */
  highlight: [number, number] | null;
};

/** Posiciones del arreglo (0-based) que cubre el nodo i. */
export const coverage = (node: number): [number, number] => [node - lowbit(node), node - 1];
const binary = (value: number) => value.toString(2);

function record(array: number[], tree: (number | null)[], play: (handle: (event: FenwickEvent) => void) => void) {
  const state: FenwickState = { array: [...array], tree, used: [], highlight: null };
  const steps: Step<FenwickState>[] = [];
  let total = 0, pending: number | undefined;
  const snapshot = (message: string, event: FenwickEvent, result?: string) =>
    steps.push({ state: { ...state, array: [...state.array], tree: [...state.tree], used: [...state.used] }, message, event, result });
  play(event => {
    switch (event.type) {
      case 'build:start': return snapshot(`Construcción en O(n): cada nodo i recibe a[i-1] y empuja su suma al nodo i + lowbit(i).`, event);
      case 'build:set': state.active = event.node; state.tree[event.node] = event.value; state.highlight = coverage(event.node);
        return snapshot(`Nodo ${event.node} (${binary(event.node)}₂) cubre ${interval(...coverage(event.node))} y vale ${event.value}.`, event);
      case 'build:push': state.active = event.parent; state.used = [event.node]; state.tree[event.parent] = event.value; state.highlight = coverage(event.parent);
        return snapshot(`Se suma al nodo ${event.parent} = ${event.node} + lowbit(${event.node}); por ahora acumula ${event.value}.`, event);
      case 'build:end': state.active = undefined; state.used = []; state.highlight = null;
        return snapshot('Construcción terminada.', event);
      case 'prefix:start': state.used = []; state.active = undefined; state.highlight = [0, event.right];
        return snapshot(`Suma del prefijo ${interval(0, event.right)}: se empieza en el nodo ${event.right + 1} y se resta lowbit en cada salto.`, event);
      case 'prefix:take': state.active = event.node; state.used.push(event.node);
        return snapshot(`Nodo ${event.node} (${binary(event.node)}₂) cubre ${interval(...coverage(event.node))}: aporta ${event.value}. Siguiente: ${event.node} − ${lowbit(event.node)} = ${event.node - lowbit(event.node)}.`, event, `Acumulado: ${event.accumulated}`);
      case 'prefix:end': {
        state.active = undefined;
        // Una consulta de intervalo son dos prefijos: el segundo se resta del primero.
        if (pending === undefined) { total = event.result; pending = event.result; return snapshot(`Prefijo ${interval(0, event.right)} = ${event.result}. Se visitaron ${state.used.length} nodos: O(log n).`, event, `Resultado: ${event.result}`); }
        total = pending - event.result;
        return snapshot(`Prefijo ${interval(0, event.right)} = ${event.result}. Intervalo = ${pending} − ${event.result} = ${total}.`, event, `Resultado: ${total}`);
      }
      case 'add:start': state.highlight = [event.index, event.index]; state.array[event.index] += event.delta;
        return snapshot(`Se suma ${event.delta} a a[${event.index}]: se empieza en el nodo ${event.index + 1} y se suma lowbit en cada salto.`, event);
      case 'add:node': state.active = event.node; state.used.push(event.node); state.tree[event.node] = event.value;
        return snapshot(`Nodo ${event.node} (${binary(event.node)}₂) cubre ${interval(...coverage(event.node))}: ahora vale ${event.value}. Siguiente: ${event.node} + ${lowbit(event.node)} = ${event.node + lowbit(event.node)}.`, event);
      case 'add:end': state.active = undefined;
        return snapshot(`Actualización terminada: cambiaron ${event.touched} nodos. Costo O(log n).`, event);
    }
  });
  return steps;
}

export const fenwickTree: VisualizationDefinition<FenwickInput, FenwickState> = {
  id: 'fenwick-tree',
  title: 'Fenwick Tree (BIT)',
  description: 'Sumas de prefijo y actualizaciones puntuales saltando con lowbit(i) = i & −i.',
  aliases: ['fenwick', 'binary indexed tree', 'arbol binario indexado'],
  inputs: [{ name: 'values', label: 'Valores iniciales', kind: 'text', default: '3, 2, -1, 6, 5, 4, -3, 3' }],
  operations: [
    { id: 'build', label: 'Construcción', fields: [] },
    { id: 'prefix', label: 'Suma de prefijo', fields: [{ name: 'right', label: 'r', ariaLabel: 'Fin del prefijo', kind: 'integer', default: 6 }] },
    { id: 'range', label: 'Suma de intervalo', fields: [
      { name: 'left', label: 'l', ariaLabel: 'Inicio del intervalo', kind: 'integer', default: 2 },
      { name: 'right', label: 'r', ariaLabel: 'Fin del intervalo', kind: 'integer', default: 6 }
    ] },
    { id: 'add', label: 'Actualización puntual', commitLabel: 'Conservar actualización', fields: [
      { name: 'index', label: 'Posición', ariaLabel: 'Posición a actualizar', kind: 'integer', default: 2 },
      { name: 'delta', label: 'Sumar', ariaLabel: 'Cantidad a sumar', kind: 'integer', default: 4 }
    ] }
  ],
  legend: [{ state: 'active', label: 'Nodo actual' }, { state: 'used', label: 'Sumado / modificado' }, { state: 'range', label: 'Posiciones afectadas' }],
  parseInput: values => ({ array: parseIntegers(String(values.values), { max: 16 }) }),
  inputFromSpec: options => ({ values: numbersToText(options.values) }),
  run({ array }, operation, params) {
    const n = array.length;
    if (operation === 'build') return record(array, new Array(n + 1).fill(null), handle => { new FenwickTree(array, handle); });
    const tree = new FenwickTree(array);
    return record(array, [...tree.tree], handle => {
      tree.trace = handle;
      if (operation === 'prefix') tree.prefix(integerParam(params, 'right', 'r', 0, n - 1));
      else if (operation === 'range') {
        const right = integerParam(params, 'right', 'r', 0, n - 1), left = integerParam(params, 'left', 'l', 0, right);
        tree.range(left, right);
      } else tree.add(integerParam(params, 'index', 'La posición', 0, n - 1), integerParam(params, 'delta', 'La cantidad', -1e9, 1e9));
    });
  },
  commit({ array }, operation, params) {
    const next = [...array];
    if (operation === 'add') next[Number(params.index)] += Number(params.delta);
    return { values: next.join(', ') };
  }
};
