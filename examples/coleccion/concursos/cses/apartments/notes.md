# Apartments

Ordena las solicitudes y los departamentos. Avanza el puntero del elemento que ya no puede participar en un emparejamiento válido.

## Casos borde

- Ningún departamento compatible.
- Tolerancia igual a cero.
- Solicitudes repetidas.

La solución es greedy: usar el menor departamento compatible no perjudica a las solicitudes restantes.
