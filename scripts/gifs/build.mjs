#!/usr/bin/env node
/**
 * Turn the recorded videos into GIFs and MP4s (run by .github/workflows/gifs.yml; needs ffmpeg and ffprobe).
 *
 *   node scripts/gifs/build.mjs [rawDir] [outDir]
 *
 * Reads <rawDir>/<src>.webm + <src>.timeline.json and app/e2e/gifs/manifest.json, cuts each GIF's
 * segments between marks, speeds them up, and writes <outDir>/<name>.gif and <name>.mp4 plus INDEX.md.
 * GIFs use ffmpeg's palettegen/paletteuse. If a GIF is over the size limit the converter steps down
 * colours, frame rate and width until it fits, and says so in INDEX.md.
 * Zero dependencies on purpose.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rawDir = resolve(process.argv[2] ?? 'app/e2e/gifs/out/raw');
const outDir = resolve(process.argv[3] ?? 'app/e2e/gifs/out/readme-gifs');
const manifest = JSON.parse(readFileSync('app/e2e/gifs/manifest.json', 'utf8'));
const LIMIT = 8 * 1024 * 1024;
mkdirSync(outDir, { recursive: true });

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
const duration = (file) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
const size = (file) => statSync(file).size;
const mb = (bytes) => (bytes / 1048576).toFixed(2) + ' MB';

const sources = new Map();
function source(name) {
  if (sources.has(name)) return sources.get(name);
  const video = resolve(rawDir, `${name}.webm`);
  const timelineFile = resolve(rawDir, `${name}.timeline.json`);
  if (!existsSync(video) || !existsSync(timelineFile)) { sources.set(name, null); return null; }
  const timeline = JSON.parse(readFileSync(timelineFile, 'utf8'));
  const marks = new Map(timeline.marks.map((m) => [m.name, m.t / 1000]));
  const entry = { name, video, marks, length: duration(video), width: timeline.width, height: timeline.height };
  sources.set(name, entry);
  return entry;
}

/** Resolve a gif's segments to {src, start, end, speed}, dropping any whose marks are missing. */
function resolveSegments(def, warnings) {
  const out = [];
  for (const seg of def.segments) {
    const src = source(seg.src);
    if (!src) { warnings.push(`source "${seg.src}" has no video; segment ${seg.from}..${seg.to} dropped`); continue; }
    const start = src.marks.get(seg.from);
    const end = src.marks.get(seg.to);
    if (start === undefined || end === undefined || end <= start) { warnings.push(`marks ${seg.from}..${seg.to} missing in "${seg.src}"; segment dropped`); continue; }
    out.push({ src, start: Math.max(0, start + (seg.fromOffset ?? 0) / 1000), end: Math.min(src.length, end + (seg.toOffset ?? 0) / 1000), speed: seg.speed ?? 1 });
  }
  return out;
}

function chain(segments, { fps, width }) {
  const inputs = [...new Set(segments.map((s) => s.src.name))];
  const args = inputs.flatMap((name) => ['-i', sources.get(name).video]);
  const parts = segments.map((s, i) =>
    `[${inputs.indexOf(s.src.name)}:v]trim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},setpts=(PTS-STARTPTS)/${s.speed.toFixed(4)},fps=${fps},scale=${width}:-2:flags=lanczos,setsar=1[s${i}]`);
  const labels = segments.map((_, i) => `[s${i}]`).join('');
  return { args, graph: `${parts.join(';')};${labels}concat=n=${segments.length}:v=1:a=0[cat]` };
}

function buildGif(name, segments, opts) {
  const file = resolve(outDir, `${name}.gif`);
  const { args, graph } = chain(segments, opts);
  const full = `${graph};[cat]split[a][b];[a]palettegen=max_colors=${opts.colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[out]`;
  run('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-filter_complex', full, '-map', '[out]', '-loop', '0', file]);
  return file;
}

function buildMp4(name, segments, width) {
  const file = resolve(outDir, `${name}.mp4`);
  const { args, graph } = chain(segments, { fps: 30, width });
  run('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-filter_complex', `${graph};[cat]format=yuv420p[out]`, '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', file]);
  return file;
}

