/**
 * contrast-check: the colour half of the design-token gate.
 *
 *   1. design/tokens.json (the skill's own output) must pass validate.py with
 *      no exemptions at all.
 *   2. The shipped palette, i.e. tokens.json plus the deviations in
 *      design/tokens.override.css, must fail on EXACTLY the pairs the override
 *      file documents as exempt. Not a superset, not a subset. A new failure
 *      means someone widened the exemption; a missing one means the exemption
 *      is stale and should be deleted.
 *
 * Run: npm run contrast:check
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SKILL = '.claude/skills/artistic-color-palettes/scripts';
const VALIDATE = `${SKILL}/validate.py`;
const TOKENS = 'design/tokens.json';

/**
 * The one accepted exemption, as documented in design/tokens.override.css.
 * One colour, one cause, one mitigation: whistle orange is identified by its
 * label and its border-strong outline, not by the fill alone.
 */
const ALLOWED = [
  'accent #ff6a1f on bg #eef1e8',
  'accent #ff6a1f on surface #ffffff'
];

function python() {
  for (const candidate of ['python3', 'python']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      /* try the next name */
    }
  }
  throw new Error('No python3/python on PATH; contrast-check needs it to run validate.py.');
}

/** Run validate.py and return { code, out }. Never throws on a gate failure. */
function validate(py, file) {
  try {
    const out = execFileSync(py, ['-I', VALIDATE, file], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

/** Pull the "GATE FAILURES" block into a list of "<role> <hex> on <ground> <hex>" strings. */
function gateFailures(out) {
  const lines = out.split('\n');
  const start = lines.findIndex((l) => l.trim() === 'GATE FAILURES');
  if (start === -1) return [];
  const found = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s{2,}\[/.test(line)) break;
    const m = line.match(/^\s*\[(light|dark)\]\s+(.+?):\s/);
    if (m) found.push(m[2].trim());
  }
  return found;
}

const py = python();
let failed = false;

// --- 1. the generated baseline must be clean -------------------------------
const base = validate(py, TOKENS);
if (base.code !== 0) {
  console.error(`FAIL  ${TOKENS} does not pass validate.py on its own.\n`);
  console.error(base.out);
  failed = true;
} else {
  console.log(`ok    ${TOKENS} passes the WCAG gate with no exemptions`);
}

// --- 2. the shipped palette must fail on exactly the documented pairs ------
const dir = mkdtempSync(join(tmpdir(), 'contrast-'));
const shipped = join(dir, 'shipped.json');
try {
  execFileSync(py, ['-I', 'scripts/design-tokens/apply-override.py', TOKENS, shipped, SKILL], {
    stdio: 'inherit'
  });

  const got = gateFailures(validate(py, shipped).out);
  const extra = got.filter((p) => !ALLOWED.includes(p));
  const missing = ALLOWED.filter((p) => !got.includes(p));

  if (extra.length > 0) {
    console.error(`\nFAIL  the shipped palette has ${extra.length} contrast failure(s) outside the exemption:`);
    for (const p of extra) console.error(`        ${p}`);
    console.error('      Fix the colour, or widen the exemption in design/tokens.override.css');
    console.error('      and in ALLOWED in this script, with a reason.');
    failed = true;
  }
  if (missing.length > 0) {
    console.error(`\nFAIL  ${missing.length} exempted pair(s) no longer fail, so the exemption is stale:`);
    for (const p of missing) console.error(`        ${p}`);
    console.error('      Remove them from design/tokens.override.css and from ALLOWED.');
    failed = true;
  }
  if (extra.length === 0 && missing.length === 0) {
    console.log(`ok    shipped palette fails on exactly the ${ALLOWED.length} documented exempt pair(s)`);
    for (const p of ALLOWED) console.log(`        exempt: ${p}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
