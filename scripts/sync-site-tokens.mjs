/**
 * Keeps site/css/tokens.css and site/css/tokens.override.css identical to the
 * design/ sources.
 *
 * Why a copy: Cloudflare Pages publishes only site/ (destination_dir = site),
 * so a stylesheet there cannot import ../design/. The design/ files stay the
 * single source of truth; these two are build output.
 *
 *   node scripts/sync-site-tokens.mjs           copy design/ -> site/css/
 *   node scripts/sync-site-tokens.mjs --check   exit 1 when they have drifted (CI)
 *
 * Run: npm run site:tokens / npm run site:tokens:check
 */
import { copyFileSync, readFileSync } from 'node:fs';

const PAIRS = [
  ['design/tokens.css', 'site/css/tokens.css'],
  ['design/tokens.override.css', 'site/css/tokens.override.css']
];
const check = process.argv.includes('--check');
let drift = 0;

for (const [from, to] of PAIRS) {
  let same = false;
  try {
    same = readFileSync(from, 'utf8') === readFileSync(to, 'utf8');
  } catch {
    same = false;
  }
  if (check) {
    if (same) console.log(`ok    ${to} matches ${from}`);
    else {
      console.error(`FAIL  ${to} differs from ${from}. Run: npm run site:tokens`);
      drift += 1;
    }
  } else {
    copyFileSync(from, to);
    console.log(`copied ${from} -> ${to}`);
  }
}
process.exit(drift ? 1 : 0);
