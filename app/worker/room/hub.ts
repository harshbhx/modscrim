import type { DrillScore, DrillSnapshot, ReportCard, Role, ServerMsg } from '@mfd/core';
import { z } from 'zod';

type Sql = DurableObjectStorage['sql'];

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
 * or null to skip it, so overlay sockets only ever get redacted data (SRS §8.3). Every overlay
 * message also passes through `forOverlay`, so hidden mod names (FR-46) hold for every builder.
 */
export function broadcast(
  ctx: DurableObjectState,
  build: (role: Role) => ServerMsg | null,
  options: { exclude?: WebSocket } = {}
): void {
  for (const role of ['console', 'mod', 'overlay'] as const) {
    const built = build(role);
    if (!built) continue;
    const hide = role === 'overlay' && ctx.getWebSockets('overlay').length > 0;
    const msg = hide ? forOverlay(built, overlayNames(ctx.storage.sql)) : built;
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

// ---- hidden mod names on the overlay (FR-46, SRS §8.3) -------------------------------------------

/** `POST /api/overlay/settings` body and `setOverlaySettings` input. */
export const OverlaySettingsZ = z.object({ hideNames: z.boolean() });
export type OverlaySettings = z.infer<typeof OverlaySettingsZ>;

/** Overlay labels while `meta.hide_names` is on; `null` while names are shown. */
export type OverlayNames = { byId: ReadonlyMap<string, string>; byName: ReadonlyMap<string, string> } | null;

/** The label for a human mod whose alias cannot be found. Never a display name. */
export const HIDDEN_NAME = 'Mod';

/**
 * With `meta.hide_names` = 1, human mods are "Mod 1", "Mod 2" and so on in the order they joined the room.
 * Kai (sim) is not a person and keeps its "(sim)" label (F-18), so it takes no number.
 */
export function overlayNames(sql: Sql): OverlayNames {
  const on = sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'hide_names'").toArray()[0]?.value === '1';
  if (!on) return null;
  const humans = sql
    .exec<{ id: string; display_name: string }>('SELECT id, display_name FROM participants WHERE is_sim = 0 ORDER BY joined_at, id')
    .toArray();
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  humans.forEach((p, i) => {
    byId.set(p.id, `Mod ${i + 1}`);
    byName.set(p.display_name.toLowerCase(), `Mod ${i + 1}`);
  });
  return { byId, byName };
}

function aliasOf(names: NonNullable<OverlayNames>, p: { id: string; name: string; isSim: boolean }): string {
  return p.isSim ? p.name : (names.byId.get(p.id) ?? HIDDEN_NAME);
}

function aliasScore(score: DrillScore, names: NonNullable<OverlayNames>): DrillScore {
  return { ...score, mods: score.mods.map((m) => ({ ...m, name: aliasOf(names, { id: m.participantId, name: m.name, isSim: m.isSim }) })) };
}

/** The overlay's `drill.state` with names hidden (lines are already redacted by the drill engine). */
export function overlaySnapshot(snapshot: DrillSnapshot, names: OverlayNames): DrillSnapshot {
  if (!names) return snapshot;
  const drill = snapshot.drill;
  return {
    participants: snapshot.participants.map((p) => ({ ...p, name: aliasOf(names, p) })),
    drill: drill && {
      ...drill,
      lines: drill.lines.map(({ actedByName: _hidden, ...line }) => line),
      score: aliasScore(drill.score, names)
    }
  };
}

/** A report card for the overlay (T-17 sends it in `report.ready`). Cards carry no IDs, so names map by name. */
export function aliasCard(card: ReportCard, names: OverlayNames): ReportCard {
  if (!names) return card;
  return { ...card, mods: card.mods.map((m) => ({ ...m, name: m.isSim ? m.name : (names.byName.get(m.name.toLowerCase()) ?? HIDDEN_NAME) })) };
}

/**
 * The overlay form of a message: with names hidden, every mod name becomes its "Mod N" label. Redaction of
 * line text and the reveal stays with the builders (SRS §8.3); this also drops `actedByName` and `by` defensively.
 */
export function forOverlay(msg: ServerMsg, names: OverlayNames): ServerMsg {
  if (!names) return msg;
  switch (msg.type) {
    case 'drill.action':
      return { type: msg.type, data: { ...msg.data, name: aliasOf(names, { id: msg.data.participantId, name: msg.data.name, isSim: msg.data.isSim }) } };
    case 'drill.score':
      return { type: msg.type, data: aliasScore(msg.data, names) };
    case 'drill.ended':
      return { type: msg.type, data: { ...msg.data, score: aliasScore(msg.data.score, names) } };
    case 'participants':
      return { type: msg.type, data: msg.data.map((p) => ({ ...p, name: aliasOf(names, p) })) };
    case 'drill.state':
      return { type: msg.type, data: overlaySnapshot(msg.data, names) };
    case 'report.ready':
      return { type: msg.type, data: { ...msg.data, card: aliasCard(msg.data.card, names) } };
    case 'action.rejected': {
      const { by: _hidden, ...data } = msg.data;
      return { type: msg.type, data };
    }
    default:
      return msg;
  }
}
