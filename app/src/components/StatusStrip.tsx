import { consoleCopy } from '../copy';
import type { StatusView } from '../lib/consoleContracts';
import { Chip, Icon } from './ConsoleIcons';

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

function meterPercent(used: number, limit: number): number {
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

function Quota({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percent = meterPercent(used, limit);
  return <div className="console-status-item">
    <dt>{label}</dt>
    <dd>
      <span className="console-status-figure"><span className="console-num">{used}</span> of <span className="console-num">{limit}</span> used</span>
      <span className={`console-meter${percent >= 90 ? ' is-high' : ''}`} aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
    </dd>
  </div>;
}

export function StatusStrip({ status, loading, error, repairing, onRepair }: Props) {
  const subscriptionHealthy = status?.subscription.status === 'enabled'
    || status?.subscription.status === 'webhook_callback_verification_pending';
  const tokenHealthy = status?.token.status === 'ok';
  const canRepair = tokenHealthy && !subscriptionHealthy;
  const nextAllowed = status?.quota.nextAllowedAt ?? 0;

  return <section className="console-status-panel" aria-label="Connection status" aria-live="polite">
    <div className="console-status-panel-heading">
      <div className="console-status-title">
        <h2>Connection status</h2>
        {status && (tokenHealthy && subscriptionHealthy
          ? <Chip tone="ok" icon="check">{consoleCopy.status.allGood}</Chip>
          : <Chip tone="warn" icon="alert">{consoleCopy.status.attention}</Chip>)}
      </div>
      {canRepair && <button type="button" className="console-button console-button-quiet" onClick={onRepair} disabled={repairing || loading}>
        {repairing ? 'Repairing…' : 'Repair chat connection'}
      </button>}
    </div>
    {loading && !status ? <div role="status">
      <p className="console-muted">Loading connection status…</p>
      <div className="console-status-skeleton" aria-hidden="true"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>
    </div> : status ? <dl className="console-status-details">
      <div className="console-status-item"><dt>Twitch connection</dt><dd>{tokenHealthy
        ? <Chip tone="ok" icon="check">{consoleCopy.status.tokenOk}</Chip>
        : <Chip tone="warn" icon="alert">{statusText(status.token.status)}</Chip>}</dd></div>
      <div className="console-status-item"><dt>Last checked</dt><dd>{dateText(status.token.validatedAt)}</dd></div>
      <div className="console-status-item"><dt>Chat subscription</dt><dd>{subscriptionHealthy
        ? <Chip tone="ok" icon="check">{status.subscription.status === 'enabled' ? consoleCopy.status.subscriptionOk : consoleCopy.status.subscriptionPending}</Chip>
        : <Chip tone="warn" icon="alert">{consoleCopy.status.subscriptionBad}</Chip>}</dd></div>
      <div className="console-status-item"><dt>Chat log</dt><dd><span><span className="console-num">{status.chatLog.count}</span> messages</span></dd></div>
      <div className="console-status-item"><dt>Last chat message</dt><dd>{dateText(status.chatLog.lastMessageAt)}</dd></div>
      <Quota label={consoleCopy.status.quotaMinute} used={status.quota.minute.used} limit={status.quota.minute.limit} />
      <Quota label={consoleCopy.status.quotaHour} used={status.quota.hour.used} limit={status.quota.hour.limit} />
      <div className="console-status-item"><dt>Next grading time</dt><dd>{nextAllowed <= Date.now() ? <Chip tone="ok" icon="clock">Ready now</Chip> : dateText(nextAllowed)}</dd></div>
    </dl> : <p className="console-muted">Connection status is unavailable.</p>}
    {error && <p className="console-status-error" role="alert"><Icon name="alert" />{error}</p>}
  </section>;
}
