# Gestor de referencias de programación competitiva

Aplicación web estática, en español, para consultar y mantener algoritmos, soluciones y apuntes, y convertirlos en un documento imprimible. Funciona completamente en el navegador: tus archivos son la fuente de verdad, no se importan a un formato propietario ni se envían a servicios propios. Puede desplegarse en GitHub Pages (por ejemplo `https://<usuario>.github.io/ReferenceManager/`).

## 1. Qué puedes abrir

La aplicación organiza el contenido en **bibliotecas**. Desde la pestaña «Bibliotecas» puedes:

- **Conectar un repositorio de GitHub** (solo lectura): pega la URL (`https://github.com/owner/repo`, con o sin `/tree/rama/ruta`) o el formato `owner/repo`, elige la rama y, opcionalmente, una subcarpeta. Para repositorios privados añade un token de acceso: un fine-grained PAT limitado al repositorio con permiso `Contents: read-only`. El token se guarda solo en el IndexedDB de este navegador y nunca se incluye en URLs ni en el índice exportado.
- **Seleccionar una carpeta local** (lectura y escritura, en navegadores compatibles con File System Access: Chrome, Edge y derivados). Los cambios se guardan directamente en tus archivos.
- **Seleccionar una instantánea local** (solo lectura, en navegadores sin File System Access: Firefox, Safari, móviles). Es una copia temporal en memoria; no se conserva al recargar.
- **Abrir la colección de ejemplos** incluida en la aplicación (solo lectura).

Cada biblioteca se indexa por separado y su registro se conserva en el navegador (IndexedDB), de modo que al volver puedes reabrirla sin repetir la configuración.

## 2. Arquitectura

```text
manager/
├── src/core/          Lógica neutral: proveedor, indexador, índice TypeSpeed, documentos
│   └── documents/     Modelo, paginación y HTML imprimible
├── src/shared/        Contratos, formatos, búsqueda, validación y etiquetas
├── src/web/           Implementación del API para el navegador
│   └── providers/     GitHub, carpeta local, instantánea y ejemplos
├── src/renderer/      Interfaz React (árbol, búsqueda, documentos, bibliotecas)
├── src/node/          Proveedor de archivos para pruebas y el CLI de índice
├── examples/coleccion/  Referencias de ejemplo (se copian a public/ al compilar)
├── docs/              Esquema JSON del índice de biblioteca
└── tests/             Pruebas unitarias, e2e en navegador y comprobación en vivo
```

- **Interfaz (`src/renderer`)**: React 19 + TypeScript. Conserva el explorador de carpetas, la búsqueda con filtros (texto, lenguaje, extensión, categoría, etiqueta), el visor con resaltado de sintaxis, la vista de metadatos y el espacio «Generar documento». Las acciones de escritura se ocultan cuando la biblioteca activa es de solo lectura.
- **Bibliotecas (`src/web/libraries.ts`)**: registro en IndexedDB con nombre, tipo, ubicación, rama, estado y fecha de la última indexación. Eliminar una conexión nunca borra archivos: solo el registro y sus cachés.
- **Proveedores (`src/web/providers`)**: todos implementan el mismo contrato (`list`, `read`, y opcionalmente `write`, `mkdir`, `rename`, `externalUrl`) y declaran sus capacidades (`write`, `rename`, `watch`, `refresh`). El indexador no sabe de dónde vienen los bytes.
- **Indexación (`src/core/indexer.ts`)**: recorre la lista del proveedor, valida rutas, omite binarios y archivos mayores de 2 MiB sin descargarlos, lee `metadata.yaml`/`.yml`, calcula SHA-256 y cachea por firma de versión. Se ejecuta en un *web worker* (`src/web/library.worker.ts`) para no bloquear la interfaz; la búsqueda y la composición de documentos también corren ahí.
- **Búsqueda (`src/shared/search.ts`)**: misma lógica de siempre (acentos insensibles, código, notas, títulos y etiquetas) más filtros por extensión, categoría (metadato `category` o primer segmento de la ruta), etiqueta, lenguaje y carpeta.
- **Lector GitHub (`src/web/providers/github.ts`)**: API pública sin credenciales o, si la biblioteca tiene token, con `Authorization: Bearer`. Resuelve la rama a un commit fijo, lista el árbol recursivo (con alternativa por carpetas si viene truncado) y lee archivos por `raw.githubusercontent.com` anclados al commit (con token, por `GET /repos/{owner}/{repo}/git/blobs/{sha}`). La caché del árbol y de los blobs se guarda en IndexedDB por sha, así que recargar no vuelve a descargar. Los errores se traducen: repositorio inexistente o privado, límite de peticiones con hora de restablecimiento, sin conexión, URL inválida.
- **Acceso local (`src/web/providers/localfs.ts`)**: File System Access API. El permiso se guarda en IndexedDB; tras recargar puede pedirse «Conceder acceso» (el navegador exige un gesto del usuario). El guardado comprueba que el archivo no cambió desde la lectura (conflicto) y conserva BOM y fin de línea CRLF. Si el navegador implementa `FileSystemObserver`, la biblioteca se marca «con cambios» para actualizar manualmente.
- **Referencias y metadatos**: una referencia es una carpeta con código y/o notas; `metadata.yaml` (o `.yml`) describe título, etiquetas y campos libres. Se conservan comentarios y campos desconocidos al guardar.
- **Documentos (`src/core/documents`)**: el modelo selecciona referencias y genera un HTML imprimible paginado en una vista previa dentro de un `<iframe>` aislado (sin scripts). «Exportar PDF» abre el diálogo de impresión del navegador (elige «Guardar como PDF», márgenes «Ninguno», sin encabezados); también puedes descargar el HTML imprimible.
- **Persistencia (`src/web/idb.ts`)**: IndexedDB guarda el registro de bibliotecas, los identificadores de carpeta, la caché de GitHub y las preferencias (biblioteca activa, selección para practicar).

