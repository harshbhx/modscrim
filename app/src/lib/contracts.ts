import { z } from 'zod';
import type { FiltersView, ReportCard } from '@mfd/core';

export type { ClientMsg, ServerMsg } from '@mfd/core';

/**
 * Response shapes the SPA parses at the network boundary. They live here, not
 * inside the route files, so the Playwright fixtures (app/e2e/lib/mock-api.ts)
 * build their payloads with the very schemas the app validates with and cannot
 * drift from them. Value imports are limited to zod so this file also loads in
 * Node; @mfd/core is imported for types only and each schema is pinned to its
 * core type.
 */

export const FiltersZ: z.ZodType<FiltersView> = z.object({
  terms: z.array(z.object({ id: z.string(), text: z.string() })),
  automod: z.record(z.string(), z.number().int().min(0).max(4).nullable()).nullable(),
  fetchedAt: z.number().nullable()
});

export const ChatLogZ = z.object({
  count: z.number().int().nonnegative(),
  oldest: z.number().nullable(),
  newest: z.number().nullable(),
  logging: z.boolean(),
  samples: z.array(z.object({ login: z.string(), text: z.string() })).max(6)
});

export const ChannelInfoZ = z.object({
  broadcasterId: z.string().min(1),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  drillOpen: z.boolean()
});

/** The numbers a report card carries; the shared `/r/:id` card omits the drill id. */
const reportCardShape = z.object({
  attacksShown: z.number(),
  slipped: z.number(),
  mods: z.array(z.object({ name: z.string(), isSim: z.boolean(), caught: z.number(), falseBans: z.number(), avgReactionMs: z.number().nullable() })),
  grade: z.object({ passed: z.number(), total: z.number(), engine: z.enum(['twitch', 'local', 'mixed']) }).nullable(),
  termsPushed: z.number(),
  fresh: z.object({ before: z.number(), after: z.number(), total: z.number() }).nullable()
});

export const ReportCardZ: z.ZodType<ReportCard> = reportCardShape.extend({ drillId: z.string() });

export const SharedReportZ = z.object({
  reportId: z.string(),
  channel: z.object({ login: z.string(), displayName: z.string() }),
  createdAt: z.number(),
  card: reportCardShape
});

/**
 * What an overlay socket may ever receive (SRS §8.3): redacted lines carry only
 * a length, never text or segments. `.strict()` makes a fixture that smuggles in
 * readable attack text fail to build.
 */
const RedactedLineZ = z.object({ lineId: z.string(), user: z.string(), len: z.number().int().nonnegative() }).strict();
const OverlayScoreZ = z.object({
  mods: z.array(z.object({ participantId: z.string(), name: z.string(), isSim: z.boolean(), caught: z.number(), falseBans: z.number(), avgReactionMs: z.number().nullable() }).strict()),
  slipped: z.number(),
  attacksShown: z.number()
}).strict();

export const OverlayServerMsgZ = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), data: z.object({ role: z.literal('overlay'), serverTime: z.number() }).strict() }).strict(),
  z.object({
    type: z.literal('drill.state'),
    data: z.object({
      drill: z.object({
        drillId: z.string(),
        status: z.enum(['draft', 'voting', 'running', 'ended', 'cancelled']),
        startedAt: z.number().nullable(),
        total: z.number(),
        lines: z.array(z.object({ line: RedactedLineZ, shownAt: z.number(), state: z.enum(['open', 'acted', 'slipped']) }).strict()),
        score: OverlayScoreZ
      }).strict().nullable(),
      participants: z.array(z.object({ id: z.string(), name: z.string(), isSim: z.boolean(), online: z.boolean() }).strict())
    }).strict()
  }).strict(),
  z.object({ type: z.literal('report.ready'), data: z.object({ drillId: z.string(), card: ReportCardZ }).strict() }).strict()
]);
export type OverlayServerMsg = z.infer<typeof OverlayServerMsgZ>;
