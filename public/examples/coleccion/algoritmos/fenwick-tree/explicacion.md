# Fenwick Tree

Un **Fenwick Tree** (o *Binary Indexed Tree*) guarda sumas parciales de un arreglo para responder sumas de prefijo y aplicar actualizaciones puntuales en $O(\log n)$, con solo $n + 1$ enteros de memoria.

## Idea

Con índices $1..n$, el nodo $i$ guarda la suma del bloque $(i - \operatorname{lowbit}(i),\, i]$, donde $\operatorname{lowbit}(i) = i \,\&\, (-i)$ es el bit menos significativo encendido.

| Nodo | Binario | lowbit | Cubre |
| --- | --- | --- | --- |
| 4 | 100 | 4 | 1..4 |
| 6 | 110 | 2 | 5..6 |
| 7 | 111 | 1 | 7 |

- **Prefijo** $[1, r]$: se suma `t[r]` y se salta a `r - lowbit(r)` hasta llegar a 0.
- **Actualización** de la posición $i$: se suma a `t[i]` y se salta a `i + lowbit(i)` mientras $i \le n$.

Cada salto quita o agrega un bit, así que hay como máximo $\lceil \log_2 n \rceil + 1$ saltos.

## Intervalos

$$\text{suma}(l, r) = \text{prefijo}(r) - \text{prefijo}(l - 1)$$
