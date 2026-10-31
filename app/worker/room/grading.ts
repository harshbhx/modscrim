import { LIMITS, blockedBy, nextAllowedAt, type Engine, type Grade, type GradePhase, type GradesView, type JobKind } from '@mfd/core';
import { z } from 'zod';
import { log } from '../lib/log.js';
import { broadcast } from './hub.js';
import type { Scheduler, JobHandler } from './scheduler.js';
import { HelixError } from '../twitch/helix.js';
import { TwitchOAuthError } from '../twitch/oauth.js';

const GradePhaseZ = z.enum(['A', 'B-before', 'B-after']);
const GradeJobZ = z.object({ drillId: z.string().min(1), phase: GradePhaseZ });
const GradeResponseZ = z.object({
  data: z.array(z.object({ msg_id: z.string().min(1), is_permitted: z.boolean() }))
});
const EngineZ = z.enum(['twitch', 'local']);
const QuotaUnitZ = z.enum(['request', 'line']);
const StoredGradeZ = z.object({
  line_id: z.string(), phase: GradePhaseZ, engine: EngineZ, permitted: z.number().int(), blocked_by: z.string().nullable()
});
const GRADE_BATCH_MIN = 1;
const GRADE_BATCH_MAX = 100;
const DEFAULT_GRADING_BATCH_SIZE = 100;
const DEFAULT_GRADING_QUOTA_UNIT = 'request' as const;
const RATE_LIMIT_WAIT_MS = 60_000;
const HELIX_TIMEOUT_MS = 4_000;

type GradeDeps = {
  ctx: DurableObjectState;
  env: Env;
  scheduler: Scheduler;
  roomName: () => string;
  mode: () => string | null;
  broadcasterId: () => string | null;
  broadcasterType: () => string | null;
  getAccessToken: (rejectedToken?: string) => Promise<string>;
  blockedTerms: () => string[];
  refreshReport: (drillId: string, now: number) => unknown;
};

type QueueJob = { kind: JobKind; key: string; payload: unknown; now: number };
type DbGrade = z.infer<typeof StoredGradeZ>;

function phaseWave(phase: GradePhase): 'A' | 'B' {
  return phase === 'A' ? 'A' : 'B';
}

function gradeKey(drillId: string, phase: GradePhase): string {
  return `${drillId}:${phase}`;
}

