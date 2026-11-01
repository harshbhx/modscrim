/**
 * One header and one footer for every page in site/ (T-135).
 *
 * The pages are plain static HTML, so the shared chrome would drift if it were
 * pasted by hand. This script owns the text between <header class="top"> and
 * </header>, and between <div class="foot-band"> and its closing </div>, in
 * every site/**\/*.html page. It also marks the current page (aria-current).
 * The markup itself lives in scripts/lib/site-chrome.mjs, which the docs
 * builder shares.
 *
 *   node scripts/site-chrome.mjs           rewrite the pages
 *   node scripts/site-chrome.mjs --check   exit 1 when a page is out of date (CI)
 *
 * Run: npm run site:chrome / npm run site:chrome:check
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { footer, header } from './lib/site-chrome.mjs';

const check = process.argv.includes('--check');

function pages(dir = 'site') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pages(`${dir}/${e.name}`) : e.name.endsWith('.html') ? [`${dir}/${e.name}`] : []
  );
}

let stale = 0;
for (const path of pages()) {
  const rel = path.slice('site/'.length).replace(/\.html$/, '');
  const prefix = '../'.repeat(rel.split('/').length - 1);
  const before = readFileSync(path, 'utf8');
  const after = before
    .replace(/<header class="top on-green">[\s\S]*?<\/header>/, () => header(rel, prefix))
    .replace(/<div class="foot-band">[\s\S]*?<\/footer>\s*<\/div>\s*<\/div>/, () => footer(prefix));
  if (after === before) continue;
  if (check) {
    console.error(`stale  ${path}`);
    stale += 1;
  } else {
    writeFileSync(path, after);
    console.log(`wrote  ${path}`);
  }
}
if (check && stale) {
  console.error('\nsite:chrome FAILED. Run: npm run site:chrome');
  process.exit(1);
}
if (check) console.log('site:chrome OK - every page has the shared header and footer.');
