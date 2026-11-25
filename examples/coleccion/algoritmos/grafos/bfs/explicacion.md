# BFS

El **recorrido en anchura** visita un grafo por niveles: primero el origen, luego sus vecinos, luego los vecinos de esos, y así. Una **cola** garantiza ese orden.

1. `distance[source] = 0` y se mete el origen en la cola.
2. Mientras la cola no esté vacía, se saca el frente `u` y, para cada vecino `v` sin distancia, `distance[v] = distance[u] + 1` y `v` entra al final de la cola.

En un grafo no ponderado, `distance[v]` es el menor número de aristas entre el origen y `v`; los nodos no alcanzables quedan en $-1$. Cada nodo entra una vez a la cola y cada arista se revisa una vez por extremo: $O(n + m)$.
