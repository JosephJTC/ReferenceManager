// Visualización de Segment Tree: traduce los eventos de algorithm.ts en pasos con su explicación.
// Aquí se decide QUÉ se muestra en cada paso; CÓMO se dibuja está en renderer.tsx.
import type { Step, VisualizationDefinition } from '../../core/types.js';
import { escapeXml, integerParam, interval, numbersToText, parseIntegers } from '../../core/utils.js';
import { SegmentTree, neutral, type SegmentEvent, type SegmentOperation } from './algorithm.js';

export const maxSegmentValues = 16;
export const operationLabels: Record<SegmentOperation, string> = { sum: 'Suma', min: 'Mínimo', max: 'Máximo' };

export type SegmentInput = { array: number[]; operation: SegmentOperation };
/** Estado que necesita el dibujo en un paso. */
export type SegmentState = {
  /** Valor de cada nodo (índice = número de nodo); `null` si aún no se calculó. */
  values: (number | null)[];
  array: number[];
  active?: number;
  visited: number[];
  /** Nodos usados en la respuesta o recalculados. */
  partial: number[];
  skipped: number[];
  /** Intervalo del arreglo resaltado. */
  highlight: [number, number] | null;
  /** Acumulado de la consulta. */
  result?: number;
};

const show = (value: number) => Number.isFinite(value) ? String(value) : value > 0 ? '+∞' : '-∞';

/** Aplica cada evento sobre un estado y guarda una copia por paso. */
function recorder(initial: SegmentState, operation: SegmentOperation, showResult: boolean) {
  const state = initial;
  const steps: Step<SegmentState>[] = [];
  const name = operationLabels[operation].toLowerCase();
  const snapshot = (message: string, event: SegmentEvent) => steps.push({
    state: { ...state, values: [...state.values], array: [...state.array], visited: [...state.visited], partial: [...state.partial], skipped: [...state.skipped] },
    message, event,
    result: showResult && state.result !== undefined && Number.isFinite(state.result) ? `Acumulado: ${state.result}` : undefined
  });
  const visit = (node: number) => { state.active = node; if (!state.visited.includes(node)) state.visited.push(node); };
  const handle = (event: SegmentEvent) => {
    switch (event.type) {
      case 'build:start': return snapshot(`Se construye el árbol de ${name} para ${event.size} valores, de abajo hacia arriba.`, event);
      case 'build:split': visit(event.node); state.highlight = [event.lo, event.hi];
        return snapshot(`Nodo ${event.node} ${interval(event.lo, event.hi)}: se divide en ${interval(event.lo, event.mid)} y ${interval(event.mid + 1, event.hi)}.`, event);
      case 'build:leaf': visit(event.node); state.highlight = [event.lo, event.hi]; state.values[event.node] = event.value;
        return snapshot(`Hoja ${interval(event.lo, event.hi)}: copia a[${event.lo}] = ${event.value}.`, event);
      case 'build:combine': visit(event.node); state.highlight = [event.lo, event.hi]; state.values[event.node] = event.value;
        return snapshot(`Nodo ${event.node} ${interval(event.lo, event.hi)} = ${name}(${event.left}, ${event.right}) = ${event.value}.`, event);
      case 'build:end': state.active = undefined; state.visited = []; state.highlight = null;
        return snapshot(`Construcción terminada: la raíz guarda ${event.value} para todo el arreglo. Costo O(n).`, event);
      case 'query:start': state.highlight = [event.left, event.right];
        snapshot(`Consulta de ${name} en ${interval(event.left, event.right)}. Se empieza en la raíz.`, event);
        state.result = neutral(operation);
        return;
      case 'query:skip': visit(event.node); state.skipped.push(event.node);
        return snapshot(`Nodo ${event.node} ${interval(event.lo, event.hi)} no se cruza con ${interval(...state.highlight!)}: se descarta.`, event);
      case 'query:take': visit(event.node); state.partial.push(event.node); state.result = event.accumulated;
        return snapshot(`Nodo ${event.node} ${interval(event.lo, event.hi)} está contenido por completo: se usa su valor ${event.value}. Acumulado: ${show(event.accumulated)}.`, event);
      case 'query:descend': visit(event.node);
        return snapshot(`Nodo ${event.node} ${interval(event.lo, event.hi)} se cruza parcialmente: se visitan sus dos hijos.`, event);
      case 'query:end': state.active = undefined; state.result = event.result;
        return snapshot(`Resultado: ${show(event.result)}. Se visitaron ${state.visited.length} nodos y se usaron ${state.partial.length}; cada nivel aporta como máximo 4 nodos, así que la consulta cuesta O(log n).`, event);
      case 'update:start': state.highlight = [event.index, event.index];
        return snapshot(`Actualización: a[${event.index}] pasa de ${event.previous} a ${event.value}. Se baja hasta la hoja.`, event);
      case 'update:descend': visit(event.node);
        return snapshot(`Nodo ${event.node} ${interval(event.lo, event.hi)}: la posición ${state.highlight![0]} está a la ${event.side === 'left' ? 'izquierda' : 'derecha'}.`, event);
      case 'update:leaf': visit(event.node); state.partial = [event.node]; state.values[event.node] = event.value; state.array[event.lo] = event.value;
        return snapshot(`Hoja ${interval(event.lo, event.hi)} = ${event.value}.`, event);
      case 'update:recompute': visit(event.node); state.partial = [event.node]; state.values[event.node] = event.value;
        return snapshot(`Se recalcula el nodo ${event.node} ${interval(event.lo, event.hi)} = ${event.value}.`, event);
      case 'update:end': state.active = undefined; state.partial = [];
        return snapshot(`Actualización terminada: solo cambiaron ${event.changed} nodos, uno por nivel. Costo O(log n).`, event);
    }
  };
  return { steps, handle };
}

