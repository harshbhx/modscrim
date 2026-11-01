/**
 * Sorts the Playwright screenshots into one folder per surface and writes
 * INDEX.md (what is in the artifact, what is missing) and AUDIT.md (every
 * accessibility and responsiveness finding the audit recorded).
 *
 *   node scripts/ui-final-index.mjs [screenshotsDir] [auditFile] [outDir]
 *
 * Used by .github/workflows/ui-final-screens.yml; light and cheap, no browser.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [shotsDir = 'app/e2e/screenshots', auditFile = 'app/e2e/ui-final/audit.jsonl', outDir = 'ui-final-screens'] = process.argv.slice(2);

/** First match wins. */
const SURFACES = [
  ['app-landing', /^landing-/, 'App landing page (/)'],
  ['app-demo', /^demo-/, 'Demo entry (/demo)'],
  ['console', /^console-/, 'Streamer console, steps 1 to 6 and states'],
  ['mod', /^mod-/, 'Mod view: join, waiting, practice, ended'],
  ['overlay', /^overlay-/, 'OBS overlay: idle, live, report, long names'],
  ['share-card', /^report-/, 'Shared report card (/r/:id)'],
  ['shell', /^(privacy|notfound|shell-console|states-)/, 'Shell pages: privacy, 404, console under the shell, shared states'],
  ['docs', /^site-docs-/, 'Docs hub and the three tracks'],
  ['site', /^site-/, 'Marketing website']
];

const THEMES = ['light', 'dark'];
const WIDTHS = ['375', '768', '1440'];

const files = existsSync(shotsDir) ? readdirSync(shotsDir).filter((f) => f.endsWith('.png')).sort() : [];
const byFolder = new Map(SURFACES.map(([folder]) => [folder, []]));
byFolder.set('other', []);
for (const file of files) {
  const hit = SURFACES.find(([, re]) => re.test(file));
  const folder = hit ? hit[0] : 'other';
  mkdirSync(join(outDir, folder), { recursive: true });
  copyFileSync(join(shotsDir, file), join(outDir, folder, file));
  byFolder.get(folder).push(file);
}

const has = (folder, re) => byFolder.get(folder).some((f) => re.test(f));
const required = [
  ...['1-filters', '2-configure', '3-run', '3-complete', '4-grades', '5-rules', '6-proof', '6-pushed'].map((s) => ['console', new RegExp(`^console-demo-${s}-`), `console step ${s}`]),
  ...['waiting', 'practice', 'ended'].map((s) => ['mod', new RegExp(`^mod-${s}-`), `mod ${s}`]),
  ['mod', /^mod-\d+-/, 'mod join card'],
  ...['live', 'report', 'idle', 'long'].map((s) => ['overlay', new RegExp(`^overlay-(v2-)?${s}-`), `overlay ${s}`]),
  ['share-card', /^report-\d+-/, 'share card'],
  ['app-landing', /^landing-/, 'landing'],
  ['app-demo', /^demo-/, 'demo entry'],
  ['shell', /^privacy-/, 'privacy'],
  ['shell', /^notfound-/, '404'],
  ['docs', /^site-docs-index-/, 'docs hub'],
  ['site', /^site-index-/, 'site home']
];
const missing = required.filter(([folder, re]) => !has(folder, re)).map(([, , label]) => label);

let index = `# ui-final-screens\n\nOne folder per surface, light and dark at 375, 768 and 1440 px where the surface has them.\n\n`;
index += `| Folder | What | Files |\n|---|---|---|\n`;
for (const [folder, , what] of SURFACES) index += `| ${folder}/ | ${what} | ${byFolder.get(folder).length} |\n`;
if (byFolder.get('other').length) index += `| other/ | Uncategorised | ${byFolder.get('other').length} |\n`;
index += `\nTotal: ${files.length} screenshots. Coverage check: ${missing.length ? `MISSING ${missing.join(', ')}` : 'every required surface and state is present'}.\n`;
for (const [folder, , what] of SURFACES) {
  const list = byFolder.get(folder);
  if (!list.length) continue;
  index += `\n## ${folder}\n\n${what}\n\n`;
  for (const file of list) index += `- ${file}\n`;
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'INDEX.md'), index);

// ---- audit summary -------------------------------------------------------
const rows = existsSync(auditFile)
  ? readFileSync(auditFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
const groups = new Map();
for (const row of rows) {
  for (const f of row.findings) {
    const key = `${f.rule} | ${f.target} | ${f.detail}`;
    if (!groups.has(key)) groups.set(key, { f, labels: new Set() });
    groups.get(key).labels.add(row.label);
  }
}
let audit = `# Audit findings\n\n${rows.length} page states audited, ${groups.size} distinct finding(s).\n\n`;
const byRule = new Map();
for (const g of groups.values()) {
  if (!byRule.has(g.f.rule)) byRule.set(g.f.rule, []);
  byRule.get(g.f.rule).push(g);
}
for (const [rule, list] of [...byRule].sort()) {
  audit += `## ${rule} (${list.length})\n\n`;
  for (const g of list.sort((a, b) => b.labels.size - a.labels.size)) {
    const labels = [...g.labels];
    audit += `- ${g.f.target}: ${g.f.detail}. Seen in ${labels.length}: ${labels.slice(0, 6).join(', ')}${labels.length > 6 ? ', ...' : ''}\n`;
  }
  audit += '\n';
}
writeFileSync(join(outDir, 'AUDIT.md'), audit);
console.log(`ui-final-index: ${files.length} screenshots, ${rows.length} audited states, ${groups.size} findings, missing: ${missing.length ? missing.join(', ') : 'none'}`);
