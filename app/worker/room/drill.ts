import {
  DrillConfigInputZ,
  ModActionZ,
  buildWaveA,
  scoreDrill,
  simDecision,
  type ActionResult,
  type DrillConfig,
  type DrillScore,
  type DrillSnapshot,
  type DrillView,
  type JobKind,
  type LineState,
  type ModAction,
  type Participant,
  type PublicLine,
  type RedactedLine,
  type Reveal,
  type Role,
  type ServerMsg,
  type WaveLine
} from '@mfd/core';
import { z } from 'zod';
import { joinCode, randomId } from '../lib/ids.js';
import { log } from '../lib/log.js';
import { broadcast as broadcastToRoles } from './hub.js';
import type { Scheduler, JobHandler } from './scheduler.js';

const DrillConfigStoredZ = z.object({
  tactics: z.array(z.enum(['linkscam', 'spam', 'botwave', 'hateraid'])),
  primaryTactic: z.enum(['linkscam', 'spam', 'botwave', 'hateraid']),
  attackCount: z.number().int(),
  banterCount: z.number().int(),
  intervalMs: z.number().int(),
  slipWindowMs: z.number().int(),
  seed: z.number().int().min(0).max(0xffffffff),
  simMod: z.boolean()
});
const StoredLineZ = z.object({
  id: z.string(),
  wave: z.literal('A'),
  idx: z.number().int(),
  kind: z.enum(['attack', 'banter']),
  tactic: z.enum(['linkscam', 'spam', 'botwave', 'hateraid']).optional(),
  trick: z.enum(['plain', 'caps', 'leet', 'stretch', 'emoji', 'spaced', 'dotted', 'zerowidth', 'lookalike']).optional(),
  linkTrick: z.enum(['plain', 'spaced', 'bracket', 'leet', 'dotword']).optional(),
  tags: z.array(z.string()),
  user: z.string(),
  segments: z.array(z.object({ kind: z.enum(['text', 'link', 'slur']), text: z.string() })),
  text: z.string()
});
const EmitPayloadZ = z.object({ drillId: z.string(), idx: z.number().int().nonnegative() });
const LinePayloadZ = z.object({ drillId: z.string(), lineId: z.string() });
const EndPayloadZ = z.object({ drillId: z.string() });

type StoredLine = z.infer<typeof StoredLineZ>;
type DrillRow = {
  id: string;
  config: string;
  status: DrillView['status'];
  join_code: string;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
};
type LineRow = {
  id: string;
  wave: 'A';
  idx: number;
  kind: 'attack' | 'banter';
  tactic: string | null;
  trick: string | null;
  link_trick: string | null;
  tags: string;
  user: string;
  segments: string;
  text: string;
  shown_at: number | null;
  acted_by: string | null;
  action: ModAction | null;
  acted_at: number | null;
  slipped: number;
};

export class DrillError extends Error {
  constructor(readonly code: 'invalid' | 'not_found' | 'conflict', message: string, readonly field?: string) {
    super(message);
  }
}

function normalizeConfig(input: unknown): DrillConfig {
  const parsed = DrillConfigInputZ.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DrillError('invalid', issue?.message ?? 'Invalid drill configuration.', String(issue?.path[0] ?? 'config'));
  }
  return {
    tactics: parsed.data.tactics,
    primaryTactic: parsed.data.primaryTactic,
    attackCount: parsed.data.attackCount,
    banterCount: parsed.data.banterCount,
    intervalMs: parsed.data.intervalMs,
    slipWindowMs: parsed.data.slipWindowMs,
    seed: parsed.data.seed ?? crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
    simMod: parsed.data.simMod
  };
}

function asLine(row: LineRow): WaveLine {
  const parsed = StoredLineZ.parse({
    id: row.id,
    wave: row.wave,
    idx: row.idx,
    kind: row.kind,
    ...(row.tactic === null ? {} : { tactic: row.tactic }),
    ...(row.trick === null ? {} : { trick: row.trick }),
    ...(row.link_trick === null ? {} : { linkTrick: row.link_trick }),
    tags: JSON.parse(row.tags) as unknown,
    user: row.user,
    segments: JSON.parse(row.segments) as unknown,
    text: row.text
  });
  return parsed;
}

