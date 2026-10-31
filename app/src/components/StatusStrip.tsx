import { z } from 'zod';

export const StatusViewZ = z.object({
  token: z.object({ status: z.string(), validatedAt: z.number().nullable() }),
  subscription: z.object({ status: z.string() }),
  chatLog: z.object({ count: z.number().int().nonnegative(), lastMessageAt: z.number().nullable() }),
  quota: z.object({
    minute: z.object({ used: z.number().int().nonnegative(), limit: z.number().int().positive() }),
    hour: z.object({ used: z.number().int().nonnegative(), limit: z.number().int().positive() }),
    nextAllowedAt: z.number()
  })
});

export type StatusView = z.infer<typeof StatusViewZ>;

type Props = {
  status: StatusView | null;
  loading: boolean;
  error: string | null;
  repairing: boolean;
  onRepair: () => void;
};

function dateText(value: number | null): string {
  if (value === null) return 'Not available yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

function statusText(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function StatusStrip({ status, loading, error, repairing, onRepair }: Props) {
  const subscriptionHealthy = status?.subscription.status === 'enabled'
    || status?.subscription.status === 'webhook_callback_verification_pending';
  const canRepair = status?.token.status === 'ok' && !subscriptionHealthy;
  const nextAllowed = status?.quota.nextAllowedAt ?? 0;

  return <section className="console-status-panel" aria-label="Connection status" aria-live="polite">
    <div className="console-status-panel-heading">
      <h2>Connection status</h2>
      {canRepair && <button type="button" className="console-button console-button-quiet" onClick={onRepair} disabled={repairing || loading}>
        {repairing ? 'Repairing…' : 'Repair chat connection'}
      </button>}
    </div>
    {loading && !status ? <p className="console-muted" role="status">Loading connection status…</p> : status ? <dl className="console-status-details">
      <div><dt>Twitch connection</dt><dd><span className={`console-status-dot ${status.token.status === 'ok' ? 'is-good' : 'is-warn'}`} />{statusText(status.token.status)}</dd></div>
      <div><dt>Last checked</dt><dd>{dateText(status.token.validatedAt)}</dd></div>
      <div><dt>Chat subscription</dt><dd><span className={`console-status-dot ${subscriptionHealthy ? 'is-good' : 'is-warn'}`} />{statusText(status.subscription.status)}</dd></div>
      <div><dt>Chat log</dt><dd>{status.chatLog.count} messages</dd></div>
      <div><dt>Last chat message</dt><dd>{dateText(status.chatLog.lastMessageAt)}</dd></div>
      <div><dt>Grading quota · minute</dt><dd>{status.quota.minute.used} of {status.quota.minute.limit} used</dd></div>
      <div><dt>Grading quota · hour</dt><dd>{status.quota.hour.used} of {status.quota.hour.limit} used</dd></div>
      <div><dt>Next grading time</dt><dd>{nextAllowed <= Date.now() ? 'Ready now' : dateText(nextAllowed)}</dd></div>
    </dl> : <p className="console-muted">Connection status is unavailable.</p>}
    {error && <p className="console-status-error" role="alert">{error}</p>}
  </section>;
}
