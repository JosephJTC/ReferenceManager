import * as fs from 'node:fs/promises';
import path from 'node:path';
import { NodeFsProvider } from './node-provider.js';
import { LibraryIndexer } from '../core/indexer.js';
import { buildLibraryIndex, indexSchemaId } from '../core/library-index.js';

async function main() {
  const args = process.argv.slice(2);
  const folder = args[0];
  if (!folder) {
    console.error('Uso: npm run index -- <carpeta> [--out archivo.json]');
    process.exit(1);
  }
  const outIndex = args.indexOf('--out');
  const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
  const root = path.resolve(folder);
  const indexer = new LibraryIndexer(new NodeFsProvider(root));
  const collection = await indexer.scan();
  const index = await buildLibraryIndex(collection, {
    id: 'local', name: path.basename(root),
    source: { kind: 'local-fs' }
  }, {
    fileSha: async file => {
      try {
        const bytes = await indexer.provider.read(file);
        const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
        return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
      } catch { return ''; }
    },
    fileSize: () => 0
  });
  for (const reference of index.references) {
    for (const file of reference.files) {
      try { file.size = (await fs.stat(path.join(root, file.path))).size; } catch { /* sin tamaño */ }
    }
  }
  const json = JSON.stringify(index, null, 2);
  if (out) await fs.writeFile(out, json);
  else console.log(json);
  console.error(`Índice ${indexSchemaId} generado: ${index.references.length} referencias.`);
}

await main();
