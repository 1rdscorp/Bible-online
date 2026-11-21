#!/usr/bin/env node
/**
 * Minimal static file server for local development (no dependencies).
 * GitHub Pages serves the same files in production.
 *
 *   npm start                     → http://localhost:8000
 *   PORT=3000 npm start
 *   HOST=0.0.0.0 npm start        → also reachable from a phone on your Wi-Fi
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || '127.0.0.1';

// ES modules must be served as JavaScript, or the browser refuses to run them.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }

  let file = resolve(join(ROOT, pathname));
  // Never serve anything outside the project, or dotfiles such as .git.
  const inside = file === ROOT || file.startsWith(ROOT + sep);
  if (!inside || pathname.split('/').some((part) => part.startsWith('.'))) return send(res, 403, 'Forbidden');

  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    send(res, 200, await readFile(file), TYPES[extname(file)] ?? 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found');
  }
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Serving ${ROOT}\n→ http://${shown}:${PORT}/  (Ctrl+C to stop)`);
});
