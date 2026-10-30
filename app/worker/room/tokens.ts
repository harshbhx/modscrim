import { seal, unseal } from '../auth/crypto.js';
import { log } from '../lib/log.js';
import { refreshToken as refreshTwitchToken, TwitchOAuthError, validateToken } from '../twitch/oauth.js';

type TokenRow = {
  access_sealed: string;
  refresh_sealed: string;
  expires_at: number;
  scopes: string;
  status: string;
};

/** Per-room token access and single-flight refresh handling (FR-02). */
export class RoomTokens {
  private readonly refreshes = new Map<string, Promise<string>>();

  constructor(private readonly env: Env, private readonly roomName: () => string) {}

  async getAccessToken(userId: string, rejectedToken?: string): Promise<string> {
    const row = await this.env.DB.prepare('SELECT access_sealed, refresh_sealed, expires_at, scopes, status FROM oauth_tokens WHERE user_id = ?')
      .bind(userId)
      .first<TokenRow>();
    if (!row || row.status !== 'ok') throw new Error('twitch_reconnect_required');

    const currentAccess = await unseal(row.access_sealed, this.env.TOKEN_ENC_KEY, userId);
    const now = Date.now();
    if (rejectedToken !== undefined && currentAccess !== rejectedToken) return currentAccess;
    if (rejectedToken === undefined && row.expires_at > now + 5 * 60_000) return currentAccess;

    const active = this.refreshes.get(userId);
    if (active) return active;
    const refresh = this.refreshAccessToken(userId, rejectedToken);
    this.refreshes.set(userId, refresh);
    try {
      return await refresh;
    } finally {
      if (this.refreshes.get(userId) === refresh) this.refreshes.delete(userId);
    }
  }

  /**
   * Hourly validation (FR-03). Twitch answering 401 to `/oauth2/validate`, or 400/401 to a refresh,
   * marks the token `invalid` so the console shows "Reconnect Twitch". Network and 5xx errors throw
   * and leave the stored status unchanged. `validated_at` records each answer Twitch gave.
   */
  async validate(userId: string, now: number): Promise<'ok' | 'invalid'> {
    let access: string;
    try {
      access = await this.getAccessToken(userId);
    } catch (error) {
      if (error instanceof Error && error.message === 'twitch_reconnect_required') return 'invalid';
      if (error instanceof TwitchOAuthError && (error.status === 400 || error.status === 401)) {
        return this.markInvalid(userId, now);
      }
      throw error;
    }

    let identity: Awaited<ReturnType<typeof validateToken>>;
    try {
      identity = await validateToken(this.env, access);
    } catch (error) {
      if (error instanceof TwitchOAuthError && error.status === 401) return this.markInvalid(userId, now);
      throw error;
    }
    if (identity.user_id !== userId) return this.markInvalid(userId, now);
    await this.env.DB.prepare("UPDATE oauth_tokens SET validated_at = ? WHERE user_id = ? AND status = 'ok'")
      .bind(now, userId)
      .run();
    log('auth.validate', { room: this.roomName(), uid: userId, ok: true });
    return 'ok';
  }

  private async markInvalid(userId: string, now: number): Promise<'invalid'> {
    await this.env.DB.prepare("UPDATE oauth_tokens SET status = 'invalid', validated_at = ? WHERE user_id = ? AND status = 'ok'")
      .bind(now, userId)
      .run();
    log('auth.validate', { room: this.roomName(), uid: userId, ok: false });
    return 'invalid';
  }

  private async refreshAccessToken(userId: string, rejectedToken?: string): Promise<string> {
    const row = await this.env.DB.prepare('SELECT access_sealed, refresh_sealed, expires_at, scopes, status FROM oauth_tokens WHERE user_id = ?')
      .bind(userId)
      .first<TokenRow>();
    if (!row || row.status !== 'ok') throw new Error('twitch_reconnect_required');
    const currentAccess = await unseal(row.access_sealed, this.env.TOKEN_ENC_KEY, userId);
    const now = Date.now();
    if (rejectedToken !== undefined && currentAccess !== rejectedToken) return currentAccess;
    if (rejectedToken === undefined && row.expires_at > now + 5 * 60_000) return currentAccess;

    const refresh = await unseal(row.refresh_sealed, this.env.TOKEN_ENC_KEY, userId);
    if (!refresh) throw new Error('twitch_reconnect_required');
    const next = await refreshTwitchToken(this.env, refresh);
    const accessSealed = await seal(next.access_token, this.env.TOKEN_ENC_KEY, userId);
    const refreshSealed = next.refresh_token
      ? await seal(next.refresh_token, this.env.TOKEN_ENC_KEY, userId)
      : row.refresh_sealed;
    const expiresAt = now + next.expires_in * 1000;
    await this.env.DB.prepare(`UPDATE oauth_tokens SET access_sealed = ?, refresh_sealed = ?, scopes = ?, expires_at = ?, status = 'ok'
      WHERE user_id = ?`)
      .bind(accessSealed, refreshSealed, JSON.stringify(next.scope), expiresAt, userId)
      .run();
    log('auth.refresh', { room: this.roomName(), expiresAt });
    return next.access_token;
  }
}
