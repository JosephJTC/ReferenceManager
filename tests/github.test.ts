import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitHubInput, GitHubProvider, type FetchLike } from '../src/web/providers/github.js';
import { LibraryIndexer } from '../src/core/indexer.js';
import { validateRelativePath } from '../src/core/provider.js';

test('analiza URL y formas de repositorio válidas e inválidas', () => {
  const valid: [string, { owner: string; repo: string; branch?: string; subpath?: string }][] = [
    ['https://github.com/octocat/Hello-World', { owner: 'octocat', repo: 'Hello-World' }],
    ['octocat/Hello-World', { owner: 'octocat', repo: 'Hello-World' }],
    ['https://github.com/octocat/Hello-World/tree/main/docs/api', { owner: 'octocat', repo: 'Hello-World', branch: 'main', subpath: 'docs/api' }],
    ['https://github.com/a-b/c_d-e.git', { owner: 'a-b', repo: 'c_d-e' }],
    ['https://www.github.com/owner/repo', { owner: 'owner', repo: 'repo' }]
  ];
  for (const [url, expected] of valid) assert.deepEqual(parseGitHubInput({ url }), expected);
  for (const url of [
    'https://gitlab.com/owner/repo', 'https://github.com/only-owner',
    'https://github.com//repo', 'owner/repo/extra', 'https://github.com/owner/repo/issues/1',
    'ftp://github.com/owner/repo', 'not a url', 'https://github.com/owner/re+po'
  ]) assert.throws(() => parseGitHubInput({ url }), /GitHub|válida|válido|HTTPS|propietario/i);
  assert.deepEqual(parseGitHubInput({ owner: 'octocat', repo: 'Hello-World', branch: 'main' }), { owner: 'octocat', repo: 'Hello-World', branch: 'main' });
  assert.throws(() => parseGitHubInput({ owner: '../x', repo: 'r' }), /propietario/);
  assert.throws(() => parseGitHubInput({ owner: 'o', repo: 'r', subpath: '../escape' }), /subcarpeta/);
});

type Route = { status?: number; body?: unknown; headers?: Record<string, string> };
function mockFetch(routes: Record<string, Route>, calls: string[] = []): { fetch: FetchLike; calls: string[] } {
  const fetch: FetchLike = async url => {
    calls.push(url);
    const route = Object.entries(routes).find(([key]) => url.startsWith(key) || url === key);
    if (!route) return new Response('no route', { status: 500 });
    const { status = 200, body = {}, headers = {} } = route[1];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  };
  return { fetch, calls };
}

const repoInfo = { default_branch: 'main' };
const branchInfo = { commit: { sha: 'abc123' } };

test('repositorio inexistente o privado produce mensaje en español', async () => {
  const { fetch } = mockFetch({ 'https://api.github.com/': { status: 404 } });
  const provider = new GitHubProvider({ owner: 'o', repo: 'r' }, { fetch });
  await assert.rejects(provider.list(), /no existe, es privado/);
});

test('límite de GitHub informa la hora de restablecimiento', async () => {
  const reset = String(Math.floor(Date.now() / 1000) + 1800);
  const { fetch } = mockFetch({ 'https://api.github.com/': { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset } } });
  const provider = new GitHubProvider({ owner: 'o', repo: 'r' }, { fetch });
  await assert.rejects(provider.list(), /límite de solicitudes.*60 por hora/s);
  const { fetch: fetch429 } = mockFetch({ 'https://api.github.com/': { status: 429 } });
  await assert.rejects(new GitHubProvider({ owner: 'o', repo: 'r' }, { fetch: fetch429 }).list(), /límite de solicitudes/);
});

function tree(items: { path: string; type: string; sha?: string; size?: number }[], truncated = false) {
  return { sha: 'abc123', truncated, tree: items.map(item => ({ sha: item.sha || 's' + item.path.length, ...item })) };
}

async function providerWithFiles(files: Record<string, string>, extra: object[] = [], config: object = {}) {
  const calls: string[] = [];
  const blobs = new Map(Object.entries(files).map(([path, content], index) => [`blob${index}`, new TextEncoder().encode(content)]));
  const routes: Record<string, Route> = {
    'https://api.github.com/repos/o/r/branches?per_page=100': { body: [{ name: 'main' }] },
    'https://api.github.com/repos/o/r/branches/main': { body: branchInfo },
    'https://api.github.com/repos/o/r/git/trees/abc123': {
      body: tree([
        ...Object.keys(files).map((path, index) => ({ path, type: 'blob', sha: `blob${index}`, size: files[path].length })),
        ...extra as { path: string; type: string }[]
      ])
    },
    'https://api.github.com/repos/o/r': { body: repoInfo }
  };
  const { fetch, calls: registered } = mockFetch(routes, calls);
  const serving: FetchLike = async url => {
    if (url.startsWith('https://raw.githubusercontent.com/')) {
      registered.push(url);
      const path = decodeURIComponent(url.split('/abc123/')[1] || '');
      if (path in files) return new Response(files[path]);
      return new Response('not found', { status: 404 });
    }
    return fetch(url);
  };
  const provider = new GitHubProvider({ owner: 'o', repo: 'r', ...config }, { fetch: serving });
  return { provider, registered, blobs };
}

