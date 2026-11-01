/**
 * Page shell, track map and sidebar for the docs section (site/docs/).
 * Every generated page gets the shared header and footer, a track sidebar with
 * the current page marked, breadcrumbs and previous/next links.
 */
import { esc } from './markdown.mjs';
import { footer, header } from '../lib/site-chrome.mjs';

/**
 * Pages of each track, in reading order. An entry with `href` is an existing
 * hand-written page at the site root; an entry with `slug` is generated here.
 */
export const TRACKS = {
  streamer: {
    title: 'Streamer docs',
    who: 'You run a Twitch channel and want your mods ready for a raid.',
    pages: [
      { slug: 'index', title: 'What ModScrim is for' },
      { slug: 'quick-start', title: 'Quick start' },
      { slug: 'connect-twitch', title: 'Connect Twitch' },
      { href: 'setup.html', title: 'Setup guide' },
      { slug: 'console-walkthrough', title: 'Console walkthrough' },
      { href: 'overlay.html', title: 'OBS overlay setup' },
      { slug: 'grades-and-report', title: 'Reading the grades and the report' },
      { slug: 'push-and-undo', title: 'Approve, push, undo and remove everything' },
      { href: 'safety.html', title: 'Safety' },
      { href: 'privacy.html', title: 'Privacy and data retention' },
      { slug: 'troubleshooting', title: 'Troubleshooting' }
    ]
  },
  mods: {
    title: 'Mod docs',
    who: 'You moderate a channel that runs drills and want to know what you will see and do.',
    pages: [
      { slug: 'index', title: 'Mod docs overview' },
      { slug: 'join', title: 'Join with the 6-digit code' },
      { slug: 'practice-chat', title: 'The practice chat: Delete, Timeout, Ban' },
      { slug: 'keyboard', title: 'Keyboard shortcuts' },
      { slug: 'scoring', title: 'How scores and outcomes work' },
      { slug: 'simulated', title: 'What is simulated, and what you never touch' }
    ]
  },
  dev: {
    title: 'Developer docs',
    who: 'You want to read, run, deploy or change the code.',
    pages: [
      { slug: 'index', title: 'Developer docs overview' },
      { slug: 'architecture', title: 'Architecture' },
      { slug: 'run-locally', title: 'Run it locally' },
      { slug: 'project-structure', title: 'Project structure' },
      { slug: 'contracts', title: 'API and WebSocket contracts' },
      { slug: 'deployment', title: 'Deployment' },
      { slug: 'testing', title: 'Testing and CI' },
      { slug: 'design-system', title: 'Design system and tokens' },
      { slug: 'contributing', title: 'Contributing' },
      { slug: 'built-with-codex', title: 'How it was built with Codex' }
    ]
  }
};

export const urlOf = (track, entry) => (entry.href ? entry.href : `docs/${track}/${entry.slug === 'index' ? '' : `${entry.slug}.html`}`);
export const fileOf = (track, slug) => `docs/${track}/${slug}.html`;

function list(track, current, prefix) {
  const t = TRACKS[track];
  return `<div><h2>${t.title}</h2><ul>${t.pages
    .map((p) => {
      const u = urlOf(track, p);
      const here = current && !p.href && p.slug === current.slug && track === current.track;
      return `<li><a href="${prefix}${u}"${here ? ' aria-current="page"' : ''}>${esc(p.title)}</a></li>`;
    })
    .join('')}</ul></div>`;
}

function sidebar(current, prefix) {
  const hubHere = current.track === null && current.slug === 'index';
  const refs = `<div><h2>Reference</h2><ul><li><a href="${prefix}docs/glossary.html"${current.track === null && current.slug === 'glossary' ? ' aria-current="page"' : ''}>Glossary</a></li><li><a href="${prefix}faq.html">FAQ</a></li></ul></div>`;
  const hub = `<div><h2>Docs</h2><ul><li><a href="${prefix}docs/"${hubHere ? ' aria-current="page"' : ''}>Which docs are for me?</a></li></ul></div>`;
  if (current.track) return `<nav class="docnav" aria-label="${TRACKS[current.track].title}">${list(current.track, current, prefix)}${hub}${refs}</nav>`;
  return `<nav class="docnav${hubHere ? ' is-hub' : ''}" aria-label="Documentation sections">${hub}${Object.keys(TRACKS).map((k) => list(k, current, prefix)).join('')}${refs}</nav>`;
}

