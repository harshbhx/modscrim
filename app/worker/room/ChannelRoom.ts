import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import type { ChatMessageEvent, DrillConfigInput, DrillSnapshot, DrillView, FiltersView, JobKind, Role, ServerMsg } from '@mfd/core';
import { overlayKey as newOverlayKey } from '../lib/ids.js';
import { log } from '../lib/log.js';
import { attachmentOf, broadcast, closeRole, send, tagsFor, type Attachment } from './hub.js';
import { ClientMsgZ } from './messages.js';
import { chatLogStats, deleteChatLog, ingestChat, type ChatIngestResult } from './chatlog.js';
import { isBootstrapped, migrate } from './schema.js';
import { Scheduler, type JobHandler } from './scheduler.js';
import * as tickets from './tickets.js';
import { RoomTokens } from './tokens.js';
import { getAutoModSettings, getBlockedTerms, getUsers, HelixError } from '../twitch/helix.js';
import { DrillEngine, DrillError } from './drill.js';

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
  private readonly drills = new DrillEngine(this.ctx, this.scheduler, () => this.roomName());
  private readonly tokens = new RoomTokens(this.env, () => this.roomName());

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.drills.registerJobs((kind, handler) => this.registerJob(kind, handler));
    // Migrations run only for rooms bootstrapped before; a stray request creates no tables.
    ctx.blockConcurrencyWhile(async () => {
      if (isBootstrapped(this.sql)) migrate(this.sql);
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
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
    const userId = this.meta('broadcaster_id');
    if (!userId) throw new Error('room_missing_broadcaster');
    return this.tokens.getAccessToken(userId, rejectedToken);
  }

  /** Add one validated Twitch chat event to this channel's seven-day chat log. */
  async ingestChat(event: ChatMessageEvent): Promise<ChatIngestResult> {
    if (!this.bootstrapped()) return 'ignored';
    const sentAt = Date.now();
    return this.ctx.storage.transactionSync(() => {
      const broadcasterId = this.meta('broadcaster_id');
      if (!broadcasterId || event.broadcaster_user_id !== broadcasterId) return 'ignored';
      const result = ingestChat(this.sql, broadcasterId, this.meta('logging') === '1', event, sentAt);
      if (result === 'stored') this.touch(sentAt);
      return result;
    });
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

  async createDrill(input: DrillConfigInput): Promise<{ drillId: string; joinCode: string }> {
    if (!this.bootstrapped()) throw new DrillError('not_found', 'Channel room not found.');
    this.touch();
    return this.drills.createDrill(input);
  }

  async updateDraft(drillId: string, input: DrillConfigInput): Promise<DrillView> {
    if (!this.bootstrapped()) throw new DrillError('not_found', 'Channel room not found.');
    this.touch();
    return this.drills.updateDraft(drillId, input);
  }

  async cancelDraft(drillId: string): Promise<void> {
    if (!this.bootstrapped()) throw new DrillError('not_found', 'Channel room not found.');
    this.touch();
    return this.drills.cancelDraft(drillId);
  }

  async startDrill(drillId: string): Promise<{ startedAt: number }> {
    if (!this.bootstrapped()) throw new DrillError('not_found', 'Channel room not found.');
    this.touch();
    return this.drills.startDrill(drillId);
  }

  async stopDrill(drillId: string): Promise<{ endedAt: number }> {
    if (!this.bootstrapped()) throw new DrillError('not_found', 'Channel room not found.');
    this.touch();
    return this.drills.stopDrill(drillId);
  }

  async getDrill(drillId: string): Promise<DrillView> {
    if (!this.bootstrapped()) throw new DrillError('not_found', 'Channel room not found.');
    return this.drills.getDrill(drillId);
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
    await this.scheduler.runDueJobs();
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
    this.touch();
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

  /** The per-role `drill.state`; overlays receive only redacted line data. */
  private snapshot(role: Role, _pid?: string): DrillSnapshot {
    return this.drills.snapshot(role);
  }

  private participants(exclude?: WebSocket): DrillSnapshot['participants'] {
    return this.sql
      .exec<{ id: string; display_name: string; is_sim: number }>(
        'SELECT id, display_name, is_sim FROM participants ORDER BY joined_at, id'
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
    const now = Date.now();
    if (msg.data.type === 'mod.action' && att.role === 'mod' && att.pid) {
      const result = this.drills.applyAction(att.pid, msg.data.data.lineId, msg.data.data.action, now);
      if (result.ok) this.drills.broadcastAction(result);
      else send(ws, { type: 'action.rejected', data: { lineId: msg.data.data.lineId, reason: result.reason, ...(result.by ? { by: result.by } : {}) } });
    }
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

