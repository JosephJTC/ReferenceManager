import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { serve, launchBrowser } from './server.mjs';

const { server, url } = await serve(path.resolve('dist'));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-e2e-'));

const longCode = 'const char* texto = "áéíóú ñ < > &";\n'
  + Array.from({ length: 700 }, (_, index) => `int marcador_${String(index).padStart(4, '0')} = ${index};`).join('\n')
  + '\nconst char* linea_extensa = "' + 'abcdefghijklmnop'.repeat(450) + '";\nint FIN_DEL_CODIGO = 1;';
const longNotes = '# Observaciones\n\nÁrboles, límites y análisis: O(n log n).\n\n'
  + 'Una explicación extensa con acentos y símbolos < & >. **FUERTE** y *ÉNFASIS*. '.repeat(120);

function githubRoutes(page, files) {
  const tree = [];
  const directories = new Set();
  for (const file of Object.keys(files)) {
    const parts = file.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join('/');
      if (!directories.has(dir)) { directories.add(dir); tree.push({ path: dir, type: 'tree', sha: 'd' + depth }); }
    }
    tree.push({ path: file, type: 'blob', sha: 'sha-' + file, size: files[file].length });
  }
  const routes = {
    'https://api.github.com/repos/owner/docs': { default_branch: 'main' },
    'https://api.github.com/repos/owner/docs/branches?per_page=100': [{ name: 'main' }],
    'https://api.github.com/repos/owner/docs/branches/main': { commit: { sha: 'f00d' } }
  };
  return page.route('https://api.github.com/**', route => {
    const requestUrl = route.request().url();
    if (requestUrl.includes('/git/trees/')) return route.fulfill({ json: { sha: 'f00d', tree } });
    const body = routes[requestUrl];
    if (body) return route.fulfill({ json: body });
    return route.fulfill({ status: 404, body: '{}' });
  });
}

function rawRoutes(page, files) {
  return page.route('https://raw.githubusercontent.com/**', route => {
    const file = decodeURIComponent(route.request().url().split('/f00d/')[1] || '');
    return route.fulfill({ body: files[file] ?? '', contentType: 'text/plain' });
  });
}

async function connectDocs(page) {
  await page.goto(url);
  await page.getByRole('button', { name: 'Conectar una biblioteca' }).click();
  await page.getByRole('button', { name: 'Conectar repositorio GitHub' }).click();
  await page.getByLabel('URL del repositorio').fill('https://github.com/owner/docs');
  await page.getByRole('button', { name: 'Conectar y abrir' }).click();
}

