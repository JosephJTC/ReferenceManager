// Disjoint Set Union puro: unión por tamaño y compresión de caminos.
export type DsuEvent =
  | { type: 'find:start'; node: number }
  | { type: 'find:step'; node: number; parent: number }
  | { type: 'find:root'; node: number; root: number }
  | { type: 'find:compress'; node: number; from: number; root: number }
  | { type: 'union:start'; a: number; b: number }
  | { type: 'union:same'; root: number }
  | { type: 'union:link'; child: number; parent: number; size: number };

export class DSU {
  readonly parent: number[];
  readonly size: number[];
  trace?: (event: DsuEvent) => void;

  constructor(n: number, trace?: (event: DsuEvent) => void) {
    this.parent = Array.from({ length: n }, (_, index) => index);
    this.size = new Array(n).fill(1);
    this.trace = trace;
  }

  find(node: number): number {
    this.trace?.({ type: 'find:start', node });
    const path: number[] = [];
    let root = node;
    while (this.parent[root] !== root) {
      this.trace?.({ type: 'find:step', node: root, parent: this.parent[root] });
      path.push(root); root = this.parent[root];
    }
    this.trace?.({ type: 'find:root', node, root });
    for (const item of path) if (this.parent[item] !== root) {
      const from = this.parent[item];
      this.parent[item] = root;
      this.trace?.({ type: 'find:compress', node: item, from, root });
    }
    return root;
  }

  union(a: number, b: number): boolean {
    this.trace?.({ type: 'union:start', a, b });
    let x = this.find(a), y = this.find(b);
    if (x === y) { this.trace?.({ type: 'union:same', root: x }); return false; }
    if (this.size[x] < this.size[y]) [x, y] = [y, x];
    this.parent[y] = x; this.size[x] += this.size[y];
    this.trace?.({ type: 'union:link', child: y, parent: x, size: this.size[x] });
    return true;
  }
}
