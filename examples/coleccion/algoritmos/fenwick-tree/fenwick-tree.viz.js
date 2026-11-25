// Visualización del Fenwick Tree de esta referencia. Es el ejemplo del tutorial de
// docs/VISUALIZATION_GUIDE.md (proyecto ReferenceManager): úsala como plantilla.
export default function (viz) {
  const { h, interval, parseIntegers, integerParam, numbersToText, arrayCells } = viz;
  const lowbit = i => i & -i;
  /** Posiciones del arreglo (0..n-1) que cubre el nodo i. */
  const coverage = node => [node - lowbit(node), node - 1];
  const binary = value => value.toString(2);

  // 1. Algoritmo: índices internos 1..n; la API usa posiciones 0..n-1. `trace` recibe los eventos.
  class FenwickTree {
    constructor(array, trace) {
      this.array = [...array]; this.trace = trace;
      this.tree = new Array(array.length + 1).fill(0);
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
    prefix(right) {
      let sum = 0;
      this.trace?.({ type: 'prefix:start', right });
      for (let i = right + 1; i > 0; i -= lowbit(i)) {
        sum += this.tree[i];
        this.trace?.({ type: 'prefix:take', node: i, value: this.tree[i], accumulated: sum });
      }
      this.trace?.({ type: 'prefix:end', right, result: sum });
      return sum;
    }
    range(left, right) { return this.prefix(right) - (left > 0 ? this.prefix(left - 1) : 0); }
    add(index, delta) {
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

  // 2. Eventos → pasos. `snapshot` copia los arreglos: cada paso es independiente.
  function record(array, tree, play) {
    const state = { array: [...array], tree, active: undefined, used: [], highlight: null };
    const steps = [];
    let first;
    const snapshot = (message, event, result) => steps.push({ state: { ...state, array: [...state.array], tree: [...state.tree], used: [...state.used] }, message, event, result });
    play(event => {
      switch (event.type) {
        case 'build:start': return snapshot('Construcción en O(n): cada nodo i recibe a[i-1] y empuja su suma al nodo i + lowbit(i).', event);
        case 'build:set': state.active = event.node; state.used = []; state.tree[event.node] = event.value; state.highlight = coverage(event.node);
          return snapshot(`Nodo ${event.node} (${binary(event.node)}₂) cubre ${interval(...coverage(event.node))} y vale ${event.value}.`, event);
        case 'build:push': state.active = event.parent; state.used = [event.node]; state.tree[event.parent] = event.value; state.highlight = coverage(event.parent);
          return snapshot(`Se suma al nodo ${event.parent} = ${event.node} + lowbit(${event.node}); por ahora acumula ${event.value}.`, event);
        case 'build:end': state.active = undefined; state.used = []; state.highlight = null;
          return snapshot('Construcción terminada.', event);
        case 'prefix:start': state.used = []; state.active = undefined; state.highlight = [0, event.right];
          return snapshot(`Suma del prefijo ${interval(0, event.right)}: se empieza en el nodo ${event.right + 1} y se resta lowbit en cada salto.`, event);
        case 'prefix:take': state.active = event.node; state.used.push(event.node);
          return snapshot(`Nodo ${event.node} (${binary(event.node)}₂) cubre ${interval(...coverage(event.node))}: aporta ${event.value}. Siguiente: ${event.node} − ${lowbit(event.node)} = ${event.node - lowbit(event.node)}.`, event, `Acumulado: ${event.accumulated}`);
        case 'prefix:end':
          state.active = undefined;
          // Una suma de intervalo son dos prefijos: el segundo se resta del primero.
          if (first === undefined) { first = event.result; return snapshot(`Prefijo ${interval(0, event.right)} = ${event.result}. Se visitaron ${state.used.length} nodos: O(log n).`, event, `Resultado: ${event.result}`); }
          return snapshot(`Prefijo ${interval(0, event.right)} = ${event.result}. Intervalo = ${first} − ${event.result} = ${first - event.result}.`, event, `Resultado: ${first - event.result}`);
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

  return {
    title: 'Fenwick Tree (BIT)',
    description: 'Sumas de prefijo y actualizaciones puntuales saltando con lowbit(i) = i & −i.',
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
    parseInput: values => ({ array: parseIntegers(values.values, { max: 16 }) }),
    inputFromSpec: options => ({ values: numbersToText(options.values) }),
    run({ array }, operation, params) {
      const n = array.length;
      if (operation === 'build') return record(array, new Array(n + 1).fill(null), trace => { new FenwickTree(array, trace); });
      const tree = new FenwickTree(array);   // se construye sin grabar…
      return record(array, [...tree.tree], trace => {
        tree.trace = trace;                  // …y solo se graba la operación pedida
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
    },
    // 3. Dibujo: cada nodo es una barra sobre las posiciones que cubre; más arriba cuanto mayor su lowbit.
    render({ state }) {
      const { array, tree, active, used, highlight } = state;
      const n = array.length, cell = 56, row = 46;
      const levels = Math.floor(Math.log2(Math.max(1, n))) + 1;
      const bars = array.map((_, index) => {
        const node = index + 1, [lo, hi] = coverage(node);
        const x = lo * cell + 3, y = (levels - 1 - Math.log2(lowbit(node))) * row + 4, w = (hi - lo + 1) * cell - 6;
        return h`<g class="viz-node ${active === node ? 'active' : used.includes(node) ? 'used' : ''}" data-node="${node}">
          <rect x="${x}" y="${y}" width="${w}" height="${row - 10}" rx="6"/>
          <text x="${x + w - cell / 2 + 3}" y="${y + 15}" class="viz-value">${tree[node] ?? '·'}</text>
          <text x="${x + w - cell / 2 + 3}" y="${y + 29}" class="viz-caption">t[${node}]</text></g>`;
      });
      const inRange = i => highlight && i >= highlight[0] && i <= highlight[1];
      const cells = arrayCells(array, { y: levels * row + 6, cell, className: i => inRange(i) ? 'range' : '' });
      return h`<svg viewBox="0 0 ${n * cell} ${levels * row + 54}" style="max-width:${n * cell * 1.25}px" role="img" aria-label="Fenwick Tree">${bars}${cells}</svg>`;
    }
  };
}
