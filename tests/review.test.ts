import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LibraryIndexer } from '../src/core/indexer.js';
import { NodeFsProvider } from '../src/node/node-provider.js';

async function temporary(action: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'revision-referencias-'));
  try { await action(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
const service = (root: string) => new LibraryIndexer(new NodeFsProvider(root));
test('rechaza una raíz que no sea una carpeta', async () => temporary(async root => {
  const file = path.join(root, 'archivo.txt'); await fs.writeFile(file, 'texto');
  await assert.rejects(service(file).scan(), /carpeta/);
}));
test('descubre variantes YAML, extensiones en mayúsculas y archivos inesperados de texto', async () => temporary(async root => {
  await fs.writeFile(path.join(root, 'metadata.yml'), 'title: Ejemplo\nnotes: ausente.md');
  await fs.writeFile(path.join(root, 'CODE.CPP'), 'int original = 1;');
  await fs.writeFile(path.join(root, 'IDEAS.MD'), '# Notas');
  await fs.writeFile(path.join(root, 'recurso.formato'), 'Texto independiente');
  const active = service(root);
  const result = await active.scan();
  assert.equal(result.references[0].title, 'Ejemplo');
  assert.ok(result.references[0].warnings.some(warning => warning.includes('ausente.md')));
  assert.equal((await active.read('recurso.formato')).content, 'Texto independiente');
  const notes = await active.read('IDEAS.MD');
  await active.save('IDEAS.MD', '# Editado', notes.version);
  assert.equal((await active.read('CODE.CPP')).content, 'int original = 1;');
}));
test('detecta cambios de BOM y conserva BOM y CRLF al guardar notas', async () => temporary(async root => {
  const target = path.join(root, 'notes.md');
  await fs.writeFile(target, '\ufeff# Original\r\n');
  const active = service(root);
  const original = await active.read('notes.md');
  await active.save('notes.md', '# Editado\n', original.version);
  assert.equal(await fs.readFile(target, 'utf8'), '\ufeff# Editado\r\n');
  const current = await active.read('notes.md');
  await fs.writeFile(target, '# Editado\r\n');
  await assert.rejects(active.save('notes.md', '# Conflicto', current.version), /cambió/);
}));
test('rechaza una raíz reemplazada por un enlace después de abrir la colección', async () => temporary(async parent => {
  const root = path.join(parent, 'coleccion'), outside = path.join(parent, 'externo');
  await fs.mkdir(root); await fs.mkdir(outside);
  await fs.writeFile(path.join(root, 'notes.md'), 'Dentro');
  await fs.writeFile(path.join(outside, 'notes.md'), 'Fuera');
  const active = service(root); await active.read('notes.md');
  await fs.rename(root, path.join(parent, 'anterior'));
  await fs.symlink(outside, root, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(active.read('notes.md'), /raíz|enlace/);
}));
test('reutiliza el índice sin cambios y lo invalida después de modificar archivos', async () => temporary(async root => {
  await fs.writeFile(path.join(root, 'code.cpp'), 'int primero;');
  const active = service(root);
  await active.scan();
  assert.equal((await active.scan()).stats?.cacheHits, 1);
  await fs.writeFile(path.join(root, 'code.cpp'), 'int segundo_mas_largo;');
  const changed = await active.scan();
  assert.equal(changed.stats?.cacheHits, 0);
  assert.match(changed.references[0].searchText, /segundo_mas_largo/);
}));
test('crear complementos y guardar notas con hard link no modifica el código fuente', async () => temporary(async root => {
  const source = path.join(root, 'code.cpp');
  await fs.writeFile(source, 'int fuente_original = 7;');
  const active = service(root);
  await active.supplement('', 'metadata');
  await fs.link(source, path.join(root, 'notes.md'));
  const notes = await active.read('notes.md');
  await active.save('notes.md', '# Notas independientes', notes.version);
  assert.equal(await fs.readFile(source, 'utf8'), 'int fuente_original = 7;');
  const code = await active.read('code.cpp');
  await assert.rejects(active.save('code.cpp', 'conflicto', 'f'.repeat(64)), /cambió|conflict|versión/i);
  await assert.rejects(active.supplement('', 'metadata'), /ya tiene/);
  assert.equal(await fs.readFile(source, 'utf8'), 'int fuente_original = 7;');
}));
