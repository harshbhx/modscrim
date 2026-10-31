import type { DrillConfig, DrillScore, Engine, Grade, GradePhase, LineState, ModAction, Participant, WaveLine } from './types.js';
import type { PublicLine, RedactedLine, Reveal } from './protocol.js';
import type { TagCount } from './ruleFinder.js';

export type DrillStatus = 'draft' | 'voting' | 'running' | 'ended' | 'cancelled';

export interface FiltersView {
  terms: { id: string; text: string }[];
  automod: Record<string, number | null> | null;
  fetchedAt: number | null;
}

export interface DrillView {
  drillId: string; status: DrillStatus; config: DrillConfig; joinCode: string;
  createdAt: number; startedAt: number | null; endedAt: number | null;
  lines: Array<WaveLine & { state: LineState | null }>;
  participants: Participant[];
  score: DrillScore;
}

export interface DrillSnapshot {
  drill: null | {
    drillId: string; status: DrillStatus; startedAt: number | null; total: number;
    lines: Array<{ line: PublicLine | RedactedLine; shownAt: number;
                   state: 'open' | 'acted' | 'slipped'; actedByName?: string; action?: ModAction }>;
    score: DrillScore;
    reveal?: Reveal[];
  };
  participants: Array<{ id: string; name: string; isSim: boolean; online: boolean }>;
}

export interface GradesView {
  phases: Partial<Record<GradePhase, { done: number; total: number; passed: number;
                                         engine: Engine | 'mixed'; nextAt?: number }>>;
  lines: Grade[];
}

export interface PushResult {
  term: string; status: 'added' | 'preexisting' | 'failed' | 'removed';
  twitchTermId?: string; error?: string;
}

/** Numbers only: safe for the overlay and share links. */
export interface ReportCard {
  drillId: string; attacksShown: number; slipped: number;
  mods: Array<{ name: string; isSim: boolean; caught: number; falseBans: number; avgReactionMs: number | null }>;
  grade: { passed: number; total: number; engine: Engine | 'mixed' } | null;
  termsPushed: number;
  fresh: { before: number; after: number; total: number } | null;
}

export type JobKind = 'line.emit' | 'line.slip' | 'sim.act' | 'drill.end' | 'grade.tick'
  | 'vote.close' | 'chatlog.purge' | 'room.gc' | 'report.export';

export type ActionResult =
  | { ok: true; lineId: string; pid: string; action: ModAction; reactionMs: number; falseBan: boolean }
  | { ok: false; reason: 'not_shown' | 'not_participant' | 'ended' | 'taken' | 'slipped'; by?: string };

/** The parts of a Twitch EventSub webhook body this app reads. */
export interface EventSubEnvelope {
  subscription: { id: string; type: string; version: string; status: string; condition: Record<string, string> };
  event?: unknown;
  challenge?: string;
}

export interface ChatMessageEvent {
  broadcaster_user_id: string; chatter_user_id: string; chatter_user_login: string;
  message_id: string; message: { text: string }; message_type: string;
  source_broadcaster_user_id: string | null;
}

export interface Report {
  reportId: string;
  drillId: string;
  channel: { id: string; login: string; displayName: string };
  createdAt: number;
  config: Pick<DrillConfig, 'tactics' | 'primaryTactic' | 'attackCount' | 'banterCount' | 'intervalMs' | 'slipWindowMs'>;
  score: DrillScore;
  grading: Array<{ phase: GradePhase; engine: Engine | 'mixed'; passed: number; total: number;
                   agreement?: { agree: number; total: number } }>;
  tacticCounts: Record<string, number>;
  trickCounts: Record<string, number>;
  rules?: { accepted: Array<{ term: string; gain: number }>;
            rejected: Array<{ term: string; hits: number; fp: number; fpExample?: string }>;
            needsBotRule: TagCount[] };
  proof?: { total: number; blockedBefore: number; blockedAfter: number; realChatMatches: number;
            twitchAfter?: { passed: number; total: number } };
  pushes: Array<{ term: string; status: 'added' | 'preexisting' | 'failed' | 'removed'; error?: string }>;
  coachNote?: { text: string; source: 'ai' | 'template' };
}

export interface ModHistoryDrill {
  drillId: string;
  createdAt: number;
  caught: number;
  falseBans: number;
  avgReactionMs: number | null;
}

export interface ModHistoryEntry {
  name: string;
  drills: ModHistoryDrill[];
}

export interface ReportJob { kind: 'report.export'; roomName: string; drillId: string; reportId: string }
