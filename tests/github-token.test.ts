import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubProvider, normalizeGitHubToken, type FetchLike } from '../src/web/providers/github.js';
import { LibraryIndexer } from '../src/core/indexer.js';
import { buildLibraryIndex } from '../src/core/library-index.js';
import { newLibraryRecord, saveLibraryRecord, getLibraryRecord, librarySummary, githubDescriptor, libraryIndexSource } from '../src/web/libraries.js';

const token = 'github_pat_SECRETO123';
const files: Record<string, string> = { 'algo/sort.cpp': 'int marcador_único;', 'algo/metadata.yaml': 'title: Ordenación' };
const shas = Object.fromEntries(Object.keys(files).map((path, index) => [path, `blob${index}`]));

type Call = { url: string; authorization: string | null };
function server(options: { privateRepo?: boolean } = {}): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetch: FetchLike = async (url, init) => {
    const authorization = new Headers(init?.headers).get('Authorization');
    calls.push({ url, authorization });
    if (options.privateRepo && authorization !== `Bearer ${token}`) return json({ message: 'Not Found' }, 404);
    if (url.startsWith('https://raw.githubusercontent.com/o/r/abc123/')) {
      const path = decodeURIComponent(url.split('/abc123/')[1]);
      return path in files ? new Response(files[path]) : new Response('not found', { status: 404 });
    }
    const blob = url.match(/^https:\/\/api\.github\.com\/repos\/o\/r\/git\/blobs\/(.+)$/);
    if (blob) {
      const path = Object.keys(shas).find(key => shas[key] === blob[1]);
      if (!path) return json({}, 404);
      const base64 = Buffer.from(files[path]).toString('base64').replace(/(.{8})/g, '$1\n');
      return json({ sha: blob[1], encoding: 'base64', content: base64 });
    }
    if (url === 'https://api.github.com/repos/o/r') return json({ default_branch: 'main' });
    if (url === 'https://api.github.com/repos/o/r/branches?per_page=100') return json([{ name: 'main' }]);
    if (url === 'https://api.github.com/repos/o/r/branches/main') return json({ commit: { sha: 'abc123' } });
    if (url.startsWith('https://api.github.com/repos/o/r/git/trees/abc123')) {
      return json({ sha: 'abc123', truncated: false, tree: [{ path: 'algo', type: 'tree', sha: 't1' }, ...Object.keys(files).map(path => ({ path, type: 'blob', sha: shas[path], size: files[path].length }))] });
    }
    return json({}, 500);
  };
  return { fetch, calls };
}

test('con token envía Authorization en cada petición y lee blobs por la API', async () => {
  const { fetch, calls } = server({ privateRepo: true });
  const provider = new GitHubProvider({ owner: 'o', repo: 'r', token }, { fetch });
  await provider.branches();
  const collection = await new LibraryIndexer(provider).scan();
  assert.equal(collection.references.find(ref => ref.path === 'algo')?.title, 'Ordenación');
  assert.equal(new TextDecoder().decode(await provider.read('algo/sort.cpp')), files['algo/sort.cpp']);
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => call.authorization === `Bearer ${token}`));
  assert.ok(calls.some(call => call.url === `https://api.github.com/repos/o/r/git/blobs/${shas['algo/sort.cpp']}`));
  assert.ok(!calls.some(call => call.url.includes('raw.githubusercontent.com')));
  assert.ok(calls.every(call => !call.url.includes(token)), 'el token nunca va en la URL');
  assert.ok(!provider.location.includes(token));
  assert.ok(!provider.externalUrl('algo/sort.cpp')!.includes(token));
});

