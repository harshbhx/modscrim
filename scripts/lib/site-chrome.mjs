/**
 * The shared header and footer markup for every page in site/, as functions.
 *
 * Used by scripts/site-chrome.mjs (rewrites the hand-written pages) and by
 * scripts/build-docs-site.mjs (writes the generated docs pages). `prefix` is the
 * path from the page back to site/ ('' at the root, '../../' under docs/dev/).
 * `page` is the page's path inside site/ without .html, e.g. 'faq' or
 * 'docs/dev/architecture'.
 */
export const APP = 'https://app.modscrim.dualmindlab.tech';
export const REPO = 'https://github.com/harshbhx/modscrim';

/** Primary navigation. An item is "current" for every page in `pages` or under `under`. */
export const NAV = [
  { href: 'how-it-works.html', label: 'How it works', pages: ['how-it-works'] },
  { href: 'mods.html', label: 'For mods', pages: ['mods'] },
  { href: 'docs/', label: 'Docs', pages: ['setup', 'overlay', 'docs/index'], under: 'docs/' },
  { href: 'safety.html', label: 'Safety', pages: ['safety'] },
  { href: 'demo.html', label: 'Demo', pages: ['demo'] },
  { href: 'faq.html', label: 'FAQ', pages: ['faq'] }
];

const isCurrent = (n, page) => n.pages.includes(page) || (n.under && page.startsWith(n.under));

export function header(page, prefix = '') {
  const link = (n) => `<a href="${prefix}${n.href}"${isCurrent(n, page) ? ' aria-current="page"' : ''}>${n.label}</a>`;
  const home = page === 'index' ? ' aria-current="page"' : '';
  const small = NAV.map(link).join('');
  return `<header class="top on-green">
  <div class="wrap">
    <div class="nav">
      <a class="brand" href="${prefix}index.html" aria-label="ModScrim home"${home}><img src="${prefix}img/modscrim-horizontal-reverse.svg" alt="ModScrim" width="168" height="34"></a>
      <nav class="nav-links" aria-label="Main">${small}</nav>
      <a class="btn btn-orange btn-sm" href="${APP}/console">Sign in with Twitch</a>
      <details class="menu"><summary>Menu</summary><nav aria-label="Main, small screens">${small}</nav></details>
    </div>
  </div>
</header>`;
}

export function footer(prefix = '') {
  const a = (href, label) => `<li><a href="${prefix}${href}">${label}</a></li>`;
  const x = (href, label) => `<li><a href="${href}">${label}</a></li>`;
  return `<div class="foot-band">
  <div class="wrap">
    <footer class="foot">
      <div class="foot-grid">
        <div class="foot-brand">
          <img src="${prefix}img/modscrim-horizontal-reverse.svg" alt="ModScrim" width="158" height="30">
          <p>Raid drills for your mod team.</p>
          <p style="margin-top:8px">Made for the Codex x TwitchCon hackathon, 2026.</p>
        </div>
        <nav aria-label="Product"><h2>Product</h2><ul>${a('how-it-works.html', 'How it works')}${a('mods.html', 'For mods')}${a('demo.html', 'Demo room')}${a('overlay.html', 'OBS overlay')}${a('console.html', 'Console preview')}</ul></nav>
        <nav aria-label="Docs"><h2>Docs</h2><ul>${a('docs/', 'All docs')}${a('docs/streamer/', 'Streamer docs')}${a('docs/mods/', 'Mod docs')}${a('docs/dev/', 'Developer docs')}${a('docs/glossary.html', 'Glossary')}</ul></nav>
        <nav aria-label="Trust"><h2>Trust</h2><ul>${a('safety.html', 'Safety')}${a('privacy.html', 'Privacy policy')}${a('terms.html', 'Terms of use')}</ul></nav>
        <nav aria-label="More"><h2>More</h2><ul>${a('faq.html', 'FAQ')}${x(REPO, 'Source code')}${x(`${REPO}/blob/main/LICENSE`, 'MIT licence')}${x(`${REPO}/issues`, 'Report a problem')}</ul></nav>
      </div>
      <div class="foot-legal"><p>ModScrim is not affiliated with or endorsed by Twitch.</p><p>&copy; 2026 Harsh Bhanushali and Dhairya Patel</p></div>
    </footer>
  </div>
</div>`;
}