try {
  const browser = await launchBrowser({ chromium: (await import('playwright')).chromium });

  // (e) Vista previa paginada, TOC, líneas largas, tamaños de papel y PDF real.
  {
    const context = await browser.newContext();
    const docFiles = {
      'material especial/Árbol & límites/largo.cpp': longCode,
      'material especial/Árbol & límites/notes.md': longNotes,
      'material especial/Árbol & límites/metadata.yaml': 'title: "Árbol & límites"\nsubtitle: "Código extenso"\ncomplexity: {time: O(n)}',
      'base/code.py': 'print("raíz")'
    };
    await githubRoutes(context, docFiles);
    await rawRoutes(context, docFiles);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await connectDocs(page);
    await page.waitForFunction(() => document.querySelectorAll('.home .reference').length === 2, null, { timeout: 30000 });
    await page.getByRole('button', { name: 'Generar documento', exact: true }).click();
    await page.getByRole('button', { name: 'Generar vista previa' }).click();
    await page.waitForFunction(() => document.querySelector('.document-preview iframe'), null, { timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('.preview-controls span')?.textContent.match(/de \d+/));
    const preview = await page.evaluate(() => ({
      pages: Number(document.querySelector('.preview-controls input')?.getAttribute('max')),
      sheets: (document.querySelector('.document-preview iframe')?.contentDocument?.querySelectorAll('.sheet') || []).length,
      codeLines: (document.querySelector('.document-preview iframe')?.contentDocument?.querySelectorAll('.code-line') || []).length,
      text: document.querySelector('.document-preview iframe')?.contentDocument?.body.textContent || '',
      sheetSize: (document.querySelector('.document-preview iframe')?.contentDocument?.querySelector('.sheet') || { getBoundingClientRect: () => ({ width: 0, height: 0 }) }).getBoundingClientRect()
    }));
    assert.equal(preview.sheets, preview.pages, 'las hojas paginadas coinciden con el total');
    assert.ok(preview.codeLines >= 700, `líneas de código en el documento: ${preview.codeLines}`);
    assert.match(preview.text, /áéíóú ñ/);
    assert.match(preview.text, /FIN_DEL_CODIGO/);
    // Advertencia de línea excepcionalmente larga.
    const warnings = await page.locator('.document-preview .warning').textContent().catch(() => '');
    // Índice con salto de página.
    await page.locator('.preview-index summary').click();
    const tocButtons = await page.locator('.preview-index button').count();
    assert.ok(tocButtons >= 2, 'el índice lista secciones');
    await page.locator('.preview-index button').nth(1).click();
    const visiblePage = await page.evaluate(() => Number(document.querySelector('.preview-controls input')?.value));
    assert.ok(visiblePage >= 1);
    // Tamaños de papel distintos producen hojas distintas.
    const a4 = preview.sheetSize;
    await page.getByLabel('Tamaño de papel').selectOption('A5');
    await page.getByRole('button', { name: 'Generar vista previa' }).click();
    await page.waitForFunction(previous => {
      const sheet = document.querySelector('.document-preview iframe')?.contentDocument?.querySelector('.sheet');
      return sheet && Math.abs(sheet.getBoundingClientRect().width - previous) > 50;
    }, a4.width, { timeout: 120000 });
    const a5 = await page.evaluate(() => document.querySelector('.document-preview iframe')?.contentDocument?.querySelector('.sheet')?.getBoundingClientRect());
    assert.ok(Math.abs(a5.width - a4.width) > 50, `A5 (${a5.width}) debe ser más estrecho que A4 (${a4.width})`);
    // PDF real: descargar HTML imprimible y comprobar páginas con pdfjs.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descargar HTML imprimible' }).click()
    ]);
    const htmlPath = path.join(temporary, 'documento.html');
    await download.saveAs(htmlPath);
    const pdfPage = await context.newPage();
    await pdfPage.goto('file:///' + htmlPath.replaceAll('\\', '/'));
    const pdfPath = path.join(temporary, 'documento.pdf');
    await pdfPage.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
    const loading = getDocument({ data: new Uint8Array(await fs.readFile(pdfPath)) });
    const pdf = await loading.promise;
    assert.equal(pdf.numPages, await page.evaluate(() => Number(document.querySelector('.preview-controls input')?.max)), 'el PDF impreso conserva la paginación de la vista previa');
    await loading.destroy();
    assert.equal(errors.length, 0, errors.join('\n'));
    await context.close();
    console.log('e2e (e) documento: correcto');
  }

  // (f) Colección grande (~2000 referencias) sigue respondiendo.
  {
    const context = await browser.newContext();
    const files = {};
    for (let index = 0; index < 2000; index++) {
      files[`tema/ref${String(index).padStart(4, '0')}/code.cpp`] = `int valor_${index} = ${index};`;
      files[`tema/ref${String(index).padStart(4, '0')}/metadata.yaml`] = `title: Referencia ${index}`;
    }
    const directories = new Set();
    const tree = [{ path: 'tema', type: 'tree', sha: 't0' }];
    for (const file of Object.keys(files)) {
      const dir = file.split('/').slice(0, -1).join('/');
      if (!directories.has(dir)) { directories.add(dir); tree.push({ path: dir, type: 'tree', sha: 'd' + dir.length }); }
      tree.push({ path: file, type: 'blob', sha: 's' + tree.length, size: files[file].length });
    }
    await context.route('https://api.github.com/**', route => {
      const requestUrl = route.request().url();
      if (requestUrl.includes('/git/trees/')) return route.fulfill({ json: { sha: 'f00d', tree } });
      if (requestUrl.endsWith('/branches/main')) return route.fulfill({ json: { commit: { sha: 'f00d' } } });
      return route.fulfill({ json: { default_branch: 'main' } });
    });
    await context.route('https://raw.githubusercontent.com/**', route => {
      const file = decodeURIComponent(route.request().url().split('/f00d/')[1] || '');
      return route.fulfill({ body: files[file] || 'x', contentType: 'text/plain' });
    });
    const page = await context.newPage();
    await connectDocs(page);
    const heartbeat = await page.evaluate(() => new Promise(resolve => {
      const marks = [];
      let last = performance.now();
      const timer = setInterval(() => { const now = performance.now(); marks.push(now - last); last = now; }, 50);
      setTimeout(() => { clearInterval(timer); resolve(Math.max(...marks)); }, 3000);
    }));
    await page.waitForFunction(() => document.querySelectorAll('.home .reference').length === 100, null, { timeout: 180000 });
    await page.getByLabel('Buscar referencias').fill('valor_1999');
    await page.waitForFunction(() => document.querySelectorAll('.sidebar .reference').length === 1);
    console.log(`e2e (f) 2000 referencias: correcto (latido máximo ${Math.round(heartbeat)} ms)`);
    await context.close();
  }

  await browser.close();
  console.log('Pruebas e2e de documento correctas.');
} finally {
  server.close();
  await fs.rm(temporary, { recursive: true, force: true });
}
