import {
  buildWaveA,
  DrillConfigInputZ,
  scoreDrill,
  type ActionResult,
  type DrillConfig,
  type DrillScore,
  type DrillSnapshot,
  type DrillStatus,
  type DrillView,
  type LineState,
  type ModAction,
  type Participant,
  type PublicLine,
  type RedactedLine,
  type Reveal,
  type Role,
  type Segment,
  type ServerMsg,
  type Tactic,
  type Trick,
  type LinkTrick,
  type WaveLine
} from '@mfd/core';
import { z } from 'zod';
import { joinCode as newJoinCode, randomId } from '../lib/ids.js';
import { log } from '../lib/log.js';
import { broadcast } from './hub.js';
import type { Scheduler } from './scheduler.js';
import { SIM_PARTICIPANT_ID, simPlan, syncSimMembership } from './sim.js';

/**
 * Drill engine (SRS §3.4, §8.5, FR-16 to FR-21): lifecycle, the drift-free clock, first action wins,
 * slips, stop and end, and the per-role snapshot. Every state change runs inside `transactionSync`
 * with no `await` between its reads and writes; jobs are idempotent because alarms can repeat.
 */

/** Messages the drill RPCs throw. RPC keeps an error's message, so the routes map these to HTTP codes. */
export const DRILL_ERRORS = {
  notFound: 'drill_not_found',
  conflict: 'drill_conflict',
  invalid: 'drill_invalid'
} as const;

/** The stored configuration: `DrillConfig` plus the P2 flags the schema accepts. */
export type StoredConfig = DrillConfig & { chatVote: boolean; announce: boolean };

type DrillRow = {
  id: string;
  seed: number;
  config: string;
  status: DrillStatus;
  join_code: string;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
};

type LineRow = {
  id: string;
  wave: 'A' | 'B';
  idx: number;
  kind: 'attack' | 'banter';
  tactic: string | null;
  trick: string | null;
  link_trick: string | null;
  tags: string;
  user: string;
  segments: string;
  text: string;
  state_id: string | null;
  shown_at: number | null;
  acted_by: string | null;
  action: string | null;
  acted_at: number | null;
  slipped: number | null;
};

type Finish = { endedAt: number; slipped: string[]; fresh: boolean; seed: number };

type Deps = {
  ctx: DurableObjectState;
  scheduler: Scheduler;
  roomName: () => string;
  touch: (now: number) => void;
  /** Participant IDs of mods with an open socket; they join each new draft without a code (FR-22). */
  connectedMods: () => string[];
};

const DRILL_COLUMNS = 'id, seed, config, status, join_code, created_at, started_at, ended_at';
const LINE_SELECT = `SELECT l.id, l.wave, l.idx, l.kind, l.tactic, l.trick, l.link_trick, l.tags, l.user, l.segments, l.text,
    s.line_id AS state_id, s.shown_at, s.acted_by, s.action, s.acted_at, s.slipped
  FROM wave_lines l LEFT JOIN line_state s ON s.line_id = l.id`;

const EmitJobZ = z.object({ drillId: z.string().min(1), idx: z.number().int().min(0) });
const SlipJobZ = z.object({ drillId: z.string().min(1), lineId: z.string().min(1) });
const EndJobZ = z.object({ drillId: z.string().min(1) });
const SimJobZ = z.object({
  drillId: z.string().min(1),
  lineId: z.string().min(1),
  action: z.enum(['delete', 'timeout', 'ban'])
});

