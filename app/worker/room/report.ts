import {
  coachNote,
  coachStats,
  scoreDrill,
  type Engine,
  type GradePhase,
  type LineState,
  type ModAction,
  type Participant,
  type Report,
  type ReportCard,
  type Role,
  type ServerMsg,
  type TagCount
} from '@mfd/core';
import { z } from 'zod';
import { reportId as newReportId } from '../lib/ids.js';
import type { StoredConfig } from './drill.js';
import { broadcast } from './hub.js';

/**
 * After-action report (FR-27, SRS §7.4): one per ended drill, rebuilt from the room's own tables and
 * upserted into `reports`. Sections whose tables are still empty (grading, rules, proof, pushes) are
 * empty or absent, never an error, so a report can be built as soon as the drill ends and rebuilt as
 * the loop moves on. Synchronous SQL only: callers run `saveReport` inside `transactionSync`.
 *
 * `rules.rejected[].fpExample` is a real chat line. The full `Report` goes to the console only (S-06);
 * sockets get the numbers-only `ReportCard`.
 */

type Sql = DurableObjectStorage['sql'];

type DrillRow = { id: string; config: string; status: string };

type LineRow = {
  id: string;
  kind: 'attack' | 'banter';
  tactic: string | null;
  trick: string | null;
  shown_at: number | null;
  acted_by: string | null;
  action: string | null;
  acted_at: number | null;
  slipped: number | null;
};

type GradeRow = { line_id: string; phase: string; engine: string; permitted: number };

/** A saved coach's note (FR-42): the template, or the Workers AI wording that replaced it. */
const CoachNoteZ = z.object({ text: z.string().min(1), source: z.enum(['ai', 'template']) });
type CoachNote = NonNullable<Report['coachNote']>;

const PHASES: readonly GradePhase[] = ['A', 'B-before', 'B-after'];
const PUSH_STATUSES = new Set(['added', 'preexisting', 'failed', 'removed']);

/**
 * The stored rule-finder result (`rule_runs.result`, written by `findRules`). Parsed leniently: only the
 * fields the report needs, so a later change elsewhere in the result never breaks the report.
 */
const RuleRunZ = z.object({
  accepted: z.array(z.object({ term: z.string(), gain: z.number() })),
  rejected: z.array(z.object({ term: z.string(), hits: z.number(), fp: z.number(), fpExample: z.string().optional() })),
  stillByTag: z.array(z.object({ tag: z.string(), count: z.number(), needsBotRule: z.boolean() })).default([])
});

/** The stored fresh-wave proof (`proofs.result`, written by `proveFreshWave`). */
const ProofZ = z.object({
  total: z.number(),
  blockedBefore: z.number(),
  blockedAfter: z.number(),
  realChat: z.array(z.object({ count: z.number() })).default([])
});

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function drillRow(sql: Sql, drillId: string): DrillRow | undefined {
  return sql.exec<DrillRow>('SELECT id, config, status FROM drills WHERE id = ?', drillId).toArray()[0];
}

function meta(sql: Sql, key: string): string {
  return sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0]?.value ?? '';
}

function members(sql: Sql, drillId: string): Participant[] {
  return sql
    .exec<{ id: string; display_name: string; is_sim: number }>(
      `SELECT p.id, p.display_name, p.is_sim FROM drill_participants dp JOIN participants p ON p.id = dp.participant_id
        WHERE dp.drill_id = ? ORDER BY p.joined_at, p.id`,
      drillId
    )
    .toArray()
    .map((p) => ({ id: p.id, name: p.display_name, isSim: p.is_sim === 1 }));
}

function stateOf(r: LineRow): LineState | null {
  if (r.shown_at === null && r.acted_by === null && r.slipped === null) return null;
  const state: LineState = { lineId: r.id, slipped: r.slipped === 1 };
  if (r.shown_at !== null) state.shownAt = r.shown_at;
  if (r.acted_by !== null) state.actedBy = r.acted_by;
  if (r.action !== null) state.action = r.action as ModAction;
  if (r.acted_at !== null) state.actedAt = r.acted_at;
  return state;
}

