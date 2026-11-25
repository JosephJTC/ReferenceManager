# DSU

Un **Disjoint Set Union** mantiene una partición de $\{0, \dots, n-1\}$ en conjuntos disjuntos. Cada conjunto es un árbol: cada elemento apunta a su padre y la raíz representa al conjunto.

- **buscar(x)** sube por los padres hasta la raíz. Con **compresión de caminos**, todos los nodos recorridos pasan a colgar directamente de la raíz.
- **unir(a, b)** busca ambas raíces y cuelga la del conjunto más pequeño de la del más grande (**unión por tamaño**), así la altura nunca pasa de $\log_2 n$.

Con ambas técnicas, cada operación cuesta $O(\alpha(n))$ amortizado, donde $\alpha$ es la inversa de la función de Ackermann ($\le 4$ en la práctica).
