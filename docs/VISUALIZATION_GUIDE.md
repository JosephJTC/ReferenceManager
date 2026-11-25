# Guía de visualizaciones

ReferenceManager tiene un **motor** de visualizaciones, pero ninguna visualización propia: cada referencia trae la suya en un archivo `<nombre>.viz.js` junto a su código. Esta guía explica el formato de ese archivo y cómo funciona el motor.

- [1. Arquitectura](#1-arquitectura)
- [2. Dónde va el archivo](#2-dónde-va-el-archivo)
- [3. El contrato](#3-el-contrato)
- [4. Tutorial: Fenwick Tree](#4-tutorial-fenwick-tree)
- [5. Dibujo](#5-dibujo)
- [6. Animación y reproductor](#6-animación-y-reproductor)
- [7. Impresión](#7-impresión)
- [8. Depuración](#8-depuración)
- [9. Recetas para otros algoritmos](#9-recetas-para-otros-algoritmos)
- [10. Pruebas](#10-pruebas)
- [11. Seguridad](#11-seguridad)
- [12. Lista de comprobación](#12-lista-de-comprobación)

## 1. Arquitectura

```text
Referencia (tu biblioteca)              ReferenceManager (esta aplicación)
algoritmos/fenwick-tree/                src/visualizations/
├── fenwick_tree.cpp                    ├── core/
├── explicacion.md                      │   ├── types.ts              ← contrato que cumple el .viz.js
├── metadata.yaml   ← título y datos    │   ├── engine.ts             ← validación, ejecución, reproductor
├── fenwick-tree.viz.js ← algoritmo,    │   ├── utils.ts              ← utilidades `viz` (h, arrayCells, layoutForest…)
│                     pasos y dibujo    │   ├── sandbox-client.ts     ← crea el iframe aislado y habla con él
└── fenwick-tree.viz.css (opcional)     │   ├── VisualizationHost.tsx ← formulario, reproductor, explicación, leyenda
                                        │   └── player.tsx
                                        └── sandbox/
                                            ├── runtime.ts            ← corre dentro del iframe (viz-sandbox.html)
                                            └── styles.ts             ← clases de estado comunes
```

Flujo de datos:

```text
fenwick-tree.viz.js                                   motor
algoritmo ──eventos──▶ run(): eventos → pasos ──▶ reproductor, explicación, leyenda
                       render(paso) → SVG     ◀── «dibuja el paso i»
```

1. **El algoritmo** es una clase o función normal escrita dentro del archivo. Si recibe una función `trace`, avisa con un **evento** de cada cosa que hace (`{ type: 'prefix:take', node: 6, value: 9 }`).
2. **`run`** ejecuta el algoritmo, escucha los eventos y guarda una **instantánea del estado** por cada uno: eso es un **paso**, con su explicación.
3. **`render`** recibe un paso y devuelve el SVG. No calcula nada del algoritmo.
4. **El motor** dibuja el formulario a partir de la definición, llama a `run`, valida los pasos y maneja el reproductor, el teclado, la explicación, la leyenda, los errores y la impresión.

Retroceder es gratis: todos los pasos están calculados y cada uno es una instantánea completa; ir al paso anterior es dibujar `steps[i - 1]`.

## 2. Dónde va el archivo

- En la **carpeta de la referencia, junto al código**: `algoritmos/fenwick-tree/fenwick-tree.viz.js`.
- La extensión `.viz.js` (o `.viz.mjs`) lo distingue del código: no aparece en la pestaña Código, no cuenta como lenguaje de la referencia y no entra en la búsqueda. En modo Edición se ve y se edita como cualquier archivo.
- Estilos propios opcionales: `<mismo nombre>.viz.css`.
- Una referencia puede tener varias visualizaciones; cada archivo `.viz.js` es una.

`metadata.yaml` es opcional y elige el título, el orden y los datos iniciales:

```yaml
visualizations:
  - file: fenwick-tree.viz.js      # o «type: fenwick-tree», equivalente a fenwick-tree.viz.js
    title: Fenwick Tree paso a paso
    values: [3, 2, -1, 6, 5, 4, -3, 3]   # todo lo demás se pasa a inputFromSpec
```

- Sin `visualizations`, se muestran todos los `.viz.js` de la referencia con sus valores por defecto.
- `visualizations: false` las oculta.
- Si declaras `files:` en `metadata.yaml`, los `.viz.js` y `.viz.css` de la carpeta se incluyen igualmente.

## 3. El contrato

El archivo es un módulo ES sin compilación ni `import`. Exporta por defecto una función que recibe `viz` (las utilidades del motor) y devuelve la definición:

```js
export default function (viz) {
  return { title, inputs, operations, parseInput, run, render /* , opcionales */ };
}
```

Tipos completos en [`src/visualizations/core/types.ts`](../src/visualizations/core/types.ts).

| Miembro | ¿Obligatorio? | Para qué |
| --- | --- | --- |
| `title` | Sí | Nombre de la visualización. |
| `description` | No | Texto bajo el título. |
| `inputs: Field[]` | Sí (puede ser `[]`) | Campos de los datos iniciales (arreglo, tamaño…). |
| `operations: Operation[]` | Sí, al menos una | Acciones ejecutables y sus parámetros. La primera se ejecuta al abrir. |
| `parseInput(values)` | Sí | Convierte y valida el formulario. Lanza `Error` con un mensaje claro. |
| `run(input, operation, params)` | Sí | Ejecuta el algoritmo y devuelve los pasos (al menos uno). |
| `render(step, context)` | Sí | Devuelve el SVG del paso (texto o resultado de `viz.h`). |
| `legend` | No | `{ state, label }[]`; `state` es la clase CSS del color. |
| `inputFromSpec(options)` | No | Traduce las opciones de `metadata.yaml` a valores del formulario. Sin ella, las opciones se usan tal cual por nombre de campo. |
| `commit(input, operation, params)` | No | Valores del formulario tras conservar una operación con `commitLabel`. |
| `print` | No | `{ operation: 'id' }` elige qué operación se imprime; `false` no imprime. |

```ts
type Field = { name: string; label: string; ariaLabel?: string; kind: 'text' | 'integer' | 'select'; default: string | number; options?: { value: string; label: string }[] };
type Operation = { id: string; label: string; fields: Field[]; commitLabel?: string };
type Step = { state: unknown; message: string; event?: { type: string; ... }; result?: string };
type RenderContext = { previous?: Step; next?: Step; index: number; total: number; input: unknown; operation: string; durationMs: number; theme: 'dark' | 'light'; print: boolean };
```

Los campos `integer` vacíos o no enteros se rechazan antes de llamar a `run`. El estado de cada paso es tuyo: el motor solo exige `state` y `message`. Ejemplos reales:

```jsonc
// Segment Tree
{ "values": [null, 39, 22, 17], "array": [5, 8, 6, 3], "active": 5, "visited": [1, 2], "partial": [5], "skipped": [4], "highlight": [2, 5], "result": 9 }
// Fenwick Tree
{ "array": [3, 2, -1, 6], "tree": [0, 3, 5, -1, 10], "active": 4, "used": [4], "highlight": [0, 3] }
// DSU: un bosque
{ "parent": [0, 0, 0, 2], "size": [4, 1, 2, 1], "active": 2, "path": [3, 2], "roots": [], "changed": null }
```

### Utilidades `viz`

| Utilidad | Para qué |
| --- | --- |
| `` viz.h`<svg>…${valor}…</svg>` `` | Plantilla segura: escapa cada valor interpolado; listas y otros `h` se insertan tal cual. |
| `viz.raw(texto)` | Inserta texto sin escapar dentro de `h`. |
| `viz.escape(texto)` | Escapa `& < > " '`. |
| `viz.parseIntegers(texto, { max })` | `"1, 2 3"` → `[1, 2, 3]`; error legible si algo no es entero o hay más de `max`. |
| `viz.integerParam(params, nombre, etiqueta, min, max)` | Lee un parámetro entero y comprueba su rango. |
| `viz.interval(lo, hi)` | `[3]` o `[2, 5]`. |
| `viz.numbersToText(opción)` | `values: [1, 2]` de `metadata.yaml` → `"1, 2"` para un campo de texto. |
| `viz.arrayCells(valores, { x, y, cell, className, label })` | Fila de celdas SVG para un arreglo. |
| `viz.layoutForest(parent)` | Posiciones `{ positions, width, height }` de un bosque dado como arreglo de padres. |

## 4. Tutorial: Fenwick Tree

El código completo está en la referencia de ejemplo [`examples/coleccion/algoritmos/fenwick-tree/fenwick-tree.viz.js`](../examples/coleccion/algoritmos/fenwick-tree/fenwick-tree.viz.js). Los mismos pasos sirven para cualquier otra.

### Paso 1. Crea el archivo junto al código

```text
algoritmos/fenwick-tree/
├── fenwick_tree.cpp
└── fenwick-tree.viz.js
```

```js
export default function (viz) {
  const { h, interval, parseIntegers, integerParam, numbersToText, arrayCells } = viz;
  const lowbit = i => i & -i;
  const coverage = node => [node - lowbit(node), node - 1];   // posiciones 0..n-1 que cubre el nodo
  // … pasos 2 a 4 …
}
```

### Paso 2. El algoritmo y sus eventos

Escribe el algoritmo como en un concurso y añade un `this.trace?.(…)` en cada punto que quieras mostrar. Los eventos llevan **datos** (qué nodo, qué valor), no textos ni colores.

```js
class FenwickTree {
  constructor(array, trace) { /* construye y emite build:start, build:set, build:push, build:end */ }
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
}
```

Sin `trace`, la clase es un Fenwick Tree normal.

### Paso 3. Eventos → pasos

Un grabador mantiene un estado, lo actualiza con cada evento y guarda **una copia** como paso:

```js
function record(array, tree, play) {
  const state = { array: [...array], tree, active: undefined, used: [], highlight: null };
  const steps = [];
  const snapshot = (message, event, result) =>
    steps.push({ state: { ...state, array: [...state.array], tree: [...state.tree], used: [...state.used] }, message, event, result });
  play(event => {
    switch (event.type) {
      case 'prefix:start': state.used = []; state.highlight = [0, event.right];
        return snapshot(`Suma del prefijo ${interval(0, event.right)}: se empieza en el nodo ${event.right + 1}.`, event);
      case 'prefix:take': state.active = event.node; state.used.push(event.node);
        return snapshot(`Nodo ${event.node} cubre ${interval(...coverage(event.node))}: aporta ${event.value}.`, event, `Acumulado: ${event.accumulated}`);
      // …
    }
  });
  return steps;
}
```

> **Copia los arreglos en `snapshot`.** Si todos los pasos comparten el mismo arreglo, todos muestran el estado final y «Paso anterior» parece no hacer nada.

### Paso 4. La definición

```js
return {
  title: 'Fenwick Tree (BIT)',
  description: 'Sumas de prefijo y actualizaciones puntuales saltando con lowbit(i) = i & −i.',
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
  parseInput: values => ({ array: parseIntegers(values.values, { max: 16 }) }),
  inputFromSpec: options => ({ values: numbersToText(options.values) }),
  run({ array }, operation, params) {
    const n = array.length;
    if (operation === 'build') return record(array, new Array(n + 1).fill(null), trace => { new FenwickTree(array, trace); });
    const tree = new FenwickTree(array);          // se construye sin grabar…
    return record(array, [...tree.tree], trace => {
      tree.trace = trace;                         // …y solo se graba la operación pedida
      if (operation === 'prefix') tree.prefix(integerParam(params, 'right', 'r', 0, n - 1));
      else tree.add(integerParam(params, 'index', 'La posición', 0, n - 1), integerParam(params, 'delta', 'La cantidad', -1e9, 1e9));
    });
  },
  commit({ array }, operation, params) {
    const next = [...array];
    if (operation === 'add') next[Number(params.index)] += Number(params.delta);
    return { values: next.join(', ') };
  },
  render(step) { /* paso 5 */ }
};
```

Valida en `parseInput` y con `integerParam`. Cualquier `Error` que lances se muestra como aviso y la vista sigue funcionando. Limita el tamaño: un dibujo con 500 nodos no enseña nada.

### Paso 5. El dibujo

```js
render({ state }) {
  const { array, tree, active, used, highlight } = state;
  const n = array.length, cell = 56, row = 46;
  const levels = Math.floor(Math.log2(Math.max(1, n))) + 1;
  const bars = array.map((_, index) => {
    const node = index + 1, [lo, hi] = coverage(node);
    const x = lo * cell + 3, y = (levels - 1 - Math.log2(lowbit(node))) * row + 4, w = (hi - lo + 1) * cell - 6;
    return h`<g class="viz-node ${active === node ? 'active' : used.includes(node) ? 'used' : ''}">
      <rect x="${x}" y="${y}" width="${w}" height="${row - 10}" rx="6"/>
      <text x="${x + w - cell / 2 + 3}" y="${y + 15}" class="viz-value">${tree[node] ?? '·'}</text>
      <text x="${x + w - cell / 2 + 3}" y="${y + 29}" class="viz-caption">t[${node}]</text></g>`;
  });
  const inRange = i => highlight && i >= highlight[0] && i <= highlight[1];
  const cells = arrayCells(array, { y: levels * row + 6, cell, className: i => inRange(i) ? 'range' : '' });
  return h`<svg viewBox="0 0 ${n * cell} ${levels * row + 54}" style="max-width:${n * cell * 1.25}px" role="img" aria-label="Fenwick Tree">${bars}${cells}</svg>`;
}
```

### Paso 6. Declárala y pruébala

1. Opcional: añade la entrada en `metadata.yaml` (sección 2).
2. Abre la referencia en modo Lectura → pestaña **Visualización**.
3. Ejecuta cada operación, avanza y retrocede, escribe datos inválidos y comprueba el aviso. Prueba los temas claro y oscuro.
4. En una carpeta local, edita el `.viz.js` en modo Edición; al guardar y volver a Lectura se recarga.

## 5. Dibujo

`render` devuelve **un único `<svg>`** con `viewBox`. El motor lo escala al ancho disponible; limita el tamaño máximo con `style="max-width:…px"`. Dibuja las aristas antes que los nodos para que queden debajo.

| Estructura | Cómo colocar los nodos |
| --- | --- |
| Árbol binario sobre un arreglo | Hojas en columnas consecutivas y cada nodo centrado sobre su intervalo (ver `segment-tree.viz.js`). |
| Bosque / árbol general (arreglo de padres) | `viz.layoutForest(parent)`. |
| Arreglo | `viz.arrayCells(valores, { y, cell })`. |
| Matriz / tabla de DP | `x = columna * cell`, `y = fila * cell`. |
| Grafo | Coordenadas en la entrada, o en círculo: `x = cx + R·cos(2πi/n)`, `y = cy + R·sin(2πi/n)`. |

### Clases de estado

Definidas en [`sandbox/styles.ts`](../src/visualizations/sandbox/styles.ts); funcionan en temas claro y oscuro y en la impresión:

| Clase | Dónde | Significado habitual |
| --- | --- | --- |
| `viz-node` | `<g>` con `rect` o `circle` | Nodo. |
| `viz-cell` | `<g>` con `rect` | Celda de arreglo (`arrayCells`). |
| `viz-edge` | `<line>` | Arista; `visited` la resalta, `changed` la marca con trazos. |
| `viz-value`, `viz-caption` | `<text>` | Valor en negrita; etiqueta pequeña. |
| `active` | nodo o celda | Elemento que se procesa en este paso. |
| `visited` | nodo o arista | Ya recorrido. |
| `used` | nodo | Aportó al resultado o fue modificado. |
| `skipped` | nodo | Descartado (se atenúa). |
| `range` | celda | Posiciones afectadas. |

Variables para tus propios estilos en `<nombre>.viz.css`: `--viz-node`, `--viz-stroke`, `--viz-text`, `--viz-muted`, `--viz-accent`, `--viz-active`, `--viz-visited`, `--viz-used`, `--viz-range` y sus `-stroke`. La leyenda usa las mismas clases: `legend: [{ state: 'active', label: 'Nodo actual' }]`.

## 6. Animación y reproductor

El reproductor es del motor; no hay que programarlo.

| Control | Teclado (con el foco en la visualización o en el dibujo) |
| --- | --- |
| Paso siguiente / anterior | `→` / `←` |
| Reproducir / pausar | `Espacio` |
| Reiniciar | `Inicio` |
| Barra de progreso, velocidad (0.5×, 1×, 2×, 4×) | — |

- Un paso dura `900 ms / velocidad`. `context.durationMs` da el valor actual y la variable CSS `--viz-step-ms` está disponible para transiciones (`transition: fill calc(var(--viz-step-ms) * .25)`).
- `context.previous` y `context.next` permiten marcar diferencias, por ejemplo la celda que cambió: `context.previous?.state.tree[i] !== step.state.tree[i]`.
- Un evento = un paso. Si la animación va demasiado rápida o lenta, emite más o menos eventos, o ignora algunos en el grabador (un `case` sin `snapshot`).
- Al pulsar **Ejecutar** se recalculan los pasos y el reproductor vuelve al paso 1.

## 7. Impresión

El generador de documentos incluye cada visualización como imagen: ejecuta la operación de impresión (la primera, o la de `print: { operation }`) con los datos de `metadata.yaml` y dibuja su **último paso** con `context.print = true` y tema claro. Tus estilos `.viz.css` se incrustan en la imagen. `print: false` la excluye; la opción «Visualizaciones» del generador las excluye todas.

## 8. Depuración

- **«Datos del paso (depuración)»**, bajo cada visualización, muestra el evento y el estado del paso actual en JSON.
- Los errores aparecen con el nombre del archivo:

| Mensaje | Causa probable |
| --- | --- |
| «…debe exportar por defecto una función» | Falta `export default function (viz) { … }`. |
| «La definición necesita la función «render»» (o `title`, `run`…) | Falta un miembro obligatorio. |
| «…no produjo ningún paso» | `run` devolvió `[]`: el algoritmo no emitió eventos o el grabador no llamó a `snapshot`. |
| «…produjo un paso no válido» | Falta `state` o `message` en algún paso. |
| Todos los pasos se ven iguales | `snapshot` no copia los arreglos del estado. |
| «No se pudo dibujar este paso: …» | Excepción en `render`. Solo falla ese paso. |
| «…tardó demasiado en responder» | Bucle infinito o cálculo muy largo (límite: 10 s). |
| «Los datos de metadata.yaml no son válidos…» | Las opciones no pasan `parseInput`; se usan los valores por defecto. |
| «El dibujo no es un SVG válido, así que no se puede imprimir» | `render` devolvió HTML o XML mal formado. |

- Los archivos `.viz.js` son módulos normales: puedes probarlos sin navegador (sección 10).

## 9. Recetas para otros algoritmos

El contrato no cambia; cambian los eventos, el estado y el dibujo.

| Algoritmo | Eventos | Estado | Dibujo |
| --- | --- | --- | --- |
| DSU (ejemplo: `algoritmos/dsu/dsu.viz.js`) | `find:start`, `find:step`, `find:root`, `find:compress`, `union:start`, `union:same`, `union:link` | `{ parent, size, active, path, roots, changed }` | `layoutForest(parent)` y `arrayCells(parent)` |
| BFS (ejemplo: `algoritmos/grafos/bfs/bfs.viz.js`) | `start`, `pop`, `discover`, `skip`, `done`, `end` | `{ distance[], status[], queue[], active, edge, tree[] }` | Nodos en círculo, árbol BFS resaltado y la cola con `arrayCells` |
| DFS | `visit { node, from }`, `edge:tree`, `edge:skip`, `push`, `pop`, `finish` | `{ status[], active, frontier[], order[], treeEdges[] }` | Nodos en círculo; la pila o cola con `arrayCells` |
| Dijkstra | `extract { node, dist }`, `relax { from, to, old, new }`, `relax:skip`, `stale` | `{ dist[], parent[], settled[], queue[], active, edge }` | Peso en cada arista, distancia junto a cada nodo |
| Kruskal | `edge:consider`, `edge:take`, `edge:reject` | `{ taken[], rejected[], current, total }` | Grafo con las aristas tomadas resaltadas; reutiliza una clase DSU dentro del archivo |
| Programación dinámica | `cell:start { i, j }`, `cell:read { from }`, `cell:write { value }`, `path { cells }` | `{ table[][], active, reads[], path[] }` | Cuadrícula; flechas `<line>` desde cada lectura; la recurrencia en `message` |
| Búsqueda binaria | `probe { lo, hi, mid }`, `go:left`, `go:right`, `found` | `{ array, lo, hi, mid }` | `arrayCells` con `range` en `[lo, hi]` y `active` en `mid` |
| Sparse Table | `build:cell { level, i, from }`, `query { level, left, right }` | `{ table[][], active, reads[] }` | Una fila por nivel; cada celda cubre `2^nivel` columnas |
| Recursión | `call { id, parent, args }`, `return { id, value }` | `{ parent[], labels[], status[], active }` | `layoutForest(parent)` da el árbol de llamadas |

## 10. Pruebas

Los archivos `.viz.js` no usan el navegador, así que el motor los prueba con `node:test` en [`tests/visualizations.test.ts`](../tests/visualizations.test.ts):

```ts
const fenwick = loadDefinition(await import(pathToFileURL('examples/coleccion/algoritmos/fenwick-tree/fenwick-tree.viz.js').href));
const { steps } = execute(fenwick, { values: '5, 8, 6, 3' }, 'prefix', { right: 2 });
assert.match(steps.at(-1).result, /19/);
assert.throws(() => execute(fenwick, { values: '1, x' }), /enteros/);
```

Un test recorre todas las visualizaciones de los ejemplos y comprueba que cada operación se ejecuta con los valores por defecto y que cada paso produce un SVG. Para tus propias bibliotecas puedes copiar ese patrón.

```bash
npm run typecheck && npm test   # motor y ejemplos
npm run test:e2e                # navegador: iframe aislado, reproductor, errores e impresión
```

## 11. Seguridad

El `.viz.js` es código de la biblioteca, que puede venir de un repositorio de GitHub. Por eso se ejecuta en `viz-sandbox.html`, un iframe con `sandbox="allow-scripts"` sin `allow-same-origin`:

- Tiene un origen opaco: no puede leer IndexedDB, el almacenamiento ni los tokens de la aplicación, ni el DOM de la página.
- Su CSP es `default-src 'none'`: no puede hacer peticiones de red ni cargar recursos externos.
- No puede abrir ventanas ni navegar la página principal.
- Solo se comunica con el motor por un `MessagePort` privado; recibe el código, las opciones y las órdenes, y devuelve pasos y tamaños.
- En los documentos, el SVG se incrusta como `<img>`, donde no puede ejecutar scripts.

## 12. Lista de comprobación

- [ ] `<nombre>.viz.js` en la carpeta de la referencia, junto al código.
- [ ] `export default function (viz) { return { … }; }` con `title`, `inputs`, `operations`, `parseInput`, `run` y `render`.
- [ ] El algoritmo funciona sin `trace`.
- [ ] `run` devuelve instantáneas independientes, con `message` en cada paso.
- [ ] `parseInput` valida y limita el tamaño; los parámetros usan `integerParam`.
- [ ] `render` solo lee el paso y devuelve un `<svg>` con `viewBox`, construido con `viz.h`.
- [ ] Datos iniciales y título en `metadata.yaml`, si hacen falta.
- [ ] Probada en Lectura con datos válidos e inválidos, en tema claro y oscuro, y en el generador de documentos.