function bump(counts: Record<string, number>, key: string | null): void {
  if (key !== null) counts[key] = (counts[key] ?? 0) + 1;
}

/**
 * One entry per graded phase. A line graded by both engines counts with its Twitch grade (as FR-31 reads
 * phase A), and the two engines' agreement is reported (FR-30). `passed` counts lines that got past the filters.
 */
function grading(sql: Sql, drillId: string): { phases: Report['grading']; twitchAfter: { passed: number; total: number } | null } {
  const rows = sql
    .exec<GradeRow>(
      `SELECT g.line_id, g.phase, g.engine, g.permitted FROM grades g JOIN wave_lines l ON l.id = g.line_id
        WHERE l.drill_id = ? ORDER BY g.line_id`,
      drillId
    )
    .toArray();
  const byPhase = new Map<string, Map<string, Partial<Record<Engine, boolean>>>>();
  for (const r of rows) {
    if (r.engine !== 'twitch' && r.engine !== 'local') continue;
    const lines = byPhase.get(r.phase) ?? new Map<string, Partial<Record<Engine, boolean>>>();
    const grades = lines.get(r.line_id) ?? {};
    grades[r.engine] = r.permitted === 1;
    lines.set(r.line_id, grades);
    byPhase.set(r.phase, lines);
  }

  const phases: Report['grading'] = [];
  let twitchAfter: { passed: number; total: number } | null = null;
  for (const phase of PHASES) {
    const lines = byPhase.get(phase);
    if (!lines || lines.size === 0) continue;
    let passed = 0;
    let twitchLines = 0;
    let twitchPassed = 0;
    let agree = 0;
    let both = 0;
    for (const grades of lines.values()) {
      const chosen = grades.twitch ?? grades.local;
      if (chosen) passed++;
      if (grades.twitch !== undefined) {
        twitchLines++;
        if (grades.twitch) twitchPassed++;
      }
      if (grades.twitch !== undefined && grades.local !== undefined) {
        both++;
        if (grades.twitch === grades.local) agree++;
      }
    }
    const total = lines.size;
    const engine: Engine | 'mixed' = twitchLines === total ? 'twitch' : twitchLines === 0 ? 'local' : 'mixed';
    const entry: Report['grading'][number] = { phase, engine, passed, total };
    if (both > 0) entry.agreement = { agree, total: both };
    phases.push(entry);
    if (phase === 'B-after' && twitchLines > 0) twitchAfter = { passed: twitchPassed, total: twitchLines };
  }
  return { phases, twitchAfter };
}

function rules(sql: Sql, drillId: string): Report['rules'] | undefined {
  const row = sql.exec<{ result: string }>('SELECT result FROM rule_runs WHERE drill_id = ?', drillId).toArray()[0];
  if (!row) return undefined;
  const parsed = RuleRunZ.safeParse(parseJson(row.result));
  if (!parsed.success) return undefined;
  const needsBotRule: TagCount[] = parsed.data.stillByTag
    .filter((t) => t.needsBotRule)
    .map((t) => ({ tag: t.tag, count: t.count, needsBotRule: t.needsBotRule }));
  return {
    accepted: parsed.data.accepted.map((a) => ({ term: a.term, gain: a.gain })),
    rejected: parsed.data.rejected.map((r) => {
      const entry: NonNullable<Report['rules']>['rejected'][number] = { term: r.term, hits: r.hits, fp: r.fp };
      if (r.fpExample) entry.fpExample = r.fpExample; // console only (S-06)
      return entry;
    }),
    needsBotRule
  };
}

function proof(sql: Sql, drillId: string, twitchAfter: { passed: number; total: number } | null): Report['proof'] {
  const row = sql.exec<{ result: string }>('SELECT result FROM proofs WHERE drill_id = ?', drillId).toArray()[0];
  if (!row) return undefined;
  const parsed = ProofZ.safeParse(parseJson(row.result));
  if (!parsed.success) return undefined;
  const p = parsed.data;
  const out: NonNullable<Report['proof']> = {
    total: p.total,
    blockedBefore: p.blockedBefore,
    blockedAfter: p.blockedAfter,
    realChatMatches: p.realChat.reduce((sum, r) => sum + r.count, 0)
  };
  if (twitchAfter) out.twitchAfter = twitchAfter;
  return out;
}

