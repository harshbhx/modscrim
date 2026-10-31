import type { DrillScore, DrillSnapshot, ModAction, Reveal, ServerMsg } from '@mfd/core';
import { handleModKeyboard } from '../lib/keyboard.js';

export type SnapshotLine = NonNullable<DrillSnapshot['drill']>['lines'][number];
export type DrillActionEvent = Extract<ServerMsg, { type: 'drill.action' }>['data'];
const ACTIONS = [
  { action: 'delete', label: 'Delete', key: 'D' },
  { action: 'timeout', label: 'Timeout', key: 'T' },
  { action: 'ban', label: 'Ban', key: 'B' }
] as const;

export function ActionButtons({ line, onAction, actionsEnabled }: { line: SnapshotLine; onAction: (lineId: string, action: ModAction) => void; actionsEnabled: boolean }) {
  const disabled = line.state !== 'open' || !actionsEnabled;
  return <div className="mod-actions" aria-label="Moderation actions">
    {ACTIONS.map(({ action, label, key }) => <button key={action} type="button" className="mod-action-button" data-line-id={line.line.lineId} disabled={disabled}
      aria-label={label + ' line from ' + line.line.user} onClick={() => onAction(line.line.lineId, action)}>
      <span>{label}</span><kbd aria-hidden="true">{key}</kbd>
    </button>)}
  </div>;
}

function Feedback({ line, event, reveal, participantId, participantName }: {
  line: SnapshotLine; event?: DrillActionEvent; reveal?: Reveal; participantId: string; participantName: string; 
}) {
  if (line.state === 'slipped') return <p className="mod-feedback mod-feedback-slipped">Slipped through</p>;
  if (line.state !== 'acted') return null;
  const winnerId = event?.participantId;
  const winnerName = event?.name ?? line.actedByName;
  const isMine = winnerId ? winnerId === participantId : winnerName === participantName;
  if (isMine && (event?.falseBan || reveal?.kind === 'banter')) return <p className="mod-feedback mod-feedback-false">False ban: that was a regular</p>;
  if (isMine) {
    const action = event?.action ?? line.action ?? 'delete';
    const verb = action === 'ban' ? 'Banned' : action === 'timeout' ? 'Timed out' : 'Deleted';
    const time = event ? ' · ' + (event.reactionMs / 1000).toFixed(1) + ' s' : '';
    return <p className="mod-feedback mod-feedback-caught">{verb} by you{time}</p>;
  }
  return <p className="mod-feedback mod-feedback-taken">{winnerName ? winnerName + ' got it first' : 'Another mod got it first'}</p>;
}

export function ChatLine({ line, event, reveal, participantId, participantName, onAction, actionsEnabled }: {
  line: SnapshotLine; event?: DrillActionEvent; reveal?: Reveal; participantId: string; participantName: string; actionsEnabled: boolean;
  onAction: (lineId: string, action: ModAction) => void;
}) {
  return <li className={'mod-line mod-line-' + line.state}>
    <div className="mod-line-head"><span className="mod-line-user">{line.line.user}</span>
      {reveal && <span className="mod-line-kind">{reveal.kind === 'attack' ? 'Attack' : 'Regular'}</span>}</div>
    <p className="mod-line-text">{'segments' in line.line ? line.line.segments.map((segment, index) => {
      const content = segment.kind === 'slur' ? '▇'.repeat(Math.max(1, segment.text.length)) : segment.text;
      const className = segment.kind === 'link' ? 'mod-link-segment' : segment.kind === 'slur' ? 'mod-slur-segment' : undefined;
      return <span key={index} className={className}>{content}</span>;
    }) : '▇'.repeat(line.line.len)}</p>
    {reveal && reveal.tags.length > 0 && <p className="mod-line-tags">{reveal.tags.join(' · ')}</p>}
    <Feedback line={line} event={event} reveal={reveal} participantId={participantId} participantName={participantName} />
    <ActionButtons line={line} onAction={onAction} actionsEnabled={actionsEnabled} />
  </li>;
}

export function PracticeChat({ lines, events, reveals, participantId, participantName, onAction, onSync, onHelp, actionsEnabled }: {
  lines: SnapshotLine[]; events: readonly DrillActionEvent[]; reveals: readonly Reveal[]; participantId: string; participantName: string;
  onAction: (lineId: string, action: ModAction) => void; onSync: () => void; onHelp: () => void; actionsEnabled: boolean;
}) {
  const latestEvents = new Map<string, DrillActionEvent>();
  for (const event of events) latestEvents.set(event.lineId, event);
  const revealByLine = new Map<string, Reveal>(reveals.map((reveal) => [reveal.lineId, reveal] as const));
  const shownLines = lines.length > 60 ? lines.slice(-60) : lines;
  return <section className="mod-chat-panel" aria-labelledby="practice-chat-title" onKeyDown={(event) => handleModKeyboard(event.nativeEvent, event.currentTarget, {
    openLineIds: shownLines.filter((line) => line.state === 'open').map((line) => line.line.lineId), onAction, onHelp
  })}>
    <div className="mod-panel-heading"><div><p className="mod-eyebrow">Practice chat</p><h2 id="practice-chat-title">Every line stays in this room</h2></div>
      <button type="button" className="mod-sync-button" onClick={onSync}>Sync</button></div>
    {lines.length === 0 ? <p className="mod-empty-chat">The chat will appear here when the drill starts.</p> :
      <ol className="mod-chat-list" aria-live="polite" aria-relevant="additions text">
        {shownLines.map((line) => <ChatLine key={line.line.lineId} line={line} event={latestEvents.get(line.line.lineId)} reveal={revealByLine.get(line.line.lineId)}
          participantId={participantId} participantName={participantName} onAction={onAction} actionsEnabled={actionsEnabled} />)}
      </ol>}
    {lines.length > 60 && <p className="mod-muted">Showing the latest 60 lines.</p>}
  </section>;
}

function seconds(ms: number | null): string { return ms === null ? '—' : (ms / 1000).toFixed(1) + ' s'; }
export function Scoreboard({ score, participantId }: { score: DrillScore; participantId: string }) {
  const own = score.mods.find((mod) => mod.participantId === participantId);
  return <section className="mod-score-panel" aria-labelledby="mod-score-title">
    <p className="mod-eyebrow">Your score</p><h2 id="mod-score-title">{own?.caught ?? 0} caught</h2>
    <p className="mod-own-stats">{own?.falseBans ?? 0} false bans <span aria-hidden="true">·</span> {seconds(own?.avgReactionMs ?? null)} average reaction</p>
    <div className="mod-team-heading"><h3>Team scoreboard</h3><span>{score.slipped} slipped</span></div>
    {score.mods.length === 0 ? <p className="mod-muted">No mods have joined yet.</p> : <ol className="mod-score-list">
      {score.mods.map((mod, index) => <li key={mod.participantId} className={mod.participantId === participantId ? 'is-you' : undefined}>
        <span className="mod-score-rank">{index + 1}</span>
        <span className="mod-score-name">{mod.name}{mod.isSim ? ' (sim)' : ''}{mod.participantId === participantId ? ' · you' : ''}</span>
        <span className="mod-score-numbers">{mod.caught} caught · {mod.falseBans} false bans · {seconds(mod.avgReactionMs)}</span>
      </li>)}
    </ol>}
  </section>;
}