test('indexa estructuras arbitrarias y omite binarios y archivos enormes sin descargarlos', async () => {
  const { provider, registered } = await providerWithFiles({
    'algo/sort.cpp': 'int unique_marker;',
    'algo/metadata.yaml': 'title: Ordenación',
    'imagen.png': 'binario',
    'notas.md': '# notas',
    'sin-meta/deep/nested/run.py': 'print(1)'
  }, [
    { path: 'algo', type: 'tree' }, { path: 'sin-meta', type: 'tree' }, { path: 'sin-meta/deep', type: 'tree' }, { path: 'sin-meta/deep/nested', type: 'tree' },
    { path: 'grande.cpp', type: 'blob', sha: 'bigsha', size: 3 * 1024 * 1024 }
  ]);
  const indexer = new LibraryIndexer(provider);
  const collection = await indexer.scan();
  assert.equal(collection.references.length, 3);
  assert.equal(collection.references.find(ref => ref.path === 'algo')?.title, 'Ordenación');
  assert.ok(collection.references.some(ref => ref.path === ''));
  const fetches = registered.filter(url => url.includes('raw.githubusercontent.com'));
  assert.ok(fetches.some(url => url.includes('algo/sort.cpp')));
  assert.ok(!fetches.some(url => url.includes('imagen.png')), 'no debe descargar binarios por extensión');
  assert.ok(!fetches.some(url => url.includes('grande.cpp')), 'no debe descargar archivos de más de 2 MiB');
  assert.ok(fetches.every(url => url.includes('/abc123/')), 'los blobs se descargan fijados al commit');
});

test('árbol truncado recorre subcarpetas y rutas hostiles se rechazan', async () => {
  const calls: string[] = [];
  const routes: Record<string, Route> = {
    'https://api.github.com/repos/o/r/git/trees/abc123': { body: { sha: 'abc123', truncated: true, tree: [{ path: 'sub', type: 'tree', sha: 'subtree' }, { path: '../x', type: 'blob', sha: 'evil1' }, { path: '/abs', type: 'blob', sha: 'evil2' }] } },
    'https://api.github.com/repos/o/r/git/trees/subtree': { body: tree([{ path: 'code.cpp', type: 'blob', sha: 'b1', size: 7 }]) },
    'https://api.github.com/repos/o/r/branches/main': { body: branchInfo },
    'https://api.github.com/repos/o/r': { body: repoInfo }
  };
  const { fetch, calls: registered } = mockFetch(routes, calls);
  const provider = new GitHubProvider({ owner: 'o', repo: 'r' }, { fetch });
  const result = await provider.list();
  assert.ok(result.entries.some(entry => entry.path === 'sub/code.cpp'));
  assert.ok(!result.entries.some(entry => entry.path.includes('..') || entry.path.startsWith('/')));
  assert.ok(result.truncated);
  assert.ok(registered.includes('https://api.github.com/repos/o/r/git/trees/subtree'));
  const collection = await new LibraryIndexer(provider).scan();
  assert.equal(collection.references.length, 1);
});

test('subruta limita la biblioteca y externalUrl apunta al blob', async () => {
  const { provider } = await providerWithFiles({ 'docs/ref/a.cpp': 'int a;', 'otra/b.cpp': 'int b;' }, [
    { path: 'docs', type: 'tree' }, { path: 'docs/ref', type: 'tree' }, { path: 'otra', type: 'tree' }
  ], { subpath: 'docs/ref' });
  const collection = await new LibraryIndexer(provider).scan();
  assert.deepEqual(collection.references.map(ref => ref.path), ['']);
  assert.equal(provider.externalUrl('a.cpp'), 'https://github.com/o/r/blob/main/docs/ref/a.cpp');
});

test('validateRelativePath rechaza rutas absolutas, escapes y nombres inválidos', () => {
  for (const bad of ['../x', 'a/../../b', '/abs', 'C:/abs', 'con/archivo', 'aux.txt', 'fin.', 'espacio ']) {
    assert.throws(() => validateRelativePath(bad));
  }
  assert.deepEqual(validateRelativePath('tema/sub/code.cpp'), ['tema', 'sub', 'code.cpp']);
});
