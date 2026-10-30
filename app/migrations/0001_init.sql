CREATE TABLE users (
  id TEXT PRIMARY KEY, login TEXT NOT NULL, display_name TEXT NOT NULL, avatar_url TEXT,
  broadcaster_type TEXT NOT NULL DEFAULT '', session_epoch INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX users_login ON users(login);

CREATE TABLE oauth_tokens (
  user_id TEXT PRIMARY KEY, access_sealed TEXT NOT NULL, refresh_sealed TEXT NOT NULL,
  scopes TEXT NOT NULL, expires_at INTEGER NOT NULL, validated_at INTEGER,
  status TEXT NOT NULL DEFAULT 'ok');                -- ok|invalid|revoked

CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
-- keys: app_token (sealed JSON {token, expires_at}), revoke_subscription_id

CREATE TABLE channels (
  broadcaster_id TEXT PRIMARY KEY, room_name TEXT NOT NULL, connected_at INTEGER NOT NULL,
  last_chat_at INTEGER);                               -- copied hourly by the cron, never per message

CREATE TABLE eventsub_subscriptions (
  id TEXT PRIMARY KEY, broadcaster_id TEXT, type TEXT NOT NULL, version TEXT NOT NULL,
  status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX eventsub_by_channel ON eventsub_subscriptions(broadcaster_id);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, broadcaster_id TEXT NOT NULL, actor_id TEXT NOT NULL,
  action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', at INTEGER NOT NULL);
CREATE INDEX audit_by_channel ON audit_log(broadcaster_id, at);

CREATE TABLE report_summaries (
  report_id TEXT PRIMARY KEY, broadcaster_id TEXT NOT NULL, drill_id TEXT NOT NULL,
  created_at INTEGER NOT NULL, shared INTEGER NOT NULL DEFAULT 0, attacks INTEGER NOT NULL,
  slipped INTEGER NOT NULL, passed_twitch INTEGER, terms_pushed INTEGER NOT NULL,
  fresh_before INTEGER, fresh_after INTEGER, fresh_total INTEGER, r2_prefix TEXT);
CREATE INDEX reports_by_channel ON report_summaries(broadcaster_id, created_at);
