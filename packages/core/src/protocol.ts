import type { DrillScore, Engine, GradePhase, ModAction, Segment, Tactic } from './types.js';
import type { DrillSnapshot, ModHistoryEntry, PushResult, ReportCard } from './views.js';

export type Role = 'console' | 'mod' | 'overlay';

export interface PublicLine { lineId: string; user: string; segments: Segment[] }
export interface RedactedLine { lineId: string; user: string; len: number }
export interface Reveal { lineId: string; kind: 'attack' | 'banter'; tactic?: Tactic; tags: string[] }

export type ServerMsg =
  | { type: 'hello'; data: { role: Role; participantId?: string; serverTime: number } }
  | { type: 'drill.state'; data: DrillSnapshot }
  | { type: 'drill.started'; data: { drillId: string; startedAt: number; total: number } }
  | { type: 'drill.line'; data: { line: PublicLine | RedactedLine; shownAt: number } }
  | { type: 'drill.action'; data: { lineId: string; participantId: string; name: string; isSim: boolean;
                                     action: ModAction; reactionMs: number; falseBan: boolean } }
  | { type: 'drill.slipped'; data: { lineId: string } }
  | { type: 'drill.score'; data: DrillScore }
  | { type: 'drill.ended'; data: { score: DrillScore; reveal?: Reveal[] } }
  | { type: 'action.rejected'; data: { lineId: string; reason: 'taken' | 'slipped' | 'not_shown' | 'ended' | 'not_participant'; by?: string } }
  | { type: 'participants'; data: Array<{ id: string; name: string; isSim: boolean; online: boolean }> }
  | { type: 'grade.progress'; data: { phase: GradePhase; done: number; total: number; engine: Engine | 'mixed'; nextAt?: number } }
  | { type: 'grade.done'; data: { phase: GradePhase; passed: number; total: number; engine: Engine | 'mixed' } }
  | { type: 'push.result'; data: PushResult }
  | { type: 'report.ready'; data: { drillId: string; card: ReportCard } }
  | { type: 'mod.history'; data: ModHistoryEntry[] }
  | { type: 'chat.stats'; data: { count: number; lastAt: number | null } }
  | { type: 'vote.update'; data: { counts: Record<Tactic, number>; endsAt: number } }
  | { type: 'error'; data: { code: string; message: string } };

export type ClientMsg =
  | { type: 'mod.action'; data: { lineId: string; action: ModAction } }
  | { type: 'sync' };
