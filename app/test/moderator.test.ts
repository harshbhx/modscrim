import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import migration from '../migrations/0001_init.sql?raw';
import { isChannelModerator } from '../worker/twitch/helix.js';
import { modAuthorizeUrl } from '../worker/twitch/oauth.js';

beforeAll(async () => {
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) /, 'CREATE $1$2 IF NOT EXISTS ')).run();
  }
});

describe('moderator Twitch authorization', () => {
  it('rejects membership when Get Moderators returns an empty data array', async () => {
    const broadcasterId = `broadcaster-${crypto.randomUUID()}`;
    const roomName = `ch:${broadcasterId}`;
    await env.DB.prepare('INSERT INTO channels (broadcaster_id, room_name, connected_at) VALUES (?, ?, 0)')
      .bind(broadcasterId, roomName).run();
    const bindings = {
      ...env,
      ROOM: { getByName: () => ({ getAccessToken: async () => 'broadcaster-token' }) }
    } as unknown as Env;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [] }));

    try {
      await expect(isChannelModerator(bindings, broadcasterId, 'mod-user-1')).resolves.toBe(false);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0] ?? [];
      expect(String(url)).toContain('/helix/moderation/moderators?');
      expect(String(url)).toContain(`broadcaster_id=${broadcasterId}`);
      expect(String(url)).toContain('user_id=mod-user-1');
      expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer broadcaster-token');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('allows the broadcaster without a Get Moderators request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(isChannelModerator(env, 'broadcaster-1', 'broadcaster-1')).resolves.toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('requests identity-only OAuth for moderator sign-in', () => {
    const url = new URL(modAuthorizeUrl(env, 'state-value'));
    expect(url.origin + url.pathname).toBe('https://id.twitch.tv/oauth2/authorize');
    expect(url.searchParams.get('redirect_uri')).toBe(`${env.PUBLIC_BASE_URL}/auth/mod/callback`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.has('scope')).toBe(false);
  });
});
