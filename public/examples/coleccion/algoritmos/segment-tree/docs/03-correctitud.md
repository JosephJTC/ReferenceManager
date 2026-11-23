# Correctitud

**Invariante:** después de construir o actualizar, cada nodo $v$ con intervalo $[lo, hi]$ cumple $t[v] = a_{lo} \oplus \dots \oplus a_{hi}$.

- En una hoja ($lo = hi$) el valor es $a_{lo}$.
- En un nodo interno, por inducción, los hijos cumplen el invariante y $\oplus$ es asociativa.

En la consulta, cada nodo devuelve la combinación de $[lo, hi] \cap [l, r]$: el neutro si no hay intersección, $t[v]$ si está contenido y la combinación de los hijos en otro caso.

## Errores comunes

- Reservar solo $2n$ posiciones: con la numeración $2v, 2v+1$ se necesitan hasta $4n$.
- Usar `int` para sumas que pueden superar $2^{31}$.
- Olvidar el elemento neutro correcto ($0$ para suma, $+\infty$ para mínimo).
