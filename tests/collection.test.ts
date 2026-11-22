import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { LibraryIndexer, parseMetadata } from '../src/core/indexer.js';
import { NodeFsProvider } from '../src/node/node-provider.js';
import { searchReferences, referenceCategory } from '../src/shared/search.js';

async function fixture(files: Record<string, string>, action: (service: LibraryIndexer, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'referencias-test-'));
  try {
    for (const [name, content] of Object.entries(files)) { const target = path.join(root, name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content); }
    await action(new LibraryIndexer(new NodeFsProvider(root)), root);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
test('descubre estructura plana, archivos múltiples y carpeta vacía sin exigir nombres', async () => {
  await fixture({ 'one.cpp': 'int answer;', 'two.py': 'answer = 42', 'metadata.yaml': 'title: Raíz\ntags: [práctica]', 'vacia/.keep': '' }, async service => {
    const result = await service.scan();
    assert.equal(result.references.length, 1);
    assert.equal(result.references[0].title, 'Raíz');
    assert.equal(result.references[0].code.length, 2);
    assert.ok(result.entries.some(entry => entry.directory && entry.name === 'vacia'));
  });
});
test('descubre jerarquías arbitrarias, referencias padre e hijas y notas sin código', async () => {
  await fixture({ 'tema/code.rs': 'fn main() {}', 'tema/sub/otro/main.java': 'class Main {}', 'ideas/notes.md': '# Ideas', 'sin-meta/bfs.py': 'queue = []' }, async service => {
    const result = await service.scan();
    assert.equal(result.references.length, 4);
    assert.equal(result.references.find(ref => ref.path === 'tema')?.code.length, 1);
    assert.equal(result.references.find(ref => ref.path === 'ideas')?.code.length, 0);
    assert.ok(result.references.every(ref => !ref.hasMetadata));
  });
});
test('valida YAML y conserva campos personalizados sin exigir campos opcionales', () => {
  const valid = parseMetadata('title: Árbol\ncustom:\n  dificultad_personal: 7');
  assert.equal(valid.metadata.title, 'Árbol');
  assert.deepEqual(valid.metadata.custom, { dificultad_personal: 7 });
  assert.deepEqual(parseMetadata('').warnings, []);
  for (const content of ['title: [', 'tags: texto', 'title: uno\ntitle: dos', 'schema_version: 99', 'custom: &self {next: *self}']) assert.ok(parseMetadata(content).warnings.length);
});
test('metadatos inválidos y archivos declarados ausentes no bloquean el escaneo', async () => {
  await fixture({ 'a/metadata.yaml': 'title: [', 'a/code.cpp': 'int x;', 'b/metadata.yaml': 'files: [no.cpp, ../../outside.cpp]', 'b/main.py': 'x = 1' }, async service => {
    const result = await service.scan();
    assert.equal(result.references.length, 2);
    assert.ok(result.references.every(ref => ref.warnings.length));
    assert.equal(result.references.find(ref => ref.path === 'a')?.code.length, 1);
  });
});
test('busca por código, notas, título, etiquetas y acentos; filtra por carpeta, estado, extensión y categoría', async () => {
  await fixture({ 'a/code.cpp': 'int unique_token;', 'a/metadata.yaml': 'title: Unión\ntags: [conectividad]\ncategory: Estructuras', 'b/notes.md': 'Invariante especial' }, async service => {
    const refs = (await service.scan()).references;
    for (const query of ['UNION', 'unique_token', 'conectividad']) assert.equal(searchReferences(refs, query, 'all', '', 'title').length, 1);
    assert.equal(searchReferences(refs, 'invariante', 'no-code', 'b', 'title').length, 1);
    assert.equal(searchReferences(refs, '', 'no-metadata', '', 'modified').length, 1);
    assert.equal(searchReferences(refs, 'unique_token', 'all', 'b', 'title').length, 0);
    assert.equal(searchReferences(refs, '', 'all', '', 'title', '', '', '.cpp').length, 1);
    assert.equal(searchReferences(refs, '', 'all', '', 'title', '', '', '.rs').length, 0);
    assert.equal(searchReferences(refs, '', 'all', '', 'title', '', '', '', 'estructuras').length, 1);
    assert.equal(referenceCategory(refs.find(ref => ref.path === 'b')!), 'b');
  });
});
test('crea, renombra y guarda notas con detección de conflictos y sin editar código', async () => {
  await fixture({ 'parent/.keep': '', 'code.cpp': 'int x;' }, async service => {
    await service.create('parent/nueva', 'reference');
    assert.equal((await service.scan()).references.length, 2);
    await service.rename('parent/nueva', 'parent/renombrada');
    const name = 'parent/renombrada/notes.md';
    const original = await service.read(name);
    await service.save(name, '# Modificado', original.version);
    await assert.rejects(service.save(name, '# Conflicto', original.version), /cambió externamente/);
    const code = await service.read('code.cpp');
    await assert.rejects(service.save('code.cpp', '', code.version), /Solo se permite/);
    assert.equal((await service.read('code.cpp')).content, 'int x;');
    await assert.rejects(service.rename('parent/renombrada', 'parent'), /ya existe/);
    await assert.rejects(service.rename('', 'root'), /raíz/);
    await assert.rejects(service.rename('.', 'root'), /raíz/);
    await assert.rejects(service.rename('parent', 'parent/sub'), /dentro de sí misma/);
    await assert.rejects(service.create('archivo:oculto', 'folder'), /no válido/);
  });
});
test('conserva comentarios y campos desconocidos al guardar YAML como texto', async () => {
  await fixture({ 'metadata.yaml': '# Personal\ntitle: DSU\ncustom: {nivel: 2}\n' }, async service => {
    const original = await service.read('metadata.yaml');
    await service.save('metadata.yaml', original.content.replace('DSU', 'Union Find'), original.version);
    const updated = await service.read('metadata.yaml');
    assert.match(updated.content, /# Personal/);
    assert.deepEqual(parseMetadata(updated.content).metadata.custom, { nivel: 2 });
    await assert.rejects(service.save('metadata.yaml', 'tags: invalid', updated.version), /Corrige/);
  });
});
test('rechaza escapes de ruta, archivos binarios y archivos demasiado grandes', async () => {
  await fixture({ 'binary.cpp': 'a\0b', 'huge.txt': 'x'.repeat(2 * 1024 * 1024 + 1) }, async service => {
    await assert.rejects(service.read('../outside.md'), /sale de la colección/);
    await assert.rejects(service.create('../escape', 'folder'), /sale de la colección/);
    await assert.rejects(service.read('binary.cpp'), /binario/);
    await assert.rejects(service.read('huge.txt'), /2 MiB/);
    assert.ok((await service.scan()).warnings.length === 0);
  });
});
test('no atraviesa junctions o enlaces fuera de la colección', async () => {
  await fixture({ 'outside/notes.md': '# Externo', 'collection/.keep': '' }, async (service, outer) => {
    const root = path.join(outer, 'collection');
    await fs.symlink(path.join(outer, 'outside'), path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    const inside = new LibraryIndexer(new NodeFsProvider(root));
    await assert.rejects(inside.read('link/notes.md'), /enlaces/);
    assert.equal((await inside.scan()).references.length, 0);
    assert.equal((await inside.scan()).warnings.length, 1);
  });
});
test('la colección real de ejemplos incluye categorías, varios lenguajes y estados incompletos', async () => {
  const result = await new LibraryIndexer(new NodeFsProvider(path.resolve('examples/coleccion'))).scan();
  assert.equal(result.references.length, 5);
  assert.equal(result.references.find(ref => ref.title === 'DSU')?.code.length, 2);
  assert.ok(result.references.some(ref => !ref.code.length));
  assert.ok(result.references.some(ref => !ref.hasMetadata));
});
