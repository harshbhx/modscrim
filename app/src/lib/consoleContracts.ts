import { z } from 'zod';
import type { Tactic } from '@mfd/core';

/**
 * Response shapes the streamer console parses at the network boundary. They
 * live here, not inside Console.tsx, so the Playwright fixtures
 * (app/e2e/lib/console-mock.ts) build every payload with the very schemas the
 * app validates with. Value imports are limited to zod so this file loads in
 * Node; the tactic enum is pinned to the core type, so drift fails to compile.
 */
export const TacticZ: z.ZodType<Tactic> = z.enum(['linkscam', 'spam', 'botwave', 'hateraid']);

const ChannelZ = z.object({
  id: z.string(),
  login: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  broadcasterType: z.enum(['', 'affiliate', 'partner'])
});
export const MeZ = z.object({
  user: ChannelZ,
  channel: ChannelZ,
  tokenStatus: z.string(),
  subscriptionStatus: z.string(),
  overlayUrl: z.string().url(),
  modUrl: z.string().url()
});
export const DrillViewZ = z.object({
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
    simMod: z.boolean(),
    chatVote: z.boolean(),
    announce: z.boolean()
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
export const DraftResponseZ = z.object({ drillId: z.string().min(1), joinCode: z.string().regex(/^\d{6}$/), modUrl: z.string().url() });
export const RotateResponseZ = z.object({ overlayUrl: z.string().url() });
export const LoggingResponseZ = z.object({ logging: z.boolean() });
export const DeleteResponseZ = z.object({ deleted: z.number().int().nonnegative() });
export const StartResponseZ = z.object({ startedAt: z.number() });
export const StopResponseZ = z.object({ endedAt: z.number() });
export const GradeQueuedZ = z.object({ queued: z.number().int().nonnegative() });
export const GradeLocalZ = z.object({ passed: z.number().int().nonnegative(), total: z.number().int().nonnegative(), engine: z.literal('local') });

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

const GradeZ = z.object({ lineId: z.string(), phase: z.enum(['A', 'B-before', 'B-after']), engine: z.enum(['twitch', 'local']), permitted: z.boolean(), blockedBy: z.string().optional() });
const PhaseZ = z.object({ done: z.number().int().nonnegative(), total: z.number().int().nonnegative(), passed: z.number().int().nonnegative(), engine: z.enum(['twitch', 'local', 'mixed']), nextAt: z.number().optional() });
export const GradesViewZ = z.object({ phases: z.object({ A: PhaseZ.optional(), 'B-before': PhaseZ.optional(), 'B-after': PhaseZ.optional() }), lines: z.array(GradeZ) });
export const RuleResultZ = z.object({
  accepted: z.array(z.object({ term: z.string(), hits: z.number().int(), gain: z.number().int(), exampleLineId: z.string() })).max(6),
  rejected: z.array(z.object({ term: z.string(), hits: z.number().int(), fp: z.number().int(), fpExample: z.string() })).max(6),
  stillPassing: z.array(z.string()),
  stillByTag: z.array(z.object({ tag: z.string(), count: z.number().int(), needsBotRule: z.boolean() }))
});
export const ProofResultZ = z.object({
  total: z.number().int().nonnegative(), blockedBefore: z.number().int().nonnegative(), blockedAfter: z.number().int().nonnegative(),
  realChat: z.array(z.object({ term: z.string(), count: z.number().int().nonnegative(), example: z.string().nullable() })),
  pushAllowed: z.boolean(), stillByTag: z.array(z.object({ tag: z.string(), count: z.number().int(), needsBotRule: z.boolean() }))
});
export const PushResultsZ = z.array(z.object({ term: z.string(), status: z.enum(['added', 'preexisting', 'failed', 'removed']), twitchTermId: z.string().optional(), error: z.string().optional() }));
export const ReportViewZ = z.object({
  reportId: z.string(),
  score: z.object({ mods: z.array(z.object({ participantId: z.string(), name: z.string(), isSim: z.boolean(), caught: z.number(), falseBans: z.number(), avgReactionMs: z.number().nullable() })), slipped: z.number(), attacksShown: z.number() }),
  grading: z.array(z.object({ phase: z.string(), engine: z.enum(['twitch', 'local', 'mixed']), passed: z.number(), total: z.number() })),
  rules: z.object({ accepted: z.array(z.object({ term: z.string(), gain: z.number() })), rejected: z.array(z.object({ term: z.string(), hits: z.number(), fp: z.number() })), needsBotRule: z.array(z.object({ tag: z.string(), count: z.number(), needsBotRule: z.boolean() })) }).optional(),
  proof: z.object({ total: z.number(), blockedBefore: z.number(), blockedAfter: z.number(), realChatMatches: z.number() }).optional(),
  modHistory: z.array(z.object({
    name: z.string(),
    drills: z.array(z.object({ drillId: z.string(), createdAt: z.number(), caught: z.number(), falseBans: z.number(), avgReactionMs: z.number().nullable() }))
  })).optional(),
  pushes: z.array(z.object({ term: z.string(), status: z.enum(['added', 'preexisting', 'failed', 'removed']), error: z.string().optional() }))
});

export type GradesView = z.infer<typeof GradesViewZ>;
export type RuleResult = z.infer<typeof RuleResultZ>;
export type ProofResult = z.infer<typeof ProofResultZ>;
export type PushResult = z.infer<typeof PushResultsZ>[number];
export type ReportView = z.infer<typeof ReportViewZ>;
export type StatusView = z.infer<typeof StatusViewZ>;
