import { unseal } from './crypto.js';
import { log } from '../lib/log.js';
import {
  deleteSubscription,
  getCachedAppToken,
  isChatSubscriptionFor,
  listChatSubscriptions,
  revokeToken
} from '../twitch/oauth.js';

export type DeleteOptions = {
  /**
   * Sign-out (FR-04) passes true: delete the channel's EventSub subscriptions and revoke its tokens
   * at Twitch first. The `user.authorization.revoke` handler (FR-12, T-32) passes false: Twitch has
   * already revoked the authorization and disables the subscriptions itself, so nothing calls Twitch.
   */
  callTwitch: boolean;
};

export type DeleteResult = {
  r2Deleted: number;
  twitch: { subscriptionsDeleted: number; tokensRevoked: number } | null;
};

type TokenRow = { access_sealed: string; refresh_sealed: string };

/** Placeholder rows written by `ensureChatSubscription` when no Twitch subscription exists. */
const PLACEHOLDER_SUBSCRIPTION = /^(?:failed|skipped):/;

/** The R2 prefix of a channel's report exports (SRS §7.5). */
export function reportPrefix(userId: string): string {
  return `reports/${userId}/`;
}

/**
 * Delete everything the app holds about one user (FR-04, SRS §11.3): Twitch subscriptions and
 * tokens (when `callTwitch`), the room's storage, R2 report exports, then the D1 rows. Twitch calls
 * are best effort and never block local deletion. Local steps run in an order that can be retried:
 * if the room or R2 step fails this throws before D1 is touched, so the session still works and
 * the user can sign out again; the D1 rows (and with them the session) go last, in one batch.
 */
export async function deleteUserData(env: Env, userId: string, options: DeleteOptions): Promise<DeleteResult> {
  const channel = await env.DB.prepare('SELECT room_name FROM channels WHERE broadcaster_id = ?')
    .bind(userId)
    .first<{ room_name: string }>();
  const roomName = channel?.room_name ?? `ch:${userId}`;

  const twitch = options.callTwitch ? await removeAtTwitch(env, userId, roomName) : null;

  await env.ROOM.getByName(roomName).destroy();

  let r2Deleted = 0;
  if (env.REPORTS) r2Deleted = await deletePrefix(env.REPORTS, reportPrefix(userId));

  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_tokens WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM eventsub_subscriptions WHERE broadcaster_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM audit_log WHERE broadcaster_id = ? OR actor_id = ?').bind(userId, userId),
    env.DB.prepare('DELETE FROM report_summaries WHERE broadcaster_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM channels WHERE broadcaster_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId)
  ]);

  return { r2Deleted, twitch };
}

/**
 * Delete the channel's chat subscriptions with the app token (those Twitch lists and those D1
 * recorded), then revoke the user's tokens. Subscriptions go first so no revocation webhook can
 * arrive for them afterwards. Each failure is logged without any token and deletion continues.
 */
async function removeAtTwitch(
  env: Env,
  userId: string,
  roomName: string
): Promise<{ subscriptionsDeleted: number; tokensRevoked: number }> {
  let subscriptionsDeleted = 0;
  let tokensRevoked = 0;

  try {
    const recorded = await env.DB.prepare('SELECT id FROM eventsub_subscriptions WHERE broadcaster_id = ?')
      .bind(userId)
      .all<{ id: string }>();
    const ids = new Set(recorded.results.map((row) => row.id).filter((id) => !PLACEHOLDER_SUBSCRIPTION.test(id)));
    if (ids.size > 0 || new URL(env.PUBLIC_BASE_URL).protocol === 'https:') {
      const appToken = await getCachedAppToken(env);
      const listed = await listChatSubscriptions(env, appToken);
      for (const subscription of listed ?? []) {
        if (isChatSubscriptionFor(subscription, userId)) ids.add(subscription.id);
      }
      for (const id of ids) {
        if (await deleteSubscription(env, appToken, id)) subscriptionsDeleted += 1;
      }
    }
  } catch {
    log('auth.signout', { room: roomName, uid: userId, step: 'subscriptions', ok: false });
  }

  const tokens = await env.DB.prepare('SELECT access_sealed, refresh_sealed FROM oauth_tokens WHERE user_id = ?')
    .bind(userId)
    .first<TokenRow>()
    .catch(() => null);
  if (tokens) {
    for (const sealed of [tokens.access_sealed, tokens.refresh_sealed]) {
      try {
        await revokeToken(env, await unseal(sealed, env.TOKEN_ENC_KEY, userId));
        tokensRevoked += 1;
      } catch {
        // An already-dead token answers 400; the stored copy is deleted either way.
      }
    }
  }
  return { subscriptionsDeleted, tokensRevoked };
}

/** Delete every object under a prefix, a page (up to 1,000 keys) at a time. */
async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list(cursor === undefined ? { prefix } : { prefix, cursor });
    const keys = page.objects.map((object) => object.key);
    if (keys.length > 0) {
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
  return deleted;
}
