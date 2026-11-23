# Introducción

Un **Segment Tree** responde consultas sobre intervalos de un arreglo —suma, mínimo, máximo, gcd— y admite actualizaciones puntuales, ambas en $O(\log n)$.

## Problema

Dado un arreglo $a_0, a_1, \dots, a_{n-1}$, responder $q$ operaciones de dos tipos:

| Operación | Significado |
|-----------|-------------|
| `query(l, r)` | $\sum_{i=l}^{r} a_i$ |
| `update(i, x)` | $a_i \leftarrow x$ |

Con un arreglo simple, una de las dos operaciones cuesta $O(n)$. Con sumas prefijas, la consulta es $O(1)$ pero la actualización es $O(n)$.
