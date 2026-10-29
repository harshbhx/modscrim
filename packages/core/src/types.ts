export type Tactic = 'linkscam' | 'spam' | 'botwave' | 'hateraid';
export type Trick =
  | 'plain' | 'caps' | 'leet' | 'stretch' | 'emoji'
  | 'spaced' | 'dotted' | 'zerowidth' | 'lookalike';
export type LinkTrick = 'plain' | 'spaced' | 'bracket' | 'leet' | 'dotword';
export type ModAction = 'delete' | 'timeout' | 'ban';
export type WaveId = 'A' | 'B';
export type GradePhase = 'A' | 'B-before' | 'B-after';
export type Engine = 'twitch' | 'local';

export interface Segment { kind: 'text' | 'link' | 'slur'; text: string }

export interface WaveLine {
  id: string;
  wave: WaveId;
  idx: number;
  kind: 'attack' | 'banter';
  tactic?: Tactic;
  trick?: Trick;
  linkTrick?: LinkTrick;
  tags: string[];
  user: string;
  segments: Segment[];
  text: string;
}

export interface DrillConfig {
  tactics: Tactic[];
  primaryTactic: Tactic;
  attackCount: number;
  banterCount: number;
  intervalMs: number;
  slipWindowMs: number;
  seed: number;
  simMod: boolean;
}

export interface LineState {
  lineId: string;
  shownAt?: number;
  actedBy?: string;
  action?: ModAction;
  actedAt?: number;
  slipped: boolean;
}

export interface Participant { id: string; name: string; isSim: boolean }

export interface ModScore {
  participantId: string; name: string; isSim: boolean;
  caught: number; falseBans: number; avgReactionMs: number | null;
}
export interface DrillScore { mods: ModScore[]; slipped: number; attacksShown: number }

export interface Grade {
  lineId: string; phase: GradePhase; engine: Engine;
  permitted: boolean;
  blockedBy?: string;
}
