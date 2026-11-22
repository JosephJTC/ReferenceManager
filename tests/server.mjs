import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.map': 'application/json', '.md': 'text/plain', '.txt': 'text/plain', '.yaml': 'text/plain', '.yml': 'text/plain', '.cpp': 'text/plain', '.py': 'text/plain', '.rs': 'text/plain', '.java': 'text/plain' };

export function serve(dir, base = '/ReferenceManager/') {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith(base)) {
      if (pathname === '/' || pathname === '') { res.writeHead(302, { location: base }); return res.end(); }
      res.writeHead(404); return res.end('outside base');
    }
    let relative = pathname.slice(base.length) || 'index.html';
    if (relative.endsWith('/')) relative += 'index.html';
    const file = path.join(dir, relative);
    try {
      const content = await fs.readFile(file);
      res.writeHead(200, { 'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(content);
    } catch {
      try {
        const content = await fs.readFile(path.join(dir, '404.html'));
        res.writeHead(404, { 'content-type': 'text/html' });
        res.end(content);
      } catch { res.writeHead(404); res.end(); }
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}${base}` })));
}

export async function launch(puppeteer) { throw new Error('use launchBrowser'); }
export async function launchBrowser(playwright) {
  for (const channel of ['msedge', 'chrome']) {
    try { return await playwright.chromium.launch({ channel }); } catch {}
  }
  return playwright.chromium.launch();
}