/**
 * @param {{ track: string | null, slug: string, title: string, description: string, lead: string, body: string, pn?: boolean }} p
 * @returns {{ path: string, html: string }}
 */
export function page(p) {
  const path = p.track ? fileOf(p.track, p.slug) : `docs/${p.slug}.html`;
  const rel = path.replace(/\.html$/, '');
  const prefix = '../'.repeat(rel.split('/').length - 1);
  const t = p.track ? TRACKS[p.track] : null;
  const isTrackIndex = p.track && p.slug === 'index';
  const trail = ['<a href="' + prefix + 'index.html">Home</a>', '<a href="' + prefix + 'docs/">Docs</a>'];
  if (t && !isTrackIndex) trail.push(`<a href="${prefix}docs/${p.track}/">${t.title}</a>`);
  trail.push(esc(isTrackIndex ? t.title : p.title.replace(/&amp;/g, '&')));
  let pn = '';
  if (t && p.pn !== false) {
    const idx = t.pages.findIndex((e) => !e.href && e.slug === p.slug);
    const prev = t.pages[idx - 1];
    const next = t.pages[idx + 1];
    const a = (e, label) => `<a class="pn-link" href="${prefix}${urlOf(p.track, e)}"><span>${label}</span><b>${esc(e.title)}</b></a>`;
    pn = `<nav class="pn" aria-label="Previous and next">${prev ? a(prev, 'Previous') : '<span></span>'}${next ? a(next, 'Next') : '<span></span>'}</nav>`;
  }
  const other = t
    ? `<p class="fine docs-track">${t.title}. ${esc(t.who)} Not what you came for? <a href="${prefix}docs/">Find the right docs</a>.</p>`
    : '';
  const title = p.title;
  let body = p.body;
  if (isTrackIndex && p.track !== 'dev') {
    body += `\n<h2>In this track</h2>\n<ol>${t.pages.filter((e) => !(e.slug === 'index')).map((e) => `<li><a href="@/${urlOf(p.track, e)}">${esc(e.title)}</a></li>`).join('')}</ol>`;
  }
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}${t ? ` | ${t.title}` : ' | Docs'} | ModScrim</title>
<meta name="description" content="${esc(p.description)}">
<meta name="theme-color" content="#123D2E">
<meta property="og:title" content="${esc(title)} | ModScrim docs">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ModScrim">
<meta property="og:url" content="https://modscrim.dualmindlab.tech/${rel.replace(/\/index$/, '/')}">
<meta property="og:image" content="https://modscrim.dualmindlab.tech/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="https://modscrim.dualmindlab.tech/${rel.replace(/\/index$/, '/')}">
<link rel="icon" href="${prefix}favicon.ico" sizes="32x32">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${prefix}icons/apple-touch-icon.png">
<link rel="manifest" href="${prefix}site.webmanifest">
<link rel="stylesheet" href="${prefix}css/fonts.css">
<link rel="stylesheet" href="${prefix}css/tokens.css">
<link rel="stylesheet" href="${prefix}css/tokens.override.css">
<link rel="stylesheet" href="${prefix}css/surfaces.css">
<link rel="stylesheet" href="${prefix}site.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${header(rel, prefix)}
<main id="main">
<section class="pagehead" aria-labelledby="page-title">
  <div class="wrap">
    <p class="crumb">${trail.join(' / ')}</p>
    <h1 id="page-title">${esc(title)}</h1>
    <p class="lead">${p.lead}</p>
  </div>
</section>
<section class="page"><div class="wrap"><div class="docs">
${sidebar({ track: p.track, slug: p.slug }, prefix)}
<div class="docs-main">
${other}
<div class="prose">
${body.replace(/@\//g, prefix)}
</div>
${pn}
</div>
</div></div></section>
</main>
${footer(prefix)}
<script src="${prefix}site.js"></script>
</body>
</html>
`;
  return { path: `site/${path}`, html };
}
