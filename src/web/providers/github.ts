import type { LibraryProvider, ProviderEntry } from '../../core/provider.js';
import { validateRelativePath } from '../../core/provider.js';

export type GitHubConfig = { owner: string; repo: string; branch?: string; subpath?: string; token?: string };

const ownerPattern = /^[A-Za-z0-9-]{1,39}$/;
const repoPattern = /^[A-Za-z0-9._-]{1,100}$/;
const segmentPattern = /^[^\x00-\x1f\\/]{1,255}$/;

export function parseGitHubInput(input: { url?: string; owner?: string; repo?: string; branch?: string; subpath?: string }): GitHubConfig {
  let owner = input.owner?.trim() || '';
  let repo = input.repo?.trim() || '';
  let branch = input.branch?.trim() || undefined;
  let subpath = input.subpath?.trim().replace(/^\/+|\/+$/g, '') || undefined;
  const url = input.url?.trim();
  if (url) {
    const short = url.match(/^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/);
    if (short) { owner = short[1]; repo = short[2]; }
    else {
      let parsed: URL;
      try { parsed = new URL(url); } catch { throw new Error('La URL del repositorio no es válida. Usa https://github.com/propietario/repositorio o propietario/repositorio.'); }
      if (parsed.host !== 'github.com' && parsed.host !== 'www.github.com') throw new Error('Solo se admiten repositorios de github.com.');
      if (parsed.protocol !== 'https:') throw new Error('La URL del repositorio debe usar HTTPS.');
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length < 2) throw new Error('La URL debe incluir propietario y repositorio.');
      owner = parts[0];
      repo = parts[1].replace(/\.git$/, '');
      if (parts[2] === 'tree' && parts[3]) {
        branch = branch || decodeURIComponent(parts[3]);
        const rest = parts.slice(4).map(part => decodeURIComponent(part)).join('/');
        if (rest) subpath = subpath || rest;
      } else if (parts.length > 2) {
        throw new Error('La URL del repositorio no es válida. Usa la raíz del repositorio o una URL /tree/rama/carpeta.');
      }
    }
  }
  if (!ownerPattern.test(owner)) throw new Error('El propietario del repositorio no es válido.');
  if (!repoPattern.test(repo)) throw new Error('El nombre del repositorio no es válido.');
  if (branch && !segmentPattern.test(branch)) throw new Error('El nombre de la rama no es válido.');
  if (subpath) { try { validateRelativePath(subpath); } catch { throw new Error('La subcarpeta del repositorio no es válida.'); } }
  const config: GitHubConfig = { owner, repo };
  if (branch) config.branch = branch;
  if (subpath) config.subpath = subpath;
  return config;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type GitHubCache = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
};

const tokenHint = 'Si el repositorio es privado, configura un token de acceso (fine-grained PAT con permiso Contents: read-only).';

export function normalizeGitHubToken(token?: string): string | undefined {
  const value = token?.trim();
  if (!value) return undefined;
  if (!/^[A-Za-z0-9_]{1,255}$/.test(value)) throw new Error('El token de acceso no es válido.');
  return value;
}

async function request(fetchImpl: FetchLike, url: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try { response = await fetchImpl(url, { headers }); }
  catch { throw new Error('No hay conexión con GitHub. Comprueba tu red e inténtalo de nuevo.'); }
  if (response.status === 401) throw new Error('GitHub rechazó el token de acceso (401). Comprueba que no haya caducado ni sido revocado.');
  if (response.status === 404) {
    throw new Error(token
      ? 'El repositorio no existe, es privado y el token no tiene acceso, o la rama indicada no está disponible.'
      : `El repositorio no existe, es privado o la rama indicada no está disponible. ${tokenHint}`);
  }
  if (response.status === 403 || response.status === 429) {
    if (response.headers.get('x-ratelimit-remaining') === '0' || response.status === 429) {
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      const when = reset ? new Date(reset).toLocaleTimeString('es') : 'pronto';
      throw new Error(token
        ? `Se agotó el límite de solicitudes de GitHub para este token. Se restablece a las ${when}.`
        : `Se agotó el límite de solicitudes de GitHub (60 por hora sin autenticación). Se restablece a las ${when}.`);
    }
    throw new Error(token
      ? 'GitHub rechazó la solicitud (403). El token no tiene permiso Contents: read-only sobre este repositorio.'
      : `GitHub rechazó la solicitud (403). ${tokenHint}`);
  }
  if (!response.ok) throw new Error(`GitHub respondió con un error (${response.status}).`);
  return response;
}

