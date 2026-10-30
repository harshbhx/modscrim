import { DurableObject } from 'cloudflare:workers';
import type { DrillSnapshot, JobKind, Role, ServerMsg } from '@mfd/core';
import { overlayKey as newOverlayKey } from '../lib/ids.js';
import { attachmentOf, broadcast, closeRole, send, tagsFor, type Attachment } from './hub.js';
import { ClientMsgZ } from './messages.js';
import { isBootstrapped, migrate } from './schema.js';
import { Scheduler, type JobHandler } from './scheduler.js';
import * as tickets from './tickets.js';
import { RoomTokens } from './tokens.js';

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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
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
  }

  /** Return a usable broadcaster token, refreshing at the five-minute boundary or after a 401. */
  async getAccessToken(rejectedToken?: string): Promise<string> {
    if (!this.bootstrapped()) throw new Error('room_not_bootstrapped');
    const userId = this.meta('broadcaster_id');
    if (!userId) throw new Error('room_missing_broadcaster');
    return this.tokens.getAccessToken(userId, rejectedToken);
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

  /** The per-role `drill.state`. TODO(T-12): fill `drill` from the drill tables; redact for overlays. */
  private snapshot(_role: Role, _pid?: string): DrillSnapshot {
    return { drill: null, participants: this.participants() };
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
    // TODO(T-12): `mod.action` is applied by the drill engine (`applyAction`).
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

