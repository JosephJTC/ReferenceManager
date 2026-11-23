// Segment Tree puro: no sabe nada de la interfaz. Si recibe `trace`, avisa de cada cosa que hace.
export type SegmentOperation = 'sum' | 'min' | 'max';

export type SegmentEvent =
  | { type: 'build:start'; size: number }
  | { type: 'build:split'; node: number; lo: number; hi: number; mid: number }
  | { type: 'build:leaf'; node: number; lo: number; hi: number; value: number }
  | { type: 'build:combine'; node: number; lo: number; hi: number; left: number; right: number; value: number }
  | { type: 'build:end'; value: number | null }
  | { type: 'query:start'; left: number; right: number }
  | { type: 'query:skip'; node: number; lo: number; hi: number }
  | { type: 'query:take'; node: number; lo: number; hi: number; value: number; accumulated: number }
  | { type: 'query:descend'; node: number; lo: number; hi: number }
  | { type: 'query:end'; result: number }
  | { type: 'update:start'; index: number; previous: number; value: number }
  | { type: 'update:descend'; node: number; lo: number; hi: number; side: 'left' | 'right' }
  | { type: 'update:leaf'; node: number; lo: number; hi: number; value: number }
  | { type: 'update:recompute'; node: number; lo: number; hi: number; value: number }
  | { type: 'update:end'; changed: number };

export const combine = (operation: SegmentOperation, a: number, b: number) => operation === 'sum' ? a + b : operation === 'min' ? Math.min(a, b) : Math.max(a, b);
export const neutral = (operation: SegmentOperation) => operation === 'sum' ? 0 : operation === 'min' ? Infinity : -Infinity;

export class SegmentTree {
  /** Nodo 1 = raíz; los hijos de `i` son `2i` y `2i+1`. `null` = todavía sin calcular. */
  readonly tree: (number | null)[];
  readonly array: number[];
  trace?: (event: SegmentEvent) => void;

  constructor(array: number[], readonly operation: SegmentOperation = 'sum', trace?: (event: SegmentEvent) => void) {
    this.array = [...array];
    this.tree = new Array(4 * Math.max(1, array.length)).fill(null);
    this.trace = trace;
    this.trace?.({ type: 'build:start', size: array.length });
    if (array.length) this.build(1, 0, array.length - 1);
    this.trace?.({ type: 'build:end', value: this.tree[1] });
  }

  private build(node: number, lo: number, hi: number): number {
    if (lo === hi) {
      this.tree[node] = this.array[lo];
      this.trace?.({ type: 'build:leaf', node, lo, hi, value: this.array[lo] });
      return this.array[lo];
    }
    const mid = (lo + hi) >> 1;
    this.trace?.({ type: 'build:split', node, lo, hi, mid });
    const left = this.build(node * 2, lo, mid), right = this.build(node * 2 + 1, mid + 1, hi);
    const value = (this.tree[node] = combine(this.operation, left, right));
    this.trace?.({ type: 'build:combine', node, lo, hi, left, right, value });
    return value;
  }

  query(left: number, right: number): number {
    let accumulated = neutral(this.operation);
    this.trace?.({ type: 'query:start', left, right });
    const walk = (node: number, lo: number, hi: number) => {
      if (hi < left || right < lo) { this.trace?.({ type: 'query:skip', node, lo, hi }); return; }
      if (left <= lo && hi <= right) {
        accumulated = combine(this.operation, accumulated, this.tree[node]!);
        this.trace?.({ type: 'query:take', node, lo, hi, value: this.tree[node]!, accumulated });
        return;
      }
      this.trace?.({ type: 'query:descend', node, lo, hi });
      const mid = (lo + hi) >> 1;
      walk(node * 2, lo, mid); walk(node * 2 + 1, mid + 1, hi);
    };
    if (this.array.length) walk(1, 0, this.array.length - 1);
    this.trace?.({ type: 'query:end', result: accumulated });
    return accumulated;
  }

  update(index: number, value: number) {
    this.trace?.({ type: 'update:start', index, previous: this.array[index], value });
    const path: { node: number; lo: number; hi: number }[] = [];
    let node = 1, lo = 0, hi = this.array.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1, side = index <= mid ? 'left' : 'right';
      path.push({ node, lo, hi });
      this.trace?.({ type: 'update:descend', node, lo, hi, side });
      if (side === 'left') { node = node * 2; hi = mid; } else { node = node * 2 + 1; lo = mid + 1; }
    }
    this.array[index] = value; this.tree[node] = value;
    this.trace?.({ type: 'update:leaf', node, lo, hi, value });
    for (const item of path.reverse()) {
      const next = (this.tree[item.node] = combine(this.operation, this.tree[item.node * 2]!, this.tree[item.node * 2 + 1]!));
      this.trace?.({ type: 'update:recompute', ...item, value: next });
    }
    this.trace?.({ type: 'update:end', changed: path.length + 1 });
  }
}
