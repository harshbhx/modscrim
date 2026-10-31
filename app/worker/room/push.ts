import type { PushResult } from '@mfd/core';
import { randomId } from '../lib/ids.js';
import { log } from '../lib/log.js';
import { addBlockedTerm, getBlockedTerms, HelixError, removeBlockedTerm, type TwitchBlockedTerm } from '../twitch/helix.js';
import { DRILL_ERRORS } from './drill.js';
import { broadcast } from './hub.js';
import { checkedTerms } from './rules.js';

type PushDeps = {
  ctx: DurableObjectState;
  env: Env;
  roomName: () => string;
  mode: () => string | null;
  broadcasterId: () => string | null;
  getAccessToken: (rejectedToken?: string) => Promise<string>;
  proveFreshWave: (drillId: string, terms: string[]) => Promise<{ pushAllowed: boolean }>;
  refreshReport: (drillId: string, now: number) => unknown;
};

type PushRow = {
  term: string;
  twitch_term_id: string | null;
  preexisting: number;
  status: 'pending' | 'added' | 'preexisting' | 'failed' | 'removed';
  error: string | null;
  pushed_at: number | null;
};

const PUSH_RESULT_ERROR = 'Twitch could not add this term.';
const UNDO_RESULT_ERROR = 'Twitch could not remove this term.';
const PREEXISTING_AGE_MS = 60_000;

export class PushEngine {
  constructor(private readonly deps: PushDeps) {}

  private get sql() {
    return this.deps.ctx.storage.sql;
  }

  async push(drillId: string, rawTerms: unknown, actorId: string): Promise<PushResult[]> {
    const terms = checkedTerms(rawTerms);
    const startedAt = Date.now();
    const proof = await this.deps.proveFreshWave(drillId, terms);
    if (!proof.pushAllowed) throw new Error(DRILL_ERRORS.conflict);
    const demo = this.deps.mode() === 'demo';
    const broadcasterId = this.deps.broadcasterId();
    let fresh: TwitchBlockedTerm[];
    if (demo) {
      fresh = this.localBlockedTerms();
    } else {
      if (!broadcasterId) throw new Error('room_missing_broadcaster');
      try {
        fresh = await this.withToken((token) => getBlockedTerms(this.deps.env, broadcasterId, token));
      } catch {
        const results = terms.map((term): PushResult => ({ term, status: 'failed', error: PUSH_RESULT_ERROR }));
        for (const result of results) this.broadcastResult(result);
        await this.writeAudit(broadcasterId, actorId, 'push', drillId, results, startedAt);
        log('push.term', { room: this.deps.roomName(), drill: drillId, count: results.length, failed: results.length });
        return results;
      }
      this.replaceBlockedTerms(fresh, Date.now());
    }

    const results: PushResult[] = [];
    for (const term of terms) {
      const previous = this.sql.exec<PushRow>(
        'SELECT term, twitch_term_id, preexisting, status, error, pushed_at FROM pushes WHERE drill_id = ? AND term = ?', drillId, term
      ).toArray()[0];
      if (previous?.status === 'added' || previous?.status === 'preexisting') {
        const result: PushResult = {
          term,
          status: previous.status,
          ...(previous.twitch_term_id === null ? {} : { twitchTermId: previous.twitch_term_id })
        };
        results.push(result);
        this.broadcastResult(result);
        continue;
      }

      const existing = fresh.find((item) => item.text.toLowerCase() === term.toLowerCase());
      if (existing) {
        if (previous?.status === 'pending') {
          const createdAt = existing.createdAt === null ? Number.NaN : Date.parse(existing.createdAt);
          const preexisting = Number.isFinite(createdAt) && previous.pushed_at !== null && createdAt < previous.pushed_at - PREEXISTING_AGE_MS;
          const status = preexisting ? 'preexisting' : 'added';
          this.savePush(drillId, term, existing.id, preexisting, status, null, startedAt);
          const result: PushResult = { term, status, twitchTermId: existing.id };
          results.push(result);
          this.broadcastResult(result);
        } else {
          this.savePush(drillId, term, existing.id, true, 'preexisting', null, startedAt);
          const result: PushResult = { term, status: 'preexisting', twitchTermId: existing.id };
          results.push(result);
          this.broadcastResult(result);
        }
        continue;
      }

      if (demo) {
        const id = this.addDemoTerm(term, startedAt);
        this.savePush(drillId, term, id, false, 'added', null, startedAt);
        const result: PushResult = { term, status: 'added', twitchTermId: id };
        results.push(result);
        this.broadcastResult(result);
        continue;
      }

      this.savePush(drillId, term, null, false, 'pending', null, startedAt);
      try {
        const added = await this.withToken((token) => addBlockedTerm(this.deps.env, broadcasterId as string, token, term));
        const createdAt = added.createdAt === null ? Number.NaN : Date.parse(added.createdAt);
        const oldTerm = Number.isFinite(createdAt) && createdAt < startedAt - PREEXISTING_AGE_MS;
        const status = oldTerm ? 'preexisting' : 'added';
        this.savePush(drillId, term, added.id, oldTerm, status, null, startedAt);
        this.cacheBlockedTerm(added, Date.now());
        const result: PushResult = {
          term,
          status,
          twitchTermId: added.id
        };
        results.push(result);
        this.broadcastResult(result);
      } catch {
        this.savePush(drillId, term, null, false, 'failed', PUSH_RESULT_ERROR, startedAt);
        const result: PushResult = { term, status: 'failed', error: PUSH_RESULT_ERROR };
        results.push(result);
        this.broadcastResult(result);
      }
    }

    if (!demo && broadcasterId) await this.writeAudit(broadcasterId, actorId, 'push', drillId, results, startedAt);
    const now = Date.now();
    this.deps.refreshReport(drillId, now);
    log('push.term', { room: this.deps.roomName(), drill: drillId, count: results.length, added: results.filter((item) => item.status === 'added').length });
    return results;
  }

