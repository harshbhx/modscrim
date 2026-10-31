import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { coachNote, type Report, type ReportCard, type ServerMsg } from '@mfd/core';
import { coachPrompt } from '../worker/room/coach.js';
import { errorMiddleware } from '../worker/lib/errors.js';
import { exportReport, exportView, reportMarkdown, upsertSummary } from '../worker/jobs/reportExport.js';
import { publicCard, publicReportRoutes } from '../worker/routes/reports.js';
import { forOverlay, type OverlayNames } from '../worker/room/hub.js';
import { env } from 'cloudflare:test';
import { beforeAll } from 'vitest';
import migration from '../migrations/0001_init.sql?raw';

const report: Report = {
  reportId: 'report-id-1234567890',
  drillId: 'drill-id',
  channel: { id: '42', login: 'pixelpanda_tv', displayName: 'PixelPanda' },
  createdAt: 1_700_000_000_000,
  config: { tactics: ['linkscam'], primaryTactic: 'linkscam', attackCount: 6, banterCount: 4, intervalMs: 1500, slipWindowMs: 9000 },
  score: {
    attacksShown: 6,
    slipped: 2,
    mods: [{ participantId: 'p1', name: 'Secret Mod Name', isSim: false, caught: 3, falseBans: 1, avgReactionMs: 1200 }]
  },
  grading: [{ phase: 'A', engine: 'local', passed: 4, total: 6 }],
  tacticCounts: { linkscam: 6 },
  trickCounts: { bracket: 3 },
  rules: {
    accepted: [{ term: 'nitrodrop invalid', gain: 3 }],
    rejected: [{ term: 'invalid', hits: 6, fp: 1, fpExample: 'PRIVATE_CHAT_EXAMPLE' }],
    needsBotRule: []
  },
  proof: { total: 30, blockedBefore: 4, blockedAfter: 10, realChatMatches: 0 },
  pushes: [{ term: 'nitrodrop invalid', status: 'removed' }],
  coachNote: { text: 'Two attacks slipped through.', source: 'template' }
};

const hiddenNames: OverlayNames = {
  byId: new Map([['p1', 'Mod 1']]),
  byName: new Map([['secret mod name', 'Mod 1']])
};

beforeAll(async () => {
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) /, 'CREATE $1$2 IF NOT EXISTS ')).run();
  }
});

describe('report export and share-safe projection', () => {
  it('omits real-chat examples and line text from JSON and Markdown exports', () => {
    const view = exportView(report);
    const json = JSON.stringify(view);
    const markdown = reportMarkdown(view);
    expect(json).not.toContain('PRIVATE_CHAT_EXAMPLE');
    expect(markdown).not.toContain('PRIVATE_CHAT_EXAMPLE');
    expect(json).not.toContain('attack line text');
    expect(markdown).not.toContain('attack line text');
    expect(view.rules?.rejected[0]).toEqual({ term: 'invalid', hits: 6, fp: 1 });
  });

  it('writes JSON and Markdown to R2 without line text or fpExample, and keeps an unshared report private', async () => {
    const reports = (env as unknown as { REPORTS?: R2Bucket }).REPORTS;
    expect(reports).toBeDefined();
    const broadcasterId = String(Date.now());
    const roomName = `ch:${broadcasterId}`;
    const reportId = `report-${crypto.randomUUID().replaceAll('-', '')}`;
    const privateLine = 'PRIVATE_ATTACK_LINE_SENTINEL';
    const fixture = {
      ...report,
      reportId,
      channel: { ...report.channel, id: broadcasterId },
      attackLineText: privateLine
    } as Report;
    await env.DB.prepare('INSERT INTO users (id, login, display_name, created_at, updated_at) VALUES (?, ?, ?, 0, 0)')
      .bind(broadcasterId, `u${broadcasterId}`, 'Export Test').run();
    await env.DB.prepare('INSERT INTO channels (broadcaster_id, room_name, connected_at) VALUES (?, ?, 0)')
      .bind(broadcasterId, roomName).run();

    const mockedEnv = {
      ...env,
      ROOM: { getByName: () => ({ getReport: async () => fixture }) }
    } as unknown as Env;
    const outcome = await exportReport(mockedEnv, { kind: 'report.export', roomName, drillId: fixture.drillId, reportId });
    expect(outcome).toBe('exported');
    const prefix = `reports/${broadcasterId}/${reportId}`;
    const jsonObject = await reports!.get(`${prefix}.json`);
    const markdownObject = await reports!.get(`${prefix}.md`);
    expect(jsonObject).not.toBeNull();
    expect(markdownObject).not.toBeNull();
    const json = await jsonObject!.text();
    const markdown = await markdownObject!.text();
    for (const output of [json, markdown]) {
      expect(output).not.toContain(privateLine);
      expect(output).not.toContain('PRIVATE_CHAT_EXAMPLE');
      expect(output).toContain('nitrodrop invalid');
    }
    expect(JSON.parse(json)).not.toHaveProperty('attackLineText');

    const unsharedReportId = `unshared-${crypto.randomUUID().replaceAll('-', '')}`;
    await upsertSummary(env.DB, { ...fixture, reportId: unsharedReportId }, {}).run();
    const app = new Hono<{ Bindings: Env }>();
    app.onError((error, context) => errorMiddleware(error, context));
    app.route('/api/public/reports', publicReportRoutes);
    const response = await app.request(`/api/public/reports/${unsharedReportId}`, {}, env);
    expect(response.status).toBe(404);
  });

  it('public report cards replace human names and preserve the simulated moderator label', () => {
    const card: ReportCard = {
      drillId: report.drillId, attacksShown: 6, slipped: 2,
      mods: [
        { name: 'Secret Mod Name', isSim: false, caught: 3, falseBans: 1, avgReactionMs: 1200 },
        { name: 'Kai (sim)', isSim: true, caught: 2, falseBans: 0, avgReactionMs: 3000 }
      ],
      grade: { passed: 4, total: 6, engine: 'local' }, termsPushed: 1, fresh: { before: 4, after: 10, total: 30 }
    };
    expect(publicCard(card).mods.map((mod) => mod.name)).toEqual(['Mod 1', 'Kai (sim)']);
  });
});

