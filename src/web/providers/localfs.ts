import type { LibraryProvider, ProviderEntry } from '../../core/provider.js';
import { ignoredDirectories, textLimit, validateRelativePath } from '../../core/provider.js';

type DirectoryHandle = FileSystemDirectoryHandle & { move?: unknown };

export class LocalFsProvider implements LibraryProvider {
  readonly kind = 'local-fs' as const;
  readonly capabilities = { write: true, rename: false, watch: false, refresh: true };
  private root: FileSystemDirectoryHandle;
  private observer?: { observe(...args: unknown[]): Promise<void>; disconnect(): void };
  private changed = false;
  name = '';

  constructor(root: FileSystemDirectoryHandle) {
    this.root = root;
    this.name = root.name;
    const probe = root as unknown as { move?: unknown };
    if (typeof probe.move === 'function') this.capabilities.rename = true;
    const ObserverCtor = (globalThis as { FileSystemObserver?: new (callback: (records: unknown[]) => void) => { observe(handle: FileSystemDirectoryHandle, options: { recursive: boolean }): Promise<void>; disconnect(): void } }).FileSystemObserver;
    if (ObserverCtor) {
      try {
        this.observer = new ObserverCtor(() => { this.changed = true; });
        this.capabilities.watch = true;
      } catch { /* observador no disponible */ }
    }
  }

  get location() { return this.name; }

  async startWatching() {
    if (this.observer) {
      try { await this.observer.observe(this.root, { recursive: true }); } catch { /* sin vigilancia */ }
    }
  }

  consumeChanged() { const value = this.changed; this.changed = false; return value; }

  private async directory(parts: string[]): Promise<FileSystemDirectoryHandle> {
    let current = this.root;
    for (const part of parts) current = await current.getDirectoryHandle(part);
    return current;
  }

  private parts(relative: string) { return validateRelativePath(relative); }

  async list(): Promise<{ entries: ProviderEntry[]; warnings: string[] }> {
    const entries: ProviderEntry[] = [];
    const warnings: string[] = [];
    const walk = async (directory: FileSystemDirectoryHandle, prefix: string) => {
      const iterable = directory as unknown as { entries(): AsyncIterableIterator<[string, FileSystemHandle]> };
      for await (const [name, handle] of iterable.entries()) {
        const relative = prefix ? `${prefix}/${name}` : name;
        try { validateRelativePath(relative); } catch { warnings.push(`Nombre omitido por no ser válido: ${relative}`); continue; }
        if (handle.kind === 'directory') {
          if (ignoredDirectories.has(name)) continue;
          entries.push({ path: relative, directory: true });
          await walk(handle as FileSystemDirectoryHandle, relative);
        } else {
          try {
            const file = await (handle as FileSystemFileHandle).getFile();
            entries.push({ path: relative, directory: false, size: file.size, modified: file.lastModified, version: `${file.size}:${file.lastModified}` });
          } catch { warnings.push(`No se pudo leer la información de: ${relative}`); }
        }
      }
    };
    await walk(this.root, '');
    return { entries, warnings };
  }

  async previewChanges(): Promise<{ added: number; modified: number; removed: number; changed: boolean }> {
    return { added: 0, modified: 0, removed: 0, changed: this.consumeChanged() };
  }

  async read(relative: string): Promise<Uint8Array> {
    const parts = this.parts(relative);
    const name = parts.pop()!;
    const directory = await this.directory(parts);
    const handle = await directory.getFileHandle(name);
    const file = await handle.getFile();
    if (file.size > textLimit) throw new Error('Solo se admiten archivos de texto de hasta 2 MiB.');
    return new Uint8Array(await file.arrayBuffer());
  }

  async write(relative: string, bytes: Uint8Array, options: { create: boolean }): Promise<void> {
    const parts = this.parts(relative);
    const name = parts.pop()!;
    const directory = await this.directory(parts);
    if (options.create) {
      try { await directory.getFileHandle(name); throw new Error('Ya existe un archivo o carpeta con ese nombre.'); }
      catch (error) { if ((error as DOMException).name !== 'NotFoundError') throw error; }
    }
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(bytes as BufferSource);
      await writable.close();
    } catch (error) { try { await writable.abort(); } catch {} throw error; }
  }

  async mkdir(relative: string): Promise<void> {
    const parts = this.parts(relative);
    const name = parts.pop()!;
    const directory = await this.directory(parts);
    await directory.getDirectoryHandle(name, { create: true });
  }

  async rename(from: string, to: string): Promise<void> {
    const movable = this.root as DirectoryHandle;
    if (!this.capabilities.rename) throw new Error('Tu navegador no permite mover ni renombrar dentro de la carpeta. Actualiza el nombre desde tu explorador de archivos.');
    const fromParts = this.parts(from), toParts = this.parts(to);
    const name = fromParts.pop()!;
    const destination = toParts.pop()!;
    const sourceDirectory = await this.directory(fromParts);
    const destinationDirectory = await this.directory(toParts);
    let occupied = true;
    try { await destinationDirectory.getFileHandle(destination); }
    catch { try { await destinationDirectory.getDirectoryHandle(destination); } catch { occupied = false; } }
    if (occupied) throw new Error('El destino ya existe. No se sobrescribirá.');
    const handle = await sourceDirectory.getFileHandle(name).catch(async () => sourceDirectory.getDirectoryHandle(name)) as FileSystemHandle & { move?: (parent: FileSystemDirectoryHandle, name: string) => Promise<void> };
    if (typeof handle.move !== 'function') throw new Error('Tu navegador no permite mover ni renombrar dentro de la carpeta.');
    await handle.move(destinationDirectory, destination);
  }

  async file(relative: string): Promise<File> {
    const parts = this.parts(relative);
    const name = parts.pop()!;
    const directory = await this.directory(parts);
    return (await directory.getFileHandle(name)).getFile();
  }
}