  async undo(drillId: string, actorId: string): Promise<PushResult[]> {
    const now = Date.now();
    const drill = this.sql.exec<{ id: string }>('SELECT id FROM drills WHERE id = ?', drillId).toArray()[0];
    if (!drill) throw new Error(DRILL_ERRORS.notFound);
    const demo = this.deps.mode() === 'demo';
    const broadcasterId = this.deps.broadcasterId();
    const rows = this.sql.exec<PushRow>(
      `SELECT term, twitch_term_id, preexisting, status, error, pushed_at FROM pushes WHERE drill_id = ? ORDER BY rowid`, drillId
    ).toArray();
    if (!demo && rows.some((row) => row.status === 'added' && row.preexisting === 0 && row.twitch_term_id !== null) && !broadcasterId) {
      throw new Error('room_missing_broadcaster');
    }
    const results: PushResult[] = [];
    for (const row of rows) {
      if (row.status === 'preexisting' || row.preexisting !== 0) {
        const result: PushResult = { term: row.term, status: 'preexisting', ...(row.twitch_term_id ? { twitchTermId: row.twitch_term_id } : {}) };
        results.push(result);
        continue;
      }
      if (row.status === 'removed') {
        const result: PushResult = { term: row.term, status: 'removed', ...(row.twitch_term_id ? { twitchTermId: row.twitch_term_id } : {}) };
        results.push(result);
        this.broadcastResult(result);
        continue;
      }
      if (row.status === 'failed' || row.status === 'pending') {
        const result: PushResult = { term: row.term, status: 'failed', error: row.error ?? UNDO_RESULT_ERROR };
        results.push(result);
        this.broadcastResult(result);
        continue;
      }
      if (row.status !== 'added') continue;
      if (!row.twitch_term_id) {
        const result: PushResult = { term: row.term, status: 'failed', error: UNDO_RESULT_ERROR };
        results.push(result);
        this.broadcastResult(result);
        continue;
      }
      try {
        if (demo) {
          this.removeDemoTerm(row.twitch_term_id);
        } else if (broadcasterId) {
          await this.withToken((activeToken) => removeBlockedTerm(this.deps.env, broadcasterId, activeToken, row.twitch_term_id as string));
        }
        const removedAt = Date.now();
        this.deps.ctx.storage.transactionSync(() => {
          this.sql.exec("UPDATE pushes SET status = 'removed', removed_at = ?, error = NULL WHERE drill_id = ? AND term = ?", removedAt, drillId, row.term);
          if (!demo) this.sql.exec('DELETE FROM blocked_terms WHERE id = ?', row.twitch_term_id);
        });
        const result: PushResult = { term: row.term, status: 'removed', twitchTermId: row.twitch_term_id };
        results.push(result);
        this.broadcastResult(result);
      } catch {
        const result: PushResult = { term: row.term, status: 'failed', twitchTermId: row.twitch_term_id, error: UNDO_RESULT_ERROR };
        results.push(result);
        this.broadcastResult(result);
      }
    }
    if (!demo && broadcasterId) await this.writeAudit(broadcasterId, actorId, 'undo', drillId, results, now);
    const completedAt = Date.now();
    this.deps.refreshReport(drillId, completedAt);
    log('undo.term', { room: this.deps.roomName(), drill: drillId, count: results.length, removed: results.filter((item) => item.status === 'removed').length });
    return results;
  }

