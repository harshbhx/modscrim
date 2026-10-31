import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { DEFAULT_CONFIG, DrillConfigInputZ, TacticZ } from '@mfd/core';
import type { DrillConfig, DrillSnapshot, Reveal, Segment, Tactic } from '@mfd/core';
import { ConsoleStepper, type ConsoleStep } from '../components/ConsoleStepper';
import { GradeTable, GradesViewZ, ProofBars, ProofResultZ, PushResultsZ, ReportCard, ReportViewZ, RuleList, RuleResultZ } from '../components/ConsoleReview';
import type { GradeLine, GradesView, ProofResult, PushResult, ReportView, RuleResult } from '../components/ConsoleReview';
import { CopyField } from '../components/CopyField';
import { DemoJoinQr } from '../components/DemoJoinQr';
import { useRoom } from '../lib/useRoom';
import { apiFetch, ApiError } from '../lib/api';
import { t } from '../copy';
import '../styles/console.css';

const ChannelZ = z.object({
  id: z.string(),
  login: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  broadcasterType: z.enum(['', 'affiliate', 'partner'])
});
const MeZ = z.object({
  user: ChannelZ,
  channel: ChannelZ,
  tokenStatus: z.string(),
  subscriptionStatus: z.string(),
  overlayUrl: z.string().url(),
  modUrl: z.string().url()
});
const FiltersZ = z.object({
  terms: z.array(z.object({ id: z.string(), text: z.string() })),
  automod: z.record(z.string(), z.number().int().min(0).max(4).nullable()).nullable(),
  fetchedAt: z.number().nullable()
});
const ChatLogZ = z.object({
  count: z.number().int().nonnegative(),
  oldest: z.number().nullable(),
  newest: z.number().nullable(),
  logging: z.boolean(),
  samples: z.array(z.object({ login: z.string(), text: z.string() })).max(6)
});
const DrillViewZ = z.object({
  drillId: z.string().min(1),
  status: z.enum(['draft', 'voting', 'running', 'ended', 'cancelled']),
  config: z.object({
    tactics: z.array(TacticZ),
    primaryTactic: TacticZ,
    attackCount: z.number().int(),
    banterCount: z.number().int(),
    intervalMs: z.number().int(),
    slipWindowMs: z.number().int(),
    seed: z.number().int(),
    simMod: z.boolean()
  }),
  joinCode: z.string().regex(/^\d{6}$/),
  participants: z.array(z.object({ id: z.string(), name: z.string(), isSim: z.boolean() })),
  score: z.object({
    mods: z.array(z.object({ participantId: z.string(), name: z.string(), isSim: z.boolean(), caught: z.number(), falseBans: z.number(), avgReactionMs: z.number().nullable() })),
    slipped: z.number(),
    attacksShown: z.number()
  }),
  lines: z.array(z.object({ id: z.string(), text: z.string(), tactic: TacticZ.optional(), trick: z.string().optional(), tags: z.array(z.string()) }))
});
const DraftResponseZ = z.object({ drillId: z.string().min(1), joinCode: z.string().regex(/^\d{6}$/), modUrl: z.string().url() });
const RotateResponseZ = z.object({ overlayUrl: z.string().url() });
const LoggingResponseZ = z.object({ logging: z.boolean() });
const DeleteResponseZ = z.object({ deleted: z.number().int().nonnegative() });
const StartResponseZ = z.object({ startedAt: z.number() });
const StopResponseZ = z.object({ endedAt: z.number() });
const GradeQueuedZ = z.object({ queued: z.number().int().nonnegative() });
const GradeLocalZ = z.object({ passed: z.number().int().nonnegative(), total: z.number().int().nonnegative(), engine: z.literal('local') });
const AutoModLabels: Record<string, string> = {
  overall_level: 'Overall',
  disability: 'Disability',
  aggression: 'Aggression',
  sexuality_sex_or_gender: 'Sexuality, sex or gender',
  misogyny: 'Misogyny',
  bullying: 'Bullying',
  swearing: 'Swearing',
  race_ethnicity_or_religion: 'Race, ethnicity or religion',
  sex_based_terms: 'Sex-based terms'
};
const TACTICS: Array<{ id: Tactic; label: string }> = [
  { id: 'linkscam', label: 'Link scams' },
  { id: 'spam', label: 'Spam bursts' },
  { id: 'botwave', label: 'Bot waves' },
  { id: 'hateraid', label: 'Hate raid' }
];
const DEFAULT_DRILL_INPUT = {
  tactics: [...DEFAULT_CONFIG.tactics],
  primaryTactic: DEFAULT_CONFIG.primaryTactic,
  attackCount: DEFAULT_CONFIG.attackCount,
  banterCount: DEFAULT_CONFIG.banterCount,
  intervalMs: DEFAULT_CONFIG.intervalMs,
  slipWindowMs: DEFAULT_CONFIG.slipWindowMs,
  simMod: DEFAULT_CONFIG.simMod
};

type Me = z.infer<typeof MeZ>;
type Filters = z.infer<typeof FiltersZ>;
type ChatLog = z.infer<typeof ChatLogZ>;
type Draft = { drillId: string; joinCode: string; modUrl: string };
type ConsoleLine = NonNullable<DrillSnapshot['drill']>['lines'][number];

function parse<T>(schema: z.ZodType<T>, input: unknown): T | null {
  const result = schema.safeParse(input);
  return result.success ? result.data : null;
}

function consoleFetch<T>(path: string, init: RequestInit = {}, apiBase = '/api'): Promise<T> {
  return apiFetch<T>(path, init, { apiBase });
}

function formattedDate(timestamp: number | null): string {
  if (timestamp === null) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}