describe('coach note templates', () => {
  it('covers zero slips and false bans', () => {
    expect(coachNote({ slipped: 0, attacksShown: 6, falseBans: 0, fastestMs: null }))
      .toBe('Nothing slipped through, great coverage. No regulars were removed.');
  });

  it('covers non-zero slips and false bans', () => {
    expect(coachNote({ slipped: 2, attacksShown: 6, falseBans: 1, fastestMs: 1200 }))
      .toContain('2 of 6 attacks slipped through');
    expect(coachNote({ slipped: 2, attacksShown: 6, falseBans: 1, fastestMs: 1200 }))
      .toContain('1 regular was removed');
  });

  it('sends only the four numeric coaching fields to Workers AI', () => {
    const prompt = coachPrompt({ slipped: 2, attacksShown: 6, falseBans: 1, fastestMs: 1200 });
    expect(prompt.messages[0]?.content).toBe('Write two short, friendly coaching sentences for a Twitch mod team.');
    expect(JSON.parse(prompt.messages[1]?.content ?? '{}')).toEqual({
      attacksShown: 6,
      slipped: 2,
      falseBans: 1,
      fastestMs: 1200
    });
    expect(JSON.stringify(prompt)).not.toMatch(/Secret Mod Name|PRIVATE_CHAT_EXAMPLE|nitrodrop invalid/);
  });
});

describe('overlay hidden-name redaction', () => {
  it('replaces human names in action, score, participant, end, state and report messages', () => {
    const score = { attacksShown: 1, slipped: 0, mods: [{ participantId: 'p1', name: 'Secret Mod Name', isSim: false, caught: 1, falseBans: 0, avgReactionMs: 100 }] };
    const messages: ServerMsg[] = [
      { type: 'drill.action', data: { lineId: 'l1', participantId: 'p1', name: 'Secret Mod Name', isSim: false, action: 'delete', reactionMs: 100, falseBan: false } },
      { type: 'drill.score', data: score },
      { type: 'participants', data: [{ id: 'p1', name: 'Secret Mod Name', isSim: false, online: true }] },
      { type: 'drill.ended', data: { score, reveal: [] } },
      { type: 'drill.state', data: { participants: [{ id: 'p1', name: 'Secret Mod Name', isSim: false, online: true }], drill: { drillId: 'd1', status: 'ended', startedAt: 1, total: 0, lines: [], score } } },
      { type: 'report.ready', data: { drillId: report.drillId, card: { ...publicCard({ drillId: report.drillId, attacksShown: 1, slipped: 0, mods: [{ name: 'Secret Mod Name', isSim: false, caught: 1, falseBans: 0, avgReactionMs: 100 }], grade: null, termsPushed: 0, fresh: null }), mods: [{ name: 'Secret Mod Name', isSim: false, caught: 1, falseBans: 0, avgReactionMs: 100 }] } } }
    ];
    for (const message of messages) {
      const redacted = forOverlay(message, hiddenNames);
      expect(JSON.stringify(redacted)).not.toContain('Secret Mod Name');
      expect(JSON.stringify(redacted)).toContain('Mod 1');
    }
  });
});