const emptyState = (array: number[], values: (number | null)[]): SegmentState => ({ values, array: [...array], visited: [], partial: [], skipped: [], highlight: null });

export const segmentTree: VisualizationDefinition<SegmentInput, SegmentState> = {
  id: 'segment-tree',
  title: 'Segment Tree',
  description: 'Construcción, consulta de intervalos y actualización puntual paso a paso.',
  aliases: ['segment tree', 'segtree', 'segmenttree', 'arbol de segmentos'],
  inputs: [
    { name: 'values', label: 'Valores iniciales', kind: 'text', default: '5, 8, 6, 3, 2, 7, 2, 6' },
    { name: 'operation', label: 'Operación', ariaLabel: 'Operación del árbol', kind: 'select', default: 'sum', options: Object.entries(operationLabels).map(([value, label]) => ({ value, label })) }
  ],
  operations: [
    { id: 'build', label: 'Construcción', fields: [] },
    { id: 'query', label: 'Consulta de intervalo', fields: [
      { name: 'left', label: 'l', ariaLabel: 'Inicio del intervalo', kind: 'integer', default: 2 },
      { name: 'right', label: 'r', ariaLabel: 'Fin del intervalo', kind: 'integer', default: 5 }
    ] },
    { id: 'update', label: 'Actualización puntual', commitLabel: 'Conservar actualización', fields: [
      { name: 'index', label: 'Posición', ariaLabel: 'Posición a actualizar', kind: 'integer', default: 3 },
      { name: 'value', label: 'Nuevo valor', kind: 'integer', default: 10 }
    ] }
  ],
  legend: [
    { state: 'active', label: 'Nodo actual' }, { state: 'visited', label: 'Visitado' }, { state: 'used', label: 'Usado / recalculado' },
    { state: 'skipped', label: 'Descartado' }, { state: 'range', label: 'Intervalo' }
  ],
  parseInput: values => ({ array: parseIntegers(String(values.values), { max: maxSegmentValues }), operation: values.operation as SegmentOperation }),
  inputFromSpec: options => ({ values: numbersToText(options.values), operation: typeof options.operation === 'string' ? options.operation : undefined }),
  run({ array, operation }, action, params) {
    const n = array.length;
    if (action === 'query') {
      const left = Number(params.left), right = Number(params.right);
      if (!(Number.isInteger(left) && Number.isInteger(right) && 0 <= left && left <= right && right < n)) throw new Error(`El intervalo debe cumplir 0 ≤ l ≤ r < ${n}.`);
      const tree = new SegmentTree(array, operation);
      const { steps, handle } = recorder(emptyState(array, [...tree.tree]), operation, true);
      tree.trace = handle; tree.query(left, right);
      return steps;
    }
    if (action === 'update') {
      const index = integerParam(params, 'index', 'La posición', 0, n - 1), value = integerParam(params, 'value', 'El nuevo valor', -1e9, 1e9);
      const tree = new SegmentTree(array, operation);
      const { steps, handle } = recorder(emptyState(array, [...tree.tree]), operation, false);
      tree.trace = handle; tree.update(index, value);
      return steps;
    }
    const { steps, handle } = recorder(emptyState(array, new Array(4 * Math.max(1, n)).fill(null)), operation, false);
    new SegmentTree(array, operation, handle);
    return steps;
  },
  commit({ array, operation }, action, params) {
    const next = [...array];
    if (action === 'update') next[Number(params.index)] = Number(params.value);
    return { values: next.join(', '), operation };
  },
  staticSvg: ({ array, operation }) => ({ svg: segmentTreeSvg(array, operation), caption: `arreglo [${array.join(', ')}]` })
};

