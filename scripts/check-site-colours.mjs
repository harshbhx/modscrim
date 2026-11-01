/**
 * "No new colours" gate for the static website (T-135).
 *
 * Every hex colour written by hand in site/ (stylesheets other than the two
 * copied token files, and the HTML pages) must be one of:
 *   - a value in design/tokens.css or design/tokens.override.css, or
 *   - a colour listed in brand/DESIGN.md.
 * Any rgb()/rgba()/hsl() other than a black or white shadow tint is rejected,
 * so a colour cannot hide in a function.
 *
 * Run: npm run site:colours
 */
import { globSync, readFileSync } from 'node:fs';

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const norm = (h) => {
  let x = h.slice(1).toLowerCase();
  if (x.length === 3) x = [...x].map((c) => c + c).join('');
  return `#${x.slice(0, 6)}`;
};

const allowed = new Set();
for (const f of ['design/tokens.css', 'design/tokens.override.css', 'brand/DESIGN.md']) {
  for (const h of readFileSync(f, 'utf8').match(HEX) ?? []) allowed.add(norm(h));
}

/**
 * HTML pages already held to the gate. T-135 covers the shared layer and the
 * home page; the inner pages still carry inline colours (swatches in the chat
 * samples) that T-136 removes, and it adds each page to this list as it does.
 */
const HTML_PAGES = ['site/index.html'];

const files = [
  ...globSync('site/*.css'),
  ...globSync('site/css/*.css').filter((f) => !/tokens(\.override)?\.css$/.test(f)),
  ...HTML_PAGES,
  'site/site.js'
];

const bad = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const h of line.match(HEX) ?? []) {
      if (!allowed.has(norm(h))) bad.push(`${file}:${i + 1}  ${h} is not a token or DESIGN.md colour`);
    }
    for (const fn of line.match(/\b(?:rgba?|hsla?)\([^)]*\)/g) ?? []) {
      if (!/^rgba?\(\s*(?:0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*[,)]/.test(fn)) {
        bad.push(`${file}:${i + 1}  ${fn} is a colour outside the tokens`);
      }
    }
  });
}

if (bad.length) {
  console.error(`\nsite:colours FAILED - ${bad.length} value(s):\n`);
  for (const b of bad) console.error(`  ${b}`);
  process.exit(1);
}
console.log(`site:colours OK - ${files.length} files, ${allowed.size} allowed colours, nothing new.`);
