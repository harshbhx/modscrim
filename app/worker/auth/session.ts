import { b64u } from './crypto.js';
const enc = new TextEncoder();

const hmacKey = (k: string) =>
  crypto.subtle.importKey('raw', enc.encode(k), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function signToken<T extends { exp: number }>(payload: T, key: string): Promise<string> {
  const body = b64u.enc(enc.encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(key), enc.encode(body));
  return `${body}.${b64u.enc(mac)}`;
}

export async function readToken<T extends { exp: number }>(token: string | undefined, key: string, now: number): Promise<T | null> {
  if (!token) return null;
  try {
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(key), b64u.dec(mac), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64u.dec(body))) as T;
    return payload.exp > now ? payload : null;
  } catch {
    return null;                              // malformed base64 or JSON: treat as no token
  }
}

export type StreamerSession = { uid: string; ep: number; exp: number };
export type DemoSession = { room: string; exp: number };
export type WsTicket = { room: string; role: 'console' | 'mod'; pid?: string; n: string; exp: number };
export type ParticipantToken = { room: string; pid: string; exp: number };   // 12 hours

export const STREAMER_SESSION_SECONDS = 7 * 24 * 60 * 60;

/** Resolve a streamer session cookie to a user ID, or null when it is missing, forged, expired or from an old epoch (FR-05). */
export async function readStreamerSession(
  db: D1Database,
  token: string | undefined,
  key: string,
  now: number
): Promise<StreamerSession | null> {
  const session = await readToken<StreamerSession>(token, key, now);
  if (!session || typeof session.uid !== 'string' || typeof session.ep !== 'number') return null;
  const row = await db
    .prepare('SELECT session_epoch FROM users WHERE id = ?')
    .bind(session.uid)
    .first<{ session_epoch: number }>();
  return row && row.session_epoch === session.ep ? session : null;
}
