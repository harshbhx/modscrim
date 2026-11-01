/**
 * A minimal static file server for CI.
 *
 * The e2e suite points at the deployed Worker, which is the right target for
 * the demo and console flows but the wrong one for UI work: a pull request's
 * own markup is not deployed yet, so a spec asserting new markup would be
 * checked against the previous release. Surface specs are therefore served
 * from the build produced by the branch under test.
 *
 * Zero dependencies on purpose; it only has to serve a built SPA to Playwright.
 *
 * Usage: node scripts/serve-static.mjs <dir> [port]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'app/dist/client');
const port = Number(process.argv[3] ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

if (!existsSync(root)) {
  console.error(`serve-static: ${root} does not exist. Build first.`);
  process.exit(1);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // normalize() plus the prefix check keeps ../ out of the served root
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = resolve(join(root, requested));

  if (!file.startsWith(root + sep) && file !== root) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  // SPA fallback: client-side routes have no file of their own
  if (!existsSync(file)) file = join(root, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end('Not found');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store'
  });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`serve-static: ${root} on http://127.0.0.1:${port}`);
});
