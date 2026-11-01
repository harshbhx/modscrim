/**
 * Enforces the one contrast exemption documented in design/tokens.override.css.
 *
 * Whistle orange #FF6A1F as an action fill measures 2.51:1 on chalk, under the
 * 3:1 the WCAG gate wants for a non-text element. The exemption holds only
 * because the control is identified by its label and its border, not by the
 * fill alone. So: if a rule paints itself with the action/accent colour, that
 * same rule must also declare a border from --color-action-border or
 * --color-border-strong. Otherwise the exemption's premise is false and the
 * control is unidentifiable.
 *
 * Run: npm run lint:tokens
 */
import { globSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';

const ROOTS = ['app/src/**/*.css', 'site/**/*.css'];
const SKIP = /(?:design|site[\\/]css)[\\/]tokens(\.override)?\.css$/;

/** A rule paints itself with the action colour. */
const FILL = /(?:^|[\s;{])(?:background|background-color)\s*:\s*[^;}]*(?:var\(\s*--color-(?:action|accent)\b[^)]*\)|#ff6a1f)/i;
/** ...and must carry a border from the approved tokens. */
const BORDER = /(?:^|[\s;{])border(?:-color|-top|-right|-bottom|-left)?\s*:\s*[^;}]*var\(\s*--color-(?:action-border|border-strong)\b/i;
/** Declaring the token itself is not a usage. */
const DECLARES_TOKEN = /--color-(?:action|accent)[a-z-]*\s*:/i;
/**
 * The exemption is about identifying a *control*. A decorative mark that nobody
 * can click (a status dot, a chip, a chart fill) is not a control, so a border
 * would not help anyone. Flag only things that look interactive.
 */
const INTERACTIVE = /\b(?:button|input|select|textarea|summary|\.btn\b|\[role=["']?button)/i;
const POINTER = /cursor\s*:\s*pointer/i;
/** Escape hatch for a genuine non-control that still uses the action fill. */
const DECORATIVE = /lint-action-border\s*:\s*decorative/i;

function* rules(css, file) {
  // Blank out comments so a commented-out example never trips the lint. The
  // replacement keeps length and newlines, so offsets still map onto `css`.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const selector = m[1].trim().split('\n').pop().trim();
    const body = m[2];
    const start = m.index + m[1].length;
    const raw = css.slice(start, start + m[0].length - m[1].length);
    // count from where the selector actually begins, not from the leading
    // whitespace the regex swallowed after the previous rule's closing brace
    const selectorStart = m.index + (m[1].length - m[1].trimStart().length);
    const line = clean.slice(0, selectorStart).split('\n').length;
    yield { selector, body, raw, line, file };
  }
}

const offenders = [];
let scanned = 0;

for (const pattern of ROOTS) {
  let files = [];
  try {
    files = globSync(pattern, { nodir: true });
  } catch {
    files = [];
  }
  for (const file of files) {
    if (SKIP.test(file)) continue;
    scanned += 1;
    const css = readFileSync(file, 'utf8');
    for (const rule of rules(css, file)) {
      if (!FILL.test(rule.body)) continue;
      if (DECLARES_TOKEN.test(rule.body) && !/(?:background|background-color)\s*:/i.test(rule.body)) continue;
      if (BORDER.test(rule.body)) continue;
      if (DECORATIVE.test(rule.raw)) continue;
      // only controls need a border to be identifiable
      if (!INTERACTIVE.test(rule.selector) && !POINTER.test(rule.body)) continue;
      offenders.push(rule);
    }
  }
}

if (offenders.length > 0) {
  console.error(
    `\nlint:tokens FAILED - ${offenders.length} rule(s) use the action fill without a border.\n` +
      `The light-mode exemption in design/tokens.override.css requires every orange fill\n` +
      `to carry border: 2px solid var(--color-action-border).\n`
  );
  for (const o of offenders) {
    console.error(`  ${relative(process.cwd(), o.file)}:${o.line}  ${o.selector} { ... }`);
  }
  console.error('');
  process.exit(1);
}

console.log(`lint:tokens OK - scanned ${scanned} stylesheet(s), no unbordered action fills.`);
