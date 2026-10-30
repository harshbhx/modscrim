import type { Report } from '@mfd/core';
import { z } from 'zod';
import { reportPrefix } from '../auth/deletion.js';
import { log } from '../lib/log.js';

/**
 * Report export (FR-27 P1, SRS §7.4, §7.5): the `mfd-reports` Queue consumer. For each `ReportJob` it reads the
 * report back through the room's `getReport`, writes `reports/<broadcasterId>/<reportId>.json` and `.md` to R2
 * and upserts the `report_summaries` row in D1.
 *
 * S-06: an export carries numbers, tactic and trick counts and terms. It never carries attack text or
 * `fpExample` (a real chat line): every field is copied by name, so nothing else in the report can leak.
 */

/** The Queue message (SRS §7.5). Only live rooms send it, so the room name is always `ch:<broadcasterId>`. */
export const ReportJobZ = z.object({
  kind: z.literal('report.export'),
  roomName: z.string().regex(/^ch:\d{1,32}$/),
  drillId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  reportId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/)
});

type Rules = NonNullable<Report['rules']>;

/** The exported report: the SRS §7.4 shape with `rules.rejected[].fpExample` removed. */
export type ReportExport = Omit<Report, 'rules'> & {
  rules?: { accepted: Rules['accepted']; rejected: Array<{ term: string; hits: number; fp: number }>; needsBotRule: Rules['needsBotRule'] };
};

/** Copy the report field by field, leaving out `fpExample` and anything not listed here (S-06). */
export function exportView(report: Report): ReportExport {
  const out: ReportExport = {
    reportId: report.reportId,
    drillId: report.drillId,
    channel: { id: report.channel.id, login: report.channel.login, displayName: report.channel.displayName },
    createdAt: report.createdAt,
    config: {
      tactics: [...report.config.tactics],
      primaryTactic: report.config.primaryTactic,
      attackCount: report.config.attackCount,
      banterCount: report.config.banterCount,
      intervalMs: report.config.intervalMs,
      slipWindowMs: report.config.slipWindowMs
    },
    score: {
      attacksShown: report.score.attacksShown,
      slipped: report.score.slipped,
      mods: report.score.mods.map((m) => ({
        participantId: m.participantId,
        name: m.name,
        isSim: m.isSim,
        caught: m.caught,
        falseBans: m.falseBans,
        avgReactionMs: m.avgReactionMs
      }))
    },
    grading: report.grading.map((g) => {
      const entry: ReportExport['grading'][number] = { phase: g.phase, engine: g.engine, passed: g.passed, total: g.total };
      if (g.agreement) entry.agreement = { agree: g.agreement.agree, total: g.agreement.total };
      return entry;
    }),
    tacticCounts: { ...report.tacticCounts },
    trickCounts: { ...report.trickCounts },
    pushes: report.pushes.map((p) => {
      const entry: ReportExport['pushes'][number] = { term: p.term, status: p.status };
      if (p.error !== undefined) entry.error = p.error;
      return entry;
    })
  };
  if (report.rules) {
    out.rules = {
      accepted: report.rules.accepted.map((a) => ({ term: a.term, gain: a.gain })),
      rejected: report.rules.rejected.map((r) => ({ term: r.term, hits: r.hits, fp: r.fp })),
      needsBotRule: report.rules.needsBotRule.map((t) => ({ tag: t.tag, count: t.count, needsBotRule: t.needsBotRule }))
    };
  }
  if (report.proof) {
    out.proof = {
      total: report.proof.total,
      blockedBefore: report.proof.blockedBefore,
      blockedAfter: report.proof.blockedAfter,
      realChatMatches: report.proof.realChatMatches
    };
    if (report.proof.twitchAfter) out.proof.twitchAfter = { passed: report.proof.twitchAfter.passed, total: report.proof.twitchAfter.total };
  }
  if (report.coachNote) out.coachNote = { text: report.coachNote.text, source: report.coachNote.source };
  return out;
}

