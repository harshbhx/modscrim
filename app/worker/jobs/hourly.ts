import { log } from '../lib/log.js';
import {
  deleteSubscription,
  ensureChatSubscription,
  getCachedAppToken,
  isChatSubscriptionFor,
  listChatSubscriptions
} from '../twitch/oauth.js';

/** Statuses that need no repair: live, or created moments ago and waiting for Twitch's challenge. */
const HEALTHY_SUBSCRIPTION = new Set(['enabled', 'webhook_callback_verification_pending']);

type ChannelRow = { broadcaster_id: string; room_name: string; token_status: string | null };

export type HourlyResult = {
  channels: number;
  validated: number;
  invalid: number;
  chatDeleted: number;
  drillsDeleted: number;
  repaired: number;
  failures: number;
};

/**
 * The hourly Cron Trigger (`7 * * * *` in `wrangler.jsonc`): validate every stored user token through its room (FR-03),
 * apply retention in every room and copy `last_chat_at` to D1 (FR-43), then re-create chat
 * subscriptions that are not enabled (FR-11, P1). One channel's failure never stops the others.
 */
export async function hourly(env: Env, now: number = Date.now()): Promise<HourlyResult> {
  const result: HourlyResult = { channels: 0, validated: 0, invalid: 0, chatDeleted: 0, drillsDeleted: 0, repaired: 0, failures: 0 };
  const { results: channels } = await env.DB.prepare(`SELECT c.broadcaster_id, c.room_name, o.status AS token_status
      FROM channels c LEFT JOIN oauth_tokens o ON o.user_id = c.broadcaster_id ORDER BY c.broadcaster_id`)
    .all<ChannelRow>();
  result.channels = channels.length;

  const lastChat: D1PreparedStatement[] = [];
  const connected: string[] = [];
  for (const channel of channels) {
    const room = env.ROOM.getByName(channel.room_name);
    let tokenOk = channel.token_status === 'ok';

    if (tokenOk) {
      try {
        const status = await room.validateToken();
        if (status === 'ok') result.validated += 1;
        else {
          result.invalid += 1;
          tokenOk = false;
        }
      } catch {
        result.failures += 1;
        log('job.failed', { room: channel.room_name, kind: 'hourly.validate' });
      }
    }
    if (tokenOk) connected.push(channel.broadcaster_id);

    try {
      const purged = await room.purge(now);
      if (purged) {
        result.chatDeleted += purged.chatDeleted;
        result.drillsDeleted += purged.drillsDeleted;
        lastChat.push(env.DB.prepare('UPDATE channels SET last_chat_at = ? WHERE broadcaster_id = ?')
          .bind(purged.lastChatAt, channel.broadcaster_id));
      }
    } catch {
      result.failures += 1;
      log('job.failed', { room: channel.room_name, kind: 'hourly.purge' });
    }
  }
  if (lastChat.length > 0) await env.DB.batch(lastChat);

  try {
    result.repaired = await repairChatSubscriptions(env, connected, now);
  } catch {
    result.failures += 1;
    log('job.failed', { room: 'cron', kind: 'hourly.subscriptions' });
  }
  return result;
}

/**
 * FR-11 (P1): list the app's chat subscriptions once; for each channel with a usable token whose
 * subscription is missing or not healthy, delete the dead one and create a new one. Skipped in
 * local development (non-HTTPS `PUBLIC_BASE_URL`), where Twitch cannot reach the webhook.
 */
async function repairChatSubscriptions(env: Env, broadcasterIds: string[], now: number): Promise<number> {
  if (broadcasterIds.length === 0 || new URL(env.PUBLIC_BASE_URL).protocol !== 'https:') return 0;
  const appToken = await getCachedAppToken(env);
  const listed = await listChatSubscriptions(env, appToken);
  if (!listed) return 0;

  let repaired = 0;
  for (const broadcasterId of broadcasterIds) {
    // A sign-out that finished since the channel list was read must not get a new subscription row.
    const stillConnected = await env.DB.prepare("SELECT 1 FROM oauth_tokens WHERE user_id = ? AND status = 'ok'")
      .bind(broadcasterId)
      .first();
    if (!stillConnected) continue;

    const mine = listed.filter((subscription) => isChatSubscriptionFor(subscription, broadcasterId));
    const healthy = mine.find((subscription) => HEALTHY_SUBSCRIPTION.has(subscription.status));
    if (healthy) {
      // Keep D1 in step with Twitch: one row, the live subscription.
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO eventsub_subscriptions (id, broadcaster_id, type, version, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`)
          .bind(healthy.id, broadcasterId, healthy.type, healthy.version, healthy.status, now, now),
        env.DB.prepare("DELETE FROM eventsub_subscriptions WHERE broadcaster_id = ? AND type = 'channel.chat.message' AND id <> ?")
          .bind(broadcasterId, healthy.id)
      ]);
      continue;
    }

    for (const dead of mine) await deleteSubscription(env, appToken, dead.id);
    await env.DB.prepare("DELETE FROM eventsub_subscriptions WHERE broadcaster_id = ? AND type = 'channel.chat.message'")
      .bind(broadcasterId)
      .run();
    const status = await ensureChatSubscription(env, broadcasterId);
    log('eventsub.subscription', { room: `ch:${broadcasterId}`, subType: 'channel.chat.message.repair', status });
    if (status !== 'failed') repaired += 1;
  }
  return repaired;
}