  private async withToken<T>(run: (token: string) => Promise<T>, currentToken?: string): Promise<T> {
    let token = currentToken ?? await this.deps.getAccessToken();
    try {
      return await run(token);
    } catch (error) {
      if (!(error instanceof HelixError) || error.status !== 401) throw error;
      token = await this.deps.getAccessToken(token);
      return run(token);
    }
  }

  private savePush(drillId: string, term: string, twitchId: string | null, preexisting: boolean, status: string, error: string | null, at: number): void {
    this.deps.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO pushes (id, drill_id, term, twitch_term_id, preexisting, status, error, pushed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(drill_id, term) DO UPDATE SET twitch_term_id = excluded.twitch_term_id,
           preexisting = excluded.preexisting, status = excluded.status, error = excluded.error,
           pushed_at = excluded.pushed_at, removed_at = NULL`,
        randomId(16), drillId, term, twitchId, preexisting ? 1 : 0, status, error, at
      );
    });
  }

  private replaceBlockedTerms(terms: readonly TwitchBlockedTerm[], fetchedAt: number): void {
    this.deps.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM blocked_terms');
      for (const term of terms) {
        this.sql.exec(
          'INSERT INTO blocked_terms (id, text, created_at, fetched_at) VALUES (?, ?, ?, ?)',
          term.id, term.text, term.createdAt, fetchedAt
        );
      }
      this.sql.exec('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        'filters_fetched_at', String(fetchedAt));
    });
  }

  private cacheBlockedTerm(term: TwitchBlockedTerm, now: number): void {
    this.deps.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO blocked_terms (id, text, created_at, fetched_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET text = excluded.text, created_at = excluded.created_at, fetched_at = excluded.fetched_at`,
        term.id, term.text, term.createdAt, now
      );
    });
  }

  private localBlockedTerms(): TwitchBlockedTerm[] {
    return this.sql.exec<{ id: string; text: string; created_at: string | null }>(
      'SELECT id, text, created_at FROM blocked_terms ORDER BY rowid'
    ).toArray().map((row) => ({ id: row.id, text: row.text, createdAt: row.created_at }));
  }

  private addDemoTerm(term: string, now: number): string {
    return this.deps.ctx.storage.transactionSync(() => {
      const prior = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'demo_term_sequence'").toArray()[0];
      const maximum = this.sql.exec<{ value: number | null }>(
        "SELECT MAX(CAST(substr(id, 6) AS INTEGER)) AS value FROM blocked_terms WHERE id GLOB 'demo-[0-9]*'"
      ).one().value ?? 0;
      const sequence = Math.max(Number(prior?.value ?? 0), maximum) + 1;
      const id = `demo-${sequence}`;
      this.sql.exec(
        'INSERT INTO blocked_terms (id, text, created_at, fetched_at) VALUES (?, ?, ?, ?)',
        id, term, new Date(now).toISOString(), now
      );
      this.sql.exec("INSERT INTO meta (key, value) VALUES ('demo_term_sequence', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(sequence));
      return id;
    });
  }

  private removeDemoTerm(id: string): void {
    this.deps.ctx.storage.transactionSync(() => this.sql.exec('DELETE FROM blocked_terms WHERE id = ?', id));
  }

  private broadcastResult(result: PushResult): void {
    broadcast(this.deps.ctx, (role) => role === 'console' ? { type: 'push.result', data: result } : null);
  }

  private async writeAudit(
    broadcasterId: string,
    actorId: string,
    action: 'push' | 'undo',
    drillId: string,
    results: readonly PushResult[],
    at: number
  ): Promise<void> {
    const detail = JSON.stringify({ drillId, results: results.map(({ term, status, twitchTermId }) => ({ term, status, ...(twitchTermId ? { twitchTermId } : {}) })) });
    await this.deps.env.DB.prepare('INSERT INTO audit_log (broadcaster_id, actor_id, action, detail, at) VALUES (?, ?, ?, ?, ?)')
      .bind(broadcasterId, actorId, action, detail, at)
      .run();
  }
}
