// Fenwick Tree (BIT) puro. Índices internos 1..n; la API pública usa posiciones 0..n-1.
export type FenwickEvent =
  | { type: 'build:start'; size: number }
  | { type: 'build:set'; node: number; value: number }
  | { type: 'build:push'; node: number; parent: number; value: number }
  | { type: 'build:end' }
  | { type: 'prefix:start'; right: number }
  | { type: 'prefix:take'; node: number; value: number; accumulated: number }
  | { type: 'prefix:end'; right: number; result: number }
  | { type: 'add:start'; index: number; delta: number }
  | { type: 'add:node'; node: number; value: number }
  | { type: 'add:end'; touched: number };

export const lowbit = (i: number) => i & -i;

export class FenwickTree {
  /** tree[i] guarda la suma de las posiciones (i - lowbit(i), i] en índices 1..n; tree[0] no se usa. */
  readonly tree: number[];
  readonly array: number[];
  trace?: (event: FenwickEvent) => void;

  constructor(array: number[], trace?: (event: FenwickEvent) => void) {
    this.array = [...array];
    this.tree = new Array(array.length + 1).fill(0);
    this.trace = trace;
    const n = array.length;
    this.trace?.({ type: 'build:start', size: n });
    for (let i = 1; i <= n; i++) {
      this.tree[i] += array[i - 1];
      this.trace?.({ type: 'build:set', node: i, value: this.tree[i] });
      const parent = i + lowbit(i);
      if (parent <= n) {
        this.tree[parent] += this.tree[i];
        this.trace?.({ type: 'build:push', node: i, parent, value: this.tree[parent] });
      }
    }
    this.trace?.({ type: 'build:end' });
  }

  /** Suma de a[0..right]. */
  prefix(right: number): number {
    let sum = 0;
    this.trace?.({ type: 'prefix:start', right });
    for (let i = right + 1; i > 0; i -= lowbit(i)) {
      sum += this.tree[i];
      this.trace?.({ type: 'prefix:take', node: i, value: this.tree[i], accumulated: sum });
    }
    this.trace?.({ type: 'prefix:end', right, result: sum });
    return sum;
  }

  /** Suma de a[left..right]. */
  range(left: number, right: number): number {
    return this.prefix(right) - (left > 0 ? this.prefix(left - 1) : 0);
  }

  /** a[index] += delta. */
  add(index: number, delta: number) {
    this.trace?.({ type: 'add:start', index, delta });
    this.array[index] += delta;
    let touched = 0;
    for (let i = index + 1; i <= this.array.length; i += lowbit(i)) {
      this.tree[i] += delta; touched++;
      this.trace?.({ type: 'add:node', node: i, value: this.tree[i] });
    }
    this.trace?.({ type: 'add:end', touched });
  }
}