function decodeBase64(content: string): Uint8Array {
  const binary = atob(content.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export class GitHubProvider implements LibraryProvider {
  readonly kind = 'github' as const;
  readonly capabilities = { write: false, rename: false, watch: false, refresh: true };
  readonly config: GitHubConfig;
  private fetchImpl: FetchLike;
  private cache?: GitHubCache;
  private commit = '';
  private blobs = new Map<string, { sha: string; size?: number }>();
  private defaultBranch = '';

  constructor(config: GitHubConfig, options: { fetch?: FetchLike; cache?: GitHubCache; commit?: string } = {}) {
    this.config = config;
    this.fetchImpl = options.fetch || ((url, init) => fetch(url, init));
    this.cache = options.cache;
    this.commit = options.commit || '';
  }

  private get(url: string) { return request(this.fetchImpl, url, this.config.token); }

  get location() { return `https://github.com/${this.config.owner}/${this.config.repo}`; }

  async branches(): Promise<{ branches: string[]; defaultBranch: string }> {
    const { owner, repo } = this.config;
    const info = await (await this.get(`https://api.github.com/repos/${owner}/${repo}`)).json() as { default_branch: string };
    const list = await (await this.get(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`)).json() as { name: string }[];
    return { branches: list.map(item => item.name), defaultBranch: info.default_branch };
  }

  private async resolveCommit(): Promise<string> {
    const { owner, repo } = this.config;
    let branch = this.config.branch;
    if (!branch) {
      if (!this.defaultBranch) {
        const info = await (await this.get(`https://api.github.com/repos/${owner}/${repo}`)).json() as { default_branch: string };
        this.defaultBranch = info.default_branch;
      }
      branch = this.defaultBranch;
    }
    const data = await (await this.get(`https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch!)}`)).json() as { commit: { sha: string } };
    return data.commit.sha;
  }

  async currentCommit(): Promise<string> {
    if (!this.commit) this.commit = await this.resolveCommit();
    return this.commit;
  }

  async previewChanges(): Promise<{ changed: boolean; commit: string }> {
    const latest = await this.resolveCommit();
    return { changed: latest !== this.commit, commit: latest };
  }

  private async tree(sha: string, recursive: boolean) {
    const { owner, repo } = this.config;
    return (await (await this.get(`https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}${recursive ? '?recursive=1' : ''}`)).json()) as {
      sha: string; truncated?: boolean;
      tree: { path: string; type: 'blob' | 'tree' | 'commit'; sha: string; size?: number }[];
    };
  }

  private inSubpath(path: string): string | null {
    const sub = this.config.subpath;
    if (!sub) return path;
    if (path === sub) return '';
    if (path.startsWith(sub + '/')) return path.slice(sub.length + 1);
    return null;
  }

  async list(): Promise<{ entries: ProviderEntry[]; truncated?: boolean; warnings: string[] }> {
    const warnings: string[] = [];
    const commit = await this.currentCommit();
    const cacheKey = `tree:${this.config.owner}/${this.config.repo}:${commit}:${this.config.subpath || ''}`;
    let entries = await this.cache?.get(cacheKey) as ProviderEntry[] | undefined;
    let truncated = false;
    if (entries) {
      for (const entry of entries) if (!entry.directory && entry.version) this.blobs.set(entry.path, { sha: entry.version, size: entry.size });
    } else {
      entries = [];
      this.blobs.clear();
      const data = await this.tree(commit, true);
      truncated = !!data.truncated;
      if (data.truncated) warnings.push('GitHub devolvió un árbol truncado. Se recorrió carpeta por carpeta; el listado puede ser parcial en repositorios muy grandes.');
      const pending: { path: string; sha: string }[] = [];
      const pushEntry = (raw: { path: string; type: string; sha: string; size?: number }, relative: string, name: string) => {
        try { validateRelativePath(relative); } catch { warnings.push(`Se omitió una entrada con una ruta no válida: ${raw.path}`); return; }
        if (raw.type === 'tree') {
          entries!.push({ path: relative, directory: true });
          if (data.truncated) pending.push({ path: raw.path, sha: raw.sha });
        } else if (raw.type === 'blob') {
          entries!.push({ path: relative, directory: false, size: raw.size, version: raw.sha });
          this.blobs.set(relative, { sha: raw.sha, size: raw.size });
        }
      };
      for (const item of data.tree) {
        const relative = this.inSubpath(item.path);
        if (relative === null) continue;
        pushEntry(item, relative, item.path);
      }
      let walks = 0;
      while (pending.length && walks < 2000) {
        const next = pending.shift()!;
        walks++;
        const sub = await this.tree(next.sha, false);
        for (const item of sub.tree) {
          const absolute = `${next.path}/${item.path}`;
          const relative = this.inSubpath(absolute);
          if (relative === null) continue;
          pushEntry(item, relative, item.path);
        }
      }
      if (pending.length) warnings.push('Se alcanzó el límite de recorrido de carpetas de GitHub. El listado es parcial.');
      entries = entries.filter((entry, index, all) => all.findIndex(other => other.path === entry.path) === index);
      await this.cache?.set(cacheKey, entries);
    }
    return { entries, truncated, warnings };
  }

  async read(path: string): Promise<Uint8Array> {
    const blob = this.blobs.get(path);
    const cacheKey = blob ? `blob:${this.config.owner}/${this.config.repo}:${blob.sha}` : '';
    if (cacheKey) {
      const cached = await this.cache?.get(cacheKey) as number[] | undefined;
      if (cached) return new Uint8Array(cached);
    }
    const { owner, repo, token } = this.config;
    if (token && blob) {
      const data = await (await this.get(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${blob.sha}`)).json() as { content?: string; encoding?: string };
      if (data.encoding !== 'base64' || typeof data.content !== 'string') throw new Error('GitHub devolvió el archivo en un formato inesperado.');
      const bytes = decodeBase64(data.content);
      if (cacheKey) await this.cache?.set(cacheKey, [...bytes]);
      return bytes;
    }
    const commit = await this.currentCommit();
    const sub = this.config.subpath;
    const absolute = sub ? `${sub}/${path}` : path;
    const encoded = absolute.split('/').map(segment => encodeURIComponent(segment)).join('/');
    let response: Response;
    try { response = await this.fetchImpl(`https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${encoded}`); }
    catch { throw new Error('No hay conexión con GitHub. Comprueba tu red e inténtalo de nuevo.'); }
    if (!response.ok) {
      if (response.status === 404) throw new Error(token ? 'El archivo ya no existe en el commit indexado. Actualiza la biblioteca.' : `El archivo ya no existe en el commit indexado o el repositorio es privado. Actualiza la biblioteca. ${tokenHint}`);
      if (response.status === 403 || response.status === 429) throw new Error('Se agotó el límite de solicitudes de GitHub. Actualiza más tarde.');
      throw new Error(`No se pudo descargar el archivo (${response.status}).`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (cacheKey) await this.cache?.set(cacheKey, [...bytes]);
    return bytes;
  }

  externalUrl(path: string): string | undefined {
    const { owner, repo } = this.config;
    const branch = this.config.branch || this.defaultBranch || 'HEAD';
    const sub = this.config.subpath;
    const absolute = sub ? `${sub}/${path}` : path;
    const encoded = absolute.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${encoded}`;
  }
}
