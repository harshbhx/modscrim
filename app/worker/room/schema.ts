/** Room SQLite schema (SRS §7.2). Runs only for bootstrapped rooms, inside `blockConcurrencyWhile`. */
export const SCHEMA_VERSION = '1';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: schema_version, room_name, mode (live|demo), broadcaster_id, login, display_name,
--       broadcaster_type, overlay_key, hide_names (1|0), logging (1|0), last_activity,
--       filters_fetched_at, automod_json, subscription_status

CREATE TABLE IF NOT EXISTS blocked_terms (
  id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at TEXT, fetched_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS chat_log (
  message_id TEXT PRIMARY KEY, chatter_id TEXT NOT NULL, chatter_login TEXT NOT NULL,
  text TEXT NOT NULL, tokens TEXT NOT NULL,          -- space-joined output of tokenize()
  sent_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS chat_log_sent ON chat_log(sent_at);

CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT, due_at INTEGER NOT NULL, kind TEXT NOT NULL,
  key TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}', attempts INTEGER NOT NULL DEFAULT 0,
  UNIQUE (kind, key));
CREATE INDEX IF NOT EXISTS schedule_due ON schedule(due_at);

CREATE TABLE IF NOT EXISTS drills (
  id TEXT PRIMARY KEY, seed INTEGER NOT NULL, config TEXT NOT NULL,
  status TEXT NOT NULL,                              -- draft|running|ended|cancelled (+ voting with FR-40)
  join_code TEXT NOT NULL, created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER);

CREATE TABLE IF NOT EXISTS wave_lines (
  id TEXT PRIMARY KEY, drill_id TEXT NOT NULL, wave TEXT NOT NULL, idx INTEGER NOT NULL,
  kind TEXT NOT NULL, tactic TEXT, trick TEXT, link_trick TEXT, tags TEXT NOT NULL,
  user TEXT NOT NULL, segments TEXT NOT NULL, text TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS wave_lines_drill ON wave_lines(drill_id, wave, idx);

CREATE TABLE IF NOT EXISTS participants (                -- room-scoped: a mod joins once
  id TEXT PRIMARY KEY, twitch_user_id TEXT, display_name TEXT NOT NULL,
  is_sim INTEGER NOT NULL DEFAULT 0, joined_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS drill_participants (
  drill_id TEXT NOT NULL, participant_id TEXT NOT NULL, PRIMARY KEY (drill_id, participant_id));
CREATE TABLE IF NOT EXISTS join_attempts (ip TEXT NOT NULL, minute INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (ip, minute));

CREATE TABLE IF NOT EXISTS line_state (
  line_id TEXT PRIMARY KEY, shown_at INTEGER, acted_by TEXT, action TEXT, acted_at INTEGER,
  slipped INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS grades (
  line_id TEXT NOT NULL, phase TEXT NOT NULL, engine TEXT NOT NULL, permitted INTEGER NOT NULL,
  blocked_by TEXT, graded_at INTEGER NOT NULL, PRIMARY KEY (line_id, phase, engine));

CREATE TABLE IF NOT EXISTS grade_queue (
  line_id TEXT NOT NULL, phase TEXT NOT NULL, drill_id TEXT NOT NULL,
  status TEXT NOT NULL,                              -- pending|sent|done|failed
  enqueued_at INTEGER NOT NULL, PRIMARY KEY (line_id, phase));

CREATE TABLE IF NOT EXISTS grade_sends (ts INTEGER NOT NULL, units INTEGER NOT NULL);  -- Check AutoMod Status calls, last hour

CREATE TABLE IF NOT EXISTS rule_runs (drill_id TEXT PRIMARY KEY, result TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS proofs (drill_id TEXT PRIMARY KEY, selected TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS pushes (
  id TEXT PRIMARY KEY, drill_id TEXT NOT NULL, term TEXT NOT NULL, twitch_term_id TEXT,
  preexisting INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,                              -- pending|added|failed|removed
  error TEXT, pushed_at INTEGER, removed_at INTEGER, UNIQUE (drill_id, term));

CREATE TABLE IF NOT EXISTS reports (drill_id TEXT PRIMARY KEY, report_id TEXT NOT NULL, report TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS votes (drill_id TEXT NOT NULL, chatter_id TEXT NOT NULL, tactic TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (drill_id, chatter_id));
CREATE TABLE IF NOT EXISTS ws_nonces (nonce TEXT PRIMARY KEY, exp INTEGER NOT NULL);
`;

type Sql = DurableObjectStorage['sql'];

/** True when this room was bootstrapped before. A read of `sqlite_master` stores nothing. */
export function isBootstrapped(sql: Sql): boolean {
  return sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'").toArray().length > 0;
}

/** Create every table (idempotent) and record the schema version. */
export function migrate(sql: Sql): void {
  sql.exec(SCHEMA);
  sql.exec("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)", SCHEMA_VERSION);
}
