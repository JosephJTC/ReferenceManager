import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LibraryIndexer } from '../src/core/indexer.js';
import { NodeFsProvider } from '../src/node/node-provider.js';
import { buildLibraryIndex, assignStableIdText, indexSchemaId, referenceId, stableIdPattern } from '../src/core/library-index.js';
import { parseMetadata } from '../src/core/indexer.js';
import Ajv from 'ajv/dist/2020.js';

async function fixture(files: Record<string, string>, action: (service: LibraryIndexer, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'indice-test-'));
  try {
    for (const [name, content] of Object.entries(files)) { const target = path.join(root, name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content); }
    await action(new LibraryIndexer(new NodeFsProvider(root)), root);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('el ID estable proviene de metadatos y el alternativo por ruta se marca inestable', async () => {
  await fixture({ 'a/metadata.yaml': 'id: dsu-principal\ntitle: DSU', 'a/code.cpp': 'int x;', 'b/code.py': 'x=1' }, async service => {
    const collection = await service.scan();
    const a = collection.references.find(ref => ref.path === 'a')!;
    const b = collection.references.find(ref => ref.path === 'b')!;
    assert.deepEqual(await referenceId(a), { id: 'dsu-principal', source: 'metadata', unstable: false });
    const fallback = await referenceId(b);
    assert.equal(fallback.source, 'path');
    assert.ok(fallback.id.startsWith('path:'));
    assert.ok(fallback.unstable);
    const index = await buildLibraryIndex(collection, { id: 'lib', name: 'Prueba', source: { kind: 'local-fs' } });
    assert.equal(index.schema, indexSchemaId);
    const ra = index.references.find(ref => ref.id === 'dsu-principal')!;
    assert.equal(ra.name, 'DSU');
    assert.equal(ra.files.find(file => file.role === 'metadata')?.path, 'a/metadata.yaml');
    assert.equal(index.references.find(ref => ref.path === 'b')?.idSource, 'path');
    assert.equal(index.references.find(ref => ref.path === 'b')?.unstable, true);
  });
});

test('el índice resultante cumple su esquema JSON', async () => {
  await fixture({ 'a/metadata.yaml': 'id: ref-1\ntitle: T\ncategory: Cat\nplatform: Web\nurl: https://ejemplo.test\ntags: [x]', 'a/code.cpp': 'int x;' }, async service => {
    const index = await buildLibraryIndex(await service.scan(), { id: 'lib', name: 'Prueba', source: { kind: 'github', url: 'https://github.com/o/r', branch: 'main', commit: 'abc' } });
    const schema = JSON.parse(await fs.readFile('docs/library-index.schema.json', 'utf8'));
    const validate = new Ajv().compile(schema);
    assert.ok(validate(index), JSON.stringify(validate.errors));
    const ref = index.references[0];
    assert.equal(ref.category, 'Cat');
    assert.equal(ref.platform, 'Web');
    assert.equal(ref.url, 'https://ejemplo.test');
  });
});

test('assignStableIdText inserta id conservando comentarios y formato', () => {
  const original = '# Comentario personal\nschema_version: 1\ntitle: DSU\ncustom: {nivel: 2}\n';
  const { content, changed } = assignStableIdText(original, 'abc-123');
  assert.ok(changed);
  assert.match(content, /# Comentario personal/);
  assert.match(content, /id: "abc-123"/);
  const idLine = content.split('\n').findIndex(line => line.startsWith('id:'));
  const titleLine = content.split('\n').findIndex(line => line.startsWith('title:'));
  assert.ok(idLine >= 0 && idLine < titleLine);
  assert.equal(parseMetadata(content).metadata.id, 'abc-123');
  assert.deepEqual(parseMetadata(content).metadata.custom, { nivel: 2 });
  const again = assignStableIdText(content, 'otro-id');
  assert.equal(again.changed, false);
  assert.equal(assignStableIdText('', 'nuevo').content.includes('id: "nuevo"'), true);
  assert.ok(stableIdPattern.test('abc-123'));
  assert.throws(() => assignStableIdText('title: [', 'x'), /Corrige/);
});