function parseGradeConfig(value: string | undefined, fallback: number): number {
  const parsed = z.coerce.number().int().min(GRADE_BATCH_MIN).max(GRADE_BATCH_MAX).safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function normalizeLimitType(value: string | null): '' | 'affiliate' | 'partner' {
  return value === 'affiliate' || value === 'partner' ? value : '';
}

export class GradingEngine {
  constructor(private readonly deps: GradeDeps) {}

  private get sql() {
    return this.deps.ctx.storage.sql;
  }

  register(register: (kind: JobKind, handler: JobHandler) => void): void {
    register('grade.tick', (job) => this.tick(job));
  }

  async requestGrading(drillId: string, rawPhase: GradePhase): Promise<{ queued: number }> {
    const phase = GradePhaseZ.parse(rawPhase);
    const now = Date.now();
    const queued = this.deps.ctx.storage.transactionSync(() => {
      const drill = this.sql.exec<{ id: string }>('SELECT id FROM drills WHERE id = ?', drillId).toArray()[0];
      if (!drill) throw new Error('drill_not_found');
      const wave = phaseWave(phase);
      this.sql.exec(
        `INSERT OR IGNORE INTO grade_queue (line_id, phase, drill_id, status, enqueued_at)
         SELECT l.id, ?, ?, 'pending', ? FROM wave_lines l
          WHERE l.drill_id = ? AND l.wave = ? AND l.kind = 'attack'
            AND NOT EXISTS (SELECT 1 FROM grades g WHERE g.line_id = l.id AND g.phase = ? AND g.engine = 'twitch')`,
        phase, drillId, now, drillId, wave, phase
      );
      this.sql.exec(
        `UPDATE grade_queue SET status = 'pending' WHERE drill_id = ? AND phase = ?
          AND NOT EXISTS (SELECT 1 FROM grades g WHERE g.line_id = grade_queue.line_id AND g.phase = grade_queue.phase AND g.engine = 'twitch')`,
        drillId, phase
      );
      return this.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM grade_queue WHERE drill_id = ? AND phase = ? AND status = 'pending'",
        drillId, phase
      ).one().count;
    });
    if (queued === 0) {
      this.emitProgress(drillId, phase, this.phaseSummary(drillId, phase, 'twitch'));
      return { queued };
    }
    await this.deps.scheduler.schedule('grade.tick', gradeKey(drillId, phase), now, { drillId, phase });
    return { queued };
  }

  async gradeLocally(drillId: string, rawPhase: GradePhase): Promise<{ passed: number; total: number }> {
    const phase = GradePhaseZ.parse(rawPhase);
    const now = Date.now();
    const terms = this.deps.blockedTerms();
    const result = this.deps.ctx.storage.transactionSync(() => {
      const drill = this.sql.exec<{ id: string }>('SELECT id FROM drills WHERE id = ?', drillId).toArray()[0];
      if (!drill) throw new Error('drill_not_found');
      const lines = this.sql.exec<{ id: string; text: string }>(
        'SELECT id, text FROM wave_lines WHERE drill_id = ? AND wave = ? AND kind = \'attack\' ORDER BY idx',
        drillId, phaseWave(phase)
      ).toArray();
      let passed = 0;
      for (const line of lines) {
        const blocker = blockedBy(terms, line.text);
        const permitted = blocker === null;
        if (permitted) passed++;
        this.sql.exec(
          `INSERT INTO grades (line_id, phase, engine, permitted, blocked_by, graded_at)
           VALUES (?, ?, 'local', ?, ?, ?)
           ON CONFLICT(line_id, phase, engine) DO UPDATE SET permitted = excluded.permitted,
             blocked_by = excluded.blocked_by, graded_at = excluded.graded_at`,
          line.id, phase, permitted ? 1 : 0, blocker, now
        );
        this.sql.exec(
          `INSERT INTO grade_queue (line_id, phase, drill_id, status, enqueued_at) VALUES (?, ?, ?, 'done', ?)
           ON CONFLICT(line_id, phase) DO UPDATE SET status = 'done'`,
          line.id, phase, drillId, now
        );
      }
      this.sql.exec("UPDATE grade_queue SET status = 'done' WHERE drill_id = ? AND phase = ?", drillId, phase);
      return { passed, total: lines.length };
    });
    await this.deps.scheduler.cancel('grade.tick', gradeKey(drillId, phase));
    this.emitProgress(drillId, phase, this.phaseSummary(drillId, phase, 'local'));
    this.emitDone(drillId, phase, 'local');
    this.deps.refreshReport(drillId, now);
    log('grade.done', { room: this.deps.roomName(), drill: drillId, phase, engine: 'local', ...result });
    return result;
  }

  getGrades(drillId: string): GradesView {
    const drill = this.sql.exec<{ id: string }>('SELECT id FROM drills WHERE id = ?', drillId).toArray()[0];
    if (!drill) throw new Error('drill_not_found');
    const attackRows = this.sql.exec<{ phase: GradePhase; total: number }>(
      `SELECT CASE WHEN l.wave = 'A' THEN 'A' ELSE 'B-before' END AS phase, COUNT(*) AS total
         FROM wave_lines l WHERE l.drill_id = ? AND l.kind = 'attack' GROUP BY l.wave`,
      drillId
    ).toArray();
    const totalByPhase = new Map<GradePhase, number>();
    for (const row of attackRows) totalByPhase.set(row.phase, row.total);
    const rows = this.sql.exec<DbGrade>(
      `SELECT g.line_id, g.phase, g.engine, g.permitted, g.blocked_by FROM grades g
         JOIN wave_lines l ON l.id = g.line_id WHERE l.drill_id = ? ORDER BY g.phase, l.idx, g.engine`,
      drillId
    ).toArray();
    const lines: Grade[] = [];
    const byLinePhase = new Map<string, Partial<Record<Engine, boolean>>>();
    for (const row of rows) {
      const parsed = StoredGradeZ.safeParse(row);
      if (!parsed.success) continue;
      const grade: Grade = {
        lineId: parsed.data.line_id,
        phase: parsed.data.phase,
        engine: parsed.data.engine,
        permitted: parsed.data.permitted === 1,
        ...(parsed.data.blocked_by === null ? {} : { blockedBy: parsed.data.blocked_by })
      };
      lines.push(grade);
      const key = `${grade.lineId}:${grade.phase}`;
      const engines = byLinePhase.get(key) ?? {};
      engines[grade.engine] = grade.permitted;
      byLinePhase.set(key, engines);
    }
    const phases: GradesView['phases'] = {};
    for (const phase of ['A', 'B-before'] as const) {
      const total = totalByPhase.get(phase) ?? 0;
      if (total === 0) continue;
      const grades = [...byLinePhase.entries()].filter(([key]) => key.endsWith(`:${phase}`)).map(([, engines]) => engines);
      const done = grades.length;
      const passed = grades.reduce((count, engines) => count + Number(engines.twitch ?? engines.local ?? false), 0);
      const hasTwitch = grades.some((engines) => engines.twitch !== undefined);
      const hasLocal = grades.some((engines) => engines.local !== undefined);
      const pending = this.sql.exec<{ n: number; due_at: number | null }>(
        `SELECT COUNT(*) AS n, MIN(s.due_at) AS due_at FROM grade_queue q
           LEFT JOIN schedule s ON s.kind = 'grade.tick' AND s.key = ?
          WHERE q.drill_id = ? AND q.phase = ? AND q.status IN ('pending', 'sent')`,
        `${drillId}:${phase}`, drillId, phase
      ).one();
      const engine: Engine | 'mixed' = hasTwitch && hasLocal ? 'mixed' : hasTwitch ? 'twitch' : hasLocal ? 'local' :
        this.localConfigured() || this.deps.mode() === 'demo' ? 'local' : 'twitch';
      phases[phase] = {
        done,
        total,
        passed,
        engine,
        ...(pending.n > 0 && pending.due_at !== null ? { nextAt: pending.due_at } : {})
      };
    }
    if (totalByPhase.has('B-before')) {
      const after = lines.filter((grade) => grade.phase === 'B-after');
      const pending = this.sql.exec<{ count: number; due_at: number | null }>(
        `SELECT COUNT(*) AS count, MIN(s.due_at) AS due_at FROM grade_queue q
           LEFT JOIN schedule s ON s.kind = 'grade.tick' AND s.key = ?
          WHERE q.drill_id = ? AND q.phase = ? AND q.status IN ('pending', 'sent')`,
        `${drillId}:B-after`, drillId, 'B-after'
      ).one();
      if (after.length > 0 || pending.count > 0) {
        const chosen = new Map<string, Grade>();
        for (const grade of after) {
          const current = chosen.get(grade.lineId);
          if (!current || grade.engine === 'twitch') chosen.set(grade.lineId, grade);
        }
        const selected = [...chosen.values()];
        const engines = new Set(after.map((grade) => grade.engine));
        const engine: Engine | 'mixed' = engines.size > 1 ? 'mixed' : engines.values().next().value ??
          (this.localConfigured() || this.deps.mode() === 'demo' ? 'local' : 'twitch');
        phases['B-after'] = {
          done: selected.length,
          total: totalByPhase.get('B-before') ?? 0,
          passed: selected.filter((grade) => grade.permitted).length,
          engine,
          ...(pending.due_at === null ? {} : { nextAt: pending.due_at })
        };
      }
    }
    return { phases, lines };
  }

  async tick(job: QueueJob): Promise<void> {
    const parsed = GradeJobZ.safeParse(job.payload);
    if (!parsed.success) throw new Error('invalid_grade_payload');
    const { drillId, phase } = parsed.data;
    const active = this.sql.exec<{ due_at: number | null }>(
      `SELECT MIN(s.due_at) AS due_at FROM drills d JOIN schedule s ON s.kind = 'drill.end' AND s.key = d.id
        WHERE d.status = 'running'`
    ).one().due_at;
    if (active !== null) {
      await this.deps.scheduler.schedule('grade.tick', job.key, Math.max(active, job.now + 1), { drillId, phase });
      this.emitProgress(drillId, phase, this.phaseSummary(drillId, phase, 'twitch', Math.max(active, job.now + 1)));
      return;
    }

    if (this.deps.mode() === 'demo' || this.localConfigured()) {
      await this.gradeLocally(drillId, phase);
      return;
    }

    const queue = this.sql.exec<{ line_id: string }>(
      `SELECT q.line_id FROM grade_queue q WHERE q.drill_id = ? AND q.phase = ? AND q.status = 'pending'
         ORDER BY q.enqueued_at, q.line_id`, drillId, phase
    ).toArray();
    if (queue.length === 0) {
      await this.finishIfComplete(drillId, phase, 'twitch', job.now);
      return;
    }

    let accessToken: string;
    try {
      accessToken = await this.deps.getAccessToken();
    } catch (error) {
      if (this.noToken(error)) {
        await this.gradeLocally(drillId, phase);
        return;
      }
      throw error;
    }

    const broadcasterId = this.deps.broadcasterId();
    if (!broadcasterId) {
      await this.gradeLocally(drillId, phase);
      return;
    }
    const limitType = normalizeLimitType(this.deps.broadcasterType());
    const limits = LIMITS[limitType];
    const configuredBatch = parseGradeConfig(this.deps.env.GRADING_BATCH_SIZE, DEFAULT_GRADING_BATCH_SIZE);
    const quotaUnit = QuotaUnitZ.safeParse(this.deps.env.GRADING_QUOTA_UNIT);
    const unit = quotaUnit.success ? quotaUnit.data : DEFAULT_GRADING_QUOTA_UNIT;
    const maxLines = Math.min(configuredBatch, unit === 'line' ? limits.perMinute : GRADE_BATCH_MAX);
    const ids = queue.slice(0, maxLines).map((row) => row.line_id);
    const placeholders = ids.map(() => '?').join(',');
    const batch = this.sql.exec<{ id: string; text: string }>(
      `SELECT id, text FROM wave_lines WHERE id IN (${placeholders}) ORDER BY idx`, ...ids
    ).toArray();
    const units = unit === 'line' ? batch.length : 1;
    const sends = this.sql.exec<{ ts: number; units: number }>(
      'SELECT ts, units FROM grade_sends WHERE ts > ? ORDER BY ts', job.now - 3_600_000
    ).toArray();
    const dueAt = nextAllowedAt(sends, job.now, limits, units);
    if (dueAt > job.now) {
      await this.deps.scheduler.schedule('grade.tick', job.key, dueAt, { drillId, phase });
      this.emitProgress(drillId, phase, this.phaseSummary(drillId, phase, 'twitch', dueAt));
      return;
    }

    this.ctxRecordSend(job.now, units);
    const request = async (token: string): Promise<Response> => fetch(
      `https://api.twitch.tv/helix/moderation/enforcements/status?broadcaster_id=${encodeURIComponent(broadcasterId)}`,
      {
        method: 'POST',
        headers: { 'Client-Id': this.deps.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: batch.map((line) => ({ msg_id: line.id, msg_text: line.text })) }),
        signal: AbortSignal.timeout(HELIX_TIMEOUT_MS)
      }
    );
    let response = await request(accessToken);
    this.logRateLimit(response, broadcasterId);
    let refreshed = false;
    if (response.status === 401) {
      log('grade.send', { room: this.deps.roomName(), drill: drillId, phase, engine: 'twitch', status: 401, units, quotaUnit: unit });
      try {
        accessToken = await this.deps.getAccessToken(accessToken);
      } catch (error) {
        if (this.noToken(error)) {
          await this.gradeLocally(drillId, phase);
          return;
        }
        throw error;
      }
      this.ctxRecordSend(Date.now(), units);
      response = await request(accessToken);
      refreshed = true;
      this.logRateLimit(response, broadcasterId);
    }
    if (response.status === 401 && refreshed) {
      await this.gradeLocally(drillId, phase);
      return;
    }
    if (response.status === 429) {
      const now = Date.now();
      const remaining = this.headerNumber(response, 'Ratelimit-Remaining');
      const reset = this.headerNumber(response, 'Ratelimit-Reset');
      const retryAt = remaining === 0 && reset !== null ? Math.max(now + 1_000, reset * 1000) : now + RATE_LIMIT_WAIT_MS;
      await this.deps.scheduler.schedule('grade.tick', job.key, retryAt, { drillId, phase });
      log('grade.send', { room: this.deps.roomName(), drill: drillId, phase, engine: 'twitch', status: 429, units, quotaUnit: unit, retryAt });
      this.emitProgress(drillId, phase, this.phaseSummary(drillId, phase, 'twitch', retryAt));
      return;
    }
    if (!response.ok) throw new HelixError(response.status, this.headerNumber(response, 'Ratelimit-Remaining'), this.headerNumber(response, 'Ratelimit-Reset'));
    const parsedResponse = GradeResponseZ.safeParse(await response.json());
    if (!parsedResponse.success) throw new Error('invalid_check_automod_response');

    const returned = new Map(parsedResponse.data.data.map((row) => [row.msg_id, row.is_permitted]));
    if (returned.size !== batch.length || batch.some((line) => !returned.has(line.id))) {
      throw new Error('incomplete_check_automod_response');
    }
    const gradedAt = Date.now();
    this.deps.ctx.storage.transactionSync(() => {
      for (const line of batch) {
        const permitted = returned.get(line.id);
        if (permitted === undefined) continue;
        this.sql.exec(
          `INSERT INTO grades (line_id, phase, engine, permitted, blocked_by, graded_at)
           VALUES (?, ?, 'twitch', ?, NULL, ?)
           ON CONFLICT(line_id, phase, engine) DO UPDATE SET permitted = excluded.permitted, graded_at = excluded.graded_at`,
          line.id, phase, permitted ? 1 : 0, gradedAt
        );
        this.sql.exec("UPDATE grade_queue SET status = 'done' WHERE line_id = ? AND phase = ?", line.id, phase);
      }
    });
    log('grade.send', { room: this.deps.roomName(), drill: drillId, phase, engine: 'twitch', status: response.status, units, quotaUnit: unit, count: batch.length });
    await this.finishIfComplete(drillId, phase, 'twitch', gradedAt);
  }

  private async finishIfComplete(drillId: string, phase: GradePhase, engine: Engine, now: number): Promise<void> {
    const pending = this.sql.exec<{ count: number }>(
      "SELECT COUNT(*) AS count FROM grade_queue WHERE drill_id = ? AND phase = ? AND status IN ('pending', 'sent')",
      drillId, phase
    ).one().count;
    const summary = this.phaseSummary(drillId, phase, engine);
    this.emitProgress(drillId, phase, summary);
    if (pending > 0 || summary.done < summary.total) {
      await this.deps.scheduler.schedule('grade.tick', gradeKey(drillId, phase), now + 1, { drillId, phase });
      return;
    }
    this.emitDone(drillId, phase, engine);
    this.deps.refreshReport(drillId, now);
    log('grade.done', { room: this.deps.roomName(), drill: drillId, phase, engine, passed: summary.passed, total: summary.total });
  }

  private phaseSummary(drillId: string, phase: GradePhase, engine: Engine, nextAt?: number): { done: number; total: number; passed: number; engine: Engine; nextAt?: number } {
    const row = this.sql.exec<{ total: number; done: number; passed: number }>(
      `SELECT COUNT(*) AS total,
          SUM(CASE WHEN g.line_id IS NOT NULL THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN g.permitted = 1 THEN 1 ELSE 0 END) AS passed
       FROM wave_lines l LEFT JOIN grades g ON g.line_id = l.id AND g.phase = ? AND g.engine = ?
       WHERE l.drill_id = ? AND l.wave = ? AND l.kind = 'attack'`,
      phase, engine, drillId, phaseWave(phase)
    ).one();
    return { done: row.done ?? 0, total: row.total, passed: row.passed ?? 0, engine, ...(nextAt === undefined ? {} : { nextAt }) };
  }

  private emitProgress(drillId: string, phase: GradePhase, summary: { done: number; total: number; passed: number; engine: Engine; nextAt?: number }): void {
    const data = {
      phase,
      done: summary.done,
      total: summary.total,
      engine: summary.engine,
      ...(summary.nextAt === undefined ? {} : { nextAt: summary.nextAt })
    } satisfies Extract<import('@mfd/core').ServerMsg, { type: 'grade.progress' }>['data'];
    broadcast(this.deps.ctx, (role) => role === 'console' ? { type: 'grade.progress', data } : null);
  }

  private emitDone(drillId: string, phase: GradePhase, engine: Engine): void {
    const summary = this.phaseSummary(drillId, phase, engine);
    const data = { phase, passed: summary.passed, total: summary.total, engine } satisfies Extract<import('@mfd/core').ServerMsg, { type: 'grade.done' }>['data'];
    broadcast(this.deps.ctx, (role) => role === 'console' ? { type: 'grade.done', data } : null);
  }

  private ctxRecordSend(now: number, units: number): void {
    this.deps.ctx.storage.transactionSync(() => {
      this.sql.exec('INSERT INTO grade_sends (ts, units) VALUES (?, ?)', now, units);
      this.sql.exec('DELETE FROM grade_sends WHERE ts <= ?', now - 3_600_000);
    });
  }

  private logRateLimit(response: Response, broadcasterId: string): void {
    log('twitch.ratelimit', {
      room: this.deps.roomName(),
      endpoint: 'moderation/enforcements/status',
      broadcasterId,
      httpStatus: response.status,
      limit: this.headerNumber(response, 'Ratelimit-Limit'),
      remaining: this.headerNumber(response, 'Ratelimit-Remaining'),
      reset: this.headerNumber(response, 'Ratelimit-Reset')
    });
  }

  private headerNumber(response: Response, name: string): number | null {
    const value = response.headers.get(name);
    if (value === null || !/^\d+$/.test(value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
  }

  private noToken(error: unknown): boolean {
    return (error instanceof Error && ['twitch_reconnect_required', 'demo_room'].includes(error.message)) ||
      (error instanceof TwitchOAuthError && (error.status === 400 || error.status === 401));
  }

  private localConfigured(): boolean {
    return String(this.deps.env.GRADING_ENGINE) === 'local';
  }
}
