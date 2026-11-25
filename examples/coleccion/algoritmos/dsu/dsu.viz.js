// Visualización del DSU de esta referencia: búsqueda con compresión de caminos y unión por tamaño.
// Formato de los archivos .viz.js: docs/VISUALIZATION_GUIDE.md del proyecto ReferenceManager.
export default function (viz) {
  const { h, integerParam, layoutForest, arrayCells } = viz;

  // 1. Algoritmo.
  class DSU {
    constructor(n, trace) {
      this.parent = Array.from({ length: n }, (_, i) => i);
      this.size = new Array(n).fill(1);
      this.trace = trace;
    }
    find(node) {
      this.trace?.({ type: 'find:start', node });
      const path = [];
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
    union(a, b) {
      this.trace?.({ type: 'union:start', a, b });
      let x = this.find(a), y = this.find(b);
      if (x === y) { this.trace?.({ type: 'union:same', root: x }); return false; }
      if (this.size[x] < this.size[y]) [x, y] = [y, x];
      this.parent[y] = x; this.size[x] += this.size[y];
      this.trace?.({ type: 'union:link', child: y, parent: x, size: this.size[x] });
      return true;
    }
  }

  function parseUnions(text, size) {
    return String(text).split(/[\s,;]+/).filter(Boolean).map(item => {
      const match = /^(\d+)-(\d+)$/.exec(item);
      if (!match) throw new Error('Escribe las uniones como pares «a-b» separados por comas, por ejemplo: 0-1, 2-3.');
      const pair = [Number(match[1]), Number(match[2])];
      if (pair.some(value => value >= size)) throw new Error(`Los elementos van de 0 a ${size - 1}.`);
      return pair;
    });
  }

  // 2. Eventos → pasos.
  function record(dsu, play) {
    const state = { parent: [...dsu.parent], size: [...dsu.size], active: undefined, path: [], roots: [], changed: null };
    const steps = [];
    const snapshot = (message, event, result) => steps.push({ state: { ...state, parent: [...state.parent], size: [...state.size], path: [...state.path], roots: [...state.roots] }, message, event, result });
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

  return {
    title: 'Disjoint Set Union',
    description: 'Búsqueda con compresión de caminos y unión por tamaño sobre un bosque de conjuntos.',
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
    // En los documentos impresos se dibuja el bosque al terminar las uniones iniciales.
    print: { operation: 'replay' },
    parseInput(values) {
      const size = Number(values.size);
      if (!Number.isInteger(size) || size < 1 || size > 16) throw new Error('El número de elementos debe estar entre 1 y 16.');
      return { size, unions: parseUnions(values.unions, size) };
    },
    inputFromSpec: options => ({
      size: typeof options.size === 'number' ? options.size : undefined,
      unions: Array.isArray(options.unions) ? options.unions.map(pair => Array.isArray(pair) ? pair.join('-') : String(pair)).join(', ') : typeof options.unions === 'string' ? options.unions : undefined
    }),
    run({ size, unions }, operation, params) {
      if (operation === 'replay') {
        const steps = record(new DSU(size), dsu => unions.forEach(([a, b]) => dsu.union(a, b)));
        return steps.length ? steps : [{ state: { parent: Array.from({ length: size }, (_, i) => i), size: new Array(size).fill(1), path: [], roots: [], changed: null }, message: 'No hay uniones iniciales: cada elemento es su propio conjunto.' }];
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
    commit({ unions }, operation, params) {
      const pairs = operation === 'union' ? [...unions, [Number(params.a), Number(params.b)]] : unions;
      return { unions: pairs.map(pair => pair.join('-')).join(', ') };
    },
    // 3. Dibujo: el bosque (layoutForest) y debajo el arreglo de padres.
    render({ state }) {
      const { parent, size, active, path, roots, changed } = state;
      const forest = layoutForest(parent);
      const cell = 52, cellsWidth = parent.length * cell;
      const width = Math.max(forest.width, cellsWidth), shift = (width - forest.width) / 2, cellsX = (width - cellsWidth) / 2;
      const nodeClass = node => active === node ? 'active' : roots.includes(node) ? 'used' : path.includes(node) ? 'visited' : '';
      const edges = parent.map((up, node) => {
        if (up === node) return '';
        const a = forest.positions[node], b = forest.positions[up];
        const edge = changed?.[0] === node ? 'changed' : path.includes(node) && path.includes(up) ? 'visited' : '';
        return h`<line class="viz-edge ${edge}" x1="${a.x + shift}" y1="${a.y + 14}" x2="${b.x + shift}" y2="${b.y + 14}"/>`;
      });
      const nodes = parent.map((up, node) => {
        const { x, y } = forest.positions[node];
        return h`<g class="viz-node ${nodeClass(node)}" data-node="${node}"><circle cx="${x + shift}" cy="${y + 14}" r="17"/><text x="${x + shift}" y="${y + 18}" class="viz-value">${node}</text>${up === node ? h`<text x="${x + shift}" y="${y - 7}" class="viz-caption">tam. ${size[node]}</text>` : ''}</g>`;
      });
      const cells = arrayCells(parent, { x: cellsX, y: forest.height + 14, cell, className: i => changed?.[0] === i ? 'active' : path.includes(i) ? 'range' : '', label: i => `padre[${i}]` });
      return h`<svg viewBox="0 0 ${width} ${forest.height + 62}" style="max-width:${width * 1.4}px" role="img" aria-label="Bosque de conjuntos disjuntos">${edges}${nodes}${cells}</svg>`;
    }
  };
}
