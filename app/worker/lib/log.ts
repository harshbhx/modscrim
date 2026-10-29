export type LogEvent =
  | 'auth.signin' | 'auth.signout' | 'auth.refresh' | 'auth.validate'
  | 'eventsub.received' | 'eventsub.rejected' | 'eventsub.subscription'
  | 'chat.ingest' | 'drill.created' | 'drill.started' | 'drill.ended'
  | 'line.emit' | 'mod.action' | 'grade.send' | 'grade.done' | 'rules.run'
  | 'push.term' | 'undo.term' | 'report.saved' | 'report.exported'
  | 'demo.created' | 'demo.gc' | 'job.failed';

export type LogFields = { room: string; drill?: string } & Record<string, unknown>;

const UNSAFE_FIELD = /token|secret|password|authorization|cookie|(?:chat|attack)[_-]?text|^text$|^message$/i;

function safeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) => UNSAFE_FIELD.test(key) ? [] : [[key, safeValue(item)]])
    );
  }
  return value;
}

/** Writes structured operational metadata only; sensitive and line-text fields are removed. */
export function log(evt: LogEvent, fields: LogFields): void {
  const safeFields = safeValue(fields) as LogFields;
  console.log(JSON.stringify({ evt, ts: Date.now(), ...safeFields }));
}
