import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { TacticZ, type DrillSnapshot, type ReportCard, type ServerMsg, type Tactic } from '@mfd/core';
import { pages, t } from '../copy.js';
import { apiFetch } from '../lib/api.js';
import { ChannelInfoZ, ReportCardZ } from '../lib/contracts.js';
import { percentOf } from '../lib/percent.js';
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

/** Bar width as a share of the chat panel: length 4..200 characters maps to 12..100 %. */
function lineWidth(length: number): string {
  const bounded = Math.max(4, Math.min(140, length));
  return `${Math.round(12 + ((bounded - 4) / 136) * 88)}%`;
}

const MAX_MOD_ROWS = 4;

/** Chat lines that fit above the scoreboard inside the dock (856 px): whole rows only, never a cut-off one. */
function chatLineBudget(modCount: number): number {
  const rows = Math.min(modCount, MAX_MOD_ROWS);
  const more = modCount > MAX_MOD_ROWS ? 24 : 0;
  return Math.max(3, Math.min(8, Math.floor((567 - more - 48 * rows) / 52.5)));
}
const o = pages.overlay;

function Stat({ label, value, tone }: { label: string; value: number; tone: 'plain' | 'caught' | 'foul' | 'slipped' }) {
  return <div className={`overlay-stat overlay-stat-${tone}`} data-long={String(value).length > 3 ? 'true' : 'false'}>
    <span className="overlay-stat-label">{label}</span>
    <strong className="overlay-stat-plate">{value}</strong>
  </div>;
}

function Scoreboard({ snapshot }: { snapshot: DrillSnapshot | null }) {
  const score = snapshot?.drill?.score;
  if (!score) return null;
  const caught = score.mods.reduce((sum, mod) => sum + mod.caught, 0);
  const falseBans = score.mods.reduce((sum, mod) => sum + mod.falseBans, 0);
  const rows = score.mods.slice(0, MAX_MOD_ROWS);
  const hidden = score.mods.length - rows.length;
  return <section className="overlay-panel overlay-scoreboard" aria-label="Practice scoreboard">
    <header className="overlay-panel-head">
      <h2>{o.scoreboard}</h2>
      <span className="overlay-chip">{o.chip}</span>
    </header>
    <div className="overlay-stats">
      <Stat label={o.caught} value={caught} tone="caught" />
      <Stat label={o.falseBans} value={falseBans} tone="foul" />
      <Stat label={o.slipped} value={score.slipped} tone="slipped" />
    </div>
    {rows.length > 0 && <div className="overlay-mods">
      <p className="overlay-mods-head" aria-hidden="true">
        <span />
        <span>{o.caught}</span><span>{o.falseBans}</span><span>{o.reaction}</span>
      </p>
      <ol>
        {rows.map((mod) => <li key={mod.participantId}>
          <span className="overlay-mod-name">{mod.name}{mod.isSim && <em>{o.sim}</em>}</span>
          <span className="overlay-mod-num overlay-mod-caught">{mod.caught}</span>
          <span className="overlay-mod-num">{mod.falseBans}</span>
          <span className="overlay-mod-num overlay-mod-time">{formatReaction(mod.avgReactionMs)}</span>
        </li>)}
      </ol>
      {hidden > 0 && <p className="overlay-more">{o.more.replace('{n}', String(hidden))}</p>}
    </div>}
  </section>;
}

function VoteBars({ counts }: { counts: Record<Tactic, number> }) {
  const labels: Record<Tactic, string> = { linkscam: 'Link scams', spam: 'Spam bursts', botwave: 'Bot waves', hateraid: 'Hate raid' };
  const max = Math.max(1, ...Object.values(counts));
  return <section className="overlay-panel overlay-votes" aria-label="Chat vote results">
    <header className="overlay-panel-head"><h2>{o.votes}</h2></header>
    {Object.entries(counts).map(([tactic, count]) => <div className="overlay-vote-row" key={tactic}>
      <span>{labels[tactic as Tactic]}</span>
      <span className="overlay-vote-track"><span style={{ width: `${(count / max) * 100}%` }} /></span>
      <strong>{count}</strong>
    </div>)}
    <p className="overlay-vote-hint">{o.voteHint}</p>
  </section>;
}

