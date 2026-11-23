export type SegmentOperation = 'sum' | 'min' | 'max';
export type SegmentNode = { id: number; lo: number; hi: number; depth: number };
export type SegmentStep = {
  values: (number | null)[];
  array: number[];
  active?: number;
  visited: number[];
  partial: number[];
  skipped: number[];
  highlight: [number, number] | null;
  result?: number;
  message: string;
};
export const operationLabels: Record<SegmentOperation, string> = { sum: 'Suma', min: 'Mínimo', max: 'Máximo' };
const combine = (operation: SegmentOperation, a: number, b: number) => operation === 'sum' ? a + b : operation === 'min' ? Math.min(a, b) : Math.max(a, b);
const neutral = (operation: SegmentOperation) => operation === 'sum' ? 0 : operation === 'min' ? Infinity : -Infinity;
export const maxSegmentValues = 16;

export function segmentNodes(length: number): SegmentNode[] {
  const nodes: SegmentNode[] = [];
  const walk = (id: number, lo: number, hi: number, depth: number) => {
    nodes.push({ id, lo, hi, depth });
    if (lo === hi) return;
    const mid = (lo + hi) >> 1;
    walk(id * 2, lo, mid, depth + 1); walk(id * 2 + 1, mid + 1, hi, depth + 1);
  };
  if (length > 0) walk(1, 0, length - 1, 0);
  return nodes;
}

function computeTree(array: number[], operation: SegmentOperation) {
  const values: (number | null)[] = new Array(4 * Math.max(1, array.length)).fill(null);
  const walk = (id: number, lo: number, hi: number): number => {
    if (lo === hi) return (values[id] = array[lo]);
    const mid = (lo + hi) >> 1;
    return (values[id] = combine(operation, walk(id * 2, lo, mid), walk(id * 2 + 1, mid + 1, hi)));
  };
  if (array.length) walk(1, 0, array.length - 1);
  return values;
}

const interval = (lo: number, hi: number) => lo === hi ? `[${lo}]` : `[${lo}, ${hi}]`;

export function buildSteps(array: number[], operation: SegmentOperation): SegmentStep[] {
  const values: (number | null)[] = new Array(4 * Math.max(1, array.length)).fill(null);
  const steps: SegmentStep[] = [{ values: [...values], array, visited: [], partial: [], skipped: [], highlight: null, message: `Se construye el árbol de ${operationLabels[operation].toLowerCase()} para ${array.length} valores, de abajo hacia arriba.` }];
  const visited: number[] = [];
  const walk = (id: number, lo: number, hi: number): number => {
    visited.push(id);
    if (lo === hi) {
      values[id] = array[lo];
      steps.push({ values: [...values], array, active: id, visited: [...visited], partial: [], skipped: [], highlight: [lo, hi], message: `Hoja ${interval(lo, hi)}: copia a[${lo}] = ${array[lo]}.` });
      return array[lo];
    }
    const mid = (lo + hi) >> 1;
    steps.push({ values: [...values], array, active: id, visited: [...visited], partial: [], skipped: [], highlight: [lo, hi], message: `Nodo ${id} ${interval(lo, hi)}: se divide en ${interval(lo, mid)} y ${interval(mid + 1, hi)}.` });
    const left = walk(id * 2, lo, mid), right = walk(id * 2 + 1, mid + 1, hi);
    values[id] = combine(operation, left, right);
    steps.push({ values: [...values], array, active: id, visited: [...visited], partial: [], skipped: [], highlight: [lo, hi], message: `Nodo ${id} ${interval(lo, hi)} = ${operationLabels[operation].toLowerCase()}(${left}, ${right}) = ${values[id]}.` });
    return values[id]!;
  };
  if (array.length) walk(1, 0, array.length - 1);
  steps.push({ values: [...values], array, visited: [], partial: [], skipped: [], highlight: null, message: `Construcción terminada: la raíz guarda ${values[1]} para todo el arreglo. Costo O(n).` });
  return steps;
}

export function querySteps(array: number[], operation: SegmentOperation, left: number, right: number): SegmentStep[] {
  const values = computeTree(array, operation);
  const visited: number[] = [], partial: number[] = [], skipped: number[] = [];
  let accumulated = neutral(operation);
  const show = (value: number) => Number.isFinite(value) ? String(value) : value > 0 ? '+∞' : '-∞';
  const steps: SegmentStep[] = [{ values, array, visited: [], partial: [], skipped: [], highlight: [left, right], message: `Consulta de ${operationLabels[operation].toLowerCase()} en ${interval(left, right)}. Se empieza en la raíz.` }];
  const walk = (id: number, lo: number, hi: number) => {
    visited.push(id);
    if (hi < left || right < lo) {
      skipped.push(id);
      steps.push({ values, array, active: id, visited: [...visited], partial: [...partial], skipped: [...skipped], highlight: [left, right], result: accumulated, message: `Nodo ${id} ${interval(lo, hi)} no se cruza con ${interval(left, right)}: se descarta.` });
      return;
    }
    if (left <= lo && hi <= right) {
      partial.push(id);
      accumulated = combine(operation, accumulated, values[id]!);
      steps.push({ values, array, active: id, visited: [...visited], partial: [...partial], skipped: [...skipped], highlight: [left, right], result: accumulated, message: `Nodo ${id} ${interval(lo, hi)} está contenido por completo: se usa su valor ${values[id]}. Acumulado: ${show(accumulated)}.` });
      return;
    }
    const mid = (lo + hi) >> 1;
    steps.push({ values, array, active: id, visited: [...visited], partial: [...partial], skipped: [...skipped], highlight: [left, right], result: accumulated, message: `Nodo ${id} ${interval(lo, hi)} se cruza parcialmente: se visitan sus dos hijos.` });
    walk(id * 2, lo, mid); walk(id * 2 + 1, mid + 1, hi);
  };
  if (array.length) walk(1, 0, array.length - 1);
  steps.push({ values, array, visited: [...visited], partial: [...partial], skipped: [...skipped], highlight: [left, right], result: accumulated, message: `Resultado: ${show(accumulated)}. Se visitaron ${visited.length} nodos y se usaron ${partial.length}; cada nivel aporta como máximo 4 nodos, así que la consulta cuesta O(log n).` });
  return steps;
}

