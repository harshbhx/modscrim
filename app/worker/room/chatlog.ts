import { tokenize, type ChatMessageEvent } from '@mfd/core';

export const ANNOUNCEMENT_TEXT = 'Mod fire drill starting. Practice chat only, nothing here is real.';

type Sql = DurableObjectStorage['sql'];
export type ChatIngestResult = 'stored' | 'duplicate' | 'ignored';
export type ChatLogStats = {
  count: number;
  oldest: number | null;
  newest: number | null;
  logging: boolean;
  samples: Array<{ login: string; text: string }>;
};

export function ingestChat(
  sql: Sql,
  broadcasterId: string,
  logging: boolean,
  event: ChatMessageEvent,
  sentAt: number
): ChatIngestResult {
  if (!logging || event.message.text === ANNOUNCEMENT_TEXT) return 'ignored';
  if (event.source_broadcaster_user_id && event.source_broadcaster_user_id !== broadcasterId) return 'ignored';
  const inserted = sql.exec(
    `INSERT OR IGNORE INTO chat_log (message_id, chatter_id, chatter_login, text, tokens, sent_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    event.message_id,
    event.chatter_user_id,
    event.chatter_user_login,
    event.message.text,
    tokenize(event.message.text).join(' '),
    sentAt
  );
  return inserted.rowsWritten > 0 ? 'stored' : 'duplicate';
}

export function chatLogStats(sql: Sql, logging: boolean): ChatLogStats {
  const aggregate = sql.exec<{ count: number; oldest: number | null; newest: number | null }>(
    'SELECT COUNT(*) AS count, MIN(sent_at) AS oldest, MAX(sent_at) AS newest FROM chat_log'
  ).toArray()[0];
  const samples = sql.exec<{ login: string; text: string }>(
    'SELECT chatter_login AS login, text FROM chat_log ORDER BY sent_at DESC, message_id DESC LIMIT 6'
  ).toArray();
  return {
    count: aggregate?.count ?? 0,
    oldest: aggregate?.oldest ?? null,
    newest: aggregate?.newest ?? null,
    logging,
    samples
  };
}

export function deleteChatLog(sql: Sql): number {
  return sql.exec('DELETE FROM chat_log').rowsWritten;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Drills and everything under them are kept 30 days (SRS §7.6). */
export const DRILL_RETENTION_MS = 30 * DAY_MS;
/** Join-attempt counters older than 2 minutes are dropped (FR-43). */
export const JOIN_ATTEMPT_RETENTION_MS = 2 * 60_000;
const DEFAULT_CHAT_RETENTION_DAYS = 7;

/** `CHAT_LOG_RETENTION_DAYS` in milliseconds; an unusable value falls back to the 7-day default. */
export function chatRetentionMs(env: Pick<Env, 'CHAT_LOG_RETENTION_DAYS'>): number {
  const days = Number(env.CHAT_LOG_RETENTION_DAYS);
  return (Number.isFinite(days) && days > 0 ? days : DEFAULT_CHAT_RETENTION_DAYS) * DAY_MS;
}

export type PurgeResult = { chatDeleted: number; drillsDeleted: number; lastChatAt: number | null };

const OLD_DRILLS = 'SELECT id FROM drills WHERE created_at < ?';
const OLD_LINES = `SELECT id FROM wave_lines WHERE drill_id IN (${OLD_DRILLS})`;

/**
 * Retention for one room (FR-43, SRS §7.6): chat older than the retention, drills older than
 * 30 days with every row under them, expired ticket nonces and old join-attempt counters.
 * Synchronous SQL only, so callers run it inside `transactionSync`. Idempotent.
 */
export function purgeExpired(sql: Sql, now: number, chatRetention: number): PurgeResult {
  const chatCutoff = now - chatRetention;
  const chatDeleted = sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM chat_log WHERE sent_at < ?', chatCutoff).one().n;
  if (chatDeleted > 0) sql.exec('DELETE FROM chat_log WHERE sent_at < ?', chatCutoff);

  const drillCutoff = now - DRILL_RETENTION_MS;
  const drillsDeleted = sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM drills WHERE created_at < ?', drillCutoff).one().n;
  if (drillsDeleted > 0) {
    sql.exec("DELETE FROM meta WHERE key IN (SELECT 'announce:' || id FROM drills WHERE created_at < ?)", drillCutoff);
    sql.exec(`DELETE FROM line_state WHERE line_id IN (${OLD_LINES})`, drillCutoff);
    sql.exec(`DELETE FROM grades WHERE line_id IN (${OLD_LINES})`, drillCutoff);
    for (const table of ['grade_queue', 'drill_participants', 'rule_runs', 'proofs', 'pushes', 'reports', 'votes', 'wave_lines']) {
      sql.exec(`DELETE FROM ${table} WHERE drill_id IN (${OLD_DRILLS})`, drillCutoff);
    }
    sql.exec('DELETE FROM drills WHERE created_at < ?', drillCutoff);
  }

  sql.exec('DELETE FROM ws_nonces WHERE exp <= ?', now);
  sql.exec('DELETE FROM join_attempts WHERE minute < ?', Math.floor((now - JOIN_ATTEMPT_RETENTION_MS) / 60_000));

  const lastChatAt = sql.exec<{ t: number | null }>('SELECT MAX(sent_at) AS t FROM chat_log').one().t;
  return { chatDeleted, drillsDeleted, lastChatAt };
}
