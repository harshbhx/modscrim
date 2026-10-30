import type { JobKind } from '@mfd/core';
import { log } from '../lib/log.js';

export type JobHandler = (job: { kind: JobKind; key: string; payload: unknown; now: number }) => Promise<void> | void;

/** Maximum number of attempts before a failing job is dropped (SRS §3.4). */
export const MAX_ATTEMPTS = 5;

/** Drill jobs run before everything else in one pass so Twitch work never delays the drill clock. */
const DRILL_JOBS = "('line.emit', 'line.slip', 'sim.act', 'drill.end')";

type Row = { id: number; due_at: number; kind: JobKind; key: string; payload: string; attempts: number };

/**
 * One alarm, many idempotent jobs (SRS §3.4, §8.5). Jobs live in the `schedule` table with
 * `UNIQUE (kind, key)`. Handlers are registered by the features that own each job kind.
 */
export class Scheduler {
  private readonly handlers = new Map<JobKind, JobHandler>();

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly roomName: () => string
  ) {}

  private get sql() {
    return this.ctx.storage.sql;
  }

  register(kind: JobKind, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  async schedule(kind: JobKind, key: string, dueAt: number, payload: object = {}): Promise<void> {
    this.enqueue(kind, key, dueAt, payload);
    await this.rearm();
  }

  /**
   * Upsert a job without touching the alarm. Synchronous, so it can run inside `transactionSync`
   * together with the state change that needs the job; call `rearm()` after the transaction.
   */
  enqueue(kind: JobKind, key: string, dueAt: number, payload: object = {}): void {
    this.sql.exec(
      `INSERT INTO schedule (due_at, kind, key, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(kind, key) DO UPDATE SET due_at = excluded.due_at, payload = excluded.payload, attempts = 0`,
      dueAt,
      kind,
      key,
      JSON.stringify(payload)
    );
  }

  async cancel(kind: JobKind, key: string): Promise<void> {
    this.sql.exec('DELETE FROM schedule WHERE kind = ? AND key = ?', kind, key);
    await this.rearm();
  }

  /** Point the single alarm at the earliest due job, or clear it when nothing is scheduled. */
  async rearm(): Promise<void> {
    const next = this.sql.exec<{ t: number | null }>('SELECT MIN(due_at) AS t FROM schedule').one().t;
    if (next === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    if ((await this.ctx.storage.getAlarm()) !== next) await this.ctx.storage.setAlarm(next);
  }

  async runDueJobs(now: number = Date.now()): Promise<void> {
    const due = this.sql
      .exec<Row>(
        `SELECT id, due_at, kind, key, payload, attempts FROM schedule WHERE due_at <= ?
         ORDER BY CASE WHEN kind IN ${DRILL_JOBS} THEN 0 ELSE 1 END, due_at, id`,
        now + 10
      )
      .toArray();

    for (const job of due) {
      try {
        const handler = this.handlers.get(job.kind);
        if (!handler) throw new Error(`no handler for ${job.kind}`);
        await handler({ kind: job.kind, key: job.key, payload: JSON.parse(job.payload), now });
        // Matching due_at keeps a job that rescheduled itself (same kind and key, new due_at).
        this.sql.exec('DELETE FROM schedule WHERE id = ? AND due_at = ?', job.id, job.due_at);
      } catch {
        log('job.failed', { room: this.roomName(), kind: job.kind, key: job.key, attempts: job.attempts + 1 });
        if (job.attempts + 1 >= MAX_ATTEMPTS) {
          this.sql.exec('DELETE FROM schedule WHERE id = ? AND due_at = ?', job.id, job.due_at);
        } else {
          this.sql.exec(
            'UPDATE schedule SET attempts = attempts + 1, due_at = ? WHERE id = ? AND due_at = ?',
            now + 1000 * 2 ** job.attempts,
            job.id,
            job.due_at
          );
        }
      }
    }
    await this.rearm();
  }
}
