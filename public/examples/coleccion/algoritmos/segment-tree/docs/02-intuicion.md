# Intuición

Dividimos el arreglo por la mitad recursivamente. Cada nodo representa un intervalo $[lo, hi]$ y guarda la combinación de sus dos hijos:

$$
t[v] = t[2v] \oplus t[2v+1]
$$

Cualquier intervalo $[l, r]$ se puede escribir como la unión disjunta de $O(\log n)$ nodos del árbol, así que basta combinar esos valores precalculados.