function ChatStrip({ snapshot }: { snapshot: DrillSnapshot | null }) {
  const drill = snapshot?.drill;
  const maxLines = chatLineBudget(drill?.score?.mods.length ?? 0);
  const lines = drill?.lines ?? [];
  const running = drill?.status === 'running';
  if (!drill) return <p className="overlay-connection">{o.waiting}</p>;
  if (lines.length === 0 && !running) return null;
  return <section className="overlay-panel overlay-chat" aria-label="Practice chat activity">
    <header className="overlay-panel-head">
      <h2>{o.chat}</h2>
      {running && <span className="overlay-live"><i aria-hidden="true" />{o.live}</span>}
      <span className="overlay-count">{o.linesShown.replace('{n}', String(lines.length))}</span>
    </header>
    {lines.length === 0 && <p className="overlay-empty">{o.firstLine}</p>}
    <div className="overlay-chat-list">
      {lines.slice(-maxLines).map((item) => <article className={`overlay-chat-line overlay-chat-${item.state}`} key={item.line.lineId}>
        <span className="overlay-user">{item.line.user}</span>
        <span className="overlay-redacted" aria-label="Hidden practice message">
          <span className="overlay-redacted-bar" style={{ width: lineWidth('len' in item.line ? item.line.len : 4) }} />
        </span>
        <span className="overlay-outcome" aria-hidden="true">{item.state === 'acted' ? '✓' : item.state === 'slipped' ? '!' : '·'}</span>
      </article>)}
    </div>
  </section>;
}

function AfterAction({ card, onDismiss }: { card: ReportCard; onDismiss: () => void }) {
  const engine = card.grade ? (card.grade.engine === 'mixed' ? o.engineMixed : card.grade.engine === 'twitch' ? t('grade.engine.twitch') : t('grade.engine.local')) : o.noGrade;
  return <aside className="overlay-report" role="status" aria-live="polite">
    <button className="overlay-report-dismiss" type="button" onClick={onDismiss} aria-label={o.dismiss}>×</button>
    <header className="overlay-report-head">
      <img src="/img/modscrim-mark-small-color.svg" alt="" width="40" height="40" />
      <div>
        <p className="overlay-label">{o.reportLabel}</p>
        <h2>{o.reportTitle}</h2>
      </div>
    </header>
    {card.grade && <div className="overlay-report-hero">
      <p className="overlay-hero-score" aria-hidden="true"><b>{card.grade.passed}</b><i>/ {card.grade.total}</i></p>
      <p className="overlay-hero-text">
        {t('grade.headline', { n: card.grade.passed, total: card.grade.total })}
        <span className="overlay-chip overlay-chip-quiet">{engine}</span>
      </p>
    </div>}
    <div className="overlay-report-stats">
      <p className="overlay-report-stat"><strong>{card.termsPushed}</strong>{o.termsPushed}</p>
      <p className="overlay-report-stat overlay-report-stat-slipped"><strong>{card.slipped}</strong>{o.slippedThrough}</p>
    </div>
    {card.fresh && <div className="overlay-fresh">
      <p className="overlay-fresh-title">{o.freshTitle}</p>
      <div className="overlay-fresh-row">
        <span>{o.before}</span>
        <span className="overlay-fresh-track" aria-hidden="true"><span className="overlay-fresh-before" style={{ width: `${percentOf(card.fresh.before, card.fresh.total)}%` }} /></span>
        <strong>{card.fresh.before} / {card.fresh.total}</strong>
      </div>
      <div className="overlay-fresh-row">
        <span>{o.after}</span>
        <span className="overlay-fresh-track" aria-hidden="true"><span className="overlay-fresh-after" style={{ width: `${percentOf(card.fresh.after, card.fresh.total)}%` }} /></span>
        <strong>{card.fresh.after} / {card.fresh.total}</strong>
      </div>
    </div>}
  </aside>;
}

function OverlayStage({ displayName, snapshot, report, vote, onDismiss }: {
  displayName: string;
  snapshot: DrillSnapshot | null;
  report: ReportCard | null;
  vote: VoteUpdate | null;
  onDismiss: () => void;
}) {
  const [headline, ...rest] = t('overlay.alarm').split(' · ');
  const voting = Boolean(vote && snapshot?.drill?.status === 'voting');
  return <main className="overlay-viewport" aria-label="OBS practice overlay">
    <div className="overlay-stage">
      <header className="overlay-alarm">
        <img className="overlay-alarm-mark" src="/img/modscrim-mark-small-green.svg" alt="" width="48" height="48" />
        <p className="overlay-alarm-text"><strong>{headline}</strong>{rest.length > 0 && <span>{rest.join(' · ')}</span>}</p>
        <span className="overlay-channel">{displayName}</span>
        <img className="overlay-alarm-word" src="/img/modscrim-wordmark-green.svg" alt="ModScrim" width="150" height="38" />
      </header>
      <div className="overlay-dock">
        {voting && vote ? <VoteBars counts={vote.counts} /> : <ChatStrip snapshot={snapshot} />}
        <Scoreboard snapshot={snapshot} />
      </div>
      {report && <AfterAction card={report} onDismiss={onDismiss} />}
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