export class DrillEngine {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly scheduler: Scheduler,
    private readonly roomName: () => string
  ) {}

  private get sql() {
    return this.ctx.storage.sql;
  }

  registerJobs(register: (kind: JobKind, handler: JobHandler) => void): void {
    register('line.emit', ({ payload, now }) => this.emitLine(payload, now));
    register('line.slip', ({ payload, now }) => this.slipLine(payload, now));
    register('sim.act', ({ payload, now }) => this.simAct(payload, now));
    register('drill.end', ({ payload, now }) => this.endJob(payload, now));
  }

  async createDrill(input: unknown): Promise<{ drillId: string; joinCode: string }> {
    const config = normalizeConfig(input);
    const drillId = randomId(16);
    const code = joinCode();
    const createdAt = Date.now();
    const wave = buildWaveA(config, drillId);
    return this.ctx.storage.transactionSync(() => {
      const active = this.sql.exec<{ id: string; join_code: string; status: 'draft' | 'running' }>(
        "SELECT id, join_code, status FROM drills WHERE status IN ('draft', 'running') ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, created_at DESC LIMIT 1"
      ).toArray()[0];
      if (active?.status === 'draft') return { drillId: active.id, joinCode: active.join_code };
      if (active?.status === 'running') throw new DrillError('conflict', 'A drill is already running.');

      this.sql.exec(
        'INSERT INTO drills (id, seed, config, status, join_code, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        drillId,
        config.seed,
        JSON.stringify(config),
        'draft',
        code,
        createdAt
      );
      this.saveWave(drillId, wave);
      this.sql.exec('INSERT INTO drill_participants (drill_id, participant_id) SELECT ?, id FROM participants WHERE is_sim = 0', drillId);
      if (config.simMod) {
        this.sql.exec(
          "INSERT OR IGNORE INTO participants (id, display_name, is_sim, joined_at) VALUES ('kai', 'Kai', 1, ?)",
          createdAt
        );
        this.sql.exec('INSERT OR IGNORE INTO drill_participants (drill_id, participant_id) VALUES (?, ?)', drillId, 'kai');
      }
      return { drillId, joinCode: code };
    });
  }

  async updateDraft(drillId: string, input: unknown): Promise<DrillView> {
    const config = normalizeConfig(input);
    const wave = buildWaveA(config, drillId);
    const updatedAt = Date.now();
    this.ctx.storage.transactionSync(() => {
      const row = this.sql.exec<{ status: string }>('SELECT status FROM drills WHERE id = ?', drillId).toArray()[0];
      if (!row) throw new DrillError('not_found', 'Drill not found.');
      if (row.status !== 'draft') throw new DrillError('conflict', 'Only a draft drill can be edited.');
      this.sql.exec('DELETE FROM line_state WHERE line_id IN (SELECT id FROM wave_lines WHERE drill_id = ?)', drillId);
      this.sql.exec('DELETE FROM wave_lines WHERE drill_id = ?', drillId);
      this.sql.exec('UPDATE drills SET seed = ?, config = ? WHERE id = ?', config.seed, JSON.stringify(config), drillId);
      if (config.simMod) {
        this.sql.exec(
          "INSERT OR IGNORE INTO participants (id, display_name, is_sim, joined_at) VALUES ('kai', 'Kai', 1, ?)",
          updatedAt
        );
        this.sql.exec('INSERT OR IGNORE INTO drill_participants (drill_id, participant_id) VALUES (?, ?)', drillId, 'kai');
      } else {
        this.sql.exec("DELETE FROM drill_participants WHERE drill_id = ? AND participant_id = 'kai'", drillId);
      }
      this.saveWave(drillId, wave);
    });
    return this.getDrill(drillId);
  }

  async cancelDraft(drillId: string): Promise<void> {
    const cancelledAt = Date.now();
    this.ctx.storage.transactionSync(() => {
      const row = this.sql.exec<{ status: string }>('SELECT status FROM drills WHERE id = ?', drillId).toArray()[0];
      if (!row) throw new DrillError('not_found', 'Drill not found.');
      if (row.status !== 'draft') throw new DrillError('conflict', 'Only a draft drill can be cancelled.');
      this.sql.exec("UPDATE drills SET status = 'cancelled', ended_at = ? WHERE id = ?", cancelledAt, drillId);
    });
  }

  async startDrill(drillId: string): Promise<{ startedAt: number }> {
    const startedAt = Date.now();
    const total = this.ctx.storage.transactionSync(() => {
      const row = this.sql.exec<{ status: string; total: number }>(
        'SELECT d.status, COUNT(w.id) AS total FROM drills d LEFT JOIN wave_lines w ON w.drill_id = d.id WHERE d.id = ? GROUP BY d.id',
        drillId
      ).toArray()[0];
      if (!row) throw new DrillError('not_found', 'Drill not found.');
      if (row.status !== 'draft') throw new DrillError('conflict', 'Only a draft drill can be started.');
      this.sql.exec("UPDATE drills SET status = 'running', started_at = ? WHERE id = ?", startedAt, drillId);
      this.sql.exec(
        `INSERT INTO schedule (due_at, kind, key, payload) VALUES (?, 'line.emit', ?, ?)
         ON CONFLICT(kind, key) DO UPDATE SET due_at = excluded.due_at, payload = excluded.payload, attempts = 0`,
        startedAt,
        `${drillId}:0`,
        JSON.stringify({ drillId, idx: 0 })
      );
      return row.total;
    });
    await this.scheduler.rearm();
    this.broadcast({ type: 'drill.started', data: { drillId, startedAt, total } });
    log('drill.started', { room: this.roomName(), drill: drillId, lines: total });
    return { startedAt };
  }

  async stopDrill(drillId: string): Promise<{ endedAt: number }> {
    const endedAt = Date.now();
    const finished = this.finish(drillId, endedAt);
    if (!finished) throw new DrillError('conflict', 'Only a running drill can be stopped.');
    await this.clearDrillJobs(drillId);
    this.broadcastFinished(drillId, endedAt, finished.slippedLineIds);
    return { endedAt };
  }

  async getDrill(drillId: string): Promise<DrillView> {
    const loaded = this.load(drillId);
    if (!loaded) throw new DrillError('not_found', 'Drill not found.');
    return loaded;
  }

  snapshot(role: Role): DrillSnapshot {
    const current = this.sql.exec<{ id: string }>(
      "SELECT id FROM drills WHERE status IN ('draft', 'running', 'ended') ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, created_at DESC LIMIT 1"
    ).toArray()[0];
    const participants = this.currentParticipants();
    if (!current) return { drill: null, participants };
    const view = this.load(current.id);
    if (!view) return { drill: null, participants };
    const shown = view.lines.filter((line) => line.state?.shownAt !== undefined);
    const ended = view.status === 'ended';
    const reveal = ended ? this.reveal(view.lines) : undefined;
    return {
      drill: {
        drillId: view.drillId,
        status: view.status,
        startedAt: view.startedAt,
        total: view.lines.length,
        lines: shown.map((line) => {
          const state = line.state;
          const actedByName = state?.actedBy ? view.participants.find((person) => person.id === state.actedBy)?.name : undefined;
          const lineData = role === 'overlay'
            ? { lineId: line.id, user: line.user, len: Math.ceil(line.text.length / 4) * 4 } satisfies RedactedLine
            : { lineId: line.id, user: line.user, segments: line.segments } satisfies PublicLine;
          return {
            line: lineData,
            shownAt: state?.shownAt as number,
            state: state?.slipped ? 'slipped' as const : state?.actedBy ? 'acted' as const : 'open' as const,
            ...(actedByName ? { actedByName } : {}),
            ...(state?.action ? { action: state.action } : {})
          };
        }),
        score: view.score,
        ...(role !== 'overlay' && reveal ? { reveal } : {})
      },
      participants
    };
  }

  applyAction(pid: string, lineId: string, action: ModAction, now: number): ActionResult {
    return this.ctx.storage.transactionSync(() => {
      const row = this.sql.exec<{
        kind: 'attack' | 'banter'; status: string; shown_at: number | null; acted_by: string | null;
        slipped: number; member: number; winner: string | null;
      }>(
        `SELECT w.kind, d.status, s.shown_at, s.acted_by, s.slipped,
                EXISTS (SELECT 1 FROM drill_participants dp WHERE dp.drill_id = w.drill_id AND dp.participant_id = ?) AS member,
                p.display_name AS winner
           FROM wave_lines w JOIN drills d ON d.id = w.drill_id JOIN line_state s ON s.line_id = w.id
           LEFT JOIN participants p ON p.id = s.acted_by
          WHERE w.id = ?`,
        pid,
        lineId
      ).toArray()[0];
      if (!row || row.shown_at === null) return { ok: false, reason: 'not_shown' } as const;
      if (!row.member) return { ok: false, reason: 'not_participant' } as const;
      if (row.status !== 'running') return { ok: false, reason: 'ended' } as const;
      if (row.acted_by !== null) return { ok: false, reason: 'taken', by: row.winner ?? undefined } as const;
      if (row.slipped) return { ok: false, reason: 'slipped' } as const;
      const parsedAction = ModActionZ.safeParse({ type: 'mod.action', data: { lineId, action } });
      if (!parsedAction.success) return { ok: false, reason: 'ended' } as const;
      this.sql.exec('UPDATE line_state SET acted_by = ?, action = ?, acted_at = ? WHERE line_id = ?', pid, parsedAction.data.data.action, now, lineId);
      return {
        ok: true,
        lineId,
        pid,
        action,
        reactionMs: now - row.shown_at,
        falseBan: row.kind === 'banter'
      } as const;
    });
  }

  broadcastAction(result: Extract<ActionResult, { ok: true }>): void {
    const participant = this.sql.exec<{ display_name: string; is_sim: number }>(
      'SELECT display_name, is_sim FROM participants WHERE id = ?', result.pid
    ).toArray()[0];
    if (!participant) return;
    this.broadcast({
      type: 'drill.action',
      data: {
        lineId: result.lineId,
        participantId: result.pid,
        name: participant.display_name,
        isSim: participant.is_sim === 1,
        action: result.action,
        reactionMs: result.reactionMs,
        falseBan: result.falseBan
      }
    });
    this.broadcast({ type: 'drill.score', data: this.scoreForLine(result.lineId) });
    log('mod.action', { room: this.roomName(), pid: result.pid, result: 'accepted', reactionMs: result.reactionMs });
  }

  private async emitLine(payload: unknown, now: number): Promise<void> {
    const parsed = EmitPayloadZ.safeParse(payload);
    if (!parsed.success) throw new Error('invalid_emit_payload');
    const { drillId, idx } = parsed.data;
    const emission = this.ctx.storage.transactionSync(() => {
      const row = this.sql.exec<{
        status: string; started_at: number | null; config: string; id: string; idx: number;
        kind: string; tactic: string | null; trick: string | null; link_trick: string | null;
        tags: string; user: string; segments: string; text: string; shown_at: number | null;
      }>(
        `SELECT d.status, d.started_at, d.config, w.id, w.idx, w.kind, w.tactic, w.trick,
                w.link_trick, w.tags, w.user, w.segments, w.text, s.shown_at
           FROM drills d JOIN wave_lines w ON w.drill_id = d.id
           JOIN line_state s ON s.line_id = w.id
          WHERE d.id = ? AND w.idx = ?`,
        drillId,
        idx
      ).toArray()[0];
      if (!row || row.status !== 'running' || row.started_at === null) return null;
      const line = asLine({ ...row, wave: 'A' as const, kind: row.kind as 'attack' | 'banter', acted_by: null, action: null, acted_at: null, slipped: 0 });
      const shownAt = row.shown_at ?? now;
      const isNew = row.shown_at === null;
      if (isNew) this.sql.exec('UPDATE line_state SET shown_at = ? WHERE line_id = ? AND shown_at IS NULL', shownAt, row.id);
      const config = DrillConfigStoredZ.parse(JSON.parse(row.config));
      return { line, shownAt, isNew, startedAt: row.started_at, config };
    });
    if (!emission) return;

    if (emission.isNew) {
      this.broadcast({
        type: 'drill.line',
        data: {
          line: {
            lineId: emission.line.id,
            user: emission.line.user,
            segments: emission.line.segments
          },
          shownAt: emission.shownAt
        }
      }, (role) => role === 'overlay' ? {
        type: 'drill.line',
        data: {
          line: {
            lineId: emission.line.id,
            user: emission.line.user,
            len: Math.ceil(emission.line.text.length / 4) * 4
          },
          shownAt: emission.shownAt
        }
      } : {
        type: 'drill.line',
        data: {
          line: { lineId: emission.line.id, user: emission.line.user, segments: emission.line.segments },
          shownAt: emission.shownAt
        }
      });
    }

    await this.scheduler.schedule('line.slip', emission.line.id, emission.shownAt + emission.config.slipWindowMs, {
      drillId,
      lineId: emission.line.id
    });
    if (emission.config.simMod) {
      const decision = simDecision(emission.config.seed, emission.line);
      if (decision) await this.scheduler.schedule('sim.act', emission.line.id, emission.shownAt + decision.delayMs, {
        drillId,
        lineId: emission.line.id
      });
    }
    if (idx + 1 < emission.config.attackCount + emission.config.banterCount) {
      await this.scheduler.schedule('line.emit', `${drillId}:${idx + 1}`, emission.startedAt + (idx + 1) * emission.config.intervalMs, {
        drillId,
        idx: idx + 1
      });
    } else {
      await this.scheduler.schedule('drill.end', drillId, emission.shownAt + emission.config.slipWindowMs, { drillId });
    }
  }

  private async slipLine(payload: unknown, now: number): Promise<void> {
    const parsed = LinePayloadZ.safeParse(payload);
    if (!parsed.success) throw new Error('invalid_slip_payload');
    const { drillId, lineId } = parsed.data;
    const slipped = this.ctx.storage.transactionSync(() => {
      const state = this.sql.exec<{ kind: string; shown_at: number | null; acted_by: string | null; slipped: number; status: string }>(
        `SELECT w.kind, s.shown_at, s.acted_by, s.slipped, d.status
           FROM wave_lines w JOIN line_state s ON s.line_id = w.id JOIN drills d ON d.id = w.drill_id
          WHERE w.id = ? AND w.drill_id = ?`,
        lineId,
        drillId
      ).toArray()[0];
      if (!state || state.status !== 'running' || state.kind !== 'attack' || state.shown_at === null || state.acted_by !== null || state.slipped === 1) return false;
      this.sql.exec('UPDATE line_state SET slipped = 1 WHERE line_id = ? AND acted_by IS NULL AND slipped = 0', lineId);
      return true;
    });
    if (!slipped) return;
    this.broadcast({ type: 'drill.slipped', data: { lineId } });
    this.broadcast({ type: 'drill.score', data: this.scoreForDrill(drillId) });
    log('line.emit', { room: this.roomName(), drill: drillId, idx: lineId, result: 'slipped', actualAt: now });
  }

  private async simAct(payload: unknown, now: number): Promise<void> {
    const parsed = LinePayloadZ.safeParse(payload);
    if (!parsed.success) throw new Error('invalid_sim_payload');
    const line = this.sql.exec<{ id: string; kind: 'attack' | 'banter'; text: string }>(
      'SELECT id, kind, text FROM wave_lines WHERE drill_id = ? AND id = ?', parsed.data.drillId, parsed.data.lineId
    ).toArray()[0];
    const configRow = this.sql.exec<{ config: string; status: string }>(
      'SELECT config, status FROM drills WHERE id = ?', parsed.data.drillId
    ).toArray()[0];
    if (!line || !configRow || configRow.status !== 'running') return;
    const config = DrillConfigStoredZ.parse(JSON.parse(configRow.config));
    const decision = simDecision(config.seed, line);
    if (!decision) return;
    const result = this.applyAction('kai', line.id, decision.action, now);
    if (result.ok) this.broadcastAction(result);
  }

  private async endJob(payload: unknown, now: number): Promise<void> {
    const parsed = EndPayloadZ.safeParse(payload);
    if (!parsed.success) throw new Error('invalid_end_payload');
    const finished = this.finish(parsed.data.drillId, now);
    if (!finished) return;
    await this.clearDrillJobs(parsed.data.drillId);
    this.broadcastFinished(parsed.data.drillId, now, finished.slippedLineIds);
  }

  private finish(drillId: string, endedAt: number): { slippedLineIds: string[] } | null {
    return this.ctx.storage.transactionSync(() => {
      const row = this.sql.exec<{ status: string }>('SELECT status FROM drills WHERE id = ?', drillId).toArray()[0];
      if (!row || row.status !== 'running') return null;
      const slipped = this.sql.exec<{ id: string }>(
        `SELECT w.id FROM wave_lines w JOIN line_state s ON s.line_id = w.id
          WHERE w.drill_id = ? AND w.kind = 'attack' AND s.shown_at IS NOT NULL
            AND s.acted_by IS NULL AND s.slipped = 0`,
        drillId
      ).toArray().map((line) => line.id);
      this.sql.exec(
        `UPDATE line_state SET slipped = 1 WHERE line_id IN
          (SELECT w.id FROM wave_lines w WHERE w.drill_id = ? AND w.kind = 'attack')
          AND shown_at IS NOT NULL AND acted_by IS NULL AND slipped = 0`,
        drillId
      );
      this.sql.exec("UPDATE drills SET status = 'ended', ended_at = ? WHERE id = ?", endedAt, drillId);
      return { slippedLineIds: slipped };
    });
  }

  private async clearDrillJobs(drillId: string): Promise<void> {
    this.sql.exec(
      `DELETE FROM schedule WHERE (kind = 'drill.end' AND key = ?)
         OR (kind = 'line.emit' AND substr(key, 1, ?) = ?)
         OR (kind IN ('line.slip', 'sim.act') AND key IN (SELECT id FROM wave_lines WHERE drill_id = ?))`,
      drillId,
      drillId.length + 1,
      `${drillId}:`,
      drillId
    );
    await this.scheduler.rearm();
  }

  private broadcastFinished(drillId: string, endedAt: number, slippedLineIds: readonly string[]): void {
    for (const lineId of slippedLineIds) this.broadcast({ type: 'drill.slipped', data: { lineId } });
    const view = this.load(drillId);
    if (!view) return;
    const reveal = this.reveal(view.lines);
    const score = view.score;
    this.broadcast({ type: 'drill.score', data: score });
    this.broadcast({ type: 'drill.ended', data: { score, reveal } }, (role) => role === 'overlay'
      ? { type: 'drill.ended', data: { score } }
      : { type: 'drill.ended', data: { score, reveal } });
    log('drill.ended', { room: this.roomName(), drill: drillId, lines: view.lines.length, endedAt });
  }

  private saveWave(drillId: string, lines: readonly WaveLine[]): void {
    for (const line of lines) {
      this.sql.exec(
        `INSERT INTO wave_lines (id, drill_id, wave, idx, kind, tactic, trick, link_trick, tags, user, segments, text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        line.id,
        drillId,
        line.wave,
        line.idx,
        line.kind,
        line.tactic ?? null,
        line.trick ?? null,
        line.linkTrick ?? null,
        JSON.stringify(line.tags),
        line.user,
        JSON.stringify(line.segments),
        line.text
      );
      this.sql.exec('INSERT INTO line_state (line_id, slipped) VALUES (?, 0)', line.id);
    }
  }

  private load(drillId: string): DrillView | null {
    const row = this.sql.exec<DrillRow>('SELECT id, config, status, join_code, created_at, started_at, ended_at FROM drills WHERE id = ?', drillId).toArray()[0];
    if (!row) return null;
    const config = DrillConfigStoredZ.parse(JSON.parse(row.config));
    const lineRows = this.sql.exec<LineRow>(
      `SELECT w.id, w.wave, w.idx, w.kind, w.tactic, w.trick, w.link_trick, w.tags, w.user, w.segments, w.text,
              s.shown_at, s.acted_by, s.action, s.acted_at, s.slipped
         FROM wave_lines w JOIN line_state s ON s.line_id = w.id
        WHERE w.drill_id = ? ORDER BY w.idx`,
      drillId
    ).toArray();
    const lines = lineRows.map((lineRow) => {
      const line = asLine(lineRow);
      const state: LineState = {
        lineId: line.id,
        ...(lineRow.shown_at === null ? {} : { shownAt: lineRow.shown_at }),
        ...(lineRow.acted_by === null ? {} : { actedBy: lineRow.acted_by }),
        ...(lineRow.action === null ? {} : { action: lineRow.action }),
        ...(lineRow.acted_at === null ? {} : { actedAt: lineRow.acted_at }),
        slipped: lineRow.slipped === 1
      };
      return { ...line, state };
    });
    const participants = this.sql.exec<{ id: string; display_name: string; is_sim: number }>(
      `SELECT p.id, p.display_name, p.is_sim FROM participants p
         JOIN drill_participants dp ON dp.participant_id = p.id WHERE dp.drill_id = ? ORDER BY p.joined_at, p.id`,
      drillId
    ).toArray().map((person): Participant => ({ id: person.id, name: person.display_name, isSim: person.is_sim === 1 }));
    const states = new Map(lines.map((line) => [line.id, line.state]));
    return {
      drillId: row.id,
      status: row.status,
      config,
      joinCode: row.join_code,
      createdAt: row.created_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      lines,
      participants,
      score: scoreDrill(lines, states, participants)
    };
  }

  private scoreForDrill(drillId: string): DrillScore {
    return this.load(drillId)?.score ?? { mods: [], slipped: 0, attacksShown: 0 };
  }

  private scoreForLine(lineId: string): DrillScore {
    const row = this.sql.exec<{ drill_id: string }>('SELECT drill_id FROM wave_lines WHERE id = ?', lineId).toArray()[0];
    return row ? this.scoreForDrill(row.drill_id) : { mods: [], slipped: 0, attacksShown: 0 };
  }

  private reveal(lines: DrillView['lines']): Reveal[] {
    return lines.map((line) => ({
      lineId: line.id,
      kind: line.kind,
      ...(line.tactic ? { tactic: line.tactic } : {}),
      tags: line.tags
    }));
  }

  private currentParticipants(): DrillSnapshot['participants'] {
    const active = this.sql.exec<{ id: string; display_name: string; is_sim: number }>(
      `SELECT p.id, p.display_name, p.is_sim FROM participants p
         JOIN drill_participants dp ON dp.participant_id = p.id
         JOIN drills d ON d.id = dp.drill_id
        WHERE d.status IN ('draft', 'running')
        GROUP BY p.id ORDER BY p.joined_at, p.id`
    ).toArray();
    return active.map((person) => ({
      id: person.id,
      name: person.display_name,
      isSim: person.is_sim === 1,
      online: person.is_sim === 1 || this.ctx.getWebSockets(`p:${person.id}`).length > 0
    }));
  }

  private broadcast(
    message: ServerMsg,
    override?: (role: Role) => ServerMsg | null
  ): void {
    broadcastToRoles(this.ctx, (role) => override ? override(role) : message);
  }
}
