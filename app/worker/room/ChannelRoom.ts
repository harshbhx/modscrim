import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import {
  ClientMsgZ,
  LIMITS,
  coachStats,
  nextAllowedAt,
  type CoachStats,
  type ActionResult,
  type ChatMessageEvent,
  type DrillConfigInput,
  type DrillSnapshot,
  type DrillView,
  type GradePhase,
  type GradesView,
  type ProofResult,
  type PushResult,
  type FiltersView,
  type JobKind,
  type ModAction,
  type ModHistoryEntry,
  type Report,
  type ReportJob,
  type Role,
  type RuleFinderResult,
  type ServerMsg
} from '@mfd/core';
import { overlayKey as newOverlayKey } from '../lib/ids.js';
import { log } from '../lib/log.js';
import {
  attachmentOf,
  broadcast,
  closeRole,
  overlayNames,
  overlaySnapshot,
  OverlaySettingsZ,
  send,
  tagsFor,
  type Attachment,
  type OverlaySettings
} from './hub.js';
import { chatLogStats, deleteChatLog, ingestChat, type ChatIngestResult } from './chatlog.js';
import { DEMO_DRILL_CONFIG, DEMO_GC_KEY, demoBootstrap, demoGcDueAt, isDemoRoomName, seedDemo } from './demo.js';
import { DrillEngine } from './drill.js';
import { joinAsMod, joinAsVerifiedMod, JoinInputZ } from './mods.js';
import { aiCoachNote, coachAiEnabled } from './coach.js';
import { broadcastReport, readReport, saveAiCoachNote, saveReport } from './report.js';
import { isBootstrapped, migrate } from './schema.js';
import { Scheduler, type JobHandler } from './scheduler.js';
import * as tickets from './tickets.js';
import { RoomTokens } from './tokens.js';
import { getAutoModSettings, getBlockedTerms, getUsers, HelixError } from '../twitch/helix.js';
import { chatRetentionMs, DAY_MS, purgeExpired, type PurgeResult } from './chatlog.js';
import { GradingEngine } from './grading.js';
import { RuleEngine } from './rules.js';
import { PushEngine } from './push.js';

/** The export waits this long after a report's latest update, so a burst of updates sends one message (SRS §3.4). */
export const REPORT_EXPORT_DELAY_MS = 60_000;

const HistoryReportZ = z.object({
  drillId: z.string().min(1),
  createdAt: z.number().finite(),
  score: z.object({ mods: z.array(z.object({
    participantId: z.string().min(1), name: z.string(), isSim: z.boolean(), caught: z.number().finite(),
    falseBans: z.number().finite(), avgReactionMs: z.number().finite().nullable()
  })) })
});

export type BootstrapInput = {
  mode: 'live' | 'demo';
  roomName: string;
  broadcasterId: string;
  login: string;
  displayName: string;
  broadcasterType: '' | 'affiliate' | 'partner';
};

/**
 * One room per channel (SRS §3.4): owns the clock, the sockets and the storage.
 * A room that was never bootstrapped answers 404 or `ignored` and stores nothing.
 */
