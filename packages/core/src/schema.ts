import { z } from 'zod';

export const TacticZ = z.enum(['linkscam', 'spam', 'botwave', 'hateraid']);

export const DrillConfigInputZ = z.object({
  tactics: z.array(TacticZ).min(1).max(4),
  primaryTactic: TacticZ,
  attackCount: z.number().int().min(6).max(30).default(14),
  banterCount: z.number().int().min(4).max(20).default(8),
  intervalMs: z.number().int().min(800).max(3000).default(1500),
  slipWindowMs: z.number().int().min(5000).max(15000).default(9000),
  seed: z.number().int().min(0).max(0xffffffff).optional(),
  simMod: z.boolean().default(false),
  chatVote: z.boolean().default(false),
  announce: z.boolean().default(false)
})
  .refine((config) => config.tactics.includes(config.primaryTactic), {
    message: 'Primary tactic must be selected.',
    path: ['primaryTactic']
  })
  .refine((config) => new Set(config.tactics).size === config.tactics.length, {
    message: 'Tactics must be unique.',
    path: ['tactics']
  })
  .refine((config) => config.attackCount + config.banterCount <= 40, {
    message: 'A drill has at most 40 lines.',
    path: ['banterCount']
  });

export type DrillConfigInput = z.input<typeof DrillConfigInputZ>;

export const ModActionZ = z.object({
  type: z.literal('mod.action'),
  data: z.object({
    lineId: z.string().max(80),
    action: z.enum(['delete', 'timeout', 'ban'])
  })
});

export const ClientMsgZ = z.discriminatedUnion('type', [
  ModActionZ,
  z.object({ type: z.literal('sync') })
]);

export const TermListZ = z.object({ terms: z.array(z.string().min(2).max(500)).min(1).max(12) });
export const JoinZ = z.object({ code: z.string().regex(/^\d{6}$/), displayName: z.string().trim().min(1).max(24) });
