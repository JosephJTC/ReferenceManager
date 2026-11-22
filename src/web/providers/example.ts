import type { LibraryProvider, ProviderEntry } from '../../core/provider.js';

export class ExampleProvider implements LibraryProvider {
  readonly kind = 'example' as const;
  readonly capabilities = { write: false, rename: false, watch: false, refresh: true };
  private base: string;
  private entries?: ProviderEntry[];

  constructor(base: string) { this.base = base.replace(/\/+$/, '') + '/'; }

  get location() { return 'ejemplos'; }

  private async manifest(): Promise<{ path: string; directory: boolean; size?: number }[]> {
    const response = await fetch(this.base + 'examples/manifest.json');
    if (!response.ok) throw new Error('No se pudo cargar la colección de ejemplos.');
    return (await response.json()).entries;
  }

  async list(): Promise<{ entries: ProviderEntry[]; warnings: string[] }> {
    if (this.entries) return { entries: this.entries, warnings: [] };
    const entries: ProviderEntry[] = [];
    for (const item of await this.manifest()) {
      entries.push({ path: item.path, directory: item.directory, size: item.size, version: item.size !== undefined ? `${item.size}` : undefined });
    }
    this.entries = entries;
    return { entries, warnings: [] };
  }

  async read(path: string): Promise<Uint8Array> {
    const response = await fetch(this.base + 'examples/coleccion/' + path.split('/').map(encodeURIComponent).join('/'));
    if (!response.ok) throw new Error('No se pudo leer el archivo de ejemplo.');
    return new Uint8Array(await response.arrayBuffer());
  }
}
