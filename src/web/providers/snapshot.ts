import type { LibraryProvider, ProviderEntry } from '../../core/provider.js';
import { validateRelativePath } from '../../core/provider.js';

export class SnapshotProvider implements LibraryProvider {
  readonly kind = 'local-snapshot' as const;
  readonly capabilities = { write: false, rename: false, watch: false, refresh: false };
  private files = new Map<string, File>();
  name = '';

  constructor(fileList: File[]) {
    const warnings: string[] = [];
    for (const file of fileList) {
      const raw = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = raw.split('/').filter(Boolean);
      if (parts.length > 1) parts.shift();
      const relative = parts.join('/');
      if (!relative) continue;
      try { validateRelativePath(relative); } catch { warnings.push(`Nombre omitido por no ser válido: ${relative}`); continue; }
      if (!this.name && (file as File & { webkitRelativePath?: string }).webkitRelativePath) {
        this.name = raw.split('/')[0];
      }
      this.files.set(relative, file);
    }
    this.warnings = warnings;
  }

  warnings: string[] = [];

  get location() { return this.name || 'instantánea'; }

  list(): Promise<{ entries: ProviderEntry[]; warnings: string[] }> {
    const directories = new Set<string>();
    const entries: ProviderEntry[] = [];
    for (const [path, file] of this.files) {
      const parts = path.split('/');
      for (let depth = 1; depth < parts.length; depth++) {
        const prefix = parts.slice(0, depth).join('/');
        if (!directories.has(prefix)) { directories.add(prefix); entries.push({ path: prefix, directory: true }); }
      }
      entries.push({ path, directory: false, size: file.size, modified: file.lastModified, version: `${file.size}:${file.lastModified}` });
    }
    return Promise.resolve({ entries, warnings: [...this.warnings] });
  }

  async read(path: string): Promise<Uint8Array> {
    const file = this.files.get(path);
    if (!file) throw new Error('El archivo no está en la instantánea seleccionada.');
    return new Uint8Array(await file.arrayBuffer());
  }
}
