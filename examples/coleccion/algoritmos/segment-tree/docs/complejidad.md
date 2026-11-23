# Análisis

- **Construcción:** cada uno de los $\le 2n - 1$ nodos se calcula una vez: $O(n)$.
- **Consulta:** en cada nivel se visitan como máximo 4 nodos, y hay $\lceil \log_2 n \rceil + 1$ niveles: $O(\log n)$.
- **Actualización:** se recorre un único camino raíz–hoja: $O(\log n)$.
- **Memoria:** $4n$ enteros.
