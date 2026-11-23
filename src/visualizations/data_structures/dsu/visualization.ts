// Visualización de DSU: eventos de algorithm.ts → pasos. El estado es un bosque (arreglo de padres),
// muy distinto al del Segment Tree, pero usa el mismo contrato.
import type { Step, VisualizationDefinition } from '../../core/types.js';
import { integerParam } from '../../core/utils.js';
import { DSU, type DsuEvent } from './algorithm.js';

export type DsuInput = { size: number; unions: [number, number][] };
export type DsuState = {
  parent: number[];
  size: number[];
  active?: number;
  /** Nodos recorridos por la búsqueda actual. */
  path: number[];
  /** Raíces encontradas. */
  roots: number[];
  /** Arista recién cambiada: [hijo, padre]. */
  changed: [number, number] | null;
};

export function parseUnions(text: string, size: number): [number, number][] {
  return String(text).split(/[\s,;]+/).filter(Boolean).map(item => {
    const match = /^(\d+)-(\d+)$/.exec(item);
    if (!match) throw new Error('Escribe las uniones como pares «a-b» separados por comas, por ejemplo: 0-1, 2-3.');
    const pair: [number, number] = [Number(match[1]), Number(match[2])];
    if (pair.some(value => value >= size)) throw new Error(`Los elementos van de 0 a ${size - 1}.`);
    return pair;
  });
}

function record(dsu: DSU, play: (dsu: DSU) => void) {
  const state: DsuState = { parent: [...dsu.parent], size: [...dsu.size], path: [], roots: [], changed: null };
  const steps: Step<DsuState>[] = [];
  const snapshot = (message: string, event: DsuEvent, result?: string) =>
    steps.push({ state: { ...state, parent: [...state.parent], size: [...state.size], path: [...state.path], roots: [...state.roots] }, message, event, result });
  dsu.trace = event => {
    state.changed = null;
    switch (event.type) {
      case 'union:start': state.path = []; state.roots = []; state.active = undefined;
        return snapshot(`unir(${event.a}, ${event.b}): primero se busca la raíz de cada elemento.`, event);
      case 'find:start': state.path = [event.node]; state.active = event.node;
        return snapshot(`buscar(${event.node}): se sube por los padres hasta llegar a una raíz.`, event);
      case 'find:step': state.active = event.parent; state.path.push(event.parent);
        return snapshot(`padre[${event.node}] = ${event.parent}: se sube a ${event.parent}.`, event);
      case 'find:root': state.active = event.root; state.roots.push(event.root);
        return snapshot(`${event.root} es su propio padre: es la raíz del conjunto de ${event.node}.`, event, `raíz(${event.node}) = ${event.root}`);
      case 'find:compress': state.parent[event.node] = event.root; state.active = event.node; state.changed = [event.node, event.root];
        return snapshot(`Compresión de caminos: ${event.node} deja de colgar de ${event.from} y cuelga directamente de ${event.root}.`, event);
      case 'union:same': state.active = event.root;
        return snapshot(`Ambos tienen la raíz ${event.root}: ya estaban en el mismo conjunto y no cambia nada.`, event, 'Sin cambios');
      case 'union:link': state.parent[event.child] = event.parent; state.size[event.parent] = event.size; state.active = event.parent; state.changed = [event.child, event.parent];
        return snapshot(`Unión por tamaño: la raíz ${event.child} (conjunto más pequeño) cuelga de ${event.parent}, que ahora tiene ${event.size} elementos.`, event, 'Conjuntos unidos');
    }
  };
  play(dsu);
  return steps;
}

export const dsu: VisualizationDefinition<DsuInput, DsuState> = {
  id: 'dsu',
  title: 'Disjoint Set Union',
  description: 'Búsqueda con compresión de caminos y unión por tamaño sobre un bosque de conjuntos.',
  aliases: ['dsu', 'union find', 'disjoint set union', 'disjoint sets', 'conjuntos disjuntos'],
  inputs: [
    { name: 'size', label: 'Elementos', ariaLabel: 'Número de elementos', kind: 'integer', default: 8 },
    { name: 'unions', label: 'Uniones iniciales', kind: 'text', default: '0-1, 2-3, 1-3, 4-5, 6-7, 5-7' }
  ],
  operations: [
    { id: 'find', label: 'Buscar raíz', fields: [{ name: 'node', label: 'x', ariaLabel: 'Elemento a buscar', kind: 'integer', default: 7 }] },
    { id: 'union', label: 'Unir conjuntos', commitLabel: 'Conservar unión', fields: [
      { name: 'a', label: 'a', ariaLabel: 'Primer elemento', kind: 'integer', default: 3 },
      { name: 'b', label: 'b', ariaLabel: 'Segundo elemento', kind: 'integer', default: 7 }
    ] },
    { id: 'replay', label: 'Repetir uniones iniciales', fields: [] }
  ],
  legend: [{ state: 'active', label: 'Elemento actual' }, { state: 'visited', label: 'Camino recorrido' }, { state: 'used', label: 'Raíz encontrada' }],
  parseInput(values) {
    const size = Number(values.size);
    if (!Number.isInteger(size) || size < 1 || size > 16) throw new Error('El número de elementos debe estar entre 1 y 16.');
    return { size, unions: parseUnions(String(values.unions), size) };
  },
  inputFromSpec: options => ({
    size: typeof options.size === 'number' ? options.size : undefined,
    unions: Array.isArray(options.unions) ? options.unions.map(pair => Array.isArray(pair) ? pair.join('-') : String(pair)).join(', ') : typeof options.unions === 'string' ? options.unions : undefined
  }),
  run({ size, unions }, operation, params) {
    if (operation === 'replay') {
      const steps = record(new DSU(size), dsu => unions.forEach(([a, b]) => dsu.union(a, b)));
      return steps.length ? steps : [{ state: { parent: Array.from({ length: size }, (_, index) => index), size: new Array(size).fill(1), path: [], roots: [], changed: null }, message: 'No hay uniones iniciales: cada elemento es su propio conjunto.' }];
    }
    const base = new DSU(size);
    unions.forEach(([a, b]) => base.union(a, b));
    if (operation === 'union') {
      const a = integerParam(params, 'a', 'a', 0, size - 1), b = integerParam(params, 'b', 'b', 0, size - 1);
      return record(base, dsu => dsu.union(a, b));
    }
    const node = integerParam(params, 'node', 'x', 0, size - 1);
    return record(base, dsu => dsu.find(node));
  },
  commit({ size, unions }, operation, params) {
    const pairs = operation === 'union' ? [...unions, [Number(params.a), Number(params.b)]] : unions;
    return { size, unions: pairs.map(pair => pair.join('-')).join(', ') };
  }
};