test('con token usa la caché del árbol y sigue leyendo por la API de blobs', async () => {
  const store = new Map<string, unknown>();
  const cache = { get: async (key: string) => store.get(key), set: async (key: string, value: unknown) => { store.set(key, value); } };
  await new GitHubProvider({ owner: 'o', repo: 'r', token }, { fetch: server({ privateRepo: true }).fetch, cache }).list();
  for (const key of [...store.keys()]) if (key.startsWith('blob:')) store.delete(key);
  const { fetch, calls } = server({ privateRepo: true });
  const provider = new GitHubProvider({ owner: 'o', repo: 'r', token }, { fetch, cache });
  await provider.list();
  assert.equal(new TextDecoder().decode(await provider.read('algo/sort.cpp')), files['algo/sort.cpp']);
  assert.ok(calls.some(call => call.url.includes('/git/blobs/')));
});

test('sin token no envía Authorization y usa raw.githubusercontent.com', async () => {
  const { fetch, calls } = server();
  const provider = new GitHubProvider({ owner: 'o', repo: 'r' }, { fetch });
  await new LibraryIndexer(provider).scan();
  assert.equal(new TextDecoder().decode(await provider.read('algo/sort.cpp')), files['algo/sort.cpp']);
  assert.ok(calls.every(call => call.authorization === null));
  assert.ok(calls.some(call => call.url.startsWith('https://raw.githubusercontent.com/o/r/abc123/algo/sort.cpp')));
  assert.ok(!calls.some(call => call.url.includes('/git/blobs/')));
});

test('repositorio privado sin token sugiere configurar un token; con token sin acceso lo indica', async () => {
  await assert.rejects(new GitHubProvider({ owner: 'o', repo: 'r' }, { fetch: server({ privateRepo: true }).fetch }).list(), /no existe, es privado.*token de acceso.*Contents: read-only/s);
  const forbidden: FetchLike = async () => new Response('{}', { status: 403 });
  await assert.rejects(new GitHubProvider({ owner: 'o', repo: 'r' }, { fetch: forbidden }).list(), /403.*token de acceso/);
  await assert.rejects(new GitHubProvider({ owner: 'o', repo: 'r', token: 'otro' }, { fetch: server({ privateRepo: true }).fetch }).list(), /token no tiene acceso/);
  const unauthorized: FetchLike = async () => new Response('{}', { status: 401 });
  await assert.rejects(new GitHubProvider({ owner: 'o', repo: 'r', token }, { fetch: unauthorized }).list(), /rechazó el token/);
});

test('normalizeGitHubToken recorta, ignora vacíos y rechaza caracteres no válidos', () => {
  assert.equal(normalizeGitHubToken(`  ${token}\n`), token);
  assert.equal(normalizeGitHubToken('   '), undefined);
  assert.equal(normalizeGitHubToken(undefined), undefined);
  assert.throws(() => normalizeGitHubToken('abc\r\nX-Evil: 1'), /token de acceso no es válido/);
});

test('el token se persiste en el registro y llega al descriptor, pero no al resumen ni al índice exportado', async () => {
  const record = newLibraryRecord({ name: 'Privada', kind: 'github', location: 'https://github.com/o/r', owner: 'o', repo: 'r', token });
  await saveLibraryRecord(record);
  const stored = (await getLibraryRecord(record.id))!;
  assert.equal(stored.token, token);
  const descriptor = githubDescriptor(stored);
  assert.equal(descriptor.token, token);
  assert.ok(!JSON.stringify(librarySummary(stored)).includes(token));
  assert.ok(!stored.location.includes(token));
  const provider = new GitHubProvider(descriptor, { fetch: server({ privateRepo: true }).fetch });
  const collection = await new LibraryIndexer(provider).scan();
  const index = await buildLibraryIndex(collection, libraryIndexSource(stored, await provider.currentCommit()), { fileSha: async () => 'x' });
  const json = JSON.stringify(index);
  assert.ok(json.includes('https://github.com/o/r'));
  assert.ok(!json.includes(token), 'el índice exportado no contiene el token');
  for (const path of Object.keys(files)) assert.ok(!provider.externalUrl(path)!.includes(token));
});