function pushes(sql: Sql, drillId: string): Report['pushes'] {
  return sql
    .exec<{ term: string; status: string; error: string | null }>(
      'SELECT term, status, error FROM pushes WHERE drill_id = ? ORDER BY rowid',
      drillId
    )
    .toArray()
    .filter((p) => PUSH_STATUSES.has(p.status)) // a `pending` push is still in flight
    .map((p) => {
      const entry: Report['pushes'][number] = { term: p.term, status: p.status as Report['pushes'][number]['status'] };
      if (p.error !== null) entry.error = p.error;
      return entry;
    });
}

/**
 * Build the report of an ended drill, or null when the drill is missing or not ended. `prior` keeps the
 * first build's `reportId` and `createdAt`, so a rebuild over unchanged tables gives the same report.
 */
export function buildReport(
  sql: Sql,
  drillId: string,
  prior: { reportId: string; createdAt: number; coachNote?: CoachNote }
): Report | null {
  const d = drillRow(sql, drillId);
  if (!d || d.status !== 'ended') return null;
  const config = JSON.parse(d.config) as StoredConfig;

  const lines = sql
    .exec<LineRow>(
      `SELECT l.id, l.kind, l.tactic, l.trick, s.shown_at, s.acted_by, s.action, s.acted_at, s.slipped
         FROM wave_lines l LEFT JOIN line_state s ON s.line_id = l.id
        WHERE l.drill_id = ? AND l.wave = 'A' ORDER BY l.idx`,
      drillId
    )
    .toArray();
  const states = new Map<string, LineState>();
  const tacticCounts: Record<string, number> = {};
  const trickCounts: Record<string, number> = {};
  for (const r of lines) {
    const state = stateOf(r);
    if (state) states.set(r.id, state);
    // Counts of the attacks the mods actually saw: tactic and trick names only, never text (S-06).
    if (r.kind === 'attack' && r.shown_at !== null) {
      bump(tacticCounts, r.tactic);
      bump(trickCounts, r.trick);
    }
  }

  const graded = grading(sql, drillId);
  const score = scoreDrill(lines, states, members(sql, drillId));
  const report: Report = {
    reportId: prior.reportId,
    drillId,
    channel: { id: meta(sql, 'broadcaster_id'), login: meta(sql, 'login'), displayName: meta(sql, 'display_name') },
    createdAt: prior.createdAt,
    config: {
      tactics: config.tactics,
      primaryTactic: config.primaryTactic,
      attackCount: config.attackCount,
      banterCount: config.banterCount,
      intervalMs: config.intervalMs,
      slipWindowMs: config.slipWindowMs
    },
    score,
    grading: graded.phases,
    tacticCounts,
    trickCounts,
    pushes: pushes(sql, drillId)
  };
  const ruleSection = rules(sql, drillId);
  if (ruleSection) report.rules = ruleSection;
  const proofSection = proof(sql, drillId, graded.twitchAfter);
  if (proofSection) report.proof = proofSection;
  // FR-42: every report carries a note. A Workers AI note saved earlier stays (the score it was written
  // from is final once the drill ends); otherwise the template note from the numbers.
  report.coachNote = prior.coachNote?.source === 'ai' ? prior.coachNote : { text: coachNote(coachStats(score)), source: 'template' };
  return report;
}

/**
 * Build and upsert the report of an ended drill (FR-27); null when the drill has not ended. The first save
 * draws a random `reportId` (16 bytes, base64url) and records `createdAt`; later saves keep both.
 * Idempotent. Run inside `transactionSync`.
 */
