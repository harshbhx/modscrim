import { readToken, signToken, type WsTicket } from '../auth/session.js';
import { randomId } from '../lib/ids.js';

type Sql = DurableObjectStorage['sql'];

/** Tickets live 60 seconds. All times are epoch milliseconds. */
export const TICKET_TTL_MS = 60_000;

export async function issue(
  key: string,
  room: string,
  who: { role: 'console' | 'mod'; pid?: string },
  now: number
): Promise<string> {
  const ticket: WsTicket = { room, role: who.role, n: randomId(16), exp: now + TICKET_TTL_MS };
  if (who.pid !== undefined) ticket.pid = who.pid;
  return signToken(ticket, key);
}

/**
 * Check signature, expiry and room, then burn the nonce. Single use: the room stores each
 * redeemed nonce until it expires, so a replay finds it and fails.
 */
export async function redeem(
  sql: Sql,
  transactionSync: <T>(closure: () => T) => T,
  token: string,
  key: string,
  room: string,
  now: number
): Promise<WsTicket | null> {
  const ticket = await readToken<WsTicket>(token, key, now);
  if (!ticket || ticket.room !== room) return null;
  if (ticket.role !== 'console' && ticket.role !== 'mod') return null;
  if (typeof ticket.n !== 'string' || ticket.n === '') return null;

  // No await between the read and the write.
  return transactionSync(() => {
    sql.exec('DELETE FROM ws_nonces WHERE exp <= ?', now);
    const seen = sql.exec('SELECT 1 FROM ws_nonces WHERE nonce = ?', ticket.n).toArray().length > 0;
    if (seen) return null;
    sql.exec('INSERT INTO ws_nonces (nonce, exp) VALUES (?, ?)', ticket.n, ticket.exp);
    return ticket;
  });
}

/** Constant-time comparison of the overlay key (both sides hashed so the lengths match). */
export async function keysEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  return crypto.subtle.timingSafeEqual(x, y);
}

