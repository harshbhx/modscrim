/**
 * Builds the docs section of the website (site/docs/**) with Node only.
 *
 *   - hub, streamer, mod and glossary pages: hand-written in scripts/docs-site/*.mjs
 *   - developer pages: rendered from the repository's Markdown (docs/*.md and two
 *     README.md sections) and from app/src/lib/contracts.ts
 *
 * The generated HTML is committed. CI runs `--check`, which fails when the
 * committed files differ from a fresh build (like the token sync check).
 *
 *   node scripts/build-docs-site.mjs                 write site/docs/**
 *   node scripts/build-docs-site.mjs --check         exit 1 when anything differs
 *   node scripts/build-docs-site.mjs --ref <gitref>  read the Markdown from a git ref
 *
 * Markdown source: the working tree when docs/getting-started.md exists there,
 * otherwise the ref in DOCS_SRC_REF or --ref (default origin/docs-readme-v2, the
 * documentation PR). Once that PR is merged the working tree wins automatically.
 *
 * Run: npm run site:docs / npm run site:docs:check
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { page, TRACKS } from './docs-site/layout.mjs';
import { esc, render } from './docs-site/markdown.mjs';
import { glossary, hub, pages as modPages } from './docs-site/mods.mjs';
import { pages as streamerPages } from './docs-site/streamer.mjs';

const REPO = 'https://github.com/harshbhx/modscrim';
const check = process.argv.includes('--check');
const refArg = process.argv.indexOf('--ref');
const REF = refArg > -1 ? process.argv[refArg + 1] : (process.env.DOCS_SRC_REF ?? 'origin/docs-readme-v2');
const useTree = existsSync('docs/getting-started.md');

function source(path) {
  if (useTree) return readFileSync(path, 'utf8');
  return execFileSync('git', ['show', `${REF}:${path}`], { encoding: 'utf8', maxBuffer: 1 << 24 });
}

/** Markdown file -> developer page slug, and the site pages other guides map to. */
const DEV_SLUG = {
  'architecture.md': 'docs/dev/architecture.html',
  'getting-started.md': 'docs/dev/run-locally.html',
  'deployment.md': 'docs/dev/deployment.html',
  'testing.md': 'docs/dev/testing.html',
  'design-system.md': 'docs/dev/design-system.html',
  'contributing.md': 'docs/dev/contributing.html',
  'how-it-works.md': 'how-it-works.html',
  'safety.md': 'safety.html',
  'faq.md': 'faq.html',
  'glossary.md': 'docs/glossary.html',
  'troubleshooting.md': 'docs/streamer/troubleshooting.html',
  'README.md': 'docs/'
};

/** Rewrites a link in a source file at `from` (a repo-relative directory) to a site path, or a GitHub URL. */
function mapper(fromDir) {
  return (href) => {
    if (/^(https?:|mailto:|#)/.test(href)) return href;
    const [path, hash = ''] = href.split('#');
    const parts = `${fromDir}/${path}`.split('/').filter(Boolean);
    const out = [];
    for (const p of parts) (p === '..' ? out.pop() : p !== '.' && out.push(p));
    const repoPath = out.join('/');
    const name = repoPath.replace(/^docs\//, '');
    if (repoPath.startsWith('docs/') && !name.includes('/') && DEV_SLUG[name]) {
      const t = DEV_SLUG[name];
      return `@/${t}${t.startsWith('docs/dev/') && hash ? `#${hash}` : ''}`;
    }
    if (repoPath === 'docs/README.md') return '@/docs/';
    const isDir = !/\.[a-z0-9]+$/i.test(repoPath);
    return `${REPO}/${isDir ? 'tree' : 'blob'}/main/${repoPath}${hash ? `#${hash}` : ''}`;
  };
}

/** Splits a rendered guide into title, lead and body, dropping the breadcrumb and the Next line. */
function prepare(md) {
  const lines = md.split('\n');
  let title = '';
  let lead = '';
  const body = [];
  let seenTitle = false;
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    if (!seenTitle && l.startsWith('# ')) {
      title = l.slice(2).trim();
      seenTitle = true;
      continue;
    }
    if (/^\[(Docs|Repository)\]\(/.test(l)) continue;
    if (!lead && seenTitle && l.startsWith('> ')) {
      const q = [];
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''));
      i -= 1;
      lead = q.join(' ');
      continue;
    }
    if (/^\*\*(Next|Previous):\*\*/.test(l)) continue;
    if (/^<\/?(p|a|img|div)\b/.test(l.trim())) continue;
    body.push(l);
  }
  return { title, lead, body: body.join('\n') };
}

function section(md, heading) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l === `## ${heading}`);
  if (start < 0) throw new Error(`README.md has no "## ${heading}" section`);
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

