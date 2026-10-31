import {
  buildCleanIndex,
  buildWaveB,
  findRules,
  proveOnFreshWave,
  TermListZ,
  validateTerm,
  type CleanIndex,
  type DrillView,
  type ProofResult,
  type RuleFinderResult
} from '@mfd/core';
import { DRILL_ERRORS } from './drill.js';
import { log } from '../lib/log.js';

type RuleDeps = {
  ctx: DurableObjectState;
  roomName: () => string;
  mode: () => string | null;
  getDrill: (drillId: string) => DrillView | Promise<DrillView>;
  blockedTerms: () => string[];
  refreshReport: (drillId: string, now: number) => unknown;
};

type GradeRow = { line_id: string; engine: string; permitted: number };
type ChatRow = { text: string; tokens: string };

export function checkedTerms(rawTerms: unknown): string[] {
  const parsed = TermListZ.safeParse({ terms: rawTerms });
  if (!parsed.success) throw new Error(DRILL_ERRORS.invalid);
  const terms = parsed.data.terms.map((term) => term.trim());
  if (new Set(terms.map((term) => term.toLowerCase())).size !== terms.length) throw new Error(DRILL_ERRORS.invalid);
  if (terms.some((term) => validateTerm(term) !== null)) throw new Error(DRILL_ERRORS.invalid);
  return terms;
}

/** Rule finder and fresh-wave proof (FR-31 to FR-33). The clean index stays warm while the room is awake. */
export class RuleEngine {
  private cleanIndex: CleanIndex | null = null;
  private cleanCount = 0;

  constructor(private readonly deps: RuleDeps) {}

  private get sql() {
    return this.deps.ctx.storage.sql;
  }

  async findRules(drillId: string): Promise<RuleFinderResult> {
    const view = await this.drill(drillId);
    const rows = this.sql.exec<GradeRow>(
      `SELECT g.line_id, g.engine, g.permitted FROM grades g JOIN wave_lines l ON l.id = g.line_id
        WHERE l.drill_id = ? AND g.phase = 'A' AND g.engine IN ('twitch', 'local')`, drillId
    ).toArray();
    const gradeByLine = new Map<string, { twitch?: boolean; local?: boolean }>();
    for (const row of rows) {
      const grade = gradeByLine.get(row.line_id) ?? {};
      if (row.engine === 'twitch') grade.twitch = row.permitted === 1;
      else if (row.engine === 'local') grade.local = row.permitted === 1;
      gradeByLine.set(row.line_id, grade);
    }
    const passed = view.lines.filter((line) => {
      if (line.wave !== 'A' || line.kind !== 'attack') return false;
      const grade = gradeByLine.get(line.id);
      return (grade?.twitch ?? grade?.local) === true;
    });
    const result = findRules(passed, this.getCleanIndex());
    const now = Date.now();
    this.deps.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO rule_runs (drill_id, result, created_at) VALUES (?, ?, ?)
         ON CONFLICT(drill_id) DO UPDATE SET result = excluded.result, created_at = excluded.created_at`,
        drillId, JSON.stringify(result), now
      );
    });
    this.deps.refreshReport(drillId, now);
    log('rules.run', { room: this.deps.roomName(), drill: drillId, accepted: result.accepted.length, rejected: result.rejected.length });
    return result;
  }

  async proveFreshWave(drillId: string, rawTerms: unknown): Promise<ProofResult> {
    const terms = checkedTerms(rawTerms);
    const view = await this.drill(drillId);
    const waveB = buildWaveB(view.config, drillId);
    const result = proveOnFreshWave(waveB, this.deps.blockedTerms(), terms, this.getCleanIndex());
    const now = Date.now();
    this.deps.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO proofs (drill_id, selected, result, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(drill_id) DO UPDATE SET selected = excluded.selected, result = excluded.result, created_at = excluded.created_at`,
        drillId, JSON.stringify(terms), JSON.stringify(result), now
      );
    });
    this.deps.refreshReport(drillId, now);
    return result;
  }

  private async drill(drillId: string): Promise<DrillView> {
    const exists = this.sql.exec<{ id: string }>('SELECT id FROM drills WHERE id = ?', drillId).toArray()[0];
    if (!exists) throw new Error(DRILL_ERRORS.notFound);
    return this.deps.getDrill(drillId);
  }

  private getCleanIndex(): CleanIndex {
    const count = this.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM chat_log').one().count;
    if (this.cleanIndex !== null) {
      const changed = this.cleanCount === 0 ? count !== 0 : Math.abs(count - this.cleanCount) / this.cleanCount > 0.01;
      if (!changed) return this.cleanIndex;
    }
    const rows = this.sql.exec<ChatRow>('SELECT text, tokens FROM chat_log ORDER BY sent_at, message_id').toArray();
    const texts = rows.map((row) => row.text);
    const tokenLists = rows.map((row) => row.tokens.length === 0 ? [] : row.tokens.split(' '));
    this.cleanIndex = buildCleanIndex(texts, tokenLists);
    this.cleanCount = count;
    return this.cleanIndex;
  }
}
