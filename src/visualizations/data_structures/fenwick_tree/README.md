# Fenwick Tree (BIT)

Identificador: `fenwick-tree`. Es el ejemplo que sigue paso a paso [`docs/VISUALIZATION_GUIDE.md`](../../../../docs/VISUALIZATION_GUIDE.md).

| Archivo | Qué contiene |
| --- | --- |
| `algorithm.ts` | Clase `FenwickTree` (`prefix`, `range`, `add`) y eventos `FenwickEvent`. |
| `visualization.ts` | Definición `fenwickTree`: formulario, operaciones y traducción evento → paso (`record`). |
| `renderer.tsx` | Dibuja cada nodo como una barra sobre las posiciones que cubre. |
| `renderer.css` | Alineación del arreglo con el diagrama. |

```yaml
visualizations:
  - type: fenwick-tree
    values: [3, 2, -1, 6, 5, 4, -3, 3]   # máximo 16 enteros
```

Estado de un paso (`tree[0]` no se usa):

```json
{ "array": [3, 2, -1, 6], "tree": [null, 3, 5, -1, 10], "active": 4, "used": [2], "highlight": [0, 3] }
```