/** One Markdown table cell: pipes escaped, line breaks flattened. */
function cell(value: string | number | null): string {
  if (value === null) return '–';
  return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

function table(head: string[], rows: Array<Array<string | number | null>>): string[] {
  if (rows.length === 0) return ['None.', ''];
  return [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
    ''
  ];
}

function counts(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** The Markdown export: the same fields as the JSON, as tables. */
export function reportMarkdown(r: ReportExport): string {
  const lines: string[] = [
    `# ModScrim drill report: ${cell(r.channel.displayName)}`,
    '',
    `- Channel: ${cell(r.channel.displayName)} (${cell(r.channel.login)})`,
    `- Date: ${new Date(r.createdAt).toISOString()}`,
    `- Report: ${r.reportId}`,
    `- Drill: ${r.drillId}`,
    `- Tactics: ${r.config.tactics.join(', ')} (primary: ${r.config.primaryTactic})`,
    `- Lines: ${r.config.attackCount} attacks, ${r.config.banterCount} banter, every ${r.config.intervalMs} ms, slip window ${r.config.slipWindowMs} ms`,
    '',
    '## Score',
    '',
    `${r.score.slipped} of ${r.score.attacksShown} attacks shown slipped through.`,
    '',
    ...table(
      ['Mod', 'Caught', 'False bans', 'Average reaction (ms)'],
      r.score.mods.map((m) => [m.name, m.caught, m.falseBans, m.avgReactionMs])
    ),
    '## Grading',
    '',
    ...table(
      ['Phase', 'Engine', 'Got past the filters', 'Lines', 'Engines agree'],
      r.grading.map((g) => [g.phase, g.engine, g.passed, g.total, g.agreement ? `${g.agreement.agree} of ${g.agreement.total}` : null])
    ),
    '## Tactics shown',
    '',
    ...table(['Tactic', 'Attacks'], counts(r.tacticCounts)),
    '## Tricks shown',
    '',
    ...table(['Trick', 'Attacks'], counts(r.trickCounts))
  ];
  if (r.rules) {
    lines.push(
      '## Rules proposed',
      '',
      ...table(['Term', 'Extra attacks caught'], r.rules.accepted.map((a) => [a.term, a.gain])),
      '## Rules rejected',
      '',
      ...table(['Term', 'Attacks caught', 'Real chat matches'], r.rules.rejected.map((x) => [x.term, x.hits, x.fp])),
      '## Needs a bot rule',
      '',
      ...table(['Tag', 'Attacks'], r.rules.needsBotRule.map((t) => [t.tag, t.count]))
    );
  }
  if (r.proof) {
    lines.push(
      '## Fresh wave',
      '',
      ...table(
        ['Lines', 'Blocked before', 'Blocked after', 'Real chat matches', 'Twitch after'],
        [[
          r.proof.total,
          r.proof.blockedBefore,
          r.proof.blockedAfter,
          r.proof.realChatMatches,
          r.proof.twitchAfter ? `${r.proof.twitchAfter.passed} of ${r.proof.twitchAfter.total} got past` : null
        ]]
      )
    );
  }
  lines.push('## Pushed to Twitch', '', ...table(['Term', 'Status', 'Error'], r.pushes.map((p) => [p.term, p.status, p.error ?? null])));
  if (r.coachNote) {
    lines.push("## Coach's note", '', `${cell(r.coachNote.text)}${r.coachNote.source === 'ai' ? ' (AI-written)' : ''}`, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** The `report_summaries` numbers of a report (SRS §7.3). */
export function summaryOf(report: Report) {
  const a = report.grading.find((g) => g.phase === 'A');
  return {
    attacks: report.score.attacksShown,
    slipped: report.score.slipped,
    passedTwitch: a && a.engine === 'twitch' ? a.passed : null,
    termsPushed: report.pushes.filter((p) => p.status === 'added').length,
    freshBefore: report.proof?.blockedBefore ?? null,
    freshAfter: report.proof?.blockedAfter ?? null,
    freshTotal: report.proof?.total ?? null
  };
}

/** The R2 key stem of one report's export; the files are `<stem>.json` and `<stem>.md`. */
export function exportStem(broadcasterId: string, reportId: string): string {
  return `${reportPrefix(broadcasterId)}${reportId}`;
}

/**
 * Upsert a report's summary row. `shared` is set only when given (the share route), so the export never
 * changes it; `r2Prefix` is set only when given (the export), so sharing never clears it.
 */
export function upsertSummary(
  db: D1Database,
  report: Report,
  opts: { shared?: boolean; r2Prefix?: string }
): D1PreparedStatement {
  const s = summaryOf(report);
  return db
    .prepare(
      `INSERT INTO report_summaries (report_id, broadcaster_id, drill_id, created_at, shared, attacks, slipped,
         passed_twitch, terms_pushed, fresh_before, fresh_after, fresh_total, r2_prefix)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
       ON CONFLICT(report_id) DO UPDATE SET attacks = excluded.attacks, slipped = excluded.slipped,
         passed_twitch = excluded.passed_twitch, terms_pushed = excluded.terms_pushed, fresh_before = excluded.fresh_before,
         fresh_after = excluded.fresh_after, fresh_total = excluded.fresh_total,
         shared = CASE WHEN ?14 THEN excluded.shared ELSE report_summaries.shared END,
         r2_prefix = COALESCE(excluded.r2_prefix, report_summaries.r2_prefix)
       WHERE report_summaries.broadcaster_id = excluded.broadcaster_id`
    )
    .bind(
      report.reportId,
      report.channel.id,
      report.drillId,
      report.createdAt,
      opts.shared ? 1 : 0,
      s.attacks,
      s.slipped,
      s.passedTwitch,
      s.termsPushed,
      s.freshBefore,
      s.freshAfter,
      s.freshTotal,
      opts.r2Prefix ?? null,
      opts.shared === undefined ? 0 : 1
    );
}

export type ExportOutcome = 'exported' | 'dropped';

/**
 * Handle one Queue message. Returns `dropped` for a message that can never succeed (malformed, the room or
 * channel is gone, the report changed identity); the caller acks both outcomes. Throws on a transient
 * failure (room, R2 or D1 unavailable), so the caller retries it (up to 3 times, `max_retries`).
 */
export async function exportReport(env: Env, body: unknown): Promise<ExportOutcome> {
  const bucket = env.REPORTS;
  if (!bucket) throw new Error('reports_unbound');
  const parsed = ReportJobZ.safeParse(body);
  if (!parsed.success) {
    log('report.exported', { room: 'queue', ok: false, reason: 'invalid_message' });
    return 'dropped';
  }
  const job = parsed.data;
  const broadcasterId = job.roomName.slice('ch:'.length);
  const drop = (reason: string): ExportOutcome => {
    log('report.exported', { room: job.roomName, drill: job.drillId, reportId: job.reportId, ok: false, reason });
    return 'dropped';
  };

  // A channel that signed out (FR-04) has no row and no exports; never write for it again.
  const channel = await env.DB.prepare('SELECT room_name FROM channels WHERE broadcaster_id = ?')
    .bind(broadcasterId)
    .first<{ room_name: string }>();
  if (!channel || channel.room_name !== job.roomName) return drop('no_channel');

  let report: Report | null;
  try {
    report = await env.ROOM.getByName(job.roomName).getReport(job.drillId);
  } catch (error) {
    if (error instanceof Error && error.message === 'room_not_bootstrapped') return drop('no_room');
    throw error;
  }
  if (!report || report.reportId !== job.reportId || report.channel.id !== broadcasterId) return drop('no_report');

  const view = exportView(report);
  const stem = exportStem(broadcasterId, report.reportId);
  await bucket.put(`${stem}.json`, `${JSON.stringify(view, null, 2)}\n`, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' }
  });
  await bucket.put(`${stem}.md`, reportMarkdown(view), { httpMetadata: { contentType: 'text/markdown; charset=utf-8' } });
  await upsertSummary(env.DB, report, { r2Prefix: stem }).run();
  log('report.exported', { room: job.roomName, drill: job.drillId, reportId: job.reportId, ok: true });
  return 'exported';
}