export class ChannelRoom extends DurableObject<Env> {
  private readonly sql = this.ctx.storage.sql;
  private readonly scheduler = new Scheduler(this.ctx, () => this.roomName());
  private readonly tokens = new RoomTokens(this.env, () => this.roomName());
  private readonly drills = new DrillEngine({
    ctx: this.ctx,
    scheduler: this.scheduler,
    roomName: () => this.roomName(),
    touch: (now) => this.touch(now),
    connectedMods: () => this.connectedMods(),
    refreshReport: (drillId, now) => this.refreshReport(drillId, now),
    broadcastState: () => this.broadcastState()
  });
  private readonly grading = new GradingEngine({
    ctx: this.ctx,
    env: this.env,
    scheduler: this.scheduler,
    roomName: () => this.roomName(),
    mode: () => this.meta('mode'),
    broadcasterId: () => this.meta('broadcaster_id'),
    broadcasterType: () => this.meta('broadcaster_type'),
    getAccessToken: (rejectedToken) => this.getAccessToken(rejectedToken),
    blockedTerms: () => this.sql.exec<{ text: string }>('SELECT text FROM blocked_terms ORDER BY rowid').toArray().map((row) => row.text),
    refreshReport: (drillId, now) => this.refreshReport(drillId, now)
  });
  private readonly rules = new RuleEngine({
    ctx: this.ctx,
    roomName: () => this.roomName(),
    mode: () => this.meta('mode'),
    getDrill: (drillId) => this.drills.view(drillId),
    blockedTerms: () => this.sql.exec<{ text: string }>('SELECT text FROM blocked_terms ORDER BY rowid').toArray().map((row) => row.text),
    refreshReport: (drillId, now) => this.refreshReport(drillId, now)
  });
  private readonly pushes = new PushEngine({
    ctx: this.ctx,
    env: this.env,
    roomName: () => this.roomName(),
    mode: () => this.meta('mode'),
    broadcasterId: () => this.meta('broadcaster_id'),
    getAccessToken: (rejectedToken) => this.getAccessToken(rejectedToken),
    proveFreshWave: (drillId, terms) => this.rules.proveFreshWave(drillId, terms),
    requestGrading: (drillId, phase) => this.grading.requestGrading(drillId, phase),
    refreshReport: (drillId, now) => this.refreshReport(drillId, now)
  });
  /** Drills whose Workers AI coach's note this instance already asked for: one call per drill (FR-42). */
  private readonly coachAsked = new Set<string>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Retention (FR-43): the daily purge reschedules itself 24 h later.
    this.scheduler.register('chatlog.purge', (job) => this.dailyPurge(job.now));
    // Migrations run only for rooms bootstrapped before; a stray request creates no tables.
    ctx.blockConcurrencyWhile(async () => {
      if (isBootstrapped(this.sql)) migrate(this.sql);
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    // Drill jobs (SRS §3.4). Registered on every construction so a restarted room finds its handlers.
    this.scheduler.register('line.emit', (job) => this.drills.emit(job));
    this.scheduler.register('line.slip', (job) => this.drills.slip(job));
    this.scheduler.register('drill.end', (job) => this.drills.end(job));
    this.scheduler.register('sim.act', (job) => this.drills.simAct(job));
    this.scheduler.register('vote.close', (job) => this.drills.closeVote(job));
    this.grading.register((kind, handler) => this.scheduler.register(kind, handler));
    // Demo rooms delete themselves 2 hours after their last activity (FR-38).
    this.scheduler.register('room.gc', (job) => this.demoGc(job.now));
    // Report export (FR-27, P1): live rooms with the bindings send the latest report to the Queue.
    this.scheduler.register('report.export', (job) => this.sendReportExport(job.key));
  }

  // ---- meta -------------------------------------------------------------------------------

  private bootstrapped(): boolean {
    return isBootstrapped(this.sql);
  }

  private meta(key: string): string | null {
    const row = this.sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0];
    return row ? row.value : null;
  }

  private setMeta(key: string, value: string): void {
    this.sql.exec(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value
    );
  }

  private roomName(): string {
    return this.bootstrapped() ? (this.meta('room_name') ?? 'unknown') : 'unbootstrapped';
  }

  /** Record that someone used the room (demo rooms garbage-collect on idleness). */
  private touch(now: number = Date.now()): void {
    this.setMeta('last_activity', String(now));
  }

  // ---- RPC (SRS §8.4, the T-09 part) ---------------------------------------------------------

  /** Create the room's storage the first time; later calls refresh the profile and keep the overlay key. */
  async bootstrap(input: BootstrapInput): Promise<void> {
    const fresh = !this.bootstrapped();
    this.ctx.storage.transactionSync(() => {
      migrate(this.sql);
      this.setMeta('room_name', input.roomName);
      this.setMeta('mode', input.mode);
      this.setMeta('broadcaster_id', input.broadcasterId);
      this.setMeta('login', input.login);
      this.setMeta('display_name', input.displayName);
      this.setMeta('broadcaster_type', input.broadcasterType);
      if (fresh) {
        this.setMeta('overlay_key', newOverlayKey());
        this.setMeta('hide_names', '0');
        this.setMeta('logging', '1');
        this.setMeta('last_activity', String(Date.now()));
      }
    });
    await this.ensureDailyPurge(Date.now());
    if (input.mode === 'live') {
      try {
        await this.refreshFilters();
      } catch {
        log('twitch.filters', { room: input.roomName, ok: false });
      }
    }
  }

  async getFilters(): Promise<FiltersView> {
    if (!this.bootstrapped()) return { terms: [], automod: null, fetchedAt: null };
    const terms = this.sql.exec<{ id: string; text: string }>(
      'SELECT id, text FROM blocked_terms ORDER BY rowid'
    ).toArray();
    const fetchedValue = this.meta('filters_fetched_at');
    const fetchedAt = fetchedValue !== null && /^\d+$/.test(fetchedValue) ? Number(fetchedValue) : null;
    const automodValue = this.meta('automod_json');
    let automod: FiltersView['automod'] = null;
    if (automodValue) {
      try {
        const parsed = z.record(z.string(), z.number().int().min(0).max(4).nullable()).safeParse(JSON.parse(automodValue));
        if (parsed.success) automod = parsed.data;
      } catch {
        automod = null;
      }
    }
    return { terms, automod, fetchedAt };
  }