export function saveReport(sql: Sql, drillId: string, now: number): Report | null {
  const existing = sql
    .exec<{ report_id: string; created_at: number; report: string }>(
      'SELECT report_id, created_at, report FROM reports WHERE drill_id = ?',
      drillId
    )
    .toArray()[0];
  const prior: { reportId: string; createdAt: number; coachNote?: CoachNote } = existing
    ? { reportId: existing.report_id, createdAt: existing.created_at }
    : { reportId: newReportId(), createdAt: now };
  const savedNote = existing ? savedCoachNote(existing.report) : null;
  if (savedNote) prior.coachNote = savedNote;
  const report = buildReport(sql, drillId, prior);
  if (!report) return null;
  sql.exec(
    `INSERT INTO reports (drill_id, report_id, report, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(drill_id) DO UPDATE SET report = excluded.report`,
    drillId,
    report.reportId,
    JSON.stringify(report),
    report.createdAt
  );
  return report;
}

/** The coach's note inside a saved report's JSON, or null. */
function savedCoachNote(raw: string): CoachNote | null {
  const value = parseJson(raw);
  if (value === null || typeof value !== 'object') return null;
  const parsed = CoachNoteZ.safeParse((value as { coachNote?: unknown }).coachNote);
  return parsed.success ? parsed.data : null;
}

/**
 * Store a Workers AI coach's note on a saved report (FR-42), replacing the template note. Later rebuilds keep
 * it (`saveReport`). Returns false when the drill has no saved report. Run inside `transactionSync`.
 */
export function saveAiCoachNote(sql: Sql, drillId: string, text: string): boolean {
  const row = sql.exec<{ report: string }>('SELECT report FROM reports WHERE drill_id = ?', drillId).toArray()[0];
  if (!row) return false;
  const value = parseJson(row.report);
  if (value === null || typeof value !== 'object') return false;
  const note: CoachNote = { text, source: 'ai' };
  sql.exec('UPDATE reports SET report = ? WHERE drill_id = ?', JSON.stringify({ ...value, coachNote: note }), drillId);
  return true;
}

/** The saved report of a drill, or null when it has none yet. */
export function readReport(sql: Sql, drillId: string): Report | null {
  const row = sql.exec<{ report: string }>('SELECT report FROM reports WHERE drill_id = ?', drillId).toArray()[0];
  return row ? (JSON.parse(row.report) as Report) : null;
}

// ---- the card and `report.ready` (SRS §8.3, §8.7, S-06) -----------------------------------------

/**
 * The numbers-only card: counts and mod names, no terms, no line text and no chat lines (S-06). Every key is
 * copied by name, so nothing else in the report can reach a socket. The grade is phase A (wave A against the
 * channel's current filters), `termsPushed` counts terms this drill added that are still in place, and
 * `fresh` is the fresh-wave proof's before and after.
 */
export function reportCard(report: Report): ReportCard {
  const a = report.grading.find((g) => g.phase === 'A');
  return {
    drillId: report.drillId,
    attacksShown: report.score.attacksShown,
    slipped: report.score.slipped,
    mods: report.score.mods.map((m) => ({
      name: m.name,
      isSim: m.isSim,
      caught: m.caught,
      falseBans: m.falseBans,
      avgReactionMs: m.avgReactionMs
    })),
    grade: a ? { passed: a.passed, total: a.total, engine: a.engine } : null,
    termsPushed: report.pushes.filter((p) => p.status === 'added').length,
    fresh: report.proof
      ? { before: report.proof.blockedBefore, after: report.proof.blockedAfter, total: report.proof.total }
      : null
  };
}

/** `report.ready` for one role (SRS §8.3): the card for console and overlay, nothing for mods. */
export function reportReadyFor(role: Role, card: ReportCard): ServerMsg | null {
  return role === 'mod' ? null : { type: 'report.ready', data: { drillId: card.drillId, card } };
}

/**
 * Broadcast `report.ready` after a report update. `broadcast` passes the overlay copy through `forOverlay`,
 * so with `hide_names` on its mod names become "Mod 1", "Mod 2" (FR-46).
 */
export function broadcastReport(ctx: DurableObjectState, report: Report): void {
  const card = reportCard(report);
  broadcast(ctx, (role) => reportReadyFor(role, card));
}
