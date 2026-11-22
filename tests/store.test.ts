import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listLibraryRecords, getLibraryRecord, saveLibraryRecord, removeLibraryRecord,
  getPractice, setPractice, newLibraryRecord
} from '../src/web/libraries.js';

test('registro de bibliotecas: creación, lectura, actualización y borrado aislado', async () => {
  const first = newLibraryRecord({ name: 'Una', kind: 'github', location: 'https://github.com/a/b', owner: 'a', repo: 'b' });
  const second = newLibraryRecord({ name: 'Dos', kind: 'local-snapshot', location: 'carpeta' });
  await saveLibraryRecord(first);
  await saveLibraryRecord(second);
  const all = await listLibraryRecords();
  assert.ok(all.length >= 2);
  assert.deepEqual((await getLibraryRecord(first.id))?.name, 'Una');
  await saveLibraryRecord({ ...first, name: 'Renombrada', description: 'nota' });
  assert.equal((await getLibraryRecord(first.id))?.name, 'Renombrada');
  await setPractice(first.id, [{ referenceId: 'r1', file: 'a/b/code.cpp' }]);
  await setPractice(second.id, [{ referenceId: 'r2', file: 'x.py' }]);
  await removeLibraryRecord(first.id);
  assert.equal(await getLibraryRecord(first.id), undefined);
  assert.equal((await getPractice(first.id)).length, 0, 'borrar elimina la selección de práctica de esa biblioteca');
  assert.equal((await getPractice(second.id)).length, 1, 'otras bibliotecas conservan sus datos');
  assert.equal((await getLibraryRecord(second.id))?.name, 'Dos');
});
