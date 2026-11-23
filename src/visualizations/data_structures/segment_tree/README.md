# Segment Tree

Identificador: `segment-tree`. Es la implementación de referencia de la arquitectura; la guía general está en [`docs/VISUALIZATION_GUIDE.md`](../../../../docs/VISUALIZATION_GUIDE.md).

| Archivo | Qué contiene | Edítalo para… |
| --- | --- | --- |
| `algorithm.ts` | Clase `SegmentTree` (construcción, `query`, `update`) y sus eventos `SegmentEvent`. No importa nada de la interfaz. | cambiar el algoritmo o emitir eventos nuevos |
| `visualization.ts` | Definición `segmentTree`: campos del formulario, operaciones, traducción evento → paso (`recorder`), geometría (`segmentLayout`) y SVG de impresión. | cambiar textos, qué se resalta en cada paso, validaciones o posiciones de los nodos |
| `renderer.tsx` | Componente React que dibuja un `SegmentState`. | cambiar cómo se dibujan nodos, aristas y el arreglo |
| `renderer.css` | Estilos propios. | colores, tamaños y transiciones |

## Uso en una referencia

```yaml
visualizations:
  - type: segment-tree
    title: Segment Tree de mínimos
    values: [5, 8, 6, 3, 2, 7, 2, 6]   # máximo 16 enteros
    operation: min                      # sum | min | max
```

Sin el campo `visualizations`, se activa sola si el título, la carpeta o las etiquetas contienen «segment tree», «segtree» o «árbol de segmentos».

## Estado de un paso

```json
{
  "values": [null, 39, 22, 17],
  "array": [5, 8, 6, 3, 2, 7, 2, 6],
  "active": 2,
  "visited": [1, 2],
  "partial": [],
  "skipped": [],
  "highlight": [0, 3]
}
```

`values[i]` es el valor del nodo `i` (raíz = 1, hijos `2i` y `2i+1`).
