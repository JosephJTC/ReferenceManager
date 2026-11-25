// Visualización del BFS de esta referencia: recorrido por niveles con una cola.
// Formato de los archivos .viz.js: docs/VISUALIZATION_GUIDE.md del proyecto ReferenceManager.
export default function (viz) {
  const { h, integerParam, arrayCells } = viz;

  // 1. Algoritmo: el mismo BFS de bfs.py, con eventos.
  function bfs(graph, source, trace) {
    const distance = new Array(graph.length).fill(-1);
    distance[source] = 0;
    const queue = [source];
    trace?.({ type: 'start', source });
    while (queue.length) {
      const u = queue.shift();
      trace?.({ type: 'pop', node: u, distance: distance[u] });
      for (const v of graph[u]) {
        if (distance[v] === -1) {
          distance[v] = distance[u] + 1;
          queue.push(v);
          trace?.({ type: 'discover', from: u, to: v, distance: distance[v] });
        } else trace?.({ type: 'skip', from: u, to: v });
      }
      trace?.({ type: 'done', node: u });
    }
    trace?.({ type: 'end', distance: [...distance] });
    return distance;
  }

  function parseEdges(text, n) {
    return String(text).split(/[\s,;]+/).filter(Boolean).map(item => {
      const match = /^(\d+)-(\d+)$/.exec(item);
      if (!match) throw new Error('Escribe las aristas como pares «u-v» separados por comas, por ejemplo: 0-1, 1-2.');
      const edge = [Number(match[1]), Number(match[2])];
      if (edge.some(value => value >= n)) throw new Error(`Los nodos van de 0 a ${n - 1}.`);
      return edge;
    });
  }

  // 2. Eventos → pasos.
  function record(graph, source) {
    const n = graph.length;
    const state = { distance: new Array(n).fill(-1), status: new Array(n).fill('new'), queue: [], active: undefined, edge: null, tree: [] };
    const steps = [];
    const snapshot = (message, event, result) => steps.push({ state: { ...state, distance: [...state.distance], status: [...state.status], queue: [...state.queue], tree: [...state.tree] }, message, event, result });
    bfs(graph, source, event => {
      state.edge = null;
      switch (event.type) {
        case 'start': state.distance[event.source] = 0; state.status[event.source] = 'queued'; state.queue = [event.source];
          return snapshot(`Se empieza en ${event.source} con distancia 0 y se mete en la cola.`, event);
        case 'pop': state.queue.shift(); state.active = event.node;
          return snapshot(`Se saca ${event.node} de la cola (distancia ${event.distance}) y se revisan sus vecinos.`, event);
        case 'discover': state.distance[event.to] = event.distance; state.status[event.to] = 'queued'; state.queue.push(event.to); state.edge = [event.from, event.to]; state.tree.push([event.from, event.to]);
          return snapshot(`${event.to} no se había visitado: distancia ${event.distance} y entra al final de la cola.`, event);
        case 'skip': state.edge = [event.from, event.to];
          return snapshot(`${event.to} ya tiene distancia: se ignora la arista ${event.from}–${event.to}.`, event);
        case 'done': state.status[event.node] = 'done';
          return snapshot(`${event.node} terminado.`, event);
        case 'end': state.active = undefined;
          return snapshot('La cola está vacía: cada nodo alcanzable tiene su distancia mínima en aristas. Costo O(n + m).', event, `dist = [${event.distance.join(', ')}]`);
      }
    });
    return steps;
  }

  return {
    title: 'BFS',
    description: 'Recorrido en anchura: los nodos salen de la cola en orden de distancia al origen.',
    inputs: [
      { name: 'nodes', label: 'Nodos', ariaLabel: 'Número de nodos', kind: 'integer', default: 7 },
      { name: 'edges', label: 'Aristas', kind: 'text', default: '0-1, 0-2, 1-3, 2-3, 2-4, 3-5, 4-5, 5-6' }
    ],
    operations: [{ id: 'bfs', label: 'Recorrer desde', fields: [{ name: 'source', label: 'Origen', ariaLabel: 'Nodo de origen', kind: 'integer', default: 0 }] }],
    legend: [{ state: 'active', label: 'Nodo actual' }, { state: 'visited', label: 'En la cola' }, { state: 'used', label: 'Terminado' }],
    parseInput(values) {
      const nodes = Number(values.nodes);
      if (!Number.isInteger(nodes) || nodes < 1 || nodes > 12) throw new Error('El número de nodos debe estar entre 1 y 12.');
      const edges = parseEdges(values.edges, nodes);
      const graph = Array.from({ length: nodes }, () => []);
      for (const [u, v] of edges) { graph[u].push(v); graph[v].push(u); }
      return { graph, edges };
    },
    inputFromSpec: options => ({
      nodes: typeof options.nodes === 'number' ? options.nodes : undefined,
      edges: Array.isArray(options.edges) ? options.edges.map(edge => Array.isArray(edge) ? edge.join('-') : String(edge)).join(', ') : typeof options.edges === 'string' ? options.edges : undefined
    }),
    run({ graph }, _operation, params) { return record(graph, integerParam(params, 'source', 'El origen', 0, graph.length - 1)); },
    // 3. Dibujo: nodos en círculo, aristas del árbol BFS resaltadas, y debajo la cola y las distancias.
    render({ state }, { input }) {
      const n = state.distance.length, size = 300, center = size / 2, radius = n > 1 ? 112 : 0;
      const at = i => ({ x: center + radius * Math.cos(2 * Math.PI * i / n - Math.PI / 2), y: center + radius * Math.sin(2 * Math.PI * i / n - Math.PI / 2) });
      const same = (a, b) => a && ((a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]));
      const edges = input.edges.map(edge => {
        const a = at(edge[0]), b = at(edge[1]);
        const kind = same(state.edge, edge) ? 'changed' : state.tree.some(item => same(item, edge)) ? 'visited' : '';
        return h`<line class="viz-edge ${kind}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
      });
      const nodeClass = i => state.active === i ? 'active' : state.status[i] === 'done' ? 'used' : state.status[i] === 'queued' ? 'visited' : '';
      const nodes = state.distance.map((d, i) => {
        const { x, y } = at(i);
        return h`<g class="viz-node ${nodeClass(i)}" data-node="${i}"><circle cx="${x}" cy="${y}" r="18"/><text x="${x}" y="${y + 4}" class="viz-value">${i}</text><text x="${x}" y="${y + 31}" class="viz-caption">${d < 0 ? '∞' : `d=${d}`}</text></g>`;
      });
      const cell = 40, width = Math.max(size, n * cell);
      const queue = state.queue.length ? arrayCells(state.queue, { x: (width - state.queue.length * cell) / 2, y: size + 22, cell, label: i => i === 0 ? 'frente' : '' }) : h`<text x="${width / 2}" y="${size + 42}" class="viz-caption">cola vacía</text>`;
      return h`<svg viewBox="0 0 ${width} ${size + 70}" style="max-width:${width * 1.3}px" role="img" aria-label="Recorrido BFS"><g transform="translate(${(width - size) / 2} 0)">${edges}${nodes}</g><text x="${width / 2}" y="${size + 14}" class="viz-caption">cola</text>${queue}</svg>`;
    }
  };
}