export function updateSteps(array: number[], operation: SegmentOperation, index: number, value: number): SegmentStep[] {
  const before = computeTree(array, operation);
  const next = array.map((item, position) => position === index ? value : item);
  const values = [...before];
  const visited: number[] = [];
  const steps: SegmentStep[] = [{ values: [...values], array, visited: [], partial: [], skipped: [], highlight: [index, index], message: `Actualización: a[${index}] pasa de ${array[index]} a ${value}. Se baja hasta la hoja.` }];
  const path: { id: number; lo: number; hi: number }[] = [];
  let id = 1, lo = 0, hi = array.length - 1;
  while (true) {
    path.push({ id, lo, hi }); visited.push(id);
    if (lo === hi) break;
    const mid = (lo + hi) >> 1;
    steps.push({ values: [...values], array, active: id, visited: [...visited], partial: [], skipped: [], highlight: [index, index], message: `Nodo ${id} ${interval(lo, hi)}: la posición ${index} está a la ${index <= mid ? 'izquierda' : 'derecha'}.` });
    if (index <= mid) { id = id * 2; hi = mid; } else { id = id * 2 + 1; lo = mid + 1; }
  }
  for (const node of path.reverse()) {
    values[node.id] = node.lo === node.hi ? value : combine(operation, values[node.id * 2]!, values[node.id * 2 + 1]!);
    steps.push({ values: [...values], array: next, active: node.id, visited: [...visited], partial: [node.id], skipped: [], highlight: [index, index], message: node.lo === node.hi ? `Hoja ${interval(node.lo, node.hi)} = ${value}.` : `Se recalcula el nodo ${node.id} ${interval(node.lo, node.hi)} = ${values[node.id]}.` });
  }
  steps.push({ values: [...values], array: next, visited: [...visited], partial: [], skipped: [], highlight: [index, index], message: `Actualización terminada: solo cambiaron ${path.length} nodos, uno por nivel. Costo O(log n).` });
  return steps;
}

export function parseSegmentValues(text: string): number[] {
  const values = text.split(/[\s,;]+/).filter(Boolean).map(Number);
  if (!values.length || values.some(value => !Number.isInteger(value) || Math.abs(value) > 1e9)) throw new Error('Escribe enteros separados por comas o espacios.');
  if (values.length > maxSegmentValues) throw new Error(`Usa como máximo ${maxSegmentValues} valores.`);
  return values;
}

export type SegmentLayout = { width: number; height: number; positions: Map<number, { x: number; y: number }>; nodes: SegmentNode[] };
export function segmentLayout(length: number): SegmentLayout {
  const nodes = segmentNodes(length);
  const depth = Math.max(0, ...nodes.map(node => node.depth));
  const cell = 64, levelHeight = 74;
  const width = Math.max(1, length) * cell, height = (depth + 1) * levelHeight + 20;
  const positions = new Map<number, { x: number; y: number }>();
  for (const node of nodes) positions.set(node.id, { x: ((node.lo + node.hi + 1) / 2) * cell, y: node.depth * levelHeight + 30 });
  return { width, height, positions, nodes };
}

const escapeXml = (value: string) => value.replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]!);

export function segmentTreeSvg(array: number[], operation: SegmentOperation, step?: SegmentStep): string {
  const layout = segmentLayout(array.length);
  const values = step?.values || computeTree(array, operation);
  const lines: string[] = [], nodes: string[] = [];
  for (const node of layout.nodes) {
    const { x, y } = layout.positions.get(node.id)!;
    for (const child of [node.id * 2, node.id * 2 + 1]) {
      const target = layout.positions.get(child);
      if (target) lines.push(`<line x1="${x}" y1="${y}" x2="${target.x}" y2="${target.y}" stroke="#94a3b8" stroke-width="1.2"/>`);
    }
    const state = step?.active === node.id ? '#f59e0b' : step?.partial.includes(node.id) ? '#22c55e' : step?.skipped.includes(node.id) ? '#cbd5e1' : step?.visited.includes(node.id) ? '#93c5fd' : '#ffffff';
    const value = values[node.id];
    nodes.push(`<g><rect x="${x - 27}" y="${y - 18}" width="54" height="36" rx="6" fill="${state}" stroke="#334155"/><text x="${x}" y="${y - 3}" text-anchor="middle" font-size="12" font-weight="700">${value === null || value === undefined ? '·' : escapeXml(String(value))}</text><text x="${x}" y="${y + 11}" text-anchor="middle" font-size="9" fill="#475569">${escapeXml(interval(node.lo, node.hi))}</text></g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" font-family="sans-serif" role="img" aria-label="Segment Tree de ${escapeXml(operationLabels[operation].toLowerCase())}">${lines.join('')}${nodes.join('')}</svg>`;
}