  async refreshFilters(): Promise<FiltersView> {
    if (!this.bootstrapped()) return { terms: [], automod: null, fetchedAt: null };
    if (this.meta('mode') === 'demo') return this.getFilters();
    const broadcasterId = this.meta('broadcaster_id');
    if (!broadcasterId) throw new Error('room_missing_broadcaster');

    const read = async (accessToken: string) => {
      const [user, terms, automod] = await Promise.all([
        getUsers(this.env, accessToken),
        getBlockedTerms(this.env, broadcasterId, accessToken),
        getAutoModSettings(this.env, broadcasterId, accessToken)
      ]);
      if (user.id !== broadcasterId) throw new Error('twitch_user_mismatch');
      return { user, terms, automod };
    };

    let accessToken = await this.getAccessToken();
    let snapshot: Awaited<ReturnType<typeof read>>;
    try {
      snapshot = await read(accessToken);
    } catch (error) {
      if (!(error instanceof HelixError) || error.status !== 401) throw error;
      accessToken = await this.getAccessToken(accessToken);
      snapshot = await read(accessToken);
    }

    const fetchedAt = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM blocked_terms');
      for (const term of snapshot.terms) {
        this.sql.exec(
          'INSERT INTO blocked_terms (id, text, created_at, fetched_at) VALUES (?, ?, ?, ?)',
          term.id,
          term.text,
          term.createdAt,
          fetchedAt
        );
      }
      this.setMeta('automod_json', JSON.stringify(snapshot.automod));
      this.setMeta('filters_fetched_at', String(fetchedAt));
      this.setMeta('broadcaster_type', snapshot.user.broadcaster_type);
    });
    log('twitch.filters', { room: this.roomName(), ok: true, terms: snapshot.terms.length, broadcasterType: snapshot.user.broadcaster_type });
    return this.getFilters();
  }

  /** Return a usable broadcaster token, refreshing at the five-minute boundary or after a 401. */
  async getAccessToken(rejectedToken?: string): Promise<string> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    // Demo rooms never call Twitch or D1 (FR-38).
    if (this.meta('mode') === 'demo') throw new Error('demo_room');
    const userId = this.meta('broadcaster_id');
    if (!userId) throw new Error('room_missing_broadcaster');
    return this.tokens.getAccessToken(userId, rejectedToken);
  }

  /** Add one validated Twitch chat event to this channel's seven-day chat log. */
  async ingestChat(event: ChatMessageEvent): Promise<ChatIngestResult> {
    if (!this.bootstrapped()) return 'ignored';
    const sentAt = Date.now();
    const result = this.ctx.storage.transactionSync(() => {
      const broadcasterId = this.meta('broadcaster_id');
      if (!broadcasterId || event.broadcaster_user_id !== broadcasterId) return 'ignored';
      const ingestResult = ingestChat(this.sql, broadcasterId, this.meta('logging') === '1', event, sentAt);
      if (ingestResult === 'stored') this.touch(sentAt);
      return ingestResult;
    });
    if (result !== 'ignored') this.drills.castChatVote(event.chatter_user_id, event.message.text, sentAt);
    return result;
  }

  async chatStats(): Promise<ReturnType<typeof chatLogStats> | null> {
    if (!this.bootstrapped()) return null;
    return chatLogStats(this.sql, this.meta('logging') === '1');
  }

  async setLogging(on: boolean): Promise<boolean | null> {
    if (!this.bootstrapped()) return null;
    return this.ctx.storage.transactionSync(() => {
      this.setMeta('logging', on ? '1' : '0');
      this.touch();
      return on;
    });
  }

  async deleteChatLog(): Promise<number | null> {
    if (!this.bootstrapped()) return null;
    return this.ctx.storage.transactionSync(() => {
      const deleted = deleteChatLog(this.sql);
      this.touch();
      return deleted;
    });
  }

  // ---- retention and token health (SRS §8.4, T-26) -------------------------------------------

  /** Hourly cron (FR-03): validate the broadcaster token at Twitch; a 401 marks it invalid. */
  async validateToken(): Promise<'ok' | 'invalid'> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    const userId = this.meta('broadcaster_id');
    if (!userId || this.meta('mode') !== 'live') return 'invalid';
    return this.tokens.validate(userId, Date.now());
  }

  /** Read-only grading quota snapshot for the streamer's connection panel (FR-44). */
  async gradingQuotaStatus(now: number): Promise<{
    minuteUsed: number;
    hourUsed: number;
    minuteLimit: number;
    hourLimit: number;
    nextAllowedAt: number;
  } | null> {
    if (!this.bootstrapped() || this.meta('mode') !== 'live') return null;
    const broadcasterType = this.meta('broadcaster_type');
    const limits = LIMITS[broadcasterType === 'partner' || broadcasterType === 'affiliate' ? broadcasterType : ''];
    const sends = this.sql.exec<{ ts: number; units: number }>(
      'SELECT ts, units FROM grade_sends WHERE ts > ? ORDER BY ts', now - 3_600_000
    ).toArray();
    const minuteUsed = sends.filter((send) => send.ts > now - 60_000 && send.ts <= now).reduce((sum, send) => sum + send.units, 0);
    const hourUsed = sends.filter((send) => send.ts <= now).reduce((sum, send) => sum + send.units, 0);
    const unit = String(this.env.GRADING_QUOTA_UNIT) === 'line' ? 'line' : 'request';
    const rawBatch = Number(this.env.GRADING_BATCH_SIZE);
    const batchSize = Number.isInteger(rawBatch) && rawBatch >= 1 && rawBatch <= 100 ? rawBatch : 100;
    const units = unit === 'line' ? Math.min(batchSize, limits.perMinute) : 1;
    return {
      minuteUsed,
      hourUsed,
      minuteLimit: limits.perMinute,
      hourLimit: limits.perHour,
      nextAllowedAt: nextAllowedAt(sends, now, limits, units)
    };
  }

  /** Hourly cron (FR-43): apply retention now and report the newest chat time for D1 `channels`. */
  async purge(now: number): Promise<PurgeResult | null> {
    if (!this.bootstrapped()) return null;
    const result = this.ctx.storage.transactionSync(() => purgeExpired(this.sql, now, chatRetentionMs(this.env)));
    await this.ensureDailyPurge(now);
    return result;
  }

  /** The `chatlog.purge` job: same retention, then move itself 24 h later (idempotent). */
  private async dailyPurge(now: number): Promise<void> {
    this.ctx.storage.transactionSync(() => purgeExpired(this.sql, now, chatRetentionMs(this.env)));
    await this.scheduler.schedule('chatlog.purge', 'daily', now + DAY_MS);
  }

  /** Live rooms keep exactly one daily purge job; an existing one keeps its due time. */
  private async ensureDailyPurge(now: number): Promise<void> {
    if (this.meta('mode') !== 'live') return;
    const scheduled = this.sql
      .exec("SELECT 1 FROM schedule WHERE kind = 'chatlog.purge' AND key = 'daily'")
      .toArray().length > 0;
    if (!scheduled) await this.scheduler.schedule('chatlog.purge', 'daily', now + DAY_MS);
  }

  /** A single-use 60 second ticket for a WebSocket connection. */
  async issueTicket(i: { role: 'console' | 'mod'; participantId?: string }): Promise<string> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    if (i.role === 'mod') {
      const known =
        i.participantId !== undefined &&
        this.sql.exec('SELECT 1 FROM participants WHERE id = ?', i.participantId).toArray().length > 0;
      if (!known) throw new Error('unknown_participant');
    }
    const who: { role: 'console' | 'mod'; pid?: string } = { role: i.role };
    if (i.participantId !== undefined) who.pid = i.participantId;
    return tickets.issue(this.env.SESSION_HMAC_KEY, this.roomName(), who, Date.now());
  }

  /** The current overlay key, for building the OBS URL. */
  async getOverlayKey(): Promise<string | null> {
    return this.bootstrapped() ? this.meta('overlay_key') : null;
  }

  /** Issue a new overlay key and close every overlay socket that used the old one (FR-37). */
  async rotateOverlayKey(): Promise<string> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    const key = newOverlayKey();
    this.setMeta('overlay_key', key);
    closeRole(this.ctx, 'overlay', 4001, 'key rotated');
    return key;
  }

  /**
   * Hide mod names on the overlay (FR-46): stored in `meta.hide_names`. Overlay sockets get a fresh
   * `drill.state` (which carries the mod list) at once, so the change shows without waiting for the next event.
   */
  async setOverlaySettings(s: OverlaySettings): Promise<void> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    const input = OverlaySettingsZ.safeParse(s);
    if (!input.success) throw new Error('overlay_invalid');
    this.ctx.storage.transactionSync(() => {
      this.setMeta('hide_names', input.data.hideNames ? '1' : '0');
      this.touch();
    });
    const participants = this.participants();
    broadcast(this.ctx, (role) =>
      role === 'overlay' ? { type: 'drill.state', data: { drill: this.drills.snapshot('overlay'), participants } } : null
    );
  }

  /** Delete everything this room stores, and drop its sockets and alarm (FR-04). */
  async destroy(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, 'room deleted');
      } catch {
        /* already closed */
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // ---- demo rooms (FR-38, T-18) ------------------------------------------------------------
  // A demo room never calls Twitch, D1, R2 or the Queue. Its fixture terms live in `blocked_terms`.

  /**
   * Create a demo room for the fixture channel with its terms and chat log, schedule its `room.gc`,
   * and create the first draft with `DEFAULT_CONFIG` (Kai (sim) on). Calling it again returns the same draft.
   */
  async bootstrapDemo(roomName: string): Promise<{ drillId: string; joinCode: string; overlayKey: string }> {
    if (!isDemoRoomName(roomName)) throw new Error('demo_invalid');
    const fresh = !this.bootstrapped();
    if (!fresh && this.meta('mode') !== 'demo') throw new Error('demo_invalid');
    await this.bootstrap(demoBootstrap(roomName));
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      seedDemo(this.sql, now);
      this.scheduler.enqueue('room.gc', DEMO_GC_KEY, demoGcDueAt(now));
    });
    await this.scheduler.rearm();
    if (fresh) log('demo.created', { room: roomName });
    // TODO(T-16): push and undo in demo rooms are simulated (FR-34): they edit `blocked_terms` only.
    // Demo reports stay in the room (`refreshReport` never schedules `report.export`): no D1, R2 or Queue.
    const { drillId, joinCode } = await this.createDrill(DEMO_DRILL_CONFIG);
    // Set by `bootstrap` for every fresh room, so it is never null here.
    return { drillId, joinCode, overlayKey: this.meta('overlay_key') ?? '' };
  }

  /** True once a demo room has been idle for 2 hours. Live rooms are never idle-collected. */
  private demoIdle(now: number): boolean {
    return this.meta('mode') === 'demo' && now >= demoGcDueAt(Number(this.meta('last_activity') ?? 0));
  }

  /**
   * `room.gc demo`: while the room is in use, move the check to 2 hours after the latest activity.
   * Once idle, the job does nothing here and `alarm()` deletes the room after this pass.
   */
  private demoGc(now: number): void {
    if (this.meta('mode') !== 'demo' || this.demoIdle(now)) return;
    const dueAt = demoGcDueAt(Number(this.meta('last_activity') ?? 0));
    const current = this.sql
      .exec<{ due_at: number }>("SELECT due_at FROM schedule WHERE kind = 'room.gc' AND key = ?", DEMO_GC_KEY)
      .toArray()[0]?.due_at;
    // The scheduler drops a row whose due_at did not change, so a same-time reschedule moves 1 ms later.
    this.scheduler.enqueue('room.gc', DEMO_GC_KEY, dueAt === current ? dueAt + 1 : dueAt);
  }

  /** Delete everything an idle demo room stores (FR-38): storage, alarm and sockets. */
  private async collectDemo(): Promise<void> {
    const room = this.roomName();
    await this.destroy();
    log('demo.gc', { room });
  }

  // ---- drills (SRS §8.4, T-12) -------------------------------------------------------------
  // Failures throw `drill_not_found`, `drill_conflict` or `drill_invalid` (see `DRILL_ERRORS`).

  /** Create the draft, or return the existing one (FR-20). A running drill blocks a new draft. */
  async createDrill(cfg: DrillConfigInput): Promise<{ drillId: string; joinCode: string }> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    const { drillId, joinCode, created } = this.drills.create(cfg, Date.now());
    if (created) this.broadcastState();
    return { drillId, joinCode };
  }

  /** Replace a draft's configuration and rebuild wave A; the join code stays (FR-20). */
  async updateDraft(drillId: string, cfg: DrillConfigInput): Promise<DrillView> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    const view = this.drills.update(drillId, cfg, Date.now());
    this.broadcastState();
    return view;
  }

  async cancelDraft(drillId: string): Promise<void> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    this.drills.cancel(drillId, Date.now());
    this.broadcastState();
  }

  async startDrill(drillId: string): Promise<{ startedAt: number }> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    const result = await this.drills.start(drillId, Date.now());
    this.broadcastState();
    return result;
  }

  async stopDrill(drillId: string): Promise<{ endedAt: number }> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    return this.drills.stop(drillId, Date.now());
  }

  async getDrill(drillId: string): Promise<DrillView> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    return this.drills.view(drillId);
  }

  async requestGrading(drillId: string, phase: GradePhase): Promise<{ queued: number }> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    return this.grading.requestGrading(drillId, phase);
  }

  async gradeLocally(drillId: string, phase: GradePhase): Promise<{ passed: number; total: number }> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    return this.grading.gradeLocally(drillId, phase);
  }

  async getGrades(drillId: string): Promise<GradesView> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    return this.grading.getGrades(drillId);
  }

  async findRules(drillId: string): Promise<RuleFinderResult> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    return this.rules.findRules(drillId);
  }

  async proveFreshWave(drillId: string, terms: string[]): Promise<ProofResult> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    return this.rules.proveFreshWave(drillId, terms);
  }

  async push(drillId: string, terms: string[], actorId: string): Promise<PushResult[]> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    return this.pushes.push(drillId, terms, actorId);
  }

  async undo(drillId: string, actorId: string): Promise<PushResult[]> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    return this.pushes.undo(drillId, actorId);
  }

  // ---- reports (SRS §8.4, T-17) ------------------------------------------------------------

  /** The drill's saved after-action report (FR-27), or null before the drill has ended. Console only (S-06). */
  async getReport(drillId: string): Promise<Report | null> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    return readReport(this.sql, drillId);
  }

  /** Numeric moderator history from saved reports, keyed internally by Twitch identity when available. */
  async getModHistory(participantId?: string): Promise<ModHistoryEntry[]> {
    if (!this.bootstrapped()) return [];
    const participant = participantId === undefined ? undefined : this.sql
      .exec<{ twitch_user_id: string | null }>('SELECT twitch_user_id FROM participants WHERE id = ?', participantId)
      .toArray()[0];
    if (participantId !== undefined && !participant) return [];
    const targetKey = participantId === undefined ? null : participant?.twitch_user_id ?? `pid:${participantId}`;
    const rows = this.sql.exec<{
      participant_id: string;
      twitch_user_id: string | null;
      display_name: string;
      report: string;
    }>(`SELECT p.id AS participant_id, p.twitch_user_id, p.display_name, r.report
        FROM reports r
        JOIN drill_participants dp ON dp.drill_id = r.drill_id
        JOIN participants p ON p.id = dp.participant_id
        WHERE p.is_sim = 0
        ORDER BY r.created_at, p.joined_at, p.id`).toArray();
    const history = new Map<string, ModHistoryEntry>();
    for (const row of rows) {
      const key = row.twitch_user_id ?? `pid:${row.participant_id}`;
      if (targetKey !== null && key !== targetKey) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(row.report) as unknown;
      } catch {
        continue;
      }
      const parsed = HistoryReportZ.safeParse(raw);
      if (!parsed.success) continue;
      const score = parsed.data.score.mods.find((mod) => mod.participantId === row.participant_id && !mod.isSim);
      if (!score) continue;
      const entry = history.get(key) ?? { name: score.name || row.display_name, drills: [] };
      entry.name = score.name || row.display_name;
      entry.drills.push({
        drillId: parsed.data.drillId,
        createdAt: parsed.data.createdAt,
        caught: score.caught,
        falseBans: score.falseBans,
        avgReactionMs: score.avgReactionMs
      });
      history.set(key, entry);
    }
    return [...history.values()];
  }

  /**
   * The one report hook (SRS §3.4 Reports): rebuild and upsert the drill's report from the room's tables,
   * then broadcast `report.ready` (the card to the console and the overlay, nothing to mods). The drill engine
   * calls it at drill end. Call it after every step that changes the report: `grade.done` (T-15) and
   * `findRules`, `proveFreshWave`, `push` and `undo` (T-16), after their own transaction has committed.
   * Synchronous and idempotent: a repeat call over unchanged tables saves the same report (same `reportId`
   * and `createdAt`). Returns null, and does nothing, for a drill that has not ended.
   */
  private refreshReport(drillId: string, now: number = Date.now()): Report | null {
    if (!this.bootstrapped()) return null;
    const exporting = this.exportsReports();
    const report = this.ctx.storage.transactionSync(() => {
      const saved = saveReport(this.sql, drillId, now);
      // Each update moves the one export job to 60 s after it (debounced; `UNIQUE (kind, key)`).
      if (saved && exporting) this.scheduler.enqueue('report.export', drillId, now + REPORT_EXPORT_DELAY_MS);
      return saved;
    });
    if (!report) return null;
    if (exporting) this.ctx.waitUntil(this.rearmQuietly());
    broadcastReport(this.ctx, report);
    log('report.saved', { room: this.roomName(), drill: drillId, reportId: report.reportId });
    this.requestAiCoachNote(report);
    return report;
  }

  /** Live rooms export when both P1 bindings exist. Demo rooms never use D1, R2 or the Queue (FR-38). */
  private exportsReports(): boolean {
    return this.meta('mode') === 'live' && this.env.REPORT_QUEUE !== undefined && this.env.REPORTS !== undefined;
  }

  /** Point the alarm at a job enqueued outside a job pass; a failure is logged and the next pass re-arms. */
  private async rearmQuietly(): Promise<void> {
    try {
      await this.scheduler.rearm();
    } catch {
      log('job.failed', { room: this.roomName(), kind: 'rearm' });
    }
  }

  /**
   * `report.export <drillId>`: send a `ReportJob` (SRS §7.5) for the drill's saved report. The consumer reads
   * the report back through `getReport`, so the message carries IDs only. A send failure throws, and the
   * scheduler retries with backoff.
   */
  private async sendReportExport(drillId: string): Promise<void> {
    const queue = this.env.REPORT_QUEUE;
    if (!this.exportsReports() || !queue) return;
    const report = readReport(this.sql, drillId);
    if (!report) return;
    const room = this.roomName();
    const job: ReportJob = { kind: 'report.export', roomName: room, drillId, reportId: report.reportId };
    await queue.send(job);
    log('report.exported', { room, drill: drillId, reportId: report.reportId, stage: 'queued' });
  }

  /**
   * Coach's note (FR-42, P2): the report already carries the template note. With `COACH_AI_ENABLED` and the
   * optional `AI` binding, ask Workers AI once per drill for its wording, in the background so the report
   * never waits on the model. The prompt holds the four score numbers only.
   */
  private requestAiCoachNote(report: Report): void {
    if (report.coachNote?.source === 'ai' || this.coachAsked.has(report.drillId) || !coachAiEnabled(this.env)) return;
    this.coachAsked.add(report.drillId);
    this.ctx.waitUntil(this.writeAiCoachNote(report.drillId, coachStats(report.score)));
  }

  /** Save the model's note, then refresh the report so it is broadcast like any other update. */
  private async writeAiCoachNote(drillId: string, stats: CoachStats): Promise<void> {
    const text = await aiCoachNote(this.env, stats, this.roomName(), drillId);
    if (text === null || !this.bootstrapped()) return; // the template note stands
    const saved = this.ctx.storage.transactionSync(() => saveAiCoachNote(this.sql, drillId, text));
    if (saved) this.refreshReport(drillId);
  }

  // ---- mods (SRS §8.4, T-13) ---------------------------------------------------------------

  /**
   * Join the current draft or running drill with its code (FR-22). Throws `join_forbidden` (wrong code,
   * no open drill), `join_rate_limited` (5 failures from this IP this minute) or `join_invalid`.
   */
  async joinAsMod(i: { code: string; displayName: string; ip: string; twitchUserId?: string }): Promise<{ participantId: string }> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    const input = JoinInputZ.safeParse(i);
    if (!input.success) throw new Error('join_invalid');
    const now = Date.now();
    const res = this.ctx.storage.transactionSync(() => {
      const r = joinAsMod(this.sql, input.data, now);
      if (r.ok) this.touch(now);
      return r;
    });
    if (!res.ok) throw new Error(res.reason === 'rate_limited' ? 'join_rate_limited' : 'join_forbidden');
    this.broadcastParticipants();
    return { participantId: res.participantId };
  }

  /** Join from the OAuth path after the Worker verified the Twitch identity as a channel moderator. */
  async joinAsVerifiedMod(i: { displayName: string; ip: string; twitchUserId: string }): Promise<{ participantId: string; displayName: string }> {
    if (!this.bootstrapped() || this.meta('mode') !== 'live') throw new Error('room_not_bootstrapped');
    const now = Date.now();
    const res = this.ctx.storage.transactionSync(() => {
      const result = joinAsVerifiedMod(this.sql, i, now);
      if (result.ok) this.touch(now);
      return result;
    });
    if (!res.ok) throw new Error(res.reason === 'rate_limited' ? 'join_rate_limited' : 'join_forbidden');
    this.broadcastParticipants();
    return { participantId: res.participantId, displayName: res.name };
  }

  /** Whether a draft or running drill is open for joining; null for a never-bootstrapped room. */
  async isDrillOpen(): Promise<boolean | null> {
    if (!this.bootstrapped()) return null;
    return (
      this.sql.exec("SELECT 1 FROM drills WHERE status IN ('draft', 'voting', 'running') LIMIT 1").toArray().length > 0
    );
  }

  /** Participant IDs of mods with an open socket. */
  private connectedMods(): string[] {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets('mod')) {
      const att = attachmentOf(ws);
      if (att?.pid) ids.add(att.pid);
    }
    return [...ids];
  }

  /** First action wins (FR-18, SRS §8.5); used by mod sockets and, later, Kai (sim). */
  applyAction(pid: string, lineId: string, action: ModAction, now: number): ActionResult {
    return this.drills.applyAction(pid, lineId, action, now);
  }

  // ---- scheduler (SRS §8.5) ----------------------------------------------------------------

  /** Features register the handler for the job kinds they own. Handlers must be idempotent. */
  registerJob(kind: JobKind, handler: JobHandler): void {
    this.scheduler.register(kind, handler);
  }

  async schedule(kind: JobKind, key: string, dueAt: number, payload: object = {}): Promise<void> {
    if (!this.bootstrapped()) return;
    await this.scheduler.schedule(kind, key, dueAt, payload);
  }

  override async alarm(): Promise<void> {
    if (!this.bootstrapped()) return;
    const now = Date.now();
    await this.scheduler.runDueJobs(now);
    if (this.demoIdle(now)) await this.collectDemo();
  }

  // ---- WebSockets --------------------------------------------------------------------------

  /** WebSocket upgrade forwarded by the Worker. */
  override async fetch(req: Request): Promise<Response> {
    if (!this.bootstrapped()) return new Response('Not found', { status: 404 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });

    const auth = await this.authorizeSocket(new URL(req.url));
    if (!auth) return new Response('Forbidden', { status: 403 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, tagsFor(auth));
    server.serializeAttachment(auth satisfies Attachment);
    send(server, { type: 'hello', data: { role: auth.role, ...(auth.pid ? { participantId: auth.pid } : {}), serverTime: Date.now() } });
    send(server, { type: 'drill.state', data: this.snapshot(auth.role, auth.pid) });
    if (auth.role === 'mod' && auth.pid) {
      send(server, { type: 'mod.history', data: await this.getModHistory(auth.pid) });
    }
    this.touch();
    // A mod coming online updates everyone's mod list (the console's "joined mods").
    if (auth.role === 'mod') this.broadcastParticipants();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Ticket (single use) for console and mods, or the overlay key for overlays. */
  private async authorizeSocket(url: URL): Promise<Attachment | null> {
    const key = url.searchParams.get('overlayKey');
    if (key !== null) {
      const stored = this.meta('overlay_key');
      return stored && (await tickets.keysEqual(key, stored)) ? { role: 'overlay' } : null;
    }
    const token = url.searchParams.get('ticket');
    if (!token) return null;
    const ticket = await tickets.redeem(
      this.sql,
      (fn) => this.ctx.storage.transactionSync(fn),
      token,
      this.env.SESSION_HMAC_KEY,
      this.roomName(),
      Date.now()
    );
    if (!ticket) return null;
    if (ticket.role === 'mod') {
      const row = ticket.pid
        ? this.sql.exec<{ display_name: string }>('SELECT display_name FROM participants WHERE id = ?', ticket.pid).toArray()[0]
        : undefined;
      if (!row || !ticket.pid) return null;
      return { role: 'mod', pid: ticket.pid, name: row.display_name };
    }
    return { role: 'console' };
  }

  /**
   * The per-role `drill.state` (FR-21): full lines for console and mods, redacted for overlays (SRS §8.3),
   * with mod names hidden on overlays while `hide_names` is on (FR-46).
   */
  private snapshot(role: Role, _pid?: string): DrillSnapshot {
    const snapshot = { drill: this.drills.snapshot(role), participants: this.participants() };
    return role === 'overlay' ? overlaySnapshot(snapshot, overlayNames(this.sql)) : snapshot;
  }

  /** Push a fresh `drill.state` to every socket after a lifecycle change (create, edit, cancel). */
  private broadcastState(): void {
    const participants = this.participants();
    broadcast(this.ctx, (role) => ({ type: 'drill.state', data: { drill: this.drills.snapshot(role), participants } }));
  }

  /** Human mods of the room, plus Kai (sim) only while Kai is in the drill on screen. */
  private participants(exclude?: WebSocket): DrillSnapshot['participants'] {
    return this.sql
      .exec<{ id: string; display_name: string; is_sim: number }>(
        `SELECT id, display_name, is_sim FROM participants
          WHERE is_sim = 0 OR id IN (SELECT participant_id FROM drill_participants WHERE drill_id = ?)
          ORDER BY joined_at, id`,
        this.drills.currentDrillId() ?? ''
      )
      .toArray()
      .map((p) => ({
        id: p.id,
        name: p.display_name,
        isSim: p.is_sim === 1,
        online: p.is_sim === 1 || this.ctx.getWebSockets(`p:${p.id}`).some((ws) => ws !== exclude)
      }));
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const now = Date.now(); // server time at the event boundary, for reaction measurements
    if (!this.bootstrapped()) return;
    const att = attachmentOf(ws);
    if (!att) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const msg = ClientMsgZ.safeParse(parsed);
    if (!msg.success) return;
    if (msg.data.type === 'sync') {
      send(ws, { type: 'drill.state', data: this.snapshot(att.role, att.pid) });
      return;
    }
    // Only mod sockets act; console and overlay sockets can only `sync`.
    if (att.role !== 'mod' || !att.pid) return;
    const { lineId, action } = msg.data.data;
    const res = this.applyAction(att.pid, lineId, action, now);
    const drill = this.drills.drillOfLine(lineId);
    log('mod.action', {
      room: this.roomName(),
      ...(drill ? { drill } : {}),
      pid: att.pid,
      result: res.ok ? 'ok' : res.reason,
      ...(res.ok ? { reactionMs: res.reactionMs } : {})
    });
    if (!res.ok) {
      send(ws, { type: 'action.rejected', data: { lineId, reason: res.reason, ...(res.by !== undefined ? { by: res.by } : {}) } });
      return;
    }
    this.drills.broadcastAction(res);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'closing');
    } catch {
      /* already closed */
    }
    if (!this.bootstrapped()) return;
    this.broadcastParticipants(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws, 1011);
  }

  private broadcastParticipants(exclude?: WebSocket): void {
    const msg: ServerMsg = { type: 'participants', data: this.participants(exclude) };
    broadcast(this.ctx, () => msg, exclude ? { exclude } : {});
  }
}

