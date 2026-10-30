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
