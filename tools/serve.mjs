// Servidor estatico minimo para trabajar en local con las mismas rutas que Caddy.
// Uso: node serve.mjs [puerto]   |   import { serve } from './serve.mjs'
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

export function serve(port = 0) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
      let file = path.join(ROOT, url);
      // Sin salir de la raiz.
      if (!file.startsWith(ROOT)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      let info = await stat(file).catch(() => null);
      if (info && info.isDirectory()) {
        file = path.join(file, 'index.html');
        info = await stat(file).catch(() => null);
      }
      // Mismo try_files que el Caddyfile: {path} y luego {path}.html
      if (!info) {
        const alt = file + '.html';
        info = await stat(alt).catch(() => null);
        if (info) file = alt;
      }
      if (!info) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'content-length': info.size,
        'cache-control': 'no-store'
      });
      createReadStream(file).pipe(res);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolve({ server, port: actual, origin: `http://127.0.0.1:${actual}` });
    });
  });
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const { origin } = await serve(Number(process.argv[2]) || 4173);
  console.log(`sirviendo ${ROOT} en ${origin}`);
}