## 3. Conservado, adaptado y nuevo

| Conservado | Adaptado | Nuevo |
|---|---|---|
| Explorador, búsqueda, resaltado, metadatos, documento paginado | «Abrir externamente» → «Abrir en GitHub» / «Descargar archivo»; «Mostrar carpeta» → «Copiar ruta» | Bibliotecas múltiples con registro persistente |
| Límites (2 MiB texto, 256 KiB metadatos, 100 000 elementos), omisión de binarios | Exportar PDF mediante impresión del navegador en lugar de `printToPDF` | Lector de repositorios públicos de GitHub con caché |
| Detección de conflictos, BOM y CRLF, YAML como texto | Escaneo/búsqueda en web worker en lugar de worker de Electron | Filtros por extensión y categoría |
| Semántica de indexación, creación, renombrado y complementos | Instantánea de solo lectura donde no hay File System Access | IDs estables, «seleccionar para practicar» e índice TypeSpeed exportable |

Las acciones exclusivas de escritorio desaparecieron (no hay ventana propia, ni menús, ni PDF interno); el resto del flujo es el mismo.

## 4. Desarrollo local

Requisitos: Node.js 22 o posterior (verificado con Node 26) y npm.

```powershell
cd manager
npm ci
npm run dev        # http://localhost:5173
npm run build      # sitio estático en dist/
npm run preview    # sirve dist/ localmente
```

## 5. Despliegue en GitHub Pages

1. Crea un repositorio en GitHub y sube el contenido de `manager/` a la rama `main` (el repositorio puede llamarse, por ejemplo, `ReferenceManager`).
2. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
3. El flujo `.github/workflows/deploy.yml` se ejecuta al hacer push a `main`: instala dependencias, corre las pruebas unitarias, compila y publica `dist/`.
4. La aplicación queda en `https://<usuario>.github.io/<repositorio>/`. El sitio usa rutas relativas (`base: './'`), así que funciona bajo cualquier subruta; `public/404.html` redirige a la página principal si alguien entra a una ruta inexistente.

## 6. Conectar un repositorio de GitHub

- En «Bibliotecas → Conectar repositorio GitHub» pega la URL o `owner/repo`. Se aceptan URLs como `https://github.com/owner/repo/tree/rama/carpeta`: se detectan la rama y la subcarpeta.
- Solo lectura: la aplicación nunca escribe en GitHub ni pide credenciales.
- **Límites de la API pública**: sin autenticación GitHub permite unas 60 peticiones por hora por IP. El árbol y los blobs se guardan en caché para no repetir descargas; «Actualizar» solo consulta si el commit cambió. Si se agota el límite verás la hora de restablecimiento.
- Repositorios privados aparecen como «inexistente o privado» (GitHub responde 404 en ambos casos).

## 7. Carpeta local: permisos y persistencia

