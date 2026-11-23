# Guía de visualizaciones

Cómo funciona el sistema de visualizaciones de ReferenceManager y cómo añadir o modificar una.

- [1. Arquitectura](#1-arquitectura)
- [2. El contrato](#2-el-contrato)
- [3. Tutorial: crear una visualización (Fenwick Tree)](#3-tutorial-crear-una-visualización-fenwick-tree)
- [4. Dibujo](#4-dibujo)
- [5. Animación y reproductor](#5-animación-y-reproductor)
- [6. Depuración](#6-depuración)
- [7. Recetas para otros algoritmos](#7-recetas-para-otros-algoritmos)
- [8. Pruebas](#8-pruebas)
- [9. Lista de comprobación](#9-lista-de-comprobación)

## 1. Arquitectura

```text
src/visualizations/
├── index.ts                  ← registro central de definiciones (sin React)
├── renderers.ts              ← registro central de dibujos (carga diferida)
├── core/                     ← núcleo común; no conoce ningún algoritmo
│   ├── types.ts              ← el contrato: VisualizationDefinition, Step, RendererProps…
│   ├── registry.ts           ← createRegistry(): register, unregister, get, has, list, match
│   ├── engine.ts             ← execute(), validateSteps(), playerReducer(), inputFromSpec()
│   ├── utils.ts              ← parseIntegers, integerParam, interval, layoutForest, escapeXml
│   ├── player.tsx            ← useStepPlayer + botones del reproductor
│   ├── VisualizationHost.tsx ← formulario, ejecución, reproductor, explicación, leyenda, errores
│   ├── VisualizationGallery.tsx ← Herramientas → Galería de visualizaciones
│   └── visualization.css     ← estilos y clases de estado comunes
└── data_structures/          ← una carpeta por visualización (crea graphs/, dynamic_programming/… cuando hagan falta)
    ├── segment_tree/
    ├── fenwick_tree/
    └── dsu/
        ├── algorithm.ts      ← el algoritmo puro; emite eventos
        ├── visualization.ts  ← la definición: formulario + eventos → pasos
        ├── renderer.tsx      ← dibuja UN paso
        ├── renderer.css      ← estilos propios (opcional)
        └── README.md
```

### Flujo de datos

```text
algorithm.ts          visualization.ts            core                   renderer.tsx
Algoritmo  ──eventos──▶ run(): eventos → pasos ──▶ VisualizationHost ──▶ dibuja step.state
(sin UI)               (estado propio, sin React)  (reproductor, UI)     (sin lógica del algoritmo)
```

1. **El algoritmo** (`algorithm.ts`) es una clase o función normal. Funciona sola (`new FenwickTree(a).prefix(3)`) y, si recibe una función `trace`, le avisa de cada cosa que hace con un **evento** (`{ type: 'prefix:take', node: 6, value: 9 }`).
2. **La definición** (`visualization.ts`) ejecuta el algoritmo, escucha los eventos y guarda una **instantánea del estado** por cada uno: eso es un **paso**. Aquí se decide qué se muestra y qué texto lo explica. No usa React ni el DOM, así que también corre en el worker que genera los documentos y en los tests.
3. **El núcleo** (`VisualizationHost`) construye el formulario a partir de la definición, llama a `run`, valida los pasos y se encarga del reproductor, el teclado, la explicación, la leyenda y los errores.
4. **El dibujo** (`renderer.tsx`) recibe un paso y lo pinta. No calcula nada del algoritmo.

Por eso retroceder es gratis: todos los pasos están calculados y cada uno es una instantánea completa; ir al paso anterior es solo dibujar `steps[i - 1]`.

### Registro

Hay dos puntos centrales, y son los **únicos** archivos fuera de tu carpeta que tocas al añadir una visualización:

```ts
// src/visualizations/index.ts — definiciones (puro)
visualizations.register(fenwickTree);

// src/visualizations/renderers.ts — dibujos (React, carga diferida)
'fenwick-tree': () => import('./data_structures/fenwick_tree/renderer.js'),
```

Están separados porque las definiciones se usan también fuera de la interfaz (documentos, tests), donde React no existe. El dibujo se descarga solo cuando se abre esa visualización.

`visualizations` ofrece `register`, `unregister(id)`, `get(id)`, `has(id)`, `list()` y `match(texto)`. `register` rechaza identificadores repetidos, que no estén en `kebab-case` o definiciones sin operaciones.

### Cómo llega una visualización a una referencia

- **Declarada** en `metadata.yaml`. Todo lo que no sea `type` o `title` se pasa a `inputFromSpec` como opciones:
  ```yaml
  visualizations:
    - type: fenwick-tree
      title: BIT del ejemplo
      values: [3, 2, -1, 6]
  ```
- **Detectada**: si no se declara nada, se usan las visualizaciones cuyo `id` o alguno de sus `aliases` aparece como palabra completa en el título, la carpeta o las etiquetas (`registry.match`). `visualizations: false` lo desactiva.
- **Galería**: *Herramientas → Galería de visualizaciones* muestra todas las registradas, sin necesidad de una referencia. Es la forma más rápida de probar la tuya.

## 2. El contrato

Todo está en [`core/types.ts`](../src/visualizations/core/types.ts).

### `VisualizationDefinition<Input, State>`

| Miembro | ¿Obligatorio? | Para qué |
| --- | --- | --- |
| `id` | Sí | Identificador `kebab-case`; es el `type` de `metadata.yaml`. |
| `title`, `description` | Sí | Textos que se muestran en la interfaz. |
| `inputs: Field[]` | Sí (puede ser `[]`) | Campos de los datos iniciales (arreglo, grafo…). |
| `operations: Operation[]` | Sí, al menos una | Acciones ejecutables y sus parámetros. |
| `parseInput(values)` | Sí | Convierte y valida el formulario → `Input`. Lanza `Error` con un mensaje claro. |
| `run(input, operation, params)` | Sí | Ejecuta el algoritmo y devuelve los pasos (`Step<State>[]`, al menos uno). |
| `aliases` | No | Nombres para la detección automática. Evita palabras ambiguas. |
| `legend` | No | Leyenda: `{ state, label }`; `state` es la clase CSS del color. |
| `inputFromSpec(options)` | No | Traduce las opciones de `metadata.yaml` a valores del formulario. |
| `commit(input, operation, params)` | No | Devuelve la entrada resultante de una operación que modifica los datos. Activa el botón `commitLabel`. |
| `staticSvg(input)` | No | SVG estático para documentos impresos. Sin él, la visualización no se imprime. |

`Input` y `State` son **tuyos**: el núcleo nunca mira dentro. Solo exige que cada paso tenga `state` y `message`.

### `Field` y `Operation`

```ts
type Field = { name: string; label: string; ariaLabel?: string; kind: 'text' | 'integer' | 'select'; default: string | number; options?: { value: string; label: string }[] };
type Operation = { id: string; label: string; fields: Field[]; commitLabel?: string };
```

El núcleo dibuja un control por campo. Los campos `integer` vacíos o no enteros se rechazan antes de llamar a `run`.

### `Step<State>`

```ts
type Step<State> = {
  state: State;          // instantánea completa e independiente
  message: string;       // explicación del paso
  event?: ExecutionEvent; // el evento que lo originó (se ve en «Datos del paso»)
  result?: string;       // texto destacado: «Acumulado: 9», «Resultado: 16»
};
```

Ejemplos reales de estado, uno por visualización, para ver lo distintos que pueden ser:

```jsonc
// Segment Tree: árbol en arreglo + nodos por categoría
{ "values": [null, 39, 22, 17], "array": [5, 8, 6, 3], "active": 5, "visited": [1, 2], "partial": [5], "skipped": [4], "highlight": [2, 5], "result": 9 }
// Fenwick Tree
{ "array": [3, 2, -1, 6], "tree": [0, 3, 5, -1, 10], "active": 4, "used": [4], "highlight": [0, 3] }
// DSU: un bosque
{ "parent": [0, 0, 0, 2], "size": [4, 1, 2, 1], "active": 2, "path": [3, 2], "roots": [], "changed": null }
```

### `RendererProps<State, Input>`

Lo que recibe el componente de dibujo:

| Propiedad | Contenido |
| --- | --- |
| `step` | El paso a dibujar. Normalmente solo necesitas `step.state`. |
| `previous`, `next` | Pasos vecinos (`undefined` en los extremos), para dibujar transiciones o diferencias. |
| `index`, `total` | Posición del paso. |
| `playing`, `durationMs` | Estado de la reproducción y duración de un paso a la velocidad actual. |
| `input`, `operation` | La entrada validada y la operación ejecutada. |

## 3. Tutorial: crear una visualización (Fenwick Tree)

El código de este tutorial es el que está en [`data_structures/fenwick_tree/`](../src/visualizations/data_structures/fenwick_tree/). Sigue los mismos pasos para cualquier otra.

### Paso 1 — Crea la carpeta

```text
src/visualizations/data_structures/fenwick_tree/
```

### Paso 2 — `algorithm.ts`: el algoritmo y sus eventos

Escribe el algoritmo como lo escribirías en un concurso y añade un `trace?.()` en cada punto que quieras poder mostrar. Declara los eventos como una unión para que TypeScript te avise si olvidas alguno.

```ts
export type FenwickEvent =
  | { type: 'prefix:start'; right: number }
  | { type: 'prefix:take'; node: number; value: number; accumulated: number }
  | { type: 'prefix:end'; right: number; result: number }
  | { type: 'add:start'; index: number; delta: number }
  | { type: 'add:node'; node: number; value: number }
  | { type: 'add:end'; touched: number };
  // … y los de construcción

export const lowbit = (i: number) => i & -i;

export class FenwickTree {
  readonly tree: number[];
  trace?: (event: FenwickEvent) => void;

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
}
```

Reglas: nada de React, nada de textos para el usuario, nada de colores. Los eventos llevan **datos** (qué nodo, qué valor), no decisiones de presentación. Sin `trace` la clase es un Fenwick Tree normal.

### Paso 3 — `visualization.ts`: estado y eventos → pasos

Define el estado que necesita el dibujo:

```ts
export type FenwickInput = { array: number[] };
export type FenwickState = {
  array: number[];
  tree: (number | null)[];   // null = aún sin construir
  active?: number;            // nodo actual
  used: number[];             // nodos ya sumados o modificados
  highlight: [number, number] | null; // posiciones del arreglo afectadas
};
```

Luego un grabador: mantiene un estado mutable, lo actualiza con cada evento y guarda **una copia** como paso.

```ts
function record(array, tree, play) {
  const state: FenwickState = { array: [...array], tree, used: [], highlight: null };
  const steps: Step<FenwickState>[] = [];
  const snapshot = (message, event, result?) =>
    steps.push({ state: { ...state, array: [...state.array], tree: [...state.tree], used: [...state.used] }, message, event, result });
  play(event => {
    switch (event.type) {
      case 'prefix:start': state.used = []; state.active = undefined; state.highlight = [0, event.right];
        return snapshot(`Suma del prefijo ${interval(0, event.right)}: se empieza en el nodo ${event.right + 1}…`, event);
      case 'prefix:take': state.active = event.node; state.used.push(event.node);
        return snapshot(`Nodo ${event.node} cubre ${interval(...coverage(event.node))}: aporta ${event.value}.`, event, `Acumulado: ${event.accumulated}`);
      // …
    }
  });
  return steps;
}
```

> **Copia siempre los arreglos en `snapshot`.** Si todos los pasos comparten el mismo arreglo, todos mostrarán el estado final y «paso anterior» parecerá no hacer nada.

Por último, la definición:

```ts
export const fenwickTree: VisualizationDefinition<FenwickInput, FenwickState> = {
  id: 'fenwick-tree',
  title: 'Fenwick Tree (BIT)',
  description: 'Sumas de prefijo y actualizaciones puntuales saltando con lowbit(i) = i & −i.',
  aliases: ['fenwick', 'binary indexed tree', 'arbol binario indexado'],
  inputs: [{ name: 'values', label: 'Valores iniciales', kind: 'text', default: '3, 2, -1, 6, 5, 4, -3, 3' }],
  operations: [
    { id: 'build', label: 'Construcción', fields: [] },
    { id: 'prefix', label: 'Suma de prefijo', fields: [{ name: 'right', label: 'r', kind: 'integer', default: 6 }] },
    { id: 'add', label: 'Actualización puntual', commitLabel: 'Conservar actualización', fields: [
      { name: 'index', label: 'Posición', kind: 'integer', default: 2 },
      { name: 'delta', label: 'Sumar', kind: 'integer', default: 4 }
    ] }
  ],
  legend: [{ state: 'active', label: 'Nodo actual' }, { state: 'used', label: 'Sumado / modificado' }],
  parseInput: values => ({ array: parseIntegers(String(values.values), { max: 16 }) }),
  inputFromSpec: options => ({ values: numbersToText(options.values) }),
  run({ array }, operation, params) {
    const n = array.length;
    if (operation === 'build') return record(array, new Array(n + 1).fill(null), handle => { new FenwickTree(array, handle); });
    const tree = new FenwickTree(array);             // se construye en silencio…
    return record(array, [...tree.tree], handle => {
      tree.trace = handle;                           // …y solo se graba la operación pedida
      if (operation === 'prefix') tree.prefix(integerParam(params, 'right', 'r', 0, n - 1));
      else tree.add(integerParam(params, 'index', 'La posición', 0, n - 1), integerParam(params, 'delta', 'La cantidad', -1e9, 1e9));
    });
  },
  commit({ array }, operation, params) {
    const next = [...array];
    if (operation === 'add') next[Number(params.index)] += Number(params.delta);
    return { values: next.join(', ') };
  }
};
```

Valida en `parseInput` y con `integerParam` (comprueba entero y rango); cualquier `Error` que lances se muestra al usuario como aviso y la vista sigue funcionando. Pon un tamaño máximo razonable: un dibujo con 500 nodos no enseña nada.

### Paso 4 — `renderer.tsx`: el dibujo

Un componente React con exportación por defecto. Recibe el paso y devuelve SVG y/o HTML:

```tsx
import type { RendererProps } from '../../core/types.js';
import { coverage, type FenwickInput, type FenwickState } from './visualization.js';
import './renderer.css';

const cell = 56, row = 46, pad = 8;

export default function FenwickRenderer({ step }: RendererProps<FenwickState, FenwickInput>) {
  const { array, tree, active, used, highlight } = step.state;
  const n = array.length;
  const level = (node: number) => Math.log2(node & -node);
  const levels = Math.floor(Math.log2(Math.max(1, n))) + 1;
  const width = n * cell + pad * 2, height = levels * row + pad * 2;
  return <>
    <svg viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width * 1.25 }} role="img" aria-label="Fenwick Tree">
      {array.map((_, index) => {
        const node = index + 1, [lo, hi] = coverage(node);
        const x = pad + lo * cell + 3, y = pad + (levels - 1 - level(node)) * row + 4, w = (hi - lo + 1) * cell - 6;
        return <g key={node} className={`viz-node ${active === node ? 'active' : used.includes(node) ? 'used' : ''}`}>
          <rect x={x} y={y} width={w} height={row - 10} rx={6} />
          <text x={x + w - cell / 2 + 3} y={y + 15} className="viz-value">{tree[node] ?? '·'}</text>
          <text x={x + w - cell / 2 + 3} y={y + 29} className="viz-caption">t[{node}]</text>
        </g>;
      })}
    </svg>
    <div className="viz-array">{array.map((item, position) =>
      <div key={position} className={highlight && position >= highlight[0] && position <= highlight[1] ? 'in-range' : ''}><small>{position}</small><span>{item}</span></div>)}</div>
  </>;
}
```

### Paso 5 — Regístrala

```ts
// src/visualizations/index.ts
import { fenwickTree } from './data_structures/fenwick_tree/visualization.js';
visualizations.register(fenwickTree);

// src/visualizations/renderers.ts
'fenwick-tree': () => import('./data_structures/fenwick_tree/renderer.js'),
```

La clave de `renderers.ts` debe ser exactamente el `id`.

### Paso 6 — Pruébala

```bash
npm run dev          # Herramientas → Galería de visualizaciones → Fenwick Tree (BIT)
npm run typecheck
npm test
```

En la galería: ejecuta cada operación, avanza y retrocede, escribe datos inválidos y comprueba el aviso. Añade tus casos a `tests/visualizations.test.ts` (ver [Pruebas](#8-pruebas)).

## 4. Dibujo

### Posiciones

Usa un `viewBox` en unidades propias y calcula las coordenadas a partir del estado; el SVG se escala solo al ancho disponible (`.viz-stage svg { width: 100% }`). Limita el tamaño máximo con `style={{ maxWidth }}` para que un dibujo pequeño no se vea gigante.

| Estructura | Cómo colocar los nodos |
| --- | --- |
| Árbol binario completo | `segmentLayout(n)` en `segment_tree/visualization.ts`: las hojas ocupan columnas consecutivas y cada padre se centra sobre sus hijos. |
| Bosque / árbol general con arreglo de padres | `layoutForest(parent)` en `core/utils.ts`: devuelve `{ positions, width, height }`. |
| Arreglo | Columnas de ancho fijo: `x = pad + i * cell`. O HTML con la clase `viz-array`. |
| Matriz / tabla de DP | `x = pad + columna * cell`, `y = pad + fila * cell`. |
| Grafo | Coordenadas fijas en la entrada, o en círculo: `x = cx + R·cos(2πi/n)`, `y = cy + R·sin(2πi/n)`. |

### Conexiones

Dibuja las aristas **antes** que los nodos para que queden debajo:

```tsx
<line className={`viz-edge ${onPath ? 'visited' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
```

Para grafos dirigidos añade un `<marker>` de flecha en `<defs>`; para pesos, un `<text>` en el punto medio.

### Resaltado

`core/visualization.css` define clases de estado que funcionan en cualquier `<g className="viz-node …">` con un `rect` o `circle` dentro, y respetan los temas claro y oscuro:

| Clase | Significado habitual |
| --- | --- |
| `active` | Elemento que se procesa en este paso. |
| `visited` | Ya recorrido. |
| `used` | Aportó al resultado o fue modificado. |
| `skipped` | Descartado (se atenúa). |
| `in-range` / `active` en celdas de `.viz-array` | Posiciones afectadas. |

Para colores propios usa las variables `--viz-active`, `--viz-visited`, `--viz-used`, `--viz-range` y sus `-stroke` en tu `renderer.css`. El contenedor lleva la clase `viz-<id>` para que acotes tus reglas (`.viz-dsu .viz-array div { … }`). La leyenda usa esas mismas clases: `legend: [{ state: 'active', label: 'Nodo actual' }]`.

### Pantallas pequeñas

- SVG con `viewBox` y sin `width`/`height` fijos.
- `.viz-stage` tiene `overflow: auto`: si el dibujo no cabe, se desplaza.
- Limita el tamaño de la entrada en `parseInput`.
- Textos de 9–13 unidades de `viewBox`; menos no se lee en móvil.

### Impresión

Los documentos se generan en un worker, sin React. Si quieres que tu visualización se imprima, implementa `staticSvg(input)` en la definición y devuelve el SVG como texto (usa `escapeXml` para cualquier texto). `segmentTreeSvg` es el ejemplo.

## 5. Animación y reproductor

El reproductor es común (`core/player.tsx` + `playerReducer` en `core/engine.ts`); no hay que programarlo.

| Control | Teclado (con el foco en la visualización) |
| --- | --- |
| Paso siguiente / anterior | `→` / `←` |
| Reproducir / pausar | `Espacio` |
| Reiniciar | `Inicio` |
| Barra de progreso, velocidad (0.5×, 1×, 2×, 4×) | — |

- **Duración**: un paso dura `baseStepMs / velocidad` (900 ms a 1×). Cambia `baseStepMs` o `speeds` en `core/engine.ts`.
- **Transiciones**: el contenedor expone la duración como variable CSS `--viz-step-ms`. Las clases comunes ya hacen transición de color. Para animar movimiento, mantén la misma `key` de React entre pasos y usa CSS:
  ```css
  .mi-nodo { transition: transform calc(var(--viz-step-ms) * .5); }
  ```
- **Anterior / siguiente**: no se «deshace» nada. Cada paso es una instantánea; retroceder dibuja la anterior. Si necesitas comparar, el renderer recibe `previous` y `next` (por ejemplo, para marcar qué celda cambió: `previous?.state.tree[i] !== step.state.tree[i]`).
- **Granularidad**: un evento = un paso. Si la animación va demasiado rápida o lenta, emite más o menos eventos, o ignora algunos en el grabador (un `case` sin `snapshot`).
- Al pulsar **Ejecutar** se recalculan los pasos y el reproductor vuelve al paso 1.

## 6. Depuración

- **«Datos del paso (depuración)»**, bajo cada visualización, muestra el evento y el estado del paso actual en JSON.
- El contenedor tiene `data-visualization="<id>"` y `data-step="<índice>"` para inspeccionarlo o usarlo en tests de navegador.
- Las definiciones son código puro: pruébalas sin navegador.
  ```bash
  npx tsx -e "import { execute } from './src/visualizations/core/engine.ts'; import { fenwickTree } from './src/visualizations/data_structures/fenwick_tree/visualization.ts'; console.dir(execute(fenwickTree, {}, 'prefix', { right: 4 }).steps, { depth: 4 })"
  ```

| Síntoma | Causa probable |
| --- | --- |
| «No hay una visualización registrada para «x»» | Falta `register` en `index.ts`, o el `type` de `metadata.yaml` no coincide con el `id`. |
| «…no tiene un dibujo registrado en renderers.ts» | Falta la entrada en `renderers.ts` o su clave no es el `id`. |
| «…no produjo ningún paso» | `run` devolvió `[]`: el algoritmo no emitió eventos o el grabador no llamó a `snapshot`. Devuelve al menos un paso. |
| «…produjo un paso no válido» | Falta `state` o `message` en algún paso. |
| Todos los pasos se ven iguales | El `snapshot` no copia los arreglos del estado. |
| «No se pudo dibujar este paso: …» | Excepción en el renderer (típico: leer una posición que no existe en el estado). Solo falla ese paso; los demás siguen. |
| «Los datos declarados… no son válidos» | Las opciones de `metadata.yaml` no pasan `parseInput`; se usan los valores por defecto. |
| No aparece en una referencia | No está declarada y ningún alias aparece como palabra completa en título, carpeta o etiquetas. |

## 7. Recetas para otros algoritmos

Para cada uno: qué eventos emitir, qué guardar en el estado y cómo dibujarlo. El contrato no cambia.

### DSU (implementada: [`data_structures/dsu/`](../src/visualizations/data_structures/dsu/))

- **Eventos**: `find:start`, `find:step`, `find:root`, `find:compress`, `union:start`, `union:same`, `union:link`.
- **Estado**: `{ parent, size, active, path, roots, changed }`.
- **Dibujo**: `layoutForest(parent)` recalcula el bosque en cada paso; la arista recién cambiada se resalta con `changed`.
- **Entrada**: número de elementos y lista de uniones iniciales (`0-1, 2-3`).

### Fenwick Tree (implementada: [`data_structures/fenwick_tree/`](../src/visualizations/data_structures/fenwick_tree/))

Ver el [tutorial](#3-tutorial-crear-una-visualización-fenwick-tree). Una idea de dibujo alternativa: nodos como árbol donde el padre de `i` es `i + lowbit(i)` (usa `layoutForest`).

### Recorridos de grafos (DFS / BFS)

- **Carpeta**: `src/visualizations/graphs/traversal/`.
- **Entrada**: `{ n, edges: [number, number][], directed }`; campo de texto `0-1, 0-2, 1-3` y un campo `start`.
- **Eventos**: `visit { node, from }`, `edge:tree { from, to }`, `edge:skip { from, to }`, `push`/`pop` (pila o cola), `finish { node }`.
- **Estado**:
  ```ts
  type TraversalState = { status: ('new' | 'frontier' | 'done')[]; active?: number; frontier: number[]; order: number[]; treeEdges: [number, number][]; edge?: [number, number] };
  ```
- **Dibujo**: nodos en círculo; aristas del árbol con `visited`; debajo, la pila o cola como `viz-array`.
- **Operaciones**: `dfs` y `bfs` en la misma definición comparten estado y renderer.

### Dijkstra

- **Carpeta**: `src/visualizations/graphs/dijkstra/`.
- **Entrada**: aristas con peso `0-1:4, 0-2:1` y nodo origen.
- **Eventos**: `extract { node, dist }`, `relax { from, to, weight, old, new }`, `relax:skip { from, to }`, `stale { node }` (entrada obsoleta de la cola), `done`.
- **Estado**: `{ dist: (number | null)[]; parent: number[]; settled: number[]; queue: [number, number][]; active?: number; edge?: [number, number] }` (`null` = ∞).
- **Dibujo**: grafo con el peso en cada arista, la distancia junto a cada nodo, y una tabla con `dist[]` y la cola de prioridad. Aristas del árbol de caminos mínimos (`parent`) con `visited`.

### Árbol de expansión mínima (Kruskal)

Reutiliza la clase `DSU` de `data_structures/dsu/algorithm.ts` dentro de tu algoritmo. Eventos `edge:consider`, `edge:take`, `edge:reject`; estado `{ taken: number[]; rejected: number[]; current?: number; total: number }` sobre la lista de aristas ordenada.

### Programación dinámica

- **Carpeta**: `src/visualizations/dynamic_programming/<problema>/`.
- **Eventos**: `cell:start { i, j }`, `cell:read { i, j, from: [i', j'] }`, `cell:write { i, j, value }`, `answer { i, j }`, y `path { cells }` para reconstruir la solución.
- **Estado**: `{ table: (number | null)[][]; active?: [number, number]; reads: [number, number][]; path: [number, number][] }`.
- **Dibujo**: cuadrícula SVG o una `<table>`; la celda activa con `active`, las celdas de las que depende con `visited`, y flechas `<line>` de cada lectura a la celda activa. Muestra la recurrencia en `message`.

### Búsqueda binaria

Eventos `probe { lo, hi, mid, value }`, `go:left`, `go:right`, `found`/`missing`. Estado `{ array, lo, hi, mid }`. Dibujo: `viz-array` con `in-range` para `[lo, hi]` y `active` para `mid`.

### Sparse Table

Eventos `build:cell { level, i, value, from: [a, b] }` y `query { level, left, right }`. Estado `{ table: (number | null)[][]; active?: [number, number]; reads: [number, number][] }`. Dibujo: una fila por nivel, con cada celda cubriendo `2^nivel` columnas (como las barras del Fenwick).

### Recursión

Emite `call { id, parent, args }` y `return { id, value }`. Estado `{ parent: number[]; labels: string[]; status: ('running' | 'done')[]; active?: number }`. Dibujo: `layoutForest(parent)` da el árbol de llamadas directamente.

## 8. Pruebas

Las definiciones no usan el navegador, así que se prueban con `node:test` en [`tests/visualizations.test.ts`](../tests/visualizations.test.ts):

```ts
import { execute } from '../src/visualizations/core/engine.js';
import { FenwickTree } from '../src/visualizations/data_structures/fenwick_tree/algorithm.js';
import { fenwickTree } from '../src/visualizations/data_structures/fenwick_tree/visualization.js';

test('Fenwick Tree: algoritmo y pasos', () => {
  // 1. El algoritmo, sin visualización.
  assert.equal(new FenwickTree([5, 8, 6, 3]).range(1, 2), 14);
  // 2. Los pasos: el último contiene el resultado.
  const { steps } = execute(fenwickTree, { values: '5, 8, 6, 3' }, 'prefix', { right: 2 });
  assert.match(steps.at(-1)!.result!, /19/);
  // 3. Datos inválidos.
  assert.throws(() => execute(fenwickTree, { values: '1, x' }), /enteros/);
});
```

Ya hay un test que recorre **todas** las visualizaciones registradas y comprueba que tienen dibujo, que cada operación se ejecuta con los valores por defecto y que los pasos son instantáneas distintas; la tuya queda cubierta al registrarla (actualiza la lista de identificadores esperados).

```bash
npm run typecheck   # tipos
npm test            # unitarias
npm run test:e2e    # navegador: abre la galería y avanza un paso en cada visualización
```

## 9. Lista de comprobación

- [ ] Carpeta propia con `algorithm.ts`, `visualization.ts`, `renderer.tsx` (y `renderer.css`, `README.md`).
- [ ] El algoritmo funciona sin `trace` y no importa nada de la interfaz.
- [ ] `run` devuelve instantáneas independientes, con `message` en cada paso.
- [ ] `parseInput` valida y limita el tamaño; los parámetros usan `integerParam`.
- [ ] El renderer solo lee `step.state`.
- [ ] Registrada en `index.ts` y en `renderers.ts` con el mismo identificador.
- [ ] Probada en la galería, con datos válidos e inválidos, en tema claro y oscuro.
- [ ] Tests añadidos; `npm run typecheck` y `npm test` pasan.