const inlineMd = (s, map) => render(s, { mapLink: map }).html.replace(/^<p>|<\/p>$/g, '');

function guide(track, slug, file, over = {}) {
  const md = source(`docs/${file}`);
  const { title, lead, body } = prepare(md);
  const map = mapper('docs');
  const r = render(body, { mapLink: map });
  return {
    track,
    slug,
    title: over.title ?? title,
    description: over.description ?? lead.replace(/[`*[\]]|\([^)]*\)/g, '').slice(0, 200),
    lead: inlineMd(lead, map),
    body: toc(r) + r.html,
    sourceNote: `docs/${file}`
  };
}

function toc(r) {
  const h2 = r.headings.filter((h) => h.level === 2);
  if (h2.length < 3) return '';
  return `<nav class="toc" aria-label="On this page"><h2>On this page</h2><ul>${h2.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul></nav>\n`;
}

function fromReadme(slug, heading, title, lead, description) {
  const r = render(section(source('README.md'), heading), { mapLink: mapper('') });
  return { track: 'dev', slug, title, description, lead, body: r.html };
}

/** API and WebSocket contracts: every statement below is read from app/src/lib/contracts.ts. */
function contracts() {
  const src = readFileSync('app/src/lib/contracts.ts', 'utf8');
  const exports = [];
  const re = /(?:\/\*\*([\s\S]*?)\*\/\s*)?export (?:const|type) (\w+)/g;
  let m;
  while ((m = re.exec(src))) {
    const doc = (m[1] ?? '').split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim()).filter(Boolean).join(' ');
    exports.push({ name: m[2], doc });
  }
  const unique = [...new Map(exports.map((e) => [e.name, e])).values()];
  const header = src.slice(0, src.indexOf('export const FiltersZ'));
  const intro = (header.match(/\/\*\*([\s\S]*?)\*\//)?.[1] ?? '').split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim()).filter(Boolean).join(' ');
  const rows = unique.map((e) => `<tr><td><code>${esc(e.name)}</code></td><td>${esc(e.doc) || '&nbsp;'}</td></tr>`).join('');
  const body = `<h2 id="what">What this file is</h2>
<p>${esc(intro)}</p>
<p>The source is <a href="${REPO}/blob/main/app/src/lib/contracts.ts"><code>app/src/lib/contracts.ts</code></a>. The WebSocket message types <code>ClientMsg</code> and <code>ServerMsg</code> are re-exported from <code>@mfd/core</code>; their definitions are in <a href="${REPO}/blob/main/packages/core/src/protocol.ts"><code>packages/core/src/protocol.ts</code></a>. Routes, role routing and error codes are specified in <a href="${REPO}/blob/main/docs/for-agents/interfaces.md"><code>docs/for-agents/interfaces.md</code></a>.</p>
<h2 id="exports">Exports</h2>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Export</th><th>Notes from the source</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2 id="source">Source</h2>
<p>The file as of this build, so the schemas below are exactly what the app validates with.</p>
<pre data-lang="ts"><code>${esc(src.trimEnd())}</code></pre>`;
  return {
    track: 'dev',
    slug: 'contracts',
    title: 'API and WebSocket contracts',
    description: 'The zod schemas the ModScrim SPA validates network responses and overlay WebSocket messages with, read from app/src/lib/contracts.ts.',
    lead: 'The response shapes the SPA parses at the network boundary, including the redacted overlay messages.',
    body
  };
}

function devIndex() {
  const t = TRACKS.dev.pages.filter((p) => p.slug !== 'index');
  const desc = {
    architecture: 'How the Worker, the ChannelRoom Durable Object, D1, R2, the Queue and Twitch fit together.',
    'run-locally': 'Try the demo, run the app on your machine and register a Twitch application.',
    'project-structure': 'The repository layout, folder by folder.',
    contracts: 'The schemas for network responses and overlay messages, read from the code.',
    deployment: 'Ship the Worker and the website, and read the workflows.',
    testing: 'Run the suites and understand the CI gates.',
    'design-system': 'The tokens, the contrast gate and the brand kit.',
    contributing: 'Make a change the way this repository expects.',
    'built-with-codex': 'The process this project was built with.'
  };
  return {
    track: 'dev',
    slug: 'index',
    title: 'Developer docs overview',
    description: 'ModScrim developer documentation: architecture, running locally, contracts, deployment, testing, the design system and contributing.',
    lead: 'How ModScrim is built, and how to run, test, deploy and change it.',
    body: `<p>These pages are generated from the Markdown in the repository&rsquo;s <a href="${REPO}/tree/main/docs"><code>docs/</code></a> folder and from the code, so they stay in step with it. The specifications behind them are the <a href="${REPO}/blob/main/docs/for-agents/PRD.md">PRD</a> and the <a href="${REPO}/blob/main/docs/for-agents/SRS.md">SRS</a>.</p>
<ul class="dcards">${t.map((p) => `<li><a class="dcard" href="@/docs/dev/${p.slug}.html"><b>${esc(p.title)}</b><span>${esc(desc[p.slug] ?? '')}</span><em class="go">Read the page</em></a></li>`).join('')}</ul>
<p class="fine" style="margin-top:32px">Source code: <a href="${REPO}">${REPO}</a> (MIT licence).</p>`
  };
}

const all = [
  hub,
  glossary,
  ...streamerPages,
  ...modPages,
  devIndex(),
  guide('dev', 'architecture', 'architecture.md'),
  guide('dev', 'run-locally', 'getting-started.md', { title: 'Run it locally' }),
  fromReadme('project-structure', 'Repository structure', 'Project structure', 'Where everything lives in the repository.', 'The ModScrim repository layout, folder by folder.'),
  contracts(),
  guide('dev', 'deployment', 'deployment.md'),
  guide('dev', 'testing', 'testing.md', { title: 'Testing and CI' }),
  guide('dev', 'design-system', 'design-system.md', { title: 'Design system and tokens' }),
  guide('dev', 'contributing', 'contributing.md'),
  fromReadme('built-with-codex', 'Built with Codex', 'How it was built with Codex', 'The process behind the code, as recorded in the repository.', 'How ModScrim was built for the Codex x TwitchCon hackathon, as recorded in the repository.')
];

const out = new Map(all.map((p) => page(p)).map((r) => [r.path, r.html]));

const existing = (dir = 'site/docs') =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? existing(`${dir}/${e.name}`) : [`${dir}/${e.name}`])) : [];

if (check) {
  const bad = [];
  for (const [path, html] of out) if (!existsSync(path) || readFileSync(path, 'utf8') !== html) bad.push(`differs  ${path}`);
  for (const f of existing()) if (!out.has(f)) bad.push(`orphan   ${f}`);
  if (bad.length) {
    console.error(bad.join('\n'));
    console.error('\nsite:docs FAILED. The committed docs HTML differs from a fresh build. Run: npm run site:docs');
    process.exit(1);
  }
  console.log(`site:docs OK - ${out.size} pages match a fresh build (Markdown from ${useTree ? 'the working tree' : REF}).`);
} else {
  for (const f of existing()) if (!out.has(f)) rmSync(f);
  for (const [path, html] of out) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, html);
  }
  console.log(`site:docs wrote ${out.size} pages (Markdown from ${useTree ? 'the working tree' : REF}).`);
}
