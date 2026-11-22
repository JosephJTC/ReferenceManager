import { GitHubProvider } from '../src/web/providers/github.js';
import { LibraryIndexer } from '../src/core/indexer.js';

const provider = new GitHubProvider({ owner: 'octocat', repo: 'Hello-World' });
const indexer = new LibraryIndexer(provider);
const collection = await indexer.scan();
console.log(`Repositorio real indexado: ${collection.entries.length} elementos, ${collection.references.length} referencias, ${collection.warnings.length} advertencias.`);
const file = collection.entries.find(entry => !entry.directory && /(^|\/)(readme|leeme)(\.[a-z]+)?$/i.test(entry.path) || /\.(md|txt)$/i.test(entry.path));
if (file) console.log(`Lectura de ejemplo ${file.path}: ${(await indexer.read(file.path)).content.slice(0, 60).trim()}`);
if (collection.warnings.length) console.log('Advertencias:', collection.warnings.join(' | '));