- En Chrome/Edge usa «Seleccionar carpeta local». El navegador pedirá permiso de lectura y escritura; concédelo si quieres editar.
- El identificador de la carpeta se conserva en IndexedDB, pero el navegador puede revocar el permiso entre sesiones: en ese caso la biblioteca queda en «requiere permiso» y aparece el botón «Conceder acceso».
- En Firefox, Safari y móviles no existe File System Access: «Seleccionar carpeta» crea una **instantánea de solo lectura** que no sobrevive a la recarga (hay que volver a elegir la carpeta). Los archivos editados se pueden descargar.
- Renombrar dentro de la biblioteca usa `FileSystemHandle.move`; si el navegador no lo implementa, la acción se deshabilita con una explicación.

## 8. Referencias y metadatos

Una referencia es una carpeta; se reconocen archivos de código (`.cpp`, `.cc`, `.c`, `.h`, `.hpp`, `.py`, `.java`, `.js`, `.ts`, `.rs`, `.go`, `.cs`, `.kt`, `.rb`, `.swift`), notas (`.md`, `.txt`) y metadatos (`metadata.yaml` o `metadata.yml`). Solo se pueden editar `.md`, `.yaml` y `.yml`; el código fuente es de solo lectura.

Campos habituales de `metadata.yaml` (todos opcionales salvo que se indique):

```yaml
id: b3f1c8a2-...            # ID estable para el índice (se puede asignar desde la app)
title: Unión por rangos     # nombre visible
category: estructuras       # categoría; si falta, se usa la primera carpeta
subtitle: DSU clásico
description: Breve resumen
tags: [dsu, estructuras]
complexity: { time: "O(α(n))", memory: "O(n)" }
platform: CSES              # juez/plataforma de origen
url: https://cses.fi/...    # enlace al problema o fuente
```

Campos personalizados adicionales se conservan y aparecen en la vista de metadatos y en el índice exportado.

## 9. Índice TypeSpeed

La aplicación puede exportar `referencemanager.library.json`, un índice estable de la biblioteca pensado para herramientas de práctica (por ejemplo TypeSpeed). El esquema está en `docs/library-index.schema.json` (`referencemanager.library-index/v1`): lista referencias con ID, ruta, archivos (rol, lenguaje, tamaño, SHA-256) y la selección «para practicar».

- El **ID estable** proviene del campo `id` de `metadata.yaml`. Si falta, se deriva de la ruta (marcado como inestable). «Asignar ID estable» inserta el campo en el YAML sin reformatearlo; «Asignar IDs faltantes» lo hace en lote previa confirmación.
- «Exportar índice de biblioteca» descarga el JSON; en carpetas con escritura también puede guardarse en la raíz.
- Desde la línea de comandos, `npm run index -- <carpeta> [--out archivo]` genera el mismo índice sin abrir el navegador (por ejemplo para cometerlo en un repositorio).

## 10. Pruebas

```powershell
npm test           # unitarias en Node (colección, documentos, GitHub simulado, índice, almacén)
npm run test:e2e   # compila y ejecuta e2e en navegador real (ejemplos, GitHub simulado,
                   # carpeta local OPFS, instantánea, documento/PDF, 2000 referencias, móvil)
npm run test:live  # comprobación opcional contra github.com/octocat/Hello-World
npm run typecheck  # TypeScript sin emitir
```

Las pruebas e2e sirven `dist/` bajo una subruta (`/ReferenceManager/`) para simular GitHub Pages y usan un navegador real (Edge, Chrome o el Chromium incluido en Playwright). Todas las rutas de `api.github.com` en las pruebas son simuladas; solo `test:live` sale a internet.

## 11. Limitaciones conocidas

- Sin token de GitHub: solo repositorios públicos y 60 peticiones/hora por IP (los repositorios muy grandes pueden agotarlo en la primera indexación). Con token el límite es el de la cuenta (5000/hora). El token no se puede cambiar desde la interfaz: elimina la conexión y vuelve a crearla.
- Las instantáneas son de solo lectura y no persisten al recargar.
- «Exportar PDF» depende del diálogo de impresión del navegador; hay que elegir «Guardar como PDF».
- La detección de cambios automática (`FileSystemObserver`) solo existe en algunos navegadores; en los demás se actualiza manualmente con «Actualizar».
- Los archivos de más de 2 MiB y los binarios no se indexan ni descargan (aparecen omitidos).
- El índice del documento y la selección para practicar viven en el navegador: limpiar los datos del sitio los borra.
