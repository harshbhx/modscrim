import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { TacticZ, type DrillSnapshot, type ReportCard, type ServerMsg, type Tactic } from '@mfd/core';
import { t } from '../copy.js';
import { apiFetch } from '../lib/api.js';
import { ChannelInfoZ, ReportCardZ } from '../lib/contracts.js';
import { useRoom } from '../lib/useRoom.js';
import '../styles/overlay.css';

type ChannelInfo = z.infer<typeof ChannelInfoZ>;

function readChannelInfo(value: unknown): ChannelInfo | null {
  const parsed = ChannelInfoZ.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function isReportReady(message: ServerMsg | null): message is Extract<ServerMsg, { type: 'report.ready' }> {
  return message?.type === 'report.ready';
}

type VoteUpdate = Extract<ServerMsg, { type: 'vote.update' }>['data'];
const VoteUpdateZ = z.object({ counts: z.record(TacticZ, z.number().int().nonnegative()), endsAt: z.number() });

function safeReport(value: unknown): ReportCard | null {
  const parsed = ReportCardZ.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function formatReaction(value: number | null): string {
  return value === null ? '—' : `${(value / 1000).toFixed(1)} s`;
}

function lineWidth(length: number): string {
  const bounded = Math.max(4, Math.min(1920, Math.ceil(length / 4) * 4));
  return `${Math.max(8, Math.min(100, (bounded / 1920) * 100))}%`;
}

function Scoreboard({ snapshot }: { snapshot: DrillSnapshot | null }) {
  const score = snapshot?.drill?.score;
  if (!score) return null;
  return <section className="overlay-scoreboard" aria-label="Practice scoreboard">
    <p className="overlay-label">Team scoreboard</p>
    <ol>
      {score.mods.map((mod) => <li key={mod.participantId}>
        <span>{mod.name}{mod.isSim ? ' (sim)' : ''}</span>
        <span>{mod.caught} caught · {mod.falseBans} false bans · {formatReaction(mod.avgReactionMs)}</span>
      </li>)}
    </ol>
    <p className="overlay-slipped">{score.slipped} slipped</p>
  </section>;
}

function VoteBars({ counts }: { counts: Record<Tactic, number> }) {
  const labels: Record<Tactic, string> = { linkscam: 'Link scams', spam: 'Spam bursts', botwave: 'Bot waves', hateraid: 'Hate raid' };
  const max = Math.max(1, ...Object.values(counts));
  return <section className="overlay-votes" aria-label="Chat vote results">
    <p className="overlay-label">Chat picks the next tactic</p>
    {Object.entries(counts).map(([tactic, count]) => <div className="overlay-vote-row" key={tactic}>
      <span>{labels[tactic as Tactic]}</span>
      <span className="overlay-vote-track"><span style={{ width: `${(count / max) * 100}%` }} /></span>
      <strong>{count}</strong>
    </div>)}
    <p className="overlay-vote-hint">Type !attack linkscam, spam, botwave or hateraid</p>
  </section>;
}

function ChatBars({ snapshot }: { snapshot: DrillSnapshot | null }) {
  const lines = snapshot?.drill?.lines ?? [];
  return <section className="overlay-chat" aria-label="Practice chat activity">
    {lines.slice(-14).map((item) => <article className={`overlay-chat-line overlay-chat-${item.state}`} key={item.line.lineId}>
      <span className="overlay-user">{item.line.user}</span>
      <span className="overlay-redacted" aria-label="Hidden practice message">
        <span className="overlay-redacted-bar" style={{ width: lineWidth('len' in item.line ? item.line.len : 4) }} />
      </span>
      <span className="overlay-outcome" aria-hidden="true">{item.state === 'acted' ? '✓' : item.state === 'slipped' ? '!' : '·'}</span>
    </article>)}
  </section>;
}

function AfterAction({ card, onDismiss }: { card: ReportCard; onDismiss: () => void }) {
  const grade = card.grade ? `${card.grade.passed} of ${card.grade.total} passed · ${card.grade.engine === 'mixed' ? 'Twitch and local estimate' : card.grade.engine === 'twitch' ? 'graded by Twitch' : 'local estimate'}` : 'No filter grade';
  return <aside className="overlay-report" role="status" aria-live="polite">
    <button className="overlay-report-dismiss" type="button" onClick={onDismiss} aria-label="Dismiss after-action report">×</button>
    <p className="overlay-label">After-action report</p>
    <h2>Drill complete</h2>
    <p>{grade}</p>
    <p>{card.termsPushed} terms pushed to Twitch</p>
    {card.fresh && <p>Fresh wave: {card.fresh.before} blocked before, {card.fresh.after} after, out of {card.fresh.total}</p>}
    <p>{card.slipped} attacks slipped through</p>
  </aside>;
}

function OverlayStage({ displayName, snapshot, report, vote, onDismiss }: {
  displayName: string;
  snapshot: DrillSnapshot | null;
  report: ReportCard | null;
  vote: VoteUpdate | null;
  onDismiss: () => void;
}) {
  return <main className="overlay-viewport" aria-label="OBS practice overlay">
    <div className="overlay-stage">
      <div className="overlay-inner">
        <header className="overlay-alarm"><span>{t('overlay.alarm')}</span><span className="overlay-channel">{displayName}</span></header>
        {vote && snapshot?.drill?.status === 'voting' && <VoteBars counts={vote.counts} />}
        <div className="overlay-activity">
          {snapshot?.drill?.status === 'running' && <p className="overlay-live"><span /> LIVE PRACTICE</p>}
          {!snapshot?.drill && <p className="overlay-connection">Waiting for the practice room</p>}
          <ChatBars snapshot={snapshot} />
        </div>
        <Scoreboard snapshot={snapshot} />
        {report && <AfterAction card={report} onDismiss={onDismiss} />}
      </div>
    </div>
  </main>;
}

export function Overlay() {
  const { channel = '' } = useParams();
  const [search] = useSearchParams();
  const key = search.get('key') ?? '';
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
  const [report, setReport] = useState<ReportCard | null>(null);
  const [reportVersion, setReportVersion] = useState(0);
  const [vote, setVote] = useState<VoteUpdate | null>(null);
  const { connection, role, snapshot, lastMessage } = useRoom({
    role: 'overlay', channelId: channelInfo?.broadcasterId, overlayKey: key,
    enabled: Boolean(key && channelInfo?.broadcasterId)
  });

  useEffect(() => {
    let active = true;
    setChannelInfo(null);
    setReport(null);
    if (!channel || !key) return () => { active = false; };
    void apiFetch<unknown>(`public/channel/${encodeURIComponent(channel)}`, {}, { apiBase: '/api' })
      .then((value) => { if (active) setChannelInfo(readChannelInfo(value)); })
      .catch(() => { if (active) setChannelInfo(null); });
    return () => { active = false; };
  }, [channel, key]);

  useEffect(() => {
    if (!isReportReady(lastMessage)) return;
    const card = safeReport(lastMessage.data.card);
    if (!card) return;
    setReport(card);
    setReportVersion((version) => version + 1);
  }, [lastMessage]);

  useEffect(() => {
    if (lastMessage?.type === 'vote.update') {
      const parsed = VoteUpdateZ.safeParse(lastMessage.data);
      setVote(parsed.success ? parsed.data : null);
    } else if (lastMessage?.type === 'drill.started' || lastMessage?.type === 'drill.ended') {
      setVote(null);
    }
  }, [lastMessage]);

  useEffect(() => {
    if (!report) return;
    const timeout = window.setTimeout(() => setReport(null), 20_000);
    return () => window.clearTimeout(timeout);
  }, [report, reportVersion]);

  useEffect(() => {
    const resize = (): void => {
      const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      document.documentElement.style.setProperty('--overlay-scale', String(scale));
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const online = connection === 'open';
  const displayName = channelInfo?.displayName ?? '';
  if (!key || !channelInfo?.broadcasterId || !online || role !== 'overlay') return null;
  return <OverlayStage displayName={displayName} snapshot={snapshot} report={report} vote={vote} onDismiss={() => setReport(null)} />;
}
