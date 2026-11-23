# Disjoint Set Union

Identificador: `dsu`. Guía general: [`docs/VISUALIZATION_GUIDE.md`](../../../../docs/VISUALIZATION_GUIDE.md).

| Archivo | Qué contiene |
| --- | --- |
| `algorithm.ts` | Clase `DSU` (`find` con compresión de caminos, `union` por tamaño) y eventos `DsuEvent`. |
| `visualization.ts` | Definición `dsu`: formulario, operaciones y traducción evento → paso (`record`). |
| `renderer.tsx` | Dibuja el bosque con `layoutForest` (core/utils.ts) y el arreglo de padres. |
| `renderer.css` | Estilo de la arista recién cambiada. |

```yaml
visualizations:
  - type: dsu
    size: 8                                  # de 1 a 16 elementos
    unions: [[0, 1], [2, 3], [1, 3]]         # o el texto "0-1, 2-3, 1-3"
```

Estado de un paso:

```json
{ "parent": [0, 0, 0, 2], "size": [4, 1, 2, 1], "active": 2, "path": [3, 2], "roots": [], "changed": null }
```