const rows = [];
const notes = [];
for (const [name, def] of Object.entries(manifest.gifs)) {
  const warnings = [];
  let segments = resolveSegments(def, warnings);
  if (segments.length === 0) { rows.push({ name, title: def.title, status: 'MISSING', warnings }); console.log(`[gifs] ${name}: MISSING`); continue; }
  const total = () => segments.reduce((sum, s) => sum + (s.end - s.start) / s.speed, 0);
  let fitted = '';
  if (total() > def.maxSeconds) {
    const factor = total() / def.maxSeconds;
    segments = segments.map((s) => ({ ...s, speed: s.speed * factor }));
    fitted = `sped up a further ${factor.toFixed(2)}x to fit ${def.maxSeconds} s`;
  }
  const seconds = total();
  const ladder = [
    { colors: 128, fps: def.fps, width: def.width },
    { colors: 96, fps: def.fps, width: def.width },
    { colors: 64, fps: 12, width: def.width },
    { colors: 64, fps: 12, width: Math.round((def.width * 0.85) / 2) * 2 },
    { colors: 48, fps: 10, width: Math.round((def.width * 0.75) / 2) * 2 }
  ];
  let used = null;
  let gif = '';
  for (const step of ladder) {
    gif = buildGif(name, segments, step);
    used = step;
    if (size(gif) <= LIMIT) break;
    console.log(`[gifs] ${name}: ${mb(size(gif))} over limit at ${JSON.stringify(step)}, stepping down`);
  }
  const mp4 = buildMp4(name, segments, def.mp4Width ?? Math.min(1280, def.width * 4 / 3));
  const row = { name, title: def.title, status: size(gif) <= LIMIT ? 'ok' : 'OVER LIMIT', seconds, gifBytes: size(gif), mp4Bytes: size(mp4), used, fitted, warnings,
    segments: segments.map((s) => `${s.src.name} ${s.start.toFixed(1)}-${s.end.toFixed(1)} s x${s.speed.toFixed(2)}`) };
  rows.push(row);
  console.log(`[gifs] ${name}: ${seconds.toFixed(1)} s, gif ${mb(row.gifBytes)}, mp4 ${mb(row.mp4Bytes)} (${used.width}px, ${used.fps} fps, ${used.colors} colours)`);
}

const lines = [
  '# ModScrim README GIFs',
  '',
  `Built ${new Date().toISOString()} by scripts/gifs/build.mjs from app/e2e/gifs/manifest.json.`,
  `GIF size limit ${mb(LIMIT)} (README renders up to about 10 MB).`,
  '',
  '| File | What it shows | Length | GIF | MP4 | Encoding | Status |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((r) => r.status === 'MISSING'
    ? `| ${r.name}.gif | ${r.title} | - | - | - | - | MISSING |`
    : `| ${r.name}.gif | ${r.title} | ${r.seconds.toFixed(1)} s | ${mb(r.gifBytes)} | ${mb(r.mp4Bytes)} | ${r.used.width}px, ${r.used.fps} fps, ${r.used.colors} colours | ${r.status} |`),
  '',
  '## Where each GIF comes from',
  '',
  '- hero, how-it-works, end, and the console part of safety: one real demo room on a build of this branch (one POST /api/demo made by the app\'s own "Start a demo drill" button).',
  '- mod-view: a second real demo room, the phone viewport (390x844) joining through the join card and playing with D, T and B while Kai (sim) races it.',
  '- overlay and the overlay part of safety: the branch\'s real overlay page at 1920x1080 on a neutral backdrop, fed by fixture frames over a mocked socket (a demo room\'s overlay is not reachable in a browser). The frames are redacted by construction.',
  '- share-card: the branch\'s real /r/:id page fed a fixture report built with the app\'s own schema (demo rooms keep their report inside the room).',
  '- Demo rooms grade with the local estimate; the Twitch-graded flow needs a real channel login and is not recorded.',
  '',
  '## Cuts',
  '',
  ...rows.flatMap((r) => [`### ${r.name}`, ...(r.segments ?? []).map((s) => `- ${s}`), ...(r.fitted ? [`- ${r.fitted}`] : []), ...(r.warnings ?? []).map((w) => `- WARNING: ${w}`), ''])
];
writeFileSync(resolve(outDir, 'INDEX.md'), lines.join('\n'));
const bad = rows.filter((r) => r.status !== 'ok');
if (bad.length) console.log(`[gifs] not ok: ${bad.map((r) => `${r.name} (${r.status})`).join(', ')}`);
