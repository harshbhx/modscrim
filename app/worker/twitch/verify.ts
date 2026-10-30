const enc = new TextEncoder();
const MAX_SKEW_MS = 10 * 60_000;

export type Verified =
  | { ok: true; id: string; type: string; body: string }
  | { ok: false; status: 400 | 403 };

export async function verifyEventSub(req: Request, secret: string, now: number): Promise<Verified> {
  const id = req.headers.get('Twitch-Eventsub-Message-Id');
  const ts = req.headers.get('Twitch-Eventsub-Message-Timestamp');
  const sig = req.headers.get('Twitch-Eventsub-Message-Signature');
  const type = req.headers.get('Twitch-Eventsub-Message-Type');
  if (!id || !ts || !sig || !type || !sig.startsWith('sha256=')) return { ok: false, status: 400 };
  const body = await req.text();
  const sent = Date.parse(ts.replace(/(\.\d{3})\d+/, '$1'));
  if (!Number.isFinite(sent) || Math.abs(now - sent) > MAX_SKEW_MS) return { ok: false, status: 403 };
  const hex = sig.slice(7);
  if (!/^[0-9a-f]{64}$/.test(hex)) return { ok: false, status: 403 };
  const mac = Uint8Array.from(hex.match(/../g) as string[], (value) => Number.parseInt(value, 16));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('HMAC', key, mac, enc.encode(id + ts + body));
  return ok ? { ok: true, id, type, body } : { ok: false, status: 403 };
}