/** Validate a config (FR-16). An omitted seed keeps `fallbackSeed`, or becomes a random uint32. */
export function parseConfig(input: unknown, fallbackSeed?: number): StoredConfig {
  const parsed = DrillConfigInputZ.safeParse(input);
  if (!parsed.success) throw new Error(DRILL_ERRORS.invalid);
  const c = parsed.data;
  return {
    tactics: c.tactics,
    primaryTactic: c.primaryTactic,
    attackCount: c.attackCount,
    banterCount: c.banterCount,
    intervalMs: c.intervalMs,
    slipWindowMs: c.slipWindowMs,
    seed: c.seed ?? fallbackSeed ?? randomSeed(),
    simMod: c.simMod,
    chatVote: c.chatVote,
    announce: c.announce
  };
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/** Overlay length hint (SRS §8.3): the text length rounded to a multiple of 4, at least 4. */
export function redactedLength(text: string): number {
  return Math.max(4, Math.round(text.length / 4) * 4);
}

export function publicLine(line: Pick<WaveLine, 'id' | 'user' | 'segments'>): PublicLine {
  return { lineId: line.id, user: line.user, segments: line.segments };
}

/** Exactly `lineId`, `user` and `len`: the only line shape an overlay socket ever receives. */
export function redactedLine(line: Pick<WaveLine, 'id' | 'user' | 'text'>): RedactedLine {
  return { lineId: line.id, user: line.user, len: redactedLength(line.text) };
}

function toWaveLine(r: LineRow): WaveLine {
  const line: WaveLine = {
    id: r.id,
    wave: r.wave,
    idx: r.idx,
    kind: r.kind,
    tags: JSON.parse(r.tags) as string[],
    user: r.user,
    segments: JSON.parse(r.segments) as Segment[],
    text: r.text
  };
  if (r.tactic !== null) line.tactic = r.tactic as Tactic;
  if (r.trick !== null) line.trick = r.trick as Trick;
  if (r.link_trick !== null) line.linkTrick = r.link_trick as LinkTrick;
  return line;
}

function toState(r: LineRow): LineState | null {
  if (r.state_id === null) return null;
  const state: LineState = { lineId: r.id, slipped: r.slipped === 1 };
  if (r.shown_at !== null) state.shownAt = r.shown_at;
  if (r.acted_by !== null) state.actedBy = r.acted_by;
  if (r.action !== null) state.action = r.action as ModAction;
  if (r.acted_at !== null) state.actedAt = r.acted_at;
  return state;
}

function toReveal(line: WaveLine): Reveal {
  const reveal: Reveal = { lineId: line.id, kind: line.kind, tags: line.tags };
  if (line.tactic !== undefined) reveal.tactic = line.tactic;
  return reveal;
}

export class DrillEngine {
  constructor(private readonly deps: Deps) {}

  private get sql() {
    return this.deps.ctx.storage.sql;
  }

  private tx<T>(fn: () => T): T {
    return this.deps.ctx.storage.transactionSync(fn);
  }

  private send(build: (role: Role) => ServerMsg | null): void {
    broadcast(this.deps.ctx, build);
  }

  // ---- reads ---------------------------------------------------------------------------------

  private drillRow(drillId: string): DrillRow | undefined {
    return this.sql.exec<DrillRow>(`SELECT ${DRILL_COLUMNS} FROM drills WHERE id = ?`, drillId).toArray()[0];
  }

  /** The one drill in `draft`, `voting` or `running`, if any (FR-20). */
  private activeDrill(): DrillRow | undefined {
    return this.sql
      .exec<DrillRow>(
        `SELECT ${DRILL_COLUMNS} FROM drills WHERE status IN ('draft', 'voting', 'running') ORDER BY created_at DESC, id LIMIT 1`
      )
      .toArray()[0];
  }

  /** What sockets see: the active drill, else the most recent ended one. Cancelled drills are never shown. */
  currentDrillId(): string | null {
    return this.currentDrill()?.id ?? null;
  }

  private currentDrill(): DrillRow | undefined {
    return this.sql
      .exec<DrillRow>(
        `SELECT ${DRILL_COLUMNS} FROM drills WHERE status != 'cancelled'
          ORDER BY CASE WHEN status IN ('draft', 'voting', 'running') THEN 0 ELSE 1 END, created_at DESC, id LIMIT 1`
      )
      .toArray()[0];
  }

  private lineRows(drillId: string): LineRow[] {
    return this.sql.exec<LineRow>(`${LINE_SELECT} WHERE l.drill_id = ? AND l.wave = 'A' ORDER BY l.idx`, drillId).toArray();
  }

  /** The drill's participants, in join order. */
  members(drillId: string): Participant[] {
    return this.sql
      .exec<{ id: string; display_name: string; is_sim: number }>(
        `SELECT p.id, p.display_name, p.is_sim FROM drill_participants dp JOIN participants p ON p.id = dp.participant_id
          WHERE dp.drill_id = ? ORDER BY p.joined_at, p.id`,
        drillId
      )
      .toArray()
      .map((p) => ({ id: p.id, name: p.display_name, isSim: p.is_sim === 1 }));
  }

  private nameOf(pid: string): string | undefined {
    return this.sql.exec<{ display_name: string }>('SELECT display_name FROM participants WHERE id = ?', pid).toArray()[0]
      ?.display_name;
  }

  private scoreOf(drillId: string, rows: LineRow[] = this.lineRows(drillId)): DrillScore {
    const states = new Map<string, LineState>();
    for (const r of rows) {
      const state = toState(r);
      if (state) states.set(r.id, state);
    }
    return scoreDrill(rows, states, this.members(drillId));
  }

  /** `DrillView` for the console (FR-20): lines with text, states, participants, score, status. */
  view(drillId: string): DrillView {
    const d = this.drillRow(drillId);
    if (!d) throw new Error(DRILL_ERRORS.notFound);
    const rows = this.lineRows(drillId);
    return {
      drillId: d.id,
      status: d.status,
      config: JSON.parse(d.config) as StoredConfig,
      joinCode: d.join_code,
      createdAt: d.created_at,
      startedAt: d.started_at,
      endedAt: d.ended_at,
      lines: rows.map((r) => ({ ...toWaveLine(r), state: toState(r) })),
      participants: this.members(drillId),
      score: this.scoreOf(drillId, rows)
    };
  }

  /**
   * The `drill` part of `drill.state` for one role (FR-21, SRS §8.3). Only shown lines are listed.
   * Overlays get `RedactedLine`s, no names of who acted and never the reveal.
   */
  snapshot(role: Role): DrillSnapshot['drill'] {
    const d = this.currentDrill();
    if (!d) return null;
    const rows = this.lineRows(d.id);
    const names = new Map(this.members(d.id).map((p) => [p.id, p.name]));
    const shown = rows.filter((r) => r.shown_at !== null);
    const drill: NonNullable<DrillSnapshot['drill']> = {
      drillId: d.id,
      status: d.status,
      startedAt: d.started_at,
      total: rows.length,
      lines: shown.map((r) => {
        const line = toWaveLine(r);
        const entry: NonNullable<DrillSnapshot['drill']>['lines'][number] = {
          line: role === 'overlay' ? redactedLine(line) : publicLine(line),
          shownAt: r.shown_at ?? 0,
          state: r.acted_by !== null ? 'acted' : r.slipped === 1 ? 'slipped' : 'open'
        };
        if (r.acted_by !== null) {
          if (r.action !== null) entry.action = r.action as ModAction;
          const name = names.get(r.acted_by) ?? this.nameOf(r.acted_by);
          if (role !== 'overlay' && name !== undefined) entry.actedByName = name;
        }
        return entry;
      }),
      score: this.scoreOf(d.id, rows)
    };
    if (d.status === 'ended' && role !== 'overlay') drill.reveal = shown.map((r) => toReveal(toWaveLine(r)));
    return drill;
  }

  // ---- lifecycle (FR-16, FR-20) ----------------------------------------------------------------

  /**
   * Create a draft with a new join code and wave A, or return the existing draft unchanged.
   * Mods with an open socket are added to the new draft (FR-22), so only new mods need the code.
   */
  create(input: unknown, now: number): { drillId: string; joinCode: string; created: boolean } {
    const result = this.tx(() => {
      const active = this.activeDrill();
      if (active) {
        if (active.status !== 'draft') throw new Error(DRILL_ERRORS.conflict);
        return { drillId: active.id, joinCode: active.join_code, created: false, lines: 0, seed: active.seed };
      }
      const config = parseConfig(input);
      const drillId = randomId(12);
      const code = newJoinCode();
      this.sql.exec(
        "INSERT INTO drills (id, seed, config, status, join_code, created_at) VALUES (?, ?, ?, 'draft', ?, ?)",
        drillId,
        config.seed,
        JSON.stringify(config),
        code,
        now
      );
      const lines = this.writeWaveA(drillId, config);
      for (const pid of this.deps.connectedMods()) {
        this.sql.exec(
          'INSERT OR IGNORE INTO drill_participants (drill_id, participant_id) SELECT ?, id FROM participants WHERE id = ?',
          drillId,
          pid
        );
      }
      syncSimMembership(this.sql, drillId, config.simMod, now);
      this.deps.touch(now);
      return { drillId, joinCode: code, created: true, lines, seed: config.seed };
    });
    if (result.created) {
      log('drill.created', {
        room: this.deps.roomName(),
        drill: result.drillId,
        lines: result.lines,
        mods: this.members(result.drillId).length,
        seed: result.seed
      });
    }
    return { drillId: result.drillId, joinCode: result.joinCode, created: result.created };
  }

  /** Replace a draft's configuration and rebuild wave A; the join code stays. An omitted seed keeps the draft's seed. */
  update(drillId: string, input: unknown, now: number): DrillView {
    this.tx(() => {
      const d = this.drillRow(drillId);
      if (!d) throw new Error(DRILL_ERRORS.notFound);
      if (d.status !== 'draft') throw new Error(DRILL_ERRORS.conflict);
      const config = parseConfig(input, d.seed);
      this.sql.exec('UPDATE drills SET seed = ?, config = ? WHERE id = ?', config.seed, JSON.stringify(config), drillId);
      this.writeWaveA(drillId, config);
      syncSimMembership(this.sql, drillId, config.simMod, now);
      this.deps.touch(now);
    });
    return this.view(drillId);
  }

  /** `draft → cancelled`. Cancelling a cancelled drill again is a no-op. */
  cancel(drillId: string, now: number): void {
    this.tx(() => {
      const d = this.drillRow(drillId);
      if (!d) throw new Error(DRILL_ERRORS.notFound);
      if (d.status === 'cancelled') return;
      if (d.status !== 'draft') throw new Error(DRILL_ERRORS.conflict);
      this.sql.exec("UPDATE drills SET status = 'cancelled' WHERE id = ?", drillId);
      this.deps.touch(now);
    });
  }

  private writeWaveA(drillId: string, config: DrillConfig): number {
    this.sql.exec('DELETE FROM line_state WHERE line_id IN (SELECT id FROM wave_lines WHERE drill_id = ?)', drillId);
    this.sql.exec("DELETE FROM wave_lines WHERE drill_id = ? AND wave = 'A'", drillId);
    const lines = buildWaveA(config, drillId);
    for (const l of lines) {
      this.sql.exec(
        `INSERT INTO wave_lines (id, drill_id, wave, idx, kind, tactic, trick, link_trick, tags, user, segments, text)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        l.id,
        drillId,
        l.wave,
        l.idx,
        l.kind,
        l.tactic ?? null,
        l.trick ?? null,
        l.linkTrick ?? null,
        JSON.stringify(l.tags),
        l.user,
        JSON.stringify(l.segments),
        l.text
      );
    }
    return lines.length;
  }

  /** `draft → running`: record `startedAt` and schedule line 0 at `startedAt` (FR-17). Starting a running drill is a no-op. */
  async start(drillId: string, now: number): Promise<{ startedAt: number }> {
    const result = this.tx(() => {
      const d = this.drillRow(drillId);
      if (!d) throw new Error(DRILL_ERRORS.notFound);
      if (d.status === 'running' && d.started_at !== null) return { startedAt: d.started_at, fresh: false, total: 0, seed: d.seed };
      if (d.status !== 'draft') throw new Error(DRILL_ERRORS.conflict);
      const total = this.sql
        .exec<{ n: number }>("SELECT COUNT(*) AS n FROM wave_lines WHERE drill_id = ? AND wave = 'A'", drillId)
        .one().n;
      this.sql.exec("UPDATE drills SET status = 'running', started_at = ? WHERE id = ?", now, drillId);
      this.deps.scheduler.enqueue('line.emit', `${drillId}:0`, now, { drillId, idx: 0 });
      this.deps.touch(now);
      return { startedAt: now, fresh: true, total, seed: d.seed };
    });
    await this.deps.scheduler.rearm();
    if (result.fresh) {
      const msg: ServerMsg = { type: 'drill.started', data: { drillId, startedAt: result.startedAt, total: result.total } };
      this.send(() => msg);
      log('drill.started', {
        room: this.deps.roomName(),
        drill: drillId,
        lines: result.total,
        mods: this.members(drillId).length,
        seed: result.seed
      });
    }
    return { startedAt: result.startedAt };
  }

  /** End a running drill now (FR-20): shown, open attacks slip; unshown lines are never emitted or scored. */
  async stop(drillId: string, now: number): Promise<{ endedAt: number }> {
    const result = this.finish(drillId, now, 'stop');
    await this.deps.scheduler.rearm();
    if (result?.fresh) this.announceEnd(drillId, result);
    if (!result) throw new Error(DRILL_ERRORS.notFound);
    return { endedAt: result.endedAt };
  }

  private finish(drillId: string, now: number, mode: 'stop' | 'job'): Finish | null {
    return this.tx(() => {
      const d = this.drillRow(drillId);
      if (!d) {
        if (mode === 'stop') throw new Error(DRILL_ERRORS.notFound);
        return null;
      }
      if (d.status === 'ended') {
        return mode === 'stop' ? { endedAt: d.ended_at ?? now, slipped: [], fresh: false, seed: d.seed } : null;
      }
      if (d.status !== 'running') {
        if (mode === 'stop') throw new Error(DRILL_ERRORS.conflict);
        return null;
      }
      const open = this.sql
        .exec<{ line_id: string }>(
          `SELECT s.line_id FROM line_state s JOIN wave_lines l ON l.id = s.line_id
            WHERE l.drill_id = ? AND l.kind = 'attack' AND s.shown_at IS NOT NULL AND s.acted_by IS NULL AND s.slipped = 0
            ORDER BY l.idx`,
          drillId
        )
        .toArray()
        .map((r) => r.line_id);
      for (const lineId of open) this.sql.exec('UPDATE line_state SET slipped = 1 WHERE line_id = ?', lineId);
      this.sql.exec("UPDATE drills SET status = 'ended', ended_at = ? WHERE id = ?", now, drillId);
      // Drop this drill's pending jobs. Keys are `<drillId>`, `<drillId>:<idx>` or `<drillId>-A-<idx>` (line IDs).
      this.sql.exec(
        `DELETE FROM schedule WHERE kind IN ('line.emit', 'line.slip', 'sim.act', 'drill.end')
          AND (key = ? OR substr(key, 1, ?) IN (?, ?))`,
        drillId,
        drillId.length + 1,
        `${drillId}:`,
        `${drillId}-`
      );
      this.deps.touch(now);
      return { endedAt: now, slipped: open, fresh: true, seed: d.seed };
    });
  }

  /** Broadcast the end: slips, then `drill.ended` with the reveal for console and mods only (FR-26). */
  private announceEnd(drillId: string, result: Finish): void {
    for (const lineId of result.slipped) {
      const msg: ServerMsg = { type: 'drill.slipped', data: { lineId } };
      this.send(() => msg);
    }
    const rows = this.lineRows(drillId);
    const score = this.scoreOf(drillId, rows);
    const shown = rows.filter((r) => r.shown_at !== null);
    const reveal = shown.map((r) => toReveal(toWaveLine(r)));
    this.send((role) =>
      role === 'overlay' ? { type: 'drill.ended', data: { score } } : { type: 'drill.ended', data: { score, reveal } }
    );
    // TODO(T-17): save the first version of the report here and broadcast `report.ready`.
    log('drill.ended', {
      room: this.deps.roomName(),
      drill: drillId,
      lines: shown.length,
      mods: score.mods.length,
      seed: result.seed
    });
  }

  // ---- jobs (SRS §3.4) -------------------------------------------------------------------------

  /** `line.emit <drillId>:<idx>`: show line `idx` once, then schedule its slip and the next emit (or the end). */
  emit(job: { payload: unknown; now: number }): void {
    const parsed = EmitJobZ.safeParse(job.payload);
    if (!parsed.success) return;
    const { drillId, idx } = parsed.data;
    const now = job.now;
    const out = this.tx(() => {
      const d = this.drillRow(drillId);
      if (!d || d.status !== 'running' || d.started_at === null) return null;
      const row = this.sql
        .exec<LineRow>(`${LINE_SELECT} WHERE l.drill_id = ? AND l.wave = 'A' AND l.idx = ?`, drillId, idx)
        .toArray()[0];
      if (!row || row.shown_at !== null) return null; // already shown: a repeated alarm emits nothing twice
      const config = JSON.parse(d.config) as StoredConfig;
      this.sql.exec(
        'INSERT INTO line_state (line_id, shown_at) VALUES (?, ?) ON CONFLICT(line_id) DO UPDATE SET shown_at = excluded.shown_at',
        row.id,
        now
      );
      if (row.kind === 'attack') {
        this.deps.scheduler.enqueue('line.slip', row.id, now + config.slipWindowMs, { drillId, lineId: row.id });
      }
      if (config.simMod) {
        // Kai (sim) acts after its delay unless someone was first or the line slipped (FR-39).
        const plan = simPlan(config.seed, row);
        if (plan) {
          this.deps.scheduler.enqueue('sim.act', row.id, now + plan.delayMs, { drillId, lineId: row.id, action: plan.action });
        }
      }
      const total = this.sql
        .exec<{ n: number }>("SELECT COUNT(*) AS n FROM wave_lines WHERE drill_id = ? AND wave = 'A'", drillId)
        .one().n;
      if (idx + 1 < total) {
        // Drift-free: line idx + 1 is due at startedAt + (idx + 1) × intervalMs, never "now plus interval".
        this.deps.scheduler.enqueue('line.emit', `${drillId}:${idx + 1}`, d.started_at + (idx + 1) * config.intervalMs, {
          drillId,
          idx: idx + 1
        });
      } else {
        this.deps.scheduler.enqueue('drill.end', drillId, now + config.slipWindowMs, { drillId });
      }
      return { line: toWaveLine(row), plannedAt: d.started_at + idx * config.intervalMs };
    });
    if (!out) return;
    const full: ServerMsg = { type: 'drill.line', data: { line: publicLine(out.line), shownAt: now } };
    const redacted: ServerMsg = { type: 'drill.line', data: { line: redactedLine(out.line), shownAt: now } };
    this.send((role) => (role === 'overlay' ? redacted : full));
    log('line.emit', { room: this.deps.roomName(), drill: drillId, idx, plannedAt: out.plannedAt, actualAt: now });
  }

  /** `line.slip <lineId>`: an attack nobody acted on by its deadline slips (FR-19). Banter never slips. */
  slip(job: { payload: unknown }): void {
    const parsed = SlipJobZ.safeParse(job.payload);
    if (!parsed.success) return;
    const { drillId, lineId } = parsed.data;
    const slipped = this.tx(() => {
      const row = this.sql
        .exec<{ kind: string; status: string; shown_at: number | null; acted_by: string | null; slipped: number }>(
          `SELECT l.kind, d.status, s.shown_at, s.acted_by, s.slipped
             FROM wave_lines l JOIN drills d ON d.id = l.drill_id JOIN line_state s ON s.line_id = l.id
            WHERE l.id = ? AND l.drill_id = ?`,
          lineId,
          drillId
        )
        .toArray()[0];
      if (!row || row.status !== 'running' || row.kind !== 'attack') return false;
      if (row.shown_at === null || row.acted_by !== null || row.slipped) return false;
      this.sql.exec('UPDATE line_state SET slipped = 1 WHERE line_id = ?', lineId);
      return true;
    });
    if (!slipped) return;
    const msg: ServerMsg = { type: 'drill.slipped', data: { lineId } };
    this.send(() => msg);
    this.broadcastScore(drillId);
  }

  /** `drill.end <drillId>`: due at the last line's `shownAt + slipWindowMs`. */
  end(job: { payload: unknown; now: number }): void {
    const parsed = EndJobZ.safeParse(job.payload);
    if (!parsed.success) return;
    const result = this.finish(parsed.data.drillId, job.now, 'job');
    if (result?.fresh) this.announceEnd(parsed.data.drillId, result);
  }

  /** `sim.act <lineId>`: Kai (sim) acts if the line is still open; otherwise Kai loses cleanly (FR-39). */
  simAct(job: { payload: unknown; now: number }): void {
    const parsed = SimJobZ.safeParse(job.payload);
    if (!parsed.success) return;
    const { drillId, lineId, action } = parsed.data;
    // `actedAt` is the time at the start of this alarm (SRS §5.9), like `webSocketMessage` for humans.
    const res = this.applyAction(SIM_PARTICIPANT_ID, lineId, action, job.now);
    log('mod.action', {
      room: this.deps.roomName(),
      drill: drillId,
      pid: SIM_PARTICIPANT_ID,
      result: res.ok ? 'ok' : res.reason,
      ...(res.ok ? { reactionMs: res.reactionMs } : {})
    });
    if (res.ok) this.broadcastAction(res);
  }

  // ---- actions (FR-18) -------------------------------------------------------------------------

  /** First action wins (SRS §8.5). Synchronous: no await between the read and the write. */
  applyAction(pid: string, lineId: string, action: ModAction, now: number): ActionResult {
    return this.tx(() => {
      const row = this.sql
        .exec<{ kind: string; status: string; shown_at: number | null; acted_by: string | null; slipped: number; member: number }>(
          `SELECT l.kind, d.status, s.shown_at, s.acted_by, s.slipped,
                  EXISTS (SELECT 1 FROM drill_participants dp WHERE dp.drill_id = l.drill_id AND dp.participant_id = ?) AS member
             FROM wave_lines l JOIN drills d ON d.id = l.drill_id JOIN line_state s ON s.line_id = l.id
            WHERE l.id = ?`,
          pid,
          lineId
        )
        .toArray()[0];
      if (!row || row.shown_at === null) return { ok: false, reason: 'not_shown' } as const;
      if (!row.member) return { ok: false, reason: 'not_participant' } as const;
      if (row.status !== 'running') return { ok: false, reason: 'ended' } as const;
      if (row.acted_by !== null) {
        const by = this.nameOf(row.acted_by);
        return by === undefined ? ({ ok: false, reason: 'taken' } as const) : ({ ok: false, reason: 'taken', by } as const);
      }
      if (row.slipped) return { ok: false, reason: 'slipped' } as const;
      this.sql.exec('UPDATE line_state SET acted_by = ?, action = ?, acted_at = ? WHERE line_id = ?', pid, action, now, lineId);
      this.deps.touch(now);
      return { ok: true, lineId, pid, action, reactionMs: now - row.shown_at, falseBan: row.kind === 'banter' } as const;
    });
  }

  /** `drill.action` to every role, then the new `drill.score`. */
  broadcastAction(res: Extract<ActionResult, { ok: true }>): void {
    const who = this.sql
      .exec<{ display_name: string; is_sim: number }>('SELECT display_name, is_sim FROM participants WHERE id = ?', res.pid)
      .toArray()[0];
    const msg: ServerMsg = {
      type: 'drill.action',
      data: {
        lineId: res.lineId,
        participantId: res.pid,
        name: who?.display_name ?? '',
        isSim: who?.is_sim === 1,
        action: res.action,
        reactionMs: res.reactionMs,
        falseBan: res.falseBan
      }
    };
    this.send(() => msg);
    const drillId = this.drillOfLine(res.lineId);
    if (drillId) this.broadcastScore(drillId);
  }

  drillOfLine(lineId: string): string | undefined {
    return this.sql.exec<{ drill_id: string }>('SELECT drill_id FROM wave_lines WHERE id = ?', lineId).toArray()[0]?.drill_id;
  }

  private broadcastScore(drillId: string): void {
    const msg: ServerMsg = { type: 'drill.score', data: this.scoreOf(drillId) };
    this.send(() => msg);
  }
}
