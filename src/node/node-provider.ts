import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ignoredDirectories, textLimit, validateRelativePath, type LibraryProvider, type ProviderEntry } from '../core/provider.js';

export class NodeFsProvider implements LibraryProvider {
  readonly kind = 'local-fs' as const;
  readonly capabilities = { write: true, rename: true, watch: false, refresh: true };
  readonly root: string;
  private rootIdentity?: string;

  constructor(root: string) { this.root = path.resolve(root); }

  private resolve(relative: string): string {
    const parts = validateRelativePath(relative);
    const target = path.resolve(this.root, ...parts);
    const rel = path.relative(this.root, target);
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('La ruta sale de la colección.');
    return target;
  }

  private async checkRoot() {
    const stat = await fs.lstat(this.root, { bigint: true });
    if (stat.isSymbolicLink()) throw new Error('La raíz de la colección fue reemplazada por un enlace. Vuelve a abrirla.');
    if (!stat.isDirectory()) throw new Error('La raíz debe ser una carpeta.');
    const identity = `${stat.dev}:${stat.ino}`;
    if (this.rootIdentity && this.rootIdentity !== identity) throw new Error('La carpeta raíz fue reemplazada. Vuelve a abrir la colección.');
    this.rootIdentity = identity;
  }

  private async checkPath(relative: string) {
    let current = this.root;
    for (const part of relative.split('/').filter(Boolean)) {
      current = path.join(current, part);
      try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('No se permite atravesar enlaces simbólicos.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }

  async list(): Promise<{ entries: ProviderEntry[]; warnings: string[] }> {
    await this.checkRoot();
    const entries: ProviderEntry[] = [];
    const warnings: string[] = [];
    const stack = [''];
    while (stack.length) {
      const directory = stack.pop()!;
      const children = await fs.readdir(path.join(this.root, directory), { withFileTypes: true });
      for (const child of children) {
        const relative = directory ? `${directory}/${child.name}` : child.name;
        if (child.isSymbolicLink()) { warnings.push(`Enlace omitido: ${relative}`); continue; }
        if (child.isDirectory() && ignoredDirectories.has(child.name)) continue;
        if (child.isDirectory()) { entries.push({ path: relative, directory: true }); stack.push(relative); continue; }
        if (!child.isFile()) continue;
        try {
          const stat = await fs.lstat(path.join(this.root, relative));
          entries.push({ path: relative, directory: false, size: stat.size, modified: stat.mtimeMs, version: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` });
        } catch { warnings.push(`El archivo desapareció o no se puede leer: ${relative}`); }
      }
    }
    return { entries, warnings };
  }

  async read(relative: string): Promise<Uint8Array> {
    const target = this.resolve(relative);
    await this.checkRoot();
    await this.checkPath(relative);
    if (!(await fs.lstat(target)).isFile()) throw new Error('Solo se pueden leer archivos de texto regulares.');
    const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > textLimit) throw new Error('Solo se admiten archivos de texto de hasta 2 MiB.');
      const stamp = (value: typeof stat) => `${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}`;
      const buffer = Buffer.alloc(stat.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await handle.read(buffer, length, buffer.length - length, length);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      if (length !== stat.size || stamp(await handle.stat()) !== stamp(stat)) throw new Error('El archivo cambió durante la lectura. Vuelve a intentarlo.');
      return new Uint8Array(buffer.subarray(0, length));
    } finally { await handle.close(); }
  }

  async write(relative: string, bytes: Uint8Array, options: { create: boolean }): Promise<void> {
    const target = this.resolve(relative);
    await this.checkRoot();
    await this.checkPath(relative);
    if (options.create) {
      try { await fs.writeFile(target, bytes, { flag: 'wx' }); }
      catch (error) { throw (error as NodeJS.ErrnoException).code === 'EEXIST' ? new Error('Ya existe un archivo o carpeta con ese nombre.') : error; }
      return;
    }
    let mode: number | undefined;
    try { mode = (await fs.lstat(target)).mode; } catch {}
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, bytes, { flag: 'wx', mode });
      await fs.rename(temporary, target);
    } finally { await fs.unlink(temporary).catch(() => undefined); }
  }

  async mkdir(relative: string): Promise<void> {
    try { await fs.mkdir(this.resolve(relative)); }
    catch (error) { throw (error as NodeJS.ErrnoException).code === 'EEXIST' ? new Error('Ya existe un archivo o carpeta con ese nombre.') : error; }
  }

  async rename(from: string, to: string): Promise<void> {
    await this.checkRoot();
    const source = this.resolve(from), target = this.resolve(to);
    await this.checkPath(from);
    await fs.rename(source, target);
  }
}