function humanStatus(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function segmentContent(segments: Segment[]) {
  return segments.map((segment, index) => {
    const text = segment.kind === 'slur' ? '▇'.repeat(Math.max(1, segment.text.length)) : segment.text;
    const className = segment.kind === 'link' ? 'console-link-segment' : segment.kind === 'slur' ? 'console-slur-segment' : undefined;
    return <span key={`${segment.kind}-${index}`} className={className}>{text}</span>;
  });
}

function ReadOnlyLine({ line, reveal }: { line: ConsoleLine; reveal?: Reveal }) {
  const publicLine = line.line;
  const text = 'segments' in publicLine ? segmentContent(publicLine.segments) : '▇'.repeat(publicLine.len);
  return <li className={`console-chat-line console-chat-line-${line.state}`}>
    <div className="console-chat-line-top"><strong>{publicLine.user}</strong>
      {reveal && <span className="console-line-status">{reveal.kind === 'attack' ? 'Attack' : 'Regular'}</span>}
      {line.state === 'slipped' && <span className="console-line-status is-slipped">Slipped through</span>}
      {line.state === 'acted' && <span className="console-line-status">{line.actedByName ? `${line.action === 'ban' ? 'Banned' : line.action === 'timeout' ? 'Timed out' : 'Deleted'} by ${line.actedByName}` : 'Handled'}</span>}
    </div>
    <p>{text}</p>
    {line.state === 'acted' && reveal?.kind === 'banter' && <p className="console-false-ban">False ban: that was a regular</p>}
    {reveal && reveal.tags.length > 0 && <p className="console-line-tags">{reveal.tags.join(' · ')}</p>}
  </li>;
}

export function Console() {
  const { room: demoRoom } = useParams();
  const isDemo = Boolean(demoRoom);
  const apiBase = demoRoom ? `/api/demo/${encodeURIComponent(demoRoom)}` : '/api';
  const demoModUrl = demoRoom ? `${window.location.origin}/demo/${encodeURIComponent(demoRoom)}/mod` : null;
  const [me, setMe] = useState<Me | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [chatLog, setChatLog] = useState<ChatLog | null>(null);
  const [chatLogLoaded, setChatLogLoaded] = useState(false);
  const [activeStep, setActiveStep] = useState<ConsoleStep>(1);
  const [unlockedThrough, setUnlockedThrough] = useState<ConsoleStep>(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drillView, setDrillView] = useState<z.infer<typeof DrillViewZ> | null>(null);
  const [grades, setGrades] = useState<GradesView | null>(null);
  const [rules, setRules] = useState<RuleResult | null>(null);
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const [proof, setProof] = useState<ProofResult | null>(null);
  const [pushResults, setPushResults] = useState<PushResult[]>([]);
  const [report, setReport] = useState<ReportView | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [grading, setGrading] = useState(false);
  const draftRef = useRef<Draft | null>(null);
  const draftRequestRef = useRef<Promise<Draft> | null>(null);
  const loadedDrillRef = useRef<string | null>(null);
  const gradeRequestedRef = useRef<string | null>(null);
  const rulesRequestedRef = useRef<string | null>(null);
  const proofRequestRef = useRef(0);
  const [config, setConfig] = useState<DrillConfig>(DEFAULT_CONFIG);
  const [savedConfig, setSavedConfig] = useState<DrillConfig>(DEFAULT_CONFIG);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());
  const room = useRoom({ role: 'console', apiBase, enabled: me !== null });

  const refreshChatLog = useCallback(async (): Promise<void> => {
    if (isDemo) {
      setChatLog({ count: 71, oldest: null, newest: null, logging: false, samples: [] });
      setChatLogLoaded(true);
      return;
    }
    const raw: unknown = await consoleFetch('chatlog/stats', {}, apiBase);
    const parsed = parse(ChatLogZ, raw);
    if (!parsed) throw new Error('Chat log data is unavailable.');
    setChatLog(parsed);
    setChatLogLoaded(true);
  }, [apiBase, isDemo]);

  useEffect(() => {
    let current = true;
    if (demoRoom) {
      const fakeChannel = { id: `demo:${demoRoom}`, login: 'pixelpanda_tv', displayName: 'Pixel Panda', avatarUrl: null, broadcasterType: '' as const };
      setMe({ user: fakeChannel, channel: fakeChannel, tokenStatus: 'demo', subscriptionStatus: 'demo', overlayUrl: '', modUrl: `${window.location.origin}/demo/${encodeURIComponent(demoRoom)}/mod` });
      setOverlayUrl(null);
      setChatLog({ count: 71, oldest: null, newest: null, logging: false, samples: [] });
      setChatLogLoaded(true);
      void consoleFetch<unknown>('filters', {}, apiBase).then((data) => {
        const value = parse(FiltersZ, data);
        if (current) {
          if (value) setFilters(value);
          else setError('Demo filters are unavailable. Try starting a new demo.');
          setFiltersLoaded(true);
        }
      }).catch(() => {
        if (current) {
          setFiltersLoaded(true);
          setError('Demo filters are unavailable. Try starting a new demo.');
        }
      });
      setLoading(false);
      return () => { current = false; };
    }
    void consoleFetch<unknown>('me', {}, apiBase).then((raw) => {
      const parsed = parse(MeZ, raw);
      if (!parsed) throw new Error('Channel details are unavailable.');
      if (!current) return;
      setMe(parsed);
      setOverlayUrl(parsed.overlayUrl);
      setLoading(false);
      void consoleFetch<unknown>('filters', {}, apiBase).then((data) => {
        const value = parse(FiltersZ, data);
        if (current) {
          if (value) setFilters(value);
          else setError('Filters are unavailable. Refresh from Twitch to try again.');
          setFiltersLoaded(true);
        }
      }).catch(() => {
        if (current) {
          setFiltersLoaded(true);
          setError('Filters could not be loaded. Refresh from Twitch to try again.');
        }
      });
      void consoleFetch<unknown>('chatlog/stats', {}, apiBase).then((data) => {
        const value = parse(ChatLogZ, data);
        if (current && value) {
          setChatLog(value);
        } else if (current) {
          setError('Chat log details could not be loaded. Try again in a moment.');
        }
        if (current) setChatLogLoaded(true);
      }).catch(() => {
        if (current) {
          setChatLogLoaded(true);
          setError('Chat log details could not be loaded. Try again in a moment.');
        }
      });
    }).catch((cause: unknown) => {
      if (!current) return;
      if (cause instanceof ApiError && cause.status === 401) setError('Sign in with Twitch to open your channel console.');
      else setError('Your channel console could not be loaded. Try again in a moment.');
      setLoading(false);
    });
    return () => { current = false; };
  }, [apiBase, demoRoom]);

  useEffect(() => {
    if (!me || isDemo) return;
    const timer = window.setInterval(() => {
      void refreshChatLog().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [me, refreshChatLog, isDemo]);

  useEffect(() => {
    const message = room.lastMessage;
    if (message?.type === 'chat.stats') {
      setChatLog((previous) => previous ? { ...previous, count: message.data.count, newest: message.data.lastAt } : previous);
    }
  }, [room.lastMessage]);

  useEffect(() => {
    const current = room.snapshot?.drill;
    if (!me || !current || loadedDrillRef.current === current.drillId) return;
    loadedDrillRef.current = current.drillId;
    void consoleFetch<unknown>(`drills/${encodeURIComponent(current.drillId)}`, {}, apiBase).then((raw) => {
      const view = parse(DrillViewZ, raw);
      if (!view) throw new Error('Drill details are unavailable.');
      const nextDraft = { drillId: view.drillId, joinCode: view.joinCode, modUrl: me.modUrl };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setConfig(view.config);
      setSavedConfig(view.config);
      setDrillView(view);
      setUnlockedThrough(view.status === 'ended' ? 4 : view.status === 'running' ? 3 : 2);
      if (view.status === 'running' || view.status === 'ended') setActiveStep(3);
    }).catch(() => {
      loadedDrillRef.current = null;
      setError('The current drill could not be loaded.');
    });
  }, [me, room.snapshot?.drill?.drillId, apiBase]);

  useEffect(() => {
    const status = room.snapshot?.drill?.status;
    if (status === 'running') setUnlockedThrough((previous) => previous < 3 ? 3 : previous);
    if (status === 'ended') setUnlockedThrough((previous) => previous < 4 ? 4 : previous);
  }, [room.snapshot?.drill?.status]);

  useEffect(() => {
    if (room.snapshot?.drill?.status !== 'running') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [room.snapshot?.drill?.status]);

  useEffect(() => {
    const message = room.lastMessage;
    const drillId = room.snapshot?.drill?.drillId;
    if (!message || !drillId) return;
    if (message.type === 'grade.progress') {
      setGrading(message.data.done < message.data.total);
      void loadGrades(drillId).catch(() => undefined);
    } else if (message.type === 'grade.done') {
      setGrading(false);
      void loadGrades(drillId).catch(() => undefined);
    } else if (message.type === 'push.result') {
      setPushResults((previous) => [...previous.filter((item) => item.term !== message.data.term), message.data]);
    }
  }, [room.lastMessage, room.snapshot?.drill?.drillId]);

  useEffect(() => {
    const drillId = room.snapshot?.drill?.drillId;
    if (!grading || !drillId) return;
    const timer = window.setInterval(() => { void loadGrades(drillId).catch(() => undefined); }, 2500);
    return () => window.clearInterval(timer);
  }, [grading, room.snapshot?.drill?.drillId]);

  useEffect(() => {
    const drillId = room.snapshot?.drill?.drillId;
    if (!drillId || activeStep !== 6) return;
    void loadReport(drillId).catch(() => undefined);
  }, [activeStep, room.snapshot?.drill?.drillId]);

  useEffect(() => {
    const drillId = room.snapshot?.drill?.drillId;
    if (!drillId || !rules || activeStep < 5) return;
    void makeProof(drillId, selectedTerms);
  }, [selectedTerms, rules, room.snapshot?.drill?.drillId, activeStep]);

  async function ensureDraft(): Promise<Draft> {
    if (draftRef.current) return draftRef.current;
    if (draftRequestRef.current) return draftRequestRef.current;
    if (!me) throw new Error('Sign in with Twitch to configure a drill.');
    setBusy(true);
    setError(null);
    const request = (async () => {
      const raw: unknown = await consoleFetch('drills', { method: 'POST', body: JSON.stringify(DEFAULT_DRILL_INPUT) }, apiBase);
      const created = parse(DraftResponseZ, raw);
      if (!created) throw new Error('The drill draft could not be created.');
      const detailRaw: unknown = await consoleFetch(`drills/${encodeURIComponent(created.drillId)}`, {}, apiBase);
      const detail = parse(DrillViewZ, detailRaw);
      if (!detail) throw new Error('The drill settings could not be loaded.');
      const nextDraft = { drillId: created.drillId, joinCode: created.joinCode, modUrl: created.modUrl };
      draftRef.current = nextDraft;
      loadedDrillRef.current = created.drillId;
      setDraft(nextDraft);
      setConfig(detail.config);
      setSavedConfig(detail.config);
      setDrillView(detail);
      return nextDraft;
    })();
    draftRequestRef.current = request;
    try {
      return await request;
    } finally {
      draftRequestRef.current = null;
      setBusy(false);
    }
  }

  async function openConfigure(): Promise<void> {
    setUnlockedThrough((previous) => previous < 2 ? 2 : previous);
    setActiveStep(2);
    if (room.snapshot?.drill?.status === 'ended' || room.snapshot?.drill?.status === 'cancelled') {
      draftRef.current = null;
      loadedDrillRef.current = null;
      gradeRequestedRef.current = null;
      rulesRequestedRef.current = null;
      setDrillView(null);
      setGrades(null);
      setRules(null);
      setSelectedTerms([]);
      setProof(null);
      setPushResults([]);
      setReport(null);
      setReportError(null);
      setDraft(null);
      setConfig(DEFAULT_CONFIG);
      setSavedConfig(DEFAULT_CONFIG);
    }
    try {
      await ensureDraft();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The drill draft could not be created.');
    }
  }

  async function selectStep(step: ConsoleStep): Promise<void> {
    if (step === 2) {
      await openConfigure();
      return;
    }
    if (step === 4) { await showGrades(); return; }
    if (step === 5) { await showRules(); return; }
    if (step === 6 && proof) { setActiveStep(6); return; }
    if (step <= unlockedThrough) setActiveStep(step);
  }

  async function refreshFilters(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const raw: unknown = await consoleFetch('filters/refresh', { method: 'POST' }, apiBase);
      const parsed = parse(FiltersZ, raw);
      if (!parsed) throw new Error('Filters could not be read from Twitch.');
      setFilters(parsed);
      setFiltersLoaded(true);
    } catch {
      setError('Filters could not be refreshed from Twitch. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleLogging(): Promise<void> {
    if (!chatLog) return;
    setBusy(true);
    setError(null);
    try {
      const raw: unknown = await consoleFetch('chatlog/logging', {
        method: 'POST',
        body: JSON.stringify({ on: !chatLog.logging })
      }, apiBase);
      const parsed = parse(LoggingResponseZ, raw);
      if (!parsed) throw new Error('Logging status could not be changed.');
      setChatLog({ ...chatLog, logging: parsed.logging });
    } catch {
      setError('Chat logging could not be changed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteChatLog(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const raw: unknown = await consoleFetch('chatlog', { method: 'DELETE' }, apiBase);
      const parsed = parse(DeleteResponseZ, raw);
      if (!parsed) throw new Error('Chat log could not be deleted.');
      await refreshChatLog();
      setDeleteConfirm(false);
    } catch {
      setError('Chat log could not be deleted. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function rotateOverlay(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const raw: unknown = await consoleFetch('overlay/rotate', { method: 'POST' }, apiBase);
      const parsed = parse(RotateResponseZ, raw);
      if (!parsed) throw new Error('The overlay key could not be rotated.');
      setOverlayUrl(parsed.overlayUrl);
    } catch {
      setError('The overlay key could not be rotated. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function changeConfig(update: Partial<DrillConfig>): void {
    setConfig((previous) => ({ ...previous, ...update }));
  }

  function toggleTactic(tactic: Tactic, checked: boolean): void {
    setConfig((previous) => {
      const tactics = checked
        ? [...previous.tactics, tactic]
        : previous.tactics.filter((item) => item !== tactic);
      if (tactics.length === 0) return previous;
      return {
        ...previous,
        tactics,
        primaryTactic: tactics.includes(previous.primaryTactic) ? previous.primaryTactic : tactics[0] ?? previous.primaryTactic
      };
    });
  }

  async function saveConfig(): Promise<boolean> {
    let currentDraft: Draft;
    try {
      currentDraft = await ensureDraft();
      const checked = DrillConfigInputZ.safeParse(config);
      if (!checked.success) {
        setError('Choose at least one tactic and keep the total at 40 lines or fewer.');
        return false;
      }
      setBusy(true);
      setError(null);
      const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(currentDraft.drillId)}`, {
        method: 'PATCH',
        body: JSON.stringify(checked.data)
      }, apiBase);
      const view = parse(DrillViewZ, raw);
      if (!view) throw new Error('Drill settings could not be saved.');
      setConfig(view.config);
      setSavedConfig(view.config);
      setDrillView(view);
      return true;
    } catch {
      setError('Drill settings could not be saved. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function startDrill(): Promise<void> {
    if (!draftRef.current) {
      await openConfigure();
      return;
    }
    if (JSON.stringify(config) !== JSON.stringify(savedConfig) && !await saveConfig()) return;
    setBusy(true);
    setError(null);
    try {
      const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(draftRef.current.drillId)}/start`, { method: 'POST' }, apiBase);
      if (!parse(StartResponseZ, raw)) throw new Error('The drill could not be started.');
      setUnlockedThrough(3);
      setActiveStep(3);
    } catch {
      setError('The drill could not be started. Check the settings and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function stopDrill(): Promise<void> {
    const current = room.snapshot?.drill;
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(current.drillId)}/stop`, { method: 'POST' }, apiBase);
      if (!parse(StopResponseZ, raw)) throw new Error('The drill could not be stopped.');
    } catch {
      setError('The drill could not be stopped. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function loadGrades(drillId: string): Promise<GradesView> {
    const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(drillId)}/grades`, {}, apiBase);
    const parsed = parse(GradesViewZ, raw);
    if (!parsed) throw new Error('Grade results are unavailable.');
    setGrades(parsed);
    if (parsed.phases.A && parsed.phases.A.done >= parsed.phases.A.total) setGrading(false);
    return parsed;
  }

  async function showGrades(): Promise<void> {
    const drillId = room.snapshot?.drill?.drillId;
    if (!drillId) return;
    setActiveStep(4);
    setReviewBusy(true);
    setError(null);
    try {
      const current = await loadGrades(drillId);
      const phase = current.phases.A;
      if (isDemo) {
        if (!phase) {
          const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(drillId)}/grade/local`, { method: 'POST', body: JSON.stringify({ phase: 'A' }) }, apiBase);
          if (!parse(GradeLocalZ, raw)) throw new Error('Local grading did not return a result.');
          await loadGrades(drillId);
        }
        setUnlockedThrough((previous) => previous < 4 ? 4 : previous);
        return;
      }
      if (!phase && gradeRequestedRef.current !== `${drillId}:A`) {
        gradeRequestedRef.current = `${drillId}:A`;
        setGrading(true);
        const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(drillId)}/grade`, { method: 'POST', body: JSON.stringify({ phase: 'A' }) }, apiBase);
        if (!parse(GradeQueuedZ, raw)) throw new Error('Twitch grading could not be queued.');
      } else if (phase && phase.done < phase.total) setGrading(true);
      setUnlockedThrough((previous) => previous < 4 ? 4 : previous);
    } catch {
      setGrading(false);
      setError('Grade results could not be loaded. Use a local estimate now or try again.');
    } finally {
      setReviewBusy(false);
    }
  }

  async function gradeWithTwitch(): Promise<void> {
    const drillId = room.snapshot?.drill?.drillId;
    if (!drillId) return;
    setReviewBusy(true);
    setGrading(true);
    setError(null);
    try {
      const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(drillId)}/grade`, { method: 'POST', body: JSON.stringify({ phase: 'A' }) }, apiBase);
      if (!parse(GradeQueuedZ, raw)) throw new Error('Twitch grading could not be queued.');
      gradeRequestedRef.current = `${drillId}:A`;
    } catch {
      setGrading(false);
      setError('Twitch grading could not start. You can use a local estimate now.');
    } finally {
      setReviewBusy(false);
    }
  }

  async function gradeLocally(): Promise<void> {
    const drillId = room.snapshot?.drill?.drillId;
    if (!drillId) return;
    setReviewBusy(true);
    setError(null);
    try {
      const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(drillId)}/grade/local`, { method: 'POST', body: JSON.stringify({ phase: 'A' }) }, apiBase);
      if (!parse(GradeLocalZ, raw)) throw new Error('Local grading did not return a result.');
      await loadGrades(drillId);
      setGrading(false);
    } catch {
      setError('The local estimate could not be created. Try again.');
    } finally {
      setReviewBusy(false);
    }
  }

  async function showRules(): Promise<void> {
    const drillId = room.snapshot?.drill?.drillId;
    const phase = grades?.phases.A;
    if (!drillId || !phase || phase.done < phase.total) return;
    setActiveStep(5);
    setReviewBusy(true);
    setError(null);
    try {
      if (!rules || rulesRequestedRef.current !== drillId) {
        const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(drillId)}/rules`, { method: 'POST' }, apiBase);
        const parsed = parse(RuleResultZ, raw);
        if (!parsed) throw new Error('Rule suggestions are unavailable.');
        setRules(parsed);
        setSelectedTerms(parsed.accepted.map((item) => item.term));
        rulesRequestedRef.current = drillId;
      }
      setUnlockedThrough((previous) => previous < 5 ? 5 : previous);
    } catch {
      setError('Rule suggestions could not be loaded. Try again.');
    } finally {
      setReviewBusy(false);
    }
  }

  async function makeProof(drillId: string, terms: string[]): Promise<void> {
    const requestId = ++proofRequestRef.current;
    if (terms.length === 0) { setProof(null); setReviewBusy(false); return; }
    setProof(null);
    setReviewBusy(true);
    try {
      const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(drillId)}/prove`, { method: 'POST', body: JSON.stringify({ terms }) }, apiBase);
      const parsed = parse(ProofResultZ, raw);
      if (!parsed) throw new Error('Fresh-wave proof is unavailable.');
      if (requestId !== proofRequestRef.current) return;
      setProof(parsed);
      setUnlockedThrough((previous) => previous < 6 ? 6 : previous);
    } catch {
      if (requestId === proofRequestRef.current) setError('Fresh-wave proof could not be created. Try again.');
    } finally {
      if (requestId === proofRequestRef.current) setReviewBusy(false);
    }
  }

  async function pushTerms(): Promise<void> {
    const drillId = room.snapshot?.drill?.drillId;
    const allTermsCleared = Boolean(proof && proof.realChat.length === selectedTerms.length && selectedTerms.every((term) => proof.realChat.some((item) => item.term.toLowerCase() === term.toLowerCase() && item.count === 0)));
    if (!drillId || !proof?.pushAllowed || !allTermsCleared || selectedTerms.length === 0) return;
    setReviewBusy(true);
    setError(null);
    try {
      const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(drillId)}/push`, { method: 'POST', body: JSON.stringify({ terms: selectedTerms }) }, apiBase);
      const parsed = parse(PushResultsZ, raw);
      if (!parsed) throw new Error('Push results are unavailable.');
      setPushResults(parsed);
      await loadReport(drillId).catch(() => undefined);
    } catch {
      setError('The terms could not be pushed. Refresh the proof and try again.');
    } finally {
      setReviewBusy(false);
    }
  }

  async function undoPush(): Promise<void> {
    const drillId = room.snapshot?.drill?.drillId;
    if (!drillId) return;
    setReviewBusy(true);
    setError(null);
    try {
      const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(drillId)}/undo`, { method: 'POST' }, apiBase);
      const parsed = parse(PushResultsZ, raw);
      if (!parsed) throw new Error('Undo results are unavailable.');
      setPushResults(parsed);
      await loadReport(drillId).catch(() => undefined);
    } catch {
      setError('The push could not be undone. Try again.');
    } finally {
      setReviewBusy(false);
    }
  }

  async function loadReport(drillId: string): Promise<void> {
    setReportLoading(true);
    setReportError(null);
    try {
      const raw: unknown = await consoleFetch(`drills/${encodeURIComponent(drillId)}/report`, {}, apiBase);
      const parsed = parse(ReportViewZ, raw);
      if (!parsed) throw new Error('The after-action report is unavailable.');
      setReport(parsed);
    } catch {
      setReportError('The after-action report is not available yet.');
      throw new Error('report_unavailable');
    } finally {
      setReportLoading(false);
    }
  }

  const currentDrill = room.snapshot?.drill ?? null;
  const lineRows = (currentDrill?.lines ?? []) as ConsoleLine[];
  const reveals = new Map((currentDrill?.reveal ?? []).map((reveal) => [reveal.lineId, reveal] as const));
  const participants = room.snapshot?.participants ?? [];
  const score = currentDrill?.score;
  const gradePhaseA = grades?.phases.A;
  const draftIsDirty = JSON.stringify(config) !== JSON.stringify(savedConfig);
  const configValid = DrillConfigInputZ.safeParse(config).success;
  const elapsedMs = currentDrill?.startedAt === null || currentDrill?.startedAt === undefined ? 0 : Math.max(0, now - currentDrill.startedAt);

  if (loading) return <section className="console-page"><div className="console-shell" role="status">Loading your channel console…</div></section>;
  if (!me) return <section className="console-page"><div className="console-shell console-auth-card">
    <h1>Open your channel console</h1>
    <p>{error ?? 'Sign in with Twitch to read your channel filters and run a practice drill.'}</p>
    <a className="console-button console-button-primary" href="/auth/login">Sign in with Twitch</a>
    <Link to="/">Back to the start</Link>
  </div></section>;

  return <section className="console-page">
    <div className="console-shell">
      <header className="console-heading">
        <div className="console-channel-title">
          {me.channel.avatarUrl && <img src={me.channel.avatarUrl} alt="" width="56" height="56" />}
          <div><p className="console-context">Channel console</p><h1>{me.channel.displayName}</h1></div>
        </div>
        <div className="console-status-strip" aria-label="Channel status">
          {isDemo
            ? <><span><i className="is-good" />Private demo room</span><span><i className="is-good" />Local estimate</span><span><i className="is-good" />{chatLog?.count ?? 0} fixture messages</span></>
            : <><span><i className={me.tokenStatus === 'active' || me.tokenStatus === 'valid' ? 'is-good' : 'is-warn'} />Twitch {humanStatus(me.tokenStatus)}</span>
              <span><i className={me.subscriptionStatus === 'enabled' ? 'is-good' : 'is-warn'} />Chat {humanStatus(me.subscriptionStatus)}</span>
              <span><i className={chatLog?.logging ? 'is-good' : 'is-warn'} />{chatLog?.count ?? 0} logged</span></>}
        </div>
      </header>

      {isDemo && demoModUrl && <DemoJoinQr url={demoModUrl} />}

      <ConsoleStepper current={activeStep} unlockedThrough={unlockedThrough} onSelect={(step) => void selectStep(step)} />
      {error && <p className="console-alert" role="alert">{error}</p>}

      {activeStep === 1 && <section className="console-step-panel" aria-labelledby="filters-title">
        <div className="console-step-title">
          <div><p className="console-context">Step 1</p><h2 id="filters-title">Read filters</h2></div>
          {!isDemo && <button type="button" className="console-button console-button-primary" disabled={busy} onClick={() => void refreshFilters()}>
            {busy ? 'Refreshing…' : 'Refresh from Twitch'}
          </button>}
        </div>
        <div className="console-filter-grid">
          <div className="console-filter-main">
            <section className="console-section" aria-labelledby="blocked-terms-title">
              <div className="console-section-heading"><h3 id="blocked-terms-title">Public blocked terms</h3><span>{filters?.terms.length ?? 0}</span></div>
              {!filtersLoaded ? <p className="console-muted">Loading channel filters…</p> : !filters
                ? <p className="console-muted">Filters are unavailable. Refresh from Twitch to try again.</p>
                : filters.terms.length === 0
                  ? <p className="console-empty">Your channel has no public blocked terms yet. The drill will show what that lets through.</p>
                  : <ul className="console-term-list">{filters.terms.map((term) => <li key={term.id}>{term.text}</li>)}</ul>}
              <p className="console-muted">{isDemo ? 'These are sample filters for the demo channel.' : 'Private terms are not visible to apps.'}</p>
            </section>
            <section className="console-section" aria-labelledby="automod-title">
              <div className="console-section-heading"><h3 id="automod-title">AutoMod levels</h3></div>
              {!filters?.automod ? <p className="console-muted">AutoMod settings are not available right now.</p> :
                <dl className="console-automod-list">{Object.entries(filters.automod).map(([key, value]) => <div key={key}>
                  <dt>{AutoModLabels[key] ?? humanStatus(key)}</dt><dd>{value === null ? 'Not set' : `Level ${value}`}</dd>
                </div>)}</dl>}
              {filters?.fetchedAt !== null && filters?.fetchedAt !== undefined && <p className="console-muted">Updated {formattedDate(filters.fetchedAt)}</p>}
            </section>
          </div>

          <aside className="console-log-panel" aria-labelledby="chat-log-title">
            <div className="console-section-heading"><h3 id="chat-log-title">Chat log</h3><span>{chatLog?.count ?? 0} messages</span></div>
            <p className="console-log-date">{isDemo ? 'Curated demo fixture' : chatLog?.oldest === null || chatLog?.oldest === undefined ? 'Collecting since now' : `Collecting since ${formattedDate(chatLog.oldest)}`}</p>
            <p className="console-muted">{isDemo ? 'Sample messages are used only to check whether suggested rules could match regular chat.' : t('privacy.short')}</p>
            {!chatLogLoaded ? <p className="console-muted">Loading chat log…</p> : !chatLog
              ? <p className="console-muted">Chat log details are unavailable. Try again in a moment.</p>
              : isDemo
                ? <p className="console-empty">The demo uses 71 curated sample messages. No live chat is connected.</p>
                : chatLog.count === 0
                ? <p className="console-empty">Collecting chat. The false-ban check gets better as your chat log grows; the banter pool is used meanwhile.</p>
                : <ul className="console-samples" aria-label="Six latest chat messages">{chatLog.samples.map((sample, index) =>
                <li key={`${sample.login}-${index}`}>
                  <span className="console-sample-login">{sample.login}</span>
                  <button type="button" className="console-blurred-sample" aria-label={`${sample.login}: ${sample.text}`}>
                    <span>{sample.text}</span>
                  </button>
                </li>
              )}</ul>}
            {!isDemo && <div className="console-log-actions">
              <button type="button" className="console-button console-button-quiet" disabled={busy || !chatLog} onClick={() => void toggleLogging()}>
                {chatLog?.logging ? 'Pause logging' : 'Resume logging'}
              </button>
              {!deleteConfirm
                ? <button type="button" className="console-button console-button-danger" disabled={busy || (chatLog?.count ?? 0) === 0} onClick={() => setDeleteConfirm(true)}>Delete chat log</button>
                : <div className="console-delete-confirm" role="group" aria-label="Confirm chat log deletion">
                  <span>Delete all logged messages?</span>
                  <button type="button" className="console-button console-button-danger" disabled={busy} onClick={() => void deleteChatLog()}>Confirm delete</button>
                  <button type="button" className="console-button console-button-quiet" onClick={() => setDeleteConfirm(false)}>Cancel</button>
                </div>}
            </div>}
          </aside>
        </div>
        <div className="console-step-footer">
          <button type="button" className="console-button console-button-primary" onClick={() => void openConfigure()}>Continue to configure</button>
        </div>
      </section>}

      {activeStep === 2 && <section className="console-step-panel" aria-labelledby="configure-title">
        <div className="console-step-title">
          <div><p className="console-context">Step 2</p><h2 id="configure-title">Configure</h2>
            <p className="console-muted">The draft is ready, so your mod team can join while you tune the drill.</p></div>
          <span className="console-draft-status">{draft ? 'Draft ready' : 'Preparing draft…'}</span>
        </div>
        <div className="console-config-grid">
          <section className="console-section console-config-options" aria-labelledby="tactics-title">
            <h3 id="tactics-title">Choose the tactics to rehearse</h3>
            <fieldset className="console-tactics">
              <legend>Tactics</legend>
              {TACTICS.map((tactic) => <label key={tactic.id} className="console-check-row">
                <input type="checkbox" checked={config.tactics.includes(tactic.id)} onChange={(event) => toggleTactic(tactic.id, event.currentTarget.checked)} />
                <span>{tactic.label}</span>
              </label>)}
            </fieldset>
            <fieldset className="console-primary-tactic">
              <legend>Primary tactic</legend>
              {config.tactics.map((tactic) => <label key={tactic} className="console-radio-row">
                <input type="radio" name="primary-tactic" value={tactic} checked={config.primaryTactic === tactic}
                  onChange={() => changeConfig({ primaryTactic: tactic })} />
                <span>{TACTICS.find((item) => item.id === tactic)?.label ?? tactic}</span>
              </label>)}
            </fieldset>
            {config.tactics.includes('hateraid') && <p className="console-warning" role="note">{t('hate.warning')}</p>}
          </section>
          <section className="console-section console-config-values" aria-labelledby="length-title">
            <h3 id="length-title">Shape the drill</h3>
            <label className="console-input-row">Attack lines
              <input type="number" min={6} max={30} value={config.attackCount} onChange={(event) => changeConfig({ attackCount: Number(event.currentTarget.value) })} />
              <span>6–30</span>
            </label>
            <label className="console-input-row">Banter lines
              <input type="number" min={4} max={20} value={config.banterCount} onChange={(event) => changeConfig({ banterCount: Number(event.currentTarget.value) })} />
              <span>4–20 · total at most 40</span>
            </label>
            <label className="console-input-row">Line interval
              <select value={config.intervalMs} onChange={(event) => changeConfig({ intervalMs: Number(event.currentTarget.value) })}>
                {[800, 1000, 1200, 1500, 1800, 2000, 2500, 3000].map((value) => <option key={value} value={value}>{(value / 1000).toFixed(1)} seconds</option>)}
              </select>
              <span>0.8–3.0 seconds</span>
            </label>
            <label className="console-input-row">Slip window
              <select value={config.slipWindowMs} onChange={(event) => changeConfig({ slipWindowMs: Number(event.currentTarget.value) })}>
                {[5000, 6000, 7000, 8000, 9000, 10000, 12000, 15000].map((value) => <option key={value} value={value}>{(value / 1000).toFixed(0)} seconds</option>)}
              </select>
              <span>5–15 seconds</span>
            </label>
            <label className="console-check-row console-kai-toggle">
              <input type="checkbox" checked={config.simMod} onChange={(event) => changeConfig({ simMod: event.currentTarget.checked })} />
              <span>Kai (sim)</span>
            </label>
          </section>
        </div>
        {!configValid && <p className="console-alert" role="alert">Choose a primary tactic, keep each count in range, and keep the total at 40 lines or fewer.</p>}
        {draft && <div className="console-share-grid">
          <CopyField label="Join code" value={draft.joinCode} />
          <CopyField label="Mod link" value={draft.modUrl} />
          {!isDemo && overlayUrl && <CopyField label="Overlay URL" value={overlayUrl} />}
          {!isDemo && <button type="button" className="console-button console-button-quiet" disabled={busy} onClick={() => void rotateOverlay()}>Rotate key</button>}
        </div>}
        <section className="console-section console-joined" aria-labelledby="joined-title">
          <div className="console-section-heading"><h3 id="joined-title">Joined mods</h3><span>{participants.filter((person) => !person.isSim).length}</span></div>
          {participants.length === 0
            ? <p className="console-empty">No mods yet. Share the mod link, or turn on Kai (sim) to rehearse alone.</p>
            : <ul className="console-participant-list">{participants.map((person) => <li key={person.id}>
              <span className={person.online ? 'console-presence is-online' : 'console-presence'} aria-hidden="true" />
              <span>{person.name}{person.isSim ? ' (sim)' : ''}</span>
              {!person.online && <span className="console-muted">reconnecting</span>}
            </li>)}</ul>}
        </section>
        <div className="console-step-footer">
          <button type="button" className="console-button console-button-quiet" disabled={busy || !draft || !draftIsDirty || !configValid} onClick={() => void saveConfig()}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
          <button type="button" className="console-button console-button-primary" disabled={busy || !draft || !configValid || (!config.simMod && participants.filter((person) => !person.isSim).length === 0)} onClick={() => void startDrill()}>
            {busy ? 'Starting…' : 'Start drill'}
          </button>
        </div>
      </section>}

      {activeStep === 3 && <section className="console-step-panel" aria-labelledby="run-title">
        <div className="console-step-title">
          <div><p className="console-context">Step 3</p><h2 id="run-title">{currentDrill?.status === 'ended' ? 'Drill complete' : 'Run the drill'}</h2></div>
          <div className="console-run-status"><span className={`console-connection console-connection-${room.connection}`} />
            {room.connection === 'open' ? 'Connected' : 'Reconnecting'}
            <strong>{Math.floor(elapsedMs / 60000)}:{String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0')}</strong>
          </div>
        </div>
        <p className="console-practice-banner">{t('banner.practice')}</p>
        <div className="console-live-grid">
          <section className="console-section console-live-chat" aria-labelledby="live-chat-title">
            <div className="console-section-heading"><h3 id="live-chat-title">Practice chat</h3><span>{lineRows.length} lines</span></div>
            {lineRows.length === 0 ? <p className="console-empty">The chat will appear here when the drill starts.</p> :
              <ol className="console-chat-list" aria-live="polite" aria-relevant="additions text">
                {lineRows.map((line) => <ReadOnlyLine key={line.line.lineId} line={line} reveal={reveals.get(line.line.lineId)} />)}
              </ol>}
          </section>
          <aside className="console-live-sidebar">
            <section className="console-section" aria-labelledby="scoreboard-title">
              <div className="console-section-heading"><h3 id="scoreboard-title">Team scoreboard</h3><span>{score?.slipped ?? 0} slipped</span></div>
              {!score || score.mods.length === 0 ? <p className="console-empty">No mods have joined yet.</p> :
                <ol className="console-score-list">{score.mods.map((mod, index) => <li key={mod.participantId}>
                  <span className="console-rank">{index + 1}</span>
                  <strong>{mod.name}{mod.isSim ? ' (sim)' : ''}</strong>
                  <span>{mod.caught} caught · {mod.falseBans} false bans</span>
                </li>)}</ol>}
            </section>
            <section className="console-section" aria-labelledby="mods-live-title">
              <div className="console-section-heading"><h3 id="mods-live-title">Mods in the room</h3><span>{participants.filter((person) => !person.isSim).length}</span></div>
              <ul className="console-participant-list">{participants.map((person) => <li key={person.id}>
                <span className={person.online ? 'console-presence is-online' : 'console-presence'} aria-hidden="true" />
                <span>{person.name}{person.isSim ? ' (sim)' : ''}</span>
                {!person.online && <span className="console-muted">reconnecting</span>}
              </li>)}</ul>
            </section>
          </aside>
        </div>
        {currentDrill?.status === 'running' && <div className="console-step-footer">
          <button type="button" className="console-button console-button-danger" disabled={busy} onClick={() => void stopDrill()}>{busy ? 'Stopping…' : 'Stop'}</button>
        </div>}
        {currentDrill?.status === 'ended' && <p className="console-complete-summary">{score?.attacksShown ?? 0} attacks shown · {score?.slipped ?? 0} slipped through</p>}
        {currentDrill?.status === 'ended' && <div className="console-step-footer"><button type="button" className="console-button console-button-primary" onClick={() => void showGrades()}>{isDemo ? 'Continue to local estimate' : 'Continue to Twitch grades'}</button></div>}
      </section>}

      {activeStep === 4 && <section className="console-step-panel" aria-labelledby="grade-step-title">
        <div className="console-step-title"><div><p className="console-context">Step 4</p><h2 id="grade-step-title">{isDemo ? 'Local filter estimate' : 'Twitch grades'}</h2><p className="console-muted">See which attack lines would get past your current filters.</p></div>{gradePhaseA && <span className="console-draft-status">{gradePhaseA.done} of {gradePhaseA.total} checked</span>}</div>
        <GradeTable lines={(drillView?.lines ?? []) as GradeLine[]} grades={grades} phase={gradePhaseA} onGradeTwitch={() => void gradeWithTwitch()} onGradeLocal={() => void gradeLocally()} grading={grading} busy={reviewBusy} localOnly={isDemo} />
        {gradePhaseA && gradePhaseA.done >= gradePhaseA.total && <div className="console-step-footer"><button type="button" className="console-button console-button-primary" disabled={reviewBusy} onClick={() => void showRules()}>Find better rules</button></div>}
      </section>}

      {activeStep === 5 && <section className="console-step-panel" aria-labelledby="rules-step-title">
        <div className="console-step-title"><div><p className="console-context">Step 5</p><h2 id="rules-step-title">Fix the rules</h2><p className="console-muted">Select safe terms or add one of your own. Each choice is checked against your retained chat.</p></div></div>
        {!rules ? <p className="console-muted" role="status">Finding safe rules…</p> : <RuleList rules={rules} lines={(drillView?.lines ?? []) as GradeLine[]} selected={selectedTerms} onSelectionChange={setSelectedTerms} disabled={reviewBusy} />}
        <div className="console-step-footer"><button type="button" className="console-button console-button-primary" disabled={reviewBusy || !proof || selectedTerms.length === 0} onClick={() => setActiveStep(6)}>Test on a fresh wave</button></div>
      </section>}

      {activeStep === 6 && <section className="console-step-panel" aria-labelledby="proof-step-title">
        <div className="console-step-title"><div><p className="console-context">Step 6</p><h2 id="proof-step-title">{isDemo ? 'Fresh wave and simulated push' : 'Fresh wave and push'}</h2><p className="console-muted">{isDemo ? 'Check these rules on a held-out wave, then simulate the push in this private room.' : 'Check these rules on a held-out wave before approving changes to Twitch.'}</p></div></div>
        <ProofBars proof={proof} results={pushResults} selectedTerms={selectedTerms} onPush={() => void pushTerms()} onUndo={() => void undoPush()} busy={reviewBusy} canUndo={pushResults.some((item) => item.status === 'added')} demo={isDemo} />
        {report ? <ReportCard report={report} /> : <p className="console-muted" role="status">{reportLoading ? 'Loading the after-action report…' : reportError ?? 'The after-action report is not available yet.'}</p>}
      </section>}
    </div>
  </section>;
}
