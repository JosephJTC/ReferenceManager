// Visualización del Segment Tree de esta referencia.
// ReferenceManager carga este archivo en un entorno aislado, llama a la función exportada con `viz`
// (utilidades del motor) y usa la definición que devuelve. Formato: docs/VISUALIZATION_GUIDE.md del proyecto.
export default function (viz) {
  const { h, interval, parseIntegers, integerParam, numbersToText, arrayCells } = viz;
  const labels = { sum: 'Suma', min: 'Mínimo', max: 'Máximo' };
  const combine = (op, a, b) => op === 'sum' ? a + b : op === 'min' ? Math.min(a, b) : Math.max(a, b);
  const neutral = op => op === 'sum' ? 0 : op === 'min' ? Infinity : -Infinity;
  const show = value => Number.isFinite(value) ? String(value) : value > 0 ? '+∞' : '-∞';

  // 1. Algoritmo: Segment Tree normal. Si recibe `trace`, avisa de cada cosa que hace con un evento.
  class SegmentTree {
    constructor(array, op, trace) {
      this.array = [...array]; this.op = op; this.trace = trace;
      this.tree = new Array(4 * Math.max(1, array.length)).fill(null);
      this.trace?.({ type: 'build:start', size: array.length });
      if (array.length) this.build(1, 0, array.length - 1);
      this.trace?.({ type: 'build:end', value: this.tree[1] });
    }
    build(node, lo, hi) {
      if (lo === hi) {
        this.tree[node] = this.array[lo];
        this.trace?.({ type: 'build:leaf', node, lo, hi, value: this.array[lo] });
        return this.array[lo];
      }
      const mid = (lo + hi) >> 1;
      this.trace?.({ type: 'build:split', node, lo, hi, mid });
      const left = this.build(node * 2, lo, mid), right = this.build(node * 2 + 1, mid + 1, hi);
      const value = this.tree[node] = combine(this.op, left, right);
      this.trace?.({ type: 'build:combine', node, lo, hi, left, right, value });
      return value;
    }
    query(left, right) {
      let accumulated = neutral(this.op);
      this.trace?.({ type: 'query:start', left, right });
      const walk = (node, lo, hi) => {
        if (hi < left || right < lo) { this.trace?.({ type: 'query:skip', node, lo, hi }); return; }
        if (left <= lo && hi <= right) {
          accumulated = combine(this.op, accumulated, this.tree[node]);
          this.trace?.({ type: 'query:take', node, lo, hi, value: this.tree[node], accumulated });
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
    update(index, value) {
      this.trace?.({ type: 'update:start', index, previous: this.array[index], value });
      const path = [];
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
        const next = this.tree[item.node] = combine(this.op, this.tree[item.node * 2], this.tree[item.node * 2 + 1]);
        this.trace?.({ type: 'update:recompute', ...item, value: next });
      }
      this.trace?.({ type: 'update:end', changed: path.length + 1 });
    }
  }

  // 2. Eventos → pasos: cada evento actualiza el estado y guarda una copia con su explicación.
  function record(array, values, op, showResult) {
    const state = { values, array: [...array], active: undefined, visited: [], partial: [], skipped: [], highlight: null, result: undefined };
    const steps = [];
    const name = labels[op].toLowerCase();
    const snapshot = (message, event) => steps.push({
      state: { ...state, values: [...state.values], array: [...state.array], visited: [...state.visited], partial: [...state.partial], skipped: [...state.skipped] },
      message, event,
      result: showResult && state.result !== undefined && Number.isFinite(state.result) ? `Acumulado: ${state.result}` : undefined
    });
    const visit = node => { state.active = node; if (!state.visited.includes(node)) state.visited.push(node); };
    const trace = event => {
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
          state.result = neutral(op);
          return;
        case 'query:skip': visit(event.node); state.skipped.push(event.node);
          return snapshot(`Nodo ${event.node} ${interval(event.lo, event.hi)} no se cruza con ${interval(...state.highlight)}: se descarta.`, event);
        case 'query:take': visit(event.node); state.partial.push(event.node); state.result = event.accumulated;
          return snapshot(`Nodo ${event.node} ${interval(event.lo, event.hi)} está contenido por completo: se usa su valor ${event.value}. Acumulado: ${show(event.accumulated)}.`, event);
        case 'query:descend': visit(event.node);
          return snapshot(`Nodo ${event.node} ${interval(event.lo, event.hi)} se cruza parcialmente: se visitan sus dos hijos.`, event);
        case 'query:end': state.active = undefined; state.result = event.result;
          return snapshot(`Resultado: ${show(event.result)}. Se visitaron ${state.visited.length} nodos y se usaron ${state.partial.length}; cada nivel aporta como máximo 4 nodos, así que la consulta cuesta O(log n).`, event);
        case 'update:start': state.highlight = [event.index, event.index];
          return snapshot(`Actualización: a[${event.index}] pasa de ${event.previous} a ${event.value}. Se baja hasta la hoja.`, event);
        case 'update:descend': visit(event.node);
          return snapshot(`Nodo ${event.node} ${interval(event.lo, event.hi)}: la posición ${state.highlight[0]} está a la ${event.side === 'left' ? 'izquierda' : 'derecha'}.`, event);
        case 'update:leaf': visit(event.node); state.partial = [event.node]; state.values[event.node] = event.value; state.array[event.lo] = event.value;
          return snapshot(`Hoja ${interval(event.lo, event.hi)} = ${event.value}.`, event);
        case 'update:recompute': visit(event.node); state.partial = [event.node]; state.values[event.node] = event.value;
          return snapshot(`Se recalcula el nodo ${event.node} ${interval(event.lo, event.hi)} = ${event.value}.`, event);
        case 'update:end': state.active = undefined; state.partial = [];
          return snapshot(`Actualización terminada: solo cambiaron ${event.changed} nodos, uno por nivel. Costo O(log n).`, event);
      }
    };
    return { steps, trace };
  }

  // 3. Geometría: las hojas ocupan columnas y cada nodo se centra sobre su intervalo.
  const cell = 64, levelHeight = 74;
  function layout(length) {
    const nodes = [];
    const walk = (id, lo, hi, depth) => {
      nodes.push({ id, lo, hi, x: ((lo + hi + 1) / 2) * cell, y: depth * levelHeight + 30 });
      if (lo === hi) return;
      const mid = (lo + hi) >> 1;
      walk(id * 2, lo, mid, depth + 1); walk(id * 2 + 1, mid + 1, hi, depth + 1);
    };
    if (length > 0) walk(1, 0, length - 1, 0);
    const depth = Math.max(0, ...nodes.map(node => Math.round((node.y - 30) / levelHeight)));
    return { width: Math.max(1, length) * cell, height: (depth + 1) * levelHeight + 4, nodes, byId: new Map(nodes.map(node => [node.id, node])) };
  }

  return {
    title: 'Segment Tree',
    description: 'Construcción, consulta de intervalos y actualización puntual paso a paso.',
    inputs: [
      { name: 'values', label: 'Valores iniciales', kind: 'text', default: '5, 8, 6, 3, 2, 7, 2, 6' },
      { name: 'operation', label: 'Operación', ariaLabel: 'Operación del árbol', kind: 'select', default: 'sum', options: Object.entries(labels).map(([value, label]) => ({ value, label })) }
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
    parseInput: values => ({ array: parseIntegers(values.values, { max: 16 }), op: values.operation }),
    inputFromSpec: options => ({ values: numbersToText(options.values), operation: typeof options.operation === 'string' ? options.operation : undefined }),
    run({ array, op }, action, params) {
      const n = array.length;
      if (action === 'query') {
        const left = Number(params.left), right = Number(params.right);
        if (!(Number.isInteger(left) && Number.isInteger(right) && 0 <= left && left <= right && right < n)) throw new Error(`El intervalo debe cumplir 0 ≤ l ≤ r < ${n}.`);
        const tree = new SegmentTree(array, op);
        const { steps, trace } = record(array, [...tree.tree], op, true);
        tree.trace = trace; tree.query(left, right);
        return steps;
      }
      if (action === 'update') {
        const index = integerParam(params, 'index', 'La posición', 0, n - 1), value = integerParam(params, 'value', 'El nuevo valor', -1e9, 1e9);
        const tree = new SegmentTree(array, op);
        const { steps, trace } = record(array, [...tree.tree], op, false);
        tree.trace = trace; tree.update(index, value);
        return steps;
      }
      const { steps, trace } = record(array, new Array(4 * Math.max(1, n)).fill(null), op, false);
      new SegmentTree(array, op, trace);
      return steps;
    },
    commit({ array, op }, action, params) {
      const next = [...array];
      if (action === 'update') next[Number(params.index)] = Number(params.value);
      return { values: next.join(', '), operation: op };
    },
    // 4. Dibujo: solo lee el estado del paso.
    render({ state }) {
      const tree = layout(state.array.length);
      const nodeClass = id => state.active === id ? 'active' : state.partial.includes(id) ? 'used' : state.skipped.includes(id) ? 'skipped' : state.visited.includes(id) ? 'visited' : '';
      const edges = tree.nodes.flatMap(node => [node.id * 2, node.id * 2 + 1].filter(child => tree.byId.has(child)).map(child => {
        const target = tree.byId.get(child);
        return h`<line class="viz-edge ${state.visited.includes(child) ? 'visited' : ''}" x1="${node.x}" y1="${node.y}" x2="${target.x}" y2="${target.y}"/>`;
      }));
      const nodes = tree.nodes.map(node => h`<g class="viz-node ${nodeClass(node.id)}" data-node="${node.id}">
        <rect x="${node.x - 27}" y="${node.y - 18}" width="54" height="36" rx="6"/>
        <text x="${node.x}" y="${node.y - 2}" class="viz-value">${state.values[node.id] ?? '·'}</text>
        <text x="${node.x}" y="${node.y + 12}" class="viz-caption">${interval(node.lo, node.hi)}</text></g>`);
      const inRange = i => state.highlight && i >= state.highlight[0] && i <= state.highlight[1];
      const cells = arrayCells(state.array, { y: tree.height, cell, className: i => inRange(i) ? 'range' : '' });
      return h`<svg viewBox="0 0 ${tree.width} ${tree.height + 48}" style="max-width:${tree.width * 1.25}px" role="img" aria-label="Árbol de segmentos">${edges}${nodes}${cells}</svg>`;
    }
  };
}
