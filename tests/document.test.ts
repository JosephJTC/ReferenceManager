import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { LibraryIndexer } from '../src/core/indexer.js';
import { NodeFsProvider } from '../src/node/node-provider.js';
import { buildDocumentModel, highlightedLines } from '../src/core/documents/model.js';
import { documentHtml } from '../src/core/documents/html.js';
import { defaultDocumentSettings, compactDocumentSettings, isWithin } from '../src/shared/document.js';

async function fixture(action: (service: LibraryIndexer, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'document-test-'));
  try {
    await fs.mkdir(path.join(root, 'categoría', 'sub', 'algoritmo'), { recursive: true });
    await fs.writeFile(path.join(root, 'categoría', 'sub', 'algoritmo', 'code.cpp'), '/* comentario\nmultilínea */\nint límite = 2;\n');
    await fs.writeFile(path.join(root, 'categoría', 'sub', 'algoritmo', 'notes.md'), '# Explicación\n\nA < B & C.\n\n<script>alert(1)</script>');
    await fs.writeFile(path.join(root, 'categoría', 'sub', 'algoritmo', 'metadata.yaml'), 'title: "Árbol & límites"\nsubtitle: "Una implementación"\ncomplexity: {time: O(n)}\ncustom: {nivel: personal}\ntags: [grafos]');
    await fs.writeFile(path.join(root, 'code.py'), 'print("raíz")');
    await action(new LibraryIndexer(new NodeFsProvider(root)), root);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
test('compone jerarquía arbitraria, referencia raíz, subtítulos y metadatos seleccionados', async () => {
  await fixture(async service => {
    const references = (await service.scan()).references;
    const model = await buildDocumentModel(service, { selected: references.map(reference => reference.path), settings: { ...defaultDocumentSettings, metadataKeys: ['complexity'] } });
    const html = model.blocks.map(block => block.html).join('');
    assert.match(html, /2\.1\.1 Árbol &amp; límites/);
    assert.match(html, /Una implementación/);
    assert.match(html, /Complejidad/);
    assert.match(html, /Tiempo: O\(n\)/);
    assert.doesNotMatch(html, /Información personalizada/);
    assert.doesNotMatch(html, /alert\(1\)/);
    assert.match(html, /code\.py/);
    assert.match(html, /Explicación/);
  });
});
test('respeta exclusiones de notas, código, subtítulos y metadatos', async () => {
  await fixture(async service => {
    const model = await buildDocumentModel(service, { selected: ['categoría/sub/algoritmo'], settings: { ...compactDocumentSettings, notes: false, code: false, subtitles: false, metadataKeys: [] } });
    const html = model.blocks.map(block => block.html).join('');
    assert.doesNotMatch(html, /code-line|Explicación|Una implementación|Complejidad/);
    assert.match(documentHtml(model), /grid-template-columns:repeat\(2/);
    assert.match(documentHtml(model), /default-src 'none'/);
  });
});
test('rechaza selección inexistente, vacía y configuración fuera de límites', async () => {
  await fixture(async service => {
    await assert.rejects(buildDocumentModel(service, { selected: ['ausente'], settings: defaultDocumentSettings }), /ya no existe/);
    await assert.rejects(buildDocumentModel(service, { selected: [], settings: defaultDocumentSettings }), /no son válidas/);
    await assert.rejects(buildDocumentModel(service, { selected: [''], settings: { ...defaultDocumentSettings, margin: 100 } }), /no son válidas/);
  });
});
test('resaltado conserva texto y etiquetas equilibradas en comentarios multilínea', () => {
  const source = '/* primera\nsegunda */\nconst char* s = "<&>";\n';
  const lines = highlightedLines(source, 'code.cpp', true);
  assert.equal(lines.length, 4);
  for (const line of lines) assert.equal((line.match(/<span/g) || []).length, (line.match(/<\/span>/g) || []).length);
  assert.match(lines[1], /hljs-comment/);
  assert.match(lines[2], /&lt;&amp;&gt;/);
  assert.deepEqual(highlightedLines('<script>', 'code.cpp', false), ['&lt;script&gt;']);
});
test('la selección por carpeta respeta límites de nombres y separadores de Windows', () => {
  assert.ok(isWithin('temas\\grafos\\dsu', 'temas/grafos'));
  assert.ok(isWithin('temas', ''));
  assert.ok(!isWithin('temas/grafos-extra', 'temas/grafos'));
});
test('limita la cantidad de bloques antes de componer un documento desmesurado', async () => {
  await fixture(async (service, root) => {
    const folder = 'categoría/sub/algoritmo';
    await fs.writeFile(path.join(root, 'categoría', 'sub', 'algoritmo', 'code.cpp'), '\n'.repeat(60001));
    await assert.rejects(buildDocumentModel(service, { selected: [folder], settings: { ...defaultDocumentSettings, notes: false, highlighting: false } }), /demasiadas líneas/);
  });
});