// Geometría compartida por el dibujo interactivo y el SVG de impresión.
export type SegmentNode = { id: number; lo: number; hi: number; depth: number; x: number; y: number };
export function segmentLayout(length: number) {
  const cell = 64, levelHeight = 74;
  const nodes: SegmentNode[] = [];
  const walk = (id: number, lo: number, hi: number, depth: number) => {
    nodes.push({ id, lo, hi, depth, x: ((lo + hi + 1) / 2) * cell, y: depth * levelHeight + 30 });
    if (lo === hi) return;
    const mid = (lo + hi) >> 1;
    walk(id * 2, lo, mid, depth + 1); walk(id * 2 + 1, mid + 1, hi, depth + 1);
  };
  if (length > 0) walk(1, 0, length - 1, 0);
  const depth = Math.max(0, ...nodes.map(node => node.depth));
  return { width: Math.max(1, length) * cell, height: (depth + 1) * levelHeight + 20, nodes, byId: new Map(nodes.map(node => [node.id, node])) };
}

export function segmentTreeSvg(array: number[], operation: SegmentOperation): string {
  const layout = segmentLayout(array.length);
  const values = new SegmentTree(array, operation).tree;
  const lines: string[] = [], nodes: string[] = [];
  for (const node of layout.nodes) {
    for (const child of [node.id * 2, node.id * 2 + 1]) {
      const target = layout.byId.get(child);
      if (target) lines.push(`<line x1="${node.x}" y1="${node.y}" x2="${target.x}" y2="${target.y}" stroke="#94a3b8" stroke-width="1.2"/>`);
    }
    const value = values[node.id];
    nodes.push(`<g><rect x="${node.x - 27}" y="${node.y - 18}" width="54" height="36" rx="6" fill="#ffffff" stroke="#334155"/><text x="${node.x}" y="${node.y - 3}" text-anchor="middle" font-size="12" font-weight="700">${value === null || value === undefined ? '·' : escapeXml(String(value))}</text><text x="${node.x}" y="${node.y + 11}" text-anchor="middle" font-size="9" fill="#475569">${escapeXml(interval(node.lo, node.hi))}</text></g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" font-family="sans-serif" role="img" aria-label="Segment Tree de ${escapeXml(operationLabels[operation].toLowerCase())}">${lines.join('')}${nodes.join('')}</svg>`;
}
