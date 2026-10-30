import { Hono } from 'hono';
import { z } from 'zod';
import type { ReportCard } from '@mfd/core';
import { AppError } from '../lib/errors.js';
import { reportCard } from '../room/report.js';
import { limit } from './mod.js';

/**
 * Shared report cards (FR-27 P1, SRS §8.2, PRD F-20). `GET /api/public/reports/:reportId` answers only while
 * the streamer has marked the report shared in `report_summaries`; otherwise, and for any unknown ID, 404.
 * The card is numbers only (S-06): no terms, no line text, no chat, and mods appear as "Mod 1", "Mod 2"
 * (Kai (sim) keeps its label), because anyone with the link can open it.
 */
export const publicReportRoutes = new Hono<{ Bindings: Env }>();

export const ReportIdZ = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/** The JSON the `/r/:reportId` page renders. */
export type SharedReport = {
  reportId: string;
  channel: { login: string; displayName: string };
  createdAt: number;
  card: ReportCard;
};

/** The share link of a report on this deployment. */
export function shareUrl(publicBaseUrl: string, reportId: string): string {
  return `${publicBaseUrl.replace(/\/$/, '')}/r/${encodeURIComponent(reportId)}`;
}

/** The card with every human mod's name replaced by "Mod <n>" in report order. */
export function publicCard(card: ReportCard): ReportCard {
  let n = 0;
  return {
    drillId: card.drillId,
    attacksShown: card.attacksShown,
    slipped: card.slipped,
    mods: card.mods.map((m) => ({
      name: m.isSim ? m.name : `Mod ${++n}`,
      isSim: m.isSim,
      caught: m.caught,
      falseBans: m.falseBans,
      avgReactionMs: m.avgReactionMs
    })),
    grade: card.grade ? { passed: card.grade.passed, total: card.grade.total, engine: card.grade.engine } : null,
    termsPushed: card.termsPushed,
    fresh: card.fresh ? { before: card.fresh.before, after: card.fresh.after, total: card.fresh.total } : null
  };
}

type SharedRow = { broadcaster_id: string; drill_id: string; created_at: number; room_name: string; login: string; display_name: string };

publicReportRoutes.get('/:reportId', async (context) => {
  const parsed = ReportIdZ.safeParse(context.req.param('reportId'));
  if (!parsed.success) throw new AppError('not_found', 'Report not found.');
  const reportId = parsed.data;
  const ip = context.req.header('CF-Connecting-IP') ?? 'unknown';
  await limit(context.env, `report:${ip}`);

  // D1 first: an unshared or unknown report never wakes a room.
  const row = await context.env.DB.prepare(
    `SELECT s.broadcaster_id, s.drill_id, s.created_at, c.room_name, u.login, u.display_name
       FROM report_summaries s JOIN channels c ON c.broadcaster_id = s.broadcaster_id JOIN users u ON u.id = s.broadcaster_id
      WHERE s.report_id = ? AND s.shared = 1`
  )
    .bind(reportId)
    .first<SharedRow>();
  if (!row) throw new AppError('not_found', 'Report not found.');

  let card: ReportCard | null = null;
  try {
    const report = await context.env.ROOM.getByName(row.room_name).getReport(row.drill_id);
    if (report && report.reportId === reportId) card = publicCard(reportCard(report));
  } catch (error) {
    if (!(error instanceof Error && error.message === 'room_not_bootstrapped')) {
      throw new AppError('room_unavailable', 'The report is unavailable.');
    }
  }
  if (!card) throw new AppError('not_found', 'Report not found.');

  const body: SharedReport = {
    reportId,
    channel: { login: row.login, displayName: row.display_name },
    createdAt: row.created_at,
    card
  };
  return context.json(body, 200, { 'Cache-Control': 'no-store' });
});
