import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { z } from 'zod';
import { apiFetch, ApiError } from '../lib/api.js';
import { useRoom } from '../lib/useRoom.js';
import { copy } from '../copy.js';
import { PracticeChat, Scoreboard, type DrillActionEvent } from '../components/ModPractice.js';

const ChannelInfoZ = z.object({ broadcasterId: z.string(), displayName: z.string(), avatarUrl: z.string().nullable(), drillOpen: z.boolean() });
const JoinResultZ = z.object({ participantId: z.string(), participantToken: z.string(), ticket: z.string(), wsUrl: z.string() });
const SessionZ = z.object({ participantId: z.string(), participantToken: z.string(), displayName: z.string() });
type ModSession = z.infer<typeof SessionZ>;
type ChannelInfo = z.infer<typeof ChannelInfoZ>;

function sessionKey(room: string): string { return 'mfd_mod_' + room; }
function readSession(key: string): ModSession | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = SessionZ.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  return Math.floor(total / 60).toString().padStart(2, '0') + ':' + (total % 60).toString().padStart(2, '0');
}

export function Mod() {
  const params = useParams();
  const channelLogin = (params.channel ?? '').toLowerCase();
  const demoRoom = params.room ?? null;
  const isDemo = demoRoom !== null;
  const apiBase = isDemo ? '/api/demo/' + encodeURIComponent(demoRoom) : '/api';
  const roomIdentity = isDemo ? 'demo:' + demoRoom : 'channel:' + channelLogin;
  const storageKey = sessionKey(roomIdentity);
  const [session, setSession] = useState<ModSession | null>(null);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [channelError, setChannelError] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const room = useRoom({ role: 'mod', apiBase, participantToken: session?.participantToken, enabled: session !== null });
  const drill = room.snapshot?.drill ?? null;
  const isRunning = drill?.status === 'running';
  const elapsed = drill?.startedAt == null ? 0 : Math.max(0, now - drill.startedAt);
  const actionEvents = useMemo(() => room.messages.flatMap((message): DrillActionEvent[] => message.type === 'drill.action' ? [message.data] : []), [room.messages]);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const fromTwitch = SessionZ.safeParse({
      participantId: fragment.get('participantId'),
      participantToken: fragment.get('participantToken'),
      displayName: fragment.get('displayName')
    });
    if (fromTwitch.success) {
      try { sessionStorage.setItem(storageKey, JSON.stringify(fromTwitch.data)); } catch { /* keep the current tab session */ }
      setSession(fromTwitch.data);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      return;
    }
    setSession(readSession(storageKey));
    const signInError = new URLSearchParams(window.location.search).get('error');
    if (signInError === 'not_moderator') setJoinError(copy['mod.onlyChannelMods']);
    else if (signInError === 'no_open_drill') setJoinError('There is no open drill yet. Ask the streamer to start one.');
    else if (signInError === 'rate_limited') setJoinError('Too many join attempts. Try again in a minute.');
    else if (signInError === 'sign_in_failed') setJoinError('Twitch sign-in could not be verified. Try again.');
  }, [storageKey]);
  useEffect(() => {
    if (isDemo) { setChannel(null); setChannelError(''); return; }
    let cancelled = false;
    void apiFetch<unknown>('public/channel/' + encodeURIComponent(channelLogin), {}, { apiBase: '/api' })
      .then((value) => {
        const parsed = ChannelInfoZ.safeParse(value);
        if (!parsed.success) throw new Error('Channel details could not be read.');
        if (!cancelled) setChannel(parsed.data);
      })
      .catch((error: unknown) => { if (!cancelled) setChannelError(error instanceof Error ? error.message : 'Channel details could not be loaded.'); });
    return () => { cancelled = true; };
  }, [channelLogin, isDemo]);
  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, drill?.startedAt]);

  async function join(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setJoining(true);
    setJoinError('');
    const path = isDemo ? 'mod/join' : 'mod/' + encodeURIComponent(channelLogin) + '/join';
    try {
      const value = await apiFetch<unknown>(path, { method: 'POST', body: JSON.stringify({ code, displayName: displayName.trim() }) }, { apiBase });
      const result = JoinResultZ.safeParse(value);
      if (!result.success) throw new Error('Could not join this drill. Try again.');
      const next = SessionZ.parse({ participantId: result.data.participantId, participantToken: result.data.participantToken, displayName: displayName.trim() });
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      setSession(next);
    } catch (error) {
      setJoinError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Could not join this drill. Try again.');
    } finally { setJoining(false); }
  }
  function leaveAndRejoin(): void {
    sessionStorage.removeItem(storageKey);
    setSession(null);
    setJoinError('Your session ended. Enter the code to join again.');
  }

  const channelName = isDemo ? 'Practice room' : channel?.displayName ?? channelLogin;
  const avatarUrl = channel?.avatarUrl ?? null;
  const participantName = room.snapshot?.participants.find((person) => person.id === session?.participantId)?.name ?? session?.displayName ?? '';
  const ownScore = drill?.score.mods.find((mod) => mod.participantId === session?.participantId);
  const connectionLabel = room.connection === 'open' ? 'Connected' : room.connection === 'connecting' ? 'Connecting…' : 'Reconnecting…';

  if (!session) return <section className="mod-page" aria-labelledby="mod-title">
    <div className="mod-wrap">
      <div className="mod-brand-row"><span className="mod-eyebrow">ModScrim · moderator entry</span><span className="practice-badge">Practice only</span></div>
      <div className="mod-join-layout">
        <div className="mod-join-copy">
          {avatarUrl ? <img className="mod-channel-avatar" src={avatarUrl} alt="" /> : <span className="mod-channel-avatar mod-avatar-placeholder" aria-hidden="true">M</span>}
          <p className="mod-eyebrow">{isDemo ? 'Demo room' : 'Channel'}</p>
          <h1 id="mod-title">{channelName}</h1>
          <p className="mod-lead">Join the moderator team for a private practice drill.</p>
          <p className="mod-safety-note">{copy['banner.practice']}</p>
          {channelError && <p className="mod-error" role="alert">{channelError}</p>}
        </div>
        <form className="mod-join-card" onSubmit={(event) => void join(event)}>
          <h2>Join the drill</h2>
          {!isDemo && channel?.drillOpen && <>
            <a className="mod-primary-button mod-primary-link" href={`/auth/mod/login?channel=${encodeURIComponent(channelLogin)}`}>Sign in with Twitch</a>
            <p className="mod-auth-separator">or enter the drill code</p>
          </>}
          <label htmlFor="join-code">6-digit code</label>
          <input id="join-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
          <label htmlFor="display-name">Display name</label>
          <input id="display-name" name="displayName" autoComplete="nickname" minLength={1} maxLength={24} required value={displayName}
            onChange={(event) => setDisplayName(event.target.value)} />
          {joinError && <p className="mod-error" role="alert">{joinError}</p>}{!isDemo && channel?.drillOpen === false && <p className="mod-muted">There is no open drill yet. Ask the streamer to start one.</p>}
          <button className="mod-primary-button" type="submit" disabled={joining || code.length !== 6 || displayName.trim().length === 0 || (!isDemo && channel?.drillOpen !== true)}>{joining ? 'Joining…' : 'Join'}</button>
          <p className="mod-muted">Your name appears to the other moderators in this room.</p>
        </form>
      </div>
    </div>
  </section>;

  return <section className="mod-page" aria-labelledby="mod-title">
    <div className="mod-wrap">
      <header className="mod-topbar">
        <div className="mod-channel-heading">
          {avatarUrl ? <img className="mod-channel-avatar" src={avatarUrl} alt="" /> : <span className="mod-channel-avatar mod-avatar-placeholder" aria-hidden="true">M</span>}
          <div><p className="mod-eyebrow">Moderator console</p><h1 id="mod-title">{channelName}</h1></div>
        </div>
        <div className="mod-topbar-status"><span className={'mod-connection mod-connection-' + room.connection} aria-live="polite">{connectionLabel}</span>
          <button className="mod-quiet-button" type="button" onClick={leaveAndRejoin}>Rejoin with code</button></div>
      </header>
      <div className="mod-practice-banner" role="note">{copy['banner.practice']}</div>
      {isRunning && <div className="mod-live-strip"><span className="mod-live-dot" aria-hidden="true" /> Drill in progress <span className="mod-live-time">{formatElapsed(elapsed)}</span></div>}
      {!drill || drill.status === 'draft' || drill.status === 'voting' ? <section className="mod-waiting" aria-live="polite">
        <span className="mod-waiting-icon" aria-hidden="true">◎</span><h2>{copy['mod.waiting']}</h2>
        <p>The chat will appear here when the drill starts.</p>
        <ParticipantList participants={room.snapshot?.participants ?? []} />
      </section> : <div className="mod-practice-grid">
        <div className="mod-main-column">
          <PracticeChat lines={drill.lines} events={actionEvents} reveals={drill.reveal ?? []} participantId={session.participantId} participantName={participantName}
            onAction={(lineId, action) => room.act(lineId, action)} onSync={() => room.sync()} onHelp={() => setShowHelp((visible) => !visible)} actionsEnabled={room.connection === 'open' && isRunning} />
          <div className="mod-help-area"><button type="button" className="mod-help-button" aria-expanded={showHelp} onClick={() => setShowHelp((visible) => !visible)}>Keyboard help <kbd>?</kbd></button>
            {showHelp && <p>Use ↑ and ↓ to focus an open line. Press D to delete, T to timeout, or B to ban. Home and End move to the first or latest open line. Enter activates a focused button.</p>}</div>
          {drill.status === 'ended' && <section className="mod-reveal" aria-labelledby="mod-reveal-title"><p className="mod-eyebrow">Drill complete</p><h2 id="mod-reveal-title">What came through</h2><p>{drill.score.attacksShown} attacks shown · {drill.score.slipped} slipped through</p></section>}
        </div>
        <aside className="mod-side-column" aria-label="Team status">
          <Scoreboard score={drill.score} participantId={session.participantId} />
          <ParticipantList participants={room.snapshot?.participants ?? []} />
          {drill.status === 'ended' && <section className="mod-own-result"><h2>Your result</h2><p>{ownScore?.caught ?? 0} attacks caught</p><p>{ownScore?.falseBans ?? 0} false bans</p>
            <p>Average reaction: {ownScore?.avgReactionMs == null ? '—' : (ownScore.avgReactionMs / 1000).toFixed(1) + ' s'}</p></section>}
        </aside>
      </div>}
    </div>
  </section>;
}

function ParticipantList({ participants }: { participants: Array<{ id: string; name: string; isSim: boolean; online: boolean }> }) {
  return <section className="mod-participants" aria-labelledby="mod-participants-title">
    <h2 id="mod-participants-title">Moderators</h2>
    {participants.length === 0 ? <p className="mod-muted">Waiting for your team to join.</p> : <ul>
      {participants.map((person) => <li key={person.id}><span className={'mod-online-dot' + (person.online ? ' is-online' : '')} aria-hidden="true" />{person.name}{person.isSim ? ' (sim)' : ''}
        <span className="mod-muted">{person.online ? 'Here' : 'Away'}</span></li>)}
    </ul>}
  </section>;
}

