/**
 * One header and one footer for every page in site/ (T-135).
 *
 * The pages are plain static HTML, so the shared chrome would drift if it were
 * pasted by hand. This script owns the text between <header class="top"> and
 * </header>, and between <div class="foot-band"> and its closing </div>, in
 * every site/*.html page. It also marks the current page (aria-current).
 *
 *   node scripts/site-chrome.mjs           rewrite the pages
 *   node scripts/site-chrome.mjs --check   exit 1 when a page is out of date (CI)
 *
 * Run: npm run site:chrome / npm run site:chrome:check
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const APP = 'https://app.modscrim.dualmindlab.tech';
const REPO = 'https://github.com/harshbhx/modscrim';
const check = process.argv.includes('--check');

/** Primary navigation. `pages` lists every page that counts as "inside" the item. */
const NAV = [
  { href: 'how-it-works.html', label: 'How it works', pages: ['how-it-works'] },
  { href: 'mods.html', label: 'For mods', pages: ['mods'] },
  { href: 'docs.html', label: 'Docs', pages: ['docs', 'quickstart', 'setup', 'overlay', 'troubleshooting', 'glossary'] },
  { href: 'safety.html', label: 'Safety', pages: ['safety'] },
  { href: 'demo.html', label: 'Demo', pages: ['demo'] },
  { href: 'faq.html', label: 'FAQ', pages: ['faq'] }
];

function header(page) {
  const link = (n) => `<a href="${n.href}"${n.pages.includes(page) ? ' aria-current="page"' : ''}>${n.label}</a>`;
  const home = page === 'index' ? ' aria-current="page"' : '';
  const small = NAV.map(link).join('');
  return `<header class="top on-green">
  <div class="wrap">
    <div class="nav">
      <a class="brand" href="index.html" aria-label="ModScrim home"${home}><img src="img/modscrim-horizontal-reverse.svg" alt="ModScrim" width="168" height="34"></a>
      <nav class="nav-links" aria-label="Main">${small}</nav>
      <a class="btn btn-orange btn-sm" href="${APP}/console">Sign in with Twitch</a>
      <details class="menu"><summary>Menu</summary><nav aria-label="Main, small screens">${small}</nav></details>
    </div>
  </div>
</header>`;
}

const footer = `<div class="foot-band">
  <div class="wrap">
    <footer class="foot">
      <div class="foot-grid">
        <div class="foot-brand">
          <img src="img/modscrim-horizontal-reverse.svg" alt="ModScrim" width="158" height="30">
          <p>Raid drills for your mod team.</p>
          <p style="margin-top:8px">Made for the Codex x TwitchCon hackathon, 2026.</p>
        </div>
        <nav aria-label="Product"><h2>Product</h2><ul><li><a href="how-it-works.html">How it works</a></li><li><a href="mods.html">For mods</a></li><li><a href="demo.html">Demo room</a></li><li><a href="overlay.html">OBS overlay</a></li><li><a href="console.html">Console preview</a></li></ul></nav>
        <nav aria-label="Docs"><h2>Docs</h2><ul><li><a href="docs.html">All docs</a></li><li><a href="quickstart.html">Quick start</a></li><li><a href="setup.html">Setup guide</a></li><li><a href="troubleshooting.html">Troubleshooting</a></li><li><a href="glossary.html">Glossary</a></li></ul></nav>
        <nav aria-label="Trust"><h2>Trust</h2><ul><li><a href="safety.html">Safety</a></li><li><a href="privacy.html">Privacy policy</a></li><li><a href="terms.html">Terms of use</a></li></ul></nav>
        <nav aria-label="More"><h2>More</h2><ul><li><a href="faq.html">FAQ</a></li><li><a href="${REPO}">Source code</a></li><li><a href="${REPO}/blob/main/LICENSE">MIT licence</a></li><li><a href="${REPO}/issues">Report a problem</a></li></ul></nav>
      </div>
      <div class="foot-legal"><p>ModScrim is not affiliated with or endorsed by Twitch.</p><p>&copy; 2026 Harsh Bhanushali and Dhairya Patel</p></div>
    </footer>
  </div>
</div>`;

let stale = 0;
for (const file of readdirSync('site').filter((f) => f.endsWith('.html'))) {
  const page = file.replace(/\.html$/, '');
  const path = `site/${file}`;
  const before = readFileSync(path, 'utf8');
  const after = before
    .replace(/<header class="top on-green">[\s\S]*?<\/header>/, header(page))
    .replace(/<div class="foot-band">[\s\S]*?<\/footer>\s*<\/div>\s*<\/div>/, footer);
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
