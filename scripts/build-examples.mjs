import * as fs from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve('examples/coleccion');
const target = path.resolve('public/examples');
await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(path.join(target, 'coleccion'), { recursive: true });
const entries = [];
async function walk(directory, prefix) {
  for (const child of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${child.name}` : child.name;
    if (child.isDirectory()) { entries.push({ path: relative, directory: true }); await walk(path.join(directory, child.name), relative); }
    else if (child.isFile()) {
      const stat = await fs.stat(path.join(directory, child.name));
      entries.push({ path: relative, directory: false, size: stat.size });
      await fs.mkdir(path.dirname(path.join(target, 'coleccion', relative)), { recursive: true });
      await fs.copyFile(path.join(directory, child.name), path.join(target, 'coleccion', relative));
    }
  }
}
await walk(source, '');
await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify({ entries }));
console.log(`Ejemplos preparados: ${entries.length} elementos.`);
