import { Hono } from 'hono';
import { z } from 'zod';
import type { ChatMessageEvent, EventSubEnvelope } from '@mfd/core';
import { log } from '../lib/log.js';
import { verifyEventSub } from '../twitch/verify.js';

export const eventsubRoutes = new Hono<{ Bindings: Env }>();

const EnvelopeSchema = z.object({
  subscription: z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    version: z.string().min(1),
    status: z.string().min(1),
    condition: z.record(z.string(), z.string())
  }),
  event: z.unknown().optional(),
  challenge: z.string().optional()
});
const ChatMessageSchema = z.object({
  broadcaster_user_id: z.string().min(1),
  chatter_user_id: z.string().min(1),
  chatter_user_login: z.string().min(1),
  message_id: z.string().min(1),
  message: z.object({ text: z.string() }),
  message_type: z.string().min(1),
  source_broadcaster_user_id: z.string().nullable().optional()
});

async function saveSubscription(
  db: D1Database,
  subscription: EventSubEnvelope['subscription'],
  status: string,
  now: number
): Promise<void> {
  await db.prepare(`INSERT INTO eventsub_subscriptions
      (id, broadcaster_id, type, version, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`)
    .bind(
      subscription.id,
      subscription.condition.broadcaster_user_id ?? null,
      subscription.type,
      subscription.version,
      status,
      now,
      now
    )
    .run();
}

eventsubRoutes.post('/', async (context) => {
  const receivedAt = Date.now();
  const verified = await verifyEventSub(context.req.raw, context.env.EVENTSUB_SECRET, receivedAt);
  if (!verified.ok) {
    log('eventsub.rejected', { room: 'eventsub', reason: verified.status === 403 ? 'sig' : 'parse' });
    return context.body(null, verified.status);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(verified.body);
  } catch {
    log('eventsub.rejected', { room: 'eventsub', reason: 'parse' });
    return context.body(null, 400);
  }
  const parsed = EnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    log('eventsub.rejected', { room: 'eventsub', reason: 'parse' });
    return context.body(null, 400);
  }
  const message = parsed.data;
  log('eventsub.received', {
    room: 'eventsub',
    type: message.subscription.type,
    msgType: verified.type,
    ms: Date.now() - receivedAt
  });

  try {
    if (verified.type === 'webhook_callback_verification') {
      if (message.challenge === undefined) return context.body(null, 400);
      await saveSubscription(context.env.DB, message.subscription, 'enabled', Date.now());
      log('eventsub.subscription', { room: 'eventsub', subType: message.subscription.type, status: 'enabled' });
      return context.text(message.challenge, 200, { 'Content-Type': 'text/plain; charset=utf-8' });
    }

    if (verified.type === 'revocation') {
      await saveSubscription(context.env.DB, message.subscription, message.subscription.status, Date.now());
      log('eventsub.subscription', {
        room: 'eventsub',
        subType: message.subscription.type,
        status: message.subscription.status
      });
      return context.body(null, 204);
    }

    if (verified.type !== 'notification') return context.body(null, 204);
    if (message.subscription.type !== 'channel.chat.message') return context.body(null, 204);

    const event = ChatMessageSchema.safeParse(message.event);
    if (!event.success) return context.body(null, 400);
    const chat: ChatMessageEvent = {
      ...event.data,
      source_broadcaster_user_id: event.data.source_broadcaster_user_id ?? null
    };
    const room = context.env.ROOM.getByName(`ch:${chat.broadcaster_user_id}`);
    const result = await room.ingestChat(chat);
    log('chat.ingest', { room: `ch:${chat.broadcaster_user_id}`, result });
    return context.body(null, 204);
  } catch {
    return context.body(null, 500);
  }
});
