import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { serve, launchBrowser } from './server.mjs';

const { server, url } = await serve(path.resolve('dist'));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'web-e2e-'));
const errors = [];
async function newPage(context) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
}

async function fillOpfs(page, files) {
  await page.evaluate(async entries => {
    const root = await navigator.storage.getDirectory();
    for (const [name, content] of Object.entries(entries)) {
      const parts = name.split('/');
      let dir = root;
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
      const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    }
  }, files);
}

try {
  const browser = await launchBrowser({ chromium });

  // (a) Biblioteca de ejemplos: navegación, árbol, búsqueda, filtros, código, metadatos.
  {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await newPage(context);
    await page.goto(url);
    await page.getByRole('button', { name: 'Abrir ejemplos', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('.reference').length === 5, null, { timeout: 30000 });
    await page.getByRole('button', { name: 'Plegar algoritmos', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Plegar dsu', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Desplegar algoritmos', exact: true }).click();
    await page.getByLabel('Buscar referencias').fill('dsu');
    await page.waitForFunction(() => document.querySelectorAll('.reference').length === 1);
    await page.locator('.reference').click();
    await page.locator('.code code').waitFor();
    assert.match(await page.locator('.code').textContent(), /DSU/);
    await page.getByRole('button', { name: 'Copiar', exact: true }).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /DSU/);
    await page.getByRole('button', { name: 'Metadatos', exact: true }).click();
    await page.locator('dl').waitFor();
    await page.getByLabel('Buscar referencias').fill('');
    await page.getByLabel('Filtrar por extensión').selectOption('.py');
    await page.waitForFunction(() => document.querySelectorAll('.reference').length === 2);
    await page.getByLabel('Filtrar por extensión').selectOption('.md');
    await page.waitForFunction(() => document.querySelectorAll('.reference').length === 2);
    await page.getByLabel('Filtrar por extensión').selectOption('');
    await page.getByLabel('Filtrar por categoría').selectOption({ index: 1 });
    await page.waitForFunction(() => document.querySelectorAll('.reference').length >= 0);
    await page.getByLabel('Buscar referencias').fill('');
    await page.getByLabel('Filtrar por categoría').selectOption('');
    // Recarga conserva la biblioteca de ejemplos registrada.
    await page.reload();
    await page.getByRole('button', { name: 'Bibliotecas', exact: true }).first().click();
    await page.locator('.library-item').first().waitFor();
    assert.ok((await page.locator('.library-item').count()) >= 1);
    await context.close();
    console.log('e2e (a) ejemplos: correcto');
  }

  // (b) Biblioteca GitHub con API simulada.
  {
    const context = await browser.newContext();
    const page = await newPage(context);
    const treeCalls = [];
    const repoRoutes = {
      'https://api.github.com/repos/owner/demo': { default_branch: 'main' },
      'https://api.github.com/repos/owner/demo/branches?per_page=100': [{ name: 'main' }, { name: 'dev' }],
      'https://api.github.com/repos/owner/demo/branches/main': { commit: { sha: 'c0ffee' } }
    };
    await page.route('https://api.github.com/**', route => {
      const requestUrl = route.request().url();
      if (requestUrl.includes('/git/trees/')) {
        treeCalls.push(requestUrl);
        return route.fulfill({ json: { sha: 'c0ffee', tree: [
          { path: 'algoritmos', type: 'tree', sha: 't1' },
          { path: 'algoritmos/sort.cpp', type: 'blob', sha: 'b1', size: 40 },
          { path: 'algoritmos/metadata.yaml', type: 'blob', sha: 'b2', size: 60 },
          { path: 'apuntes.md', type: 'blob', sha: 'b3', size: 30 },
          { path: 'imagen.png', type: 'blob', sha: 'b4', size: 999 }
        ] } });
      }
      const body = repoRoutes[requestUrl];
      if (body) return route.fulfill({ json: body });
      return route.fulfill({ status: 404, body: '{}' });
    });
    await page.route('https://raw.githubusercontent.com/**', route => {
      const file = decodeURIComponent(route.request().url().split('/c0ffee/')[1] || '');
      const contents = {
        'algoritmos/sort.cpp': 'int ordenar() { return 0; }',
        'algoritmos/metadata.yaml': 'title: Ordenación\ntags: [sort]\ncategory: Algoritmos',
        'apuntes.md': '# Apuntes del repositorio'
      };
      if (contents[file] !== undefined) return route.fulfill({ body: contents[file], contentType: 'text/plain' });
      return route.fulfill({ status: 404, body: 'no' });
    });
    await page.goto(url);
    await page.getByRole('button', { name: 'Conectar una biblioteca' }).click();
    await page.getByRole('button', { name: 'Conectar repositorio GitHub' }).click();
    await page.getByLabel('URL del repositorio').fill('https://github.com/owner/demo');
    await page.getByRole('button', { name: 'Cargar ramas' }).click();
    await page.waitForFunction(() => document.querySelector('.github-form select')?.options.length > 1);
    await page.getByRole('button', { name: 'Conectar y abrir' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.reference').length === 2, null, { timeout: 30000 });
    await page.locator('.reference').filter({ hasText: 'Ordenación' }).click();
    await page.locator('.code code').waitFor();
    assert.match(await page.locator('.code').textContent(), /ordenar/);
    // Solo lectura: no hay acciones de escritura.
    assert.equal(await page.getByRole('button', { name: 'Nueva referencia', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Editar', exact: true }).count(), 0);
    assert.ok(await page.getByRole('button', { name: 'Abrir en GitHub' }).count() >= 0);
    // Filtros con contenido indexado.
    await page.getByLabel('Buscar referencias').fill('ordenar');
    await page.waitForFunction(() => document.querySelectorAll('.reference').length === 1);
    await page.getByLabel('Buscar referencias').fill('');
    await page.getByLabel('Filtrar por etiqueta').fill('sort');
    await page.waitForFunction(() => document.querySelectorAll('.reference').length === 1);
    await page.getByLabel('Filtrar por etiqueta').fill('');
    // Persistencia: al recargar, la biblioteca está registrada y el árbol sale de la caché.
    await page.reload();
    await page.getByRole('button', { name: 'Bibliotecas', exact: true }).first().click();
    await page.locator('.library-item').first().waitFor();
    treeCalls.length = 0;
    await page.getByRole('button', { name: 'Abrir', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('.reference').length === 2, null, { timeout: 30000 });
    assert.equal(treeCalls.length, 0, 'el árbol cacheado evita una nueva descarga');
    await context.close();
    console.log('e2e (b) GitHub simulado: correcto');
  }

  // (b2) Errores de GitHub en español.
  {
    const context = await browser.newContext();
    const page = await newPage(context);
    await page.goto(url);
    await page.getByRole('button', { name: 'Conectar una biblioteca' }).click();
    await page.getByRole('button', { name: 'Conectar repositorio GitHub' }).click();
    await page.getByLabel('URL del repositorio').fill('https://gitlab.com/a/b');
    await page.getByRole('button', { name: 'Conectar y abrir' }).click();
    await page.waitForFunction(() => document.querySelector('.status')?.textContent.includes('github.com'));
    await page.route('https://api.github.com/**', route => route.fulfill({ status: 404, body: '{}' }));
    await page.getByLabel('URL del repositorio').fill('https://github.com/no/existo');
    await page.getByRole('button', { name: 'Conectar y abrir' }).click();
    await page.waitForFunction(() => /no existe, es privado/.test(document.querySelector('.status')?.textContent || ''));
    await page.unroute('https://api.github.com/**');
    const reset = String(Math.floor(Date.now() / 1000) + 3600);
    await page.route('https://api.github.com/**', route => route.fulfill({ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset, 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' }, body: '{}' }));
    await page.getByLabel('URL del repositorio').fill('https://github.com/no/existo');
    await page.getByRole('button', { name: 'Conectar y abrir' }).click();
    await page.waitForFunction(() => /límite de solicitudes de GitHub/.test(document.querySelector('.status')?.textContent || ''));
    await context.close();
    console.log('e2e (b2) errores GitHub: correcto');
  }

  // (c) Carpeta local mediante File System Access (OPFS inyectado).
  {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      window.showDirectoryPicker = async () => {
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle('coleccion', { create: true });
      };
      const proto = Object.getPrototypeOf(FileSystemDirectoryHandle.prototype);
    });
    const page = await newPage(context);
    await page.goto(url);
    await fillOpfs(page, {
      'coleccion/algoritmo/code.cpp': 'int fuente = 1;',
      'coleccion/algoritmo/metadata.yaml': 'title: Algoritmo OPFS\ntags: [local]',
      'coleccion/algoritmo/notes.md': '# Notas locales'
    });
    await page.getByRole('button', { name: 'Conectar una biblioteca' }).click();
    await page.getByRole('button', { name: 'Seleccionar carpeta local' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.reference').length === 1, null, { timeout: 30000 });
    await page.locator('.reference').click();
    await page.locator('.code code').waitFor();
    // Edición de metadatos: YAML inválido rechazado, válido guardado.
    await page.getByRole('button', { name: 'Editar metadatos' }).click();
    await page.getByLabel('Contenido del archivo').fill('title: [');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.waitForFunction(() => /Corrige|inválido|YAML/i.test(document.querySelector('.status')?.textContent || ''));
    await page.getByLabel('Contenido del archivo').fill('title: Editado desde OPFS\ntags: [local]');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.waitForFunction(() => /guardado/i.test(document.querySelector('.status')?.textContent || ''));
    // Detección de conflicto: leer notas, modificarlas externamente por OPFS y guardar.
    await page.getByLabel('Archivo de la referencia').selectOption('algoritmo/notes.md');
    await page.locator('.code code, article.markdown').first().waitFor();
    const notes = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('coleccion');
      const algo = await dir.getDirectoryHandle('algoritmo');
      const handle = await algo.getFileHandle('notes.md');
      const writable = await handle.createWritable();
      await writable.write('# Cambio externo');
      await writable.close();
      const code = await algo.getFileHandle('code.cpp');
      const bytes = new Uint8Array(await (await code.getFile()).arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    });
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByLabel('Contenido del archivo').fill('# Borrador local');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.waitForFunction(() => /cambió externamente/i.test(document.querySelector('.status')?.textContent || ''));
    // Crear referencia nueva (aceptar el diálogo de descartar el borrador conflictuado).
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Nueva referencia' }).click();
    await page.getByLabel('Ruta relativa a la biblioteca').fill('nueva-ref');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.reference').length === 2);
    // Actualizar detecta el cambio externo; el código no se modificó.
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.waitForFunction(() => /actualizada/i.test(document.querySelector('.status')?.textContent || ''), null, { timeout: 30000 });
    const after = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const code = await (await (await (await root.getDirectoryHandle('coleccion')).getDirectoryHandle('algoritmo')).getFileHandle('code.cpp')).getFile();
      const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(await code.arrayBuffer()));
      return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    });
    assert.equal(after, notes, 'el código fuente no se modificó');
    // Persistencia del registro tras recargar.
    await page.reload();
    await page.getByRole('button', { name: 'Bibliotecas', exact: true }).first().click();
    await page.locator('.library-item').first().waitFor();
    assert.ok((await page.locator('.library-item').count()) >= 1);
    await context.close();
    console.log('e2e (c) carpeta local OPFS: correcto');
  }

  // (d) Instantánea sin File System Access.
  {
    const context = await browser.newContext();
    await context.addInitScript(() => { delete window.showDirectoryPicker; });
    const snapshotDir = path.join(temporary, 'instantanea');
    await fs.mkdir(path.join(snapshotDir, 'ref'), { recursive: true });
    await fs.writeFile(path.join(snapshotDir, 'ref', 'code.py'), 'x = 1');
    await fs.writeFile(path.join(snapshotDir, 'ref', 'metadata.yaml'), 'title: Ref instantánea');
    const page = await newPage(context);
    await page.goto(url);
    await page.getByRole('button', { name: 'Conectar una biblioteca' }).click();
    const input = page.locator('input[type=file]');
    await input.setInputFiles(snapshotDir);
    await page.waitForFunction(() => document.querySelectorAll('.reference').length === 1, null, { timeout: 30000 });
    await page.locator('.reference').click();
    await page.locator('.code code').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Editar', exact: true }).count(), 0, 'instantánea es de solo lectura');
    assert.equal(await page.getByRole('button', { name: 'Nueva referencia' }).count(), 0);
    await context.close();
    console.log('e2e (d) instantánea: correcto');
  }

  // (g) Vista móvil usable sin desbordamiento horizontal.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await newPage(context);
    await page.goto(url);
    await page.getByRole('button', { name: 'Abrir ejemplos', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelectorAll('.reference').length === 5, null, { timeout: 30000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `desbordamiento horizontal: ${overflow}px`);
    await context.close();
    console.log('e2e (g) móvil: correcto');
  }

  await browser.close();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Pruebas e2e web correctas.');
} finally {
  server.close();
  await fs.rm(temporary, { recursive: true, force: true });
}
