import type { Role, ServerMsg } from '@mfd/core';

/** What each hibernating socket remembers. Small: well under the 16 KB limit. */
export type Attachment = { role: Role; pid?: string; name?: string };

export function tagsFor(att: Attachment): string[] {
  return att.pid ? [att.role, `p:${att.pid}`] : [att.role];
}

export function attachmentOf(ws: WebSocket): Attachment | null {
  const raw = ws.deserializeAttachment() as Attachment | null;
  return raw && typeof raw.role === 'string' ? raw : null;
}

export function send(ws: WebSocket, msg: ServerMsg): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* the socket is closing; the close handler cleans up */
  }
}

/**
 * Send one payload per role. `build` receives the role and returns the message for that role,
 * or null to skip it, so overlay sockets only ever get redacted data (SRS §8.3).
 */
export function broadcast(
  ctx: DurableObjectState,
  build: (role: Role) => ServerMsg | null,
  options: { exclude?: WebSocket } = {}
): void {
  for (const role of ['console', 'mod', 'overlay'] as const) {
    const msg = build(role);
    if (!msg) continue;
    const payload = JSON.stringify(msg);
    for (const ws of ctx.getWebSockets(role)) {
      if (ws === options.exclude) continue;
      try {
        ws.send(payload);
      } catch {
        /* ignore sockets that are going away */
      }
    }
  }
}

/** Send to one participant's sockets only. */
export function sendToParticipant(ctx: DurableObjectState, pid: string, msg: ServerMsg): void {
  for (const ws of ctx.getWebSockets(`p:${pid}`)) send(ws, msg);
}

export function closeRole(ctx: DurableObjectState, role: Role, code: number, reason: string): void {
  for (const ws of ctx.getWebSockets(role)) {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }
}
