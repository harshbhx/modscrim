import { useState } from 'react';
import { z } from 'zod';
import { validateTerm } from '@mfd/core';
import { t } from '../copy';

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
  pushes: z.array(z.object({ term: z.string(), status: z.enum(['added', 'preexisting', 'failed', 'removed']), error: z.string().optional() }))
});

export type GradesView = z.infer<typeof GradesViewZ>;
export type RuleResult = z.infer<typeof RuleResultZ>;
export type ProofResult = z.infer<typeof ProofResultZ>;
export type PushResult = z.infer<typeof PushResultsZ>[number];
export type ReportView = z.infer<typeof ReportViewZ>;
export type GradeLine = { id: string; text: string; tactic?: string; trick?: string; tags: string[] };

export function GradeTable({ lines, grades, phase, onGradeTwitch, onGradeLocal, grading, busy }: {
  lines: GradeLine[]; grades: GradesView | null; phase: GradesView['phases']['A'];
  onGradeTwitch: () => void; onGradeLocal: () => void; grading: boolean; busy: boolean;
}) {
  const rows = new Map((grades?.lines ?? []).filter((grade) => grade.phase === 'A').map((grade) => [grade.lineId, grade]));
  return <section className="console-section" aria-labelledby="grade-table-title">
    <div className="console-section-heading"><h3 id="grade-table-title">Attack line grades</h3>{phase && <span>{phase.done} of {phase.total} · {engineName(phase.engine)}</span>}</div>
    {!phase && <p className="console-muted">Grade the ended drill to see which attack lines pass your filters.</p>}
    {phase && <p className="console-grade-headline">{t('grade.headline', { n: phase.passed, total: phase.total })}<span>{engineName(phase.engine)}</span></p>}
    {grading && <p className="console-muted" role="status">Twitch grading in progress: {phase?.done ?? 0} of {phase?.total ?? lines.filter((line) => line.tactic).length} checked.</p>}
    {phase?.nextAt && phase.nextAt > Date.now() && <p className="console-warning" role="status">Twitch's grading limit for this hour is used up. {phase.engine === 'local' || phase.engine === 'mixed' ? 'Showing a local estimate; ' : ''}Twitch grading resumes at {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(phase.nextAt)}.</p>}
    <div className="console-grade-actions"><button type="button" className="console-button console-button-primary" disabled={busy || grading} onClick={onGradeTwitch}>Grade with Twitch</button><button type="button" className="console-button console-button-quiet" disabled={busy} onClick={onGradeLocal}>Use local estimate now</button></div>
    <div className="console-table-wrap"><table className="console-grade-table"><thead><tr><th scope="col">Attack line</th><th scope="col">Tactic</th><th scope="col">Trick</th><th scope="col">Result</th><th scope="col">Engine</th></tr></thead>
      <tbody>{lines.filter((line) => line.tactic).map((line) => { const grade = rows.get(line.id); return <tr key={line.id}><td>{line.text}</td><td>{line.tactic}</td><td>{line.trick ?? line.tags.join(', ')}</td><td>{grade ? grade.permitted ? 'Would get through' : `Blocked by ${grade.blockedBy ?? 'a filter'}` : 'Not graded yet'}</td><td>{grade ? engineName(grade.engine) : '—'}</td></tr>; })}</tbody>
    </table></div>
  </section>;
}

export function RuleList({ rules, lines, selected, onSelectionChange, disabled }: {
  rules: RuleResult; lines: GradeLine[]; selected: string[]; onSelectionChange: (terms: string[]) => void; disabled: boolean;
}) {
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const lineById = new Map(lines.map((line) => [line.id, line]));
  function toggle(term: string, checked: boolean): void {
    if (checked && selected.length < 12 && !selected.some((item) => item.toLowerCase() === term.toLowerCase())) onSelectionChange([...selected, term]);
    if (!checked) onSelectionChange(selected.filter((item) => item.toLowerCase() !== term.toLowerCase()));
  }
  function addManual(): void {
    const value = manual.trim();
    const invalid = validateTerm(value);
    if (invalid) { setManualError(invalid); return; }
    if (selected.length >= 12) { setManualError('Select no more than 12 terms.'); return; }
    if (selected.some((item) => item.toLowerCase() === value.toLowerCase())) { setManualError('That term is already selected.'); return; }
    onSelectionChange([...selected, value]); setManual(''); setManualError(null);
  }
  return <section className="console-section" aria-labelledby="accepted-rules-title">
    <div className="console-section-heading"><h3 id="accepted-rules-title">Proposed safe terms</h3><span>{rules.accepted.length} of 6 · local estimate</span></div>
    {rules.accepted.length === 0 ? <p className="console-empty">No safe rule found: every candidate would also match real chat. The tricks below need a bot rule.</p> : <ul className="console-rule-list">{rules.accepted.map((item) => {
      const example = lineById.get(item.exampleLineId); const checked = selected.some((term) => term.toLowerCase() === item.term.toLowerCase());
      return <li key={item.term}><label className="console-rule-select"><input type="checkbox" checked={checked} disabled={disabled || (!checked && selected.length >= 12)} onChange={(event) => toggle(item.term, event.currentTarget.checked)} /><strong>{item.term}</strong></label>
        <span>Catches {item.hits} attack lines · local estimate</span><span>{t('rules.zeroMatches')}</span>{example && <span className="console-rule-example">Example: {example.text}</span>}</li>;
    })}</ul>}
    {rules.rejected.length > 0 && <><h4>Rejected: matches real chat · local estimate</h4><ul className="console-rejected-list">{rules.rejected.map((item) => <li key={item.term}><strong>{item.term}</strong><span className="console-blurred-rejection">{t('rules.rejected', { hits: item.hits, example: item.fpExample })}</span></li>)}</ul></>}
    {rules.stillByTag.length > 0 && <><h4>Still getting through · local estimate</h4><ul className="console-tag-list">{rules.stillByTag.map((item) => <li key={item.tag}>{item.tag} · {item.count}{item.needsBotRule && <strong>{t('rules.botRule')}</strong>}</li>)}</ul></>}
    <div className="console-manual-term"><label htmlFor="manual-rule-term">Add a blocked term</label><div>
      <input id="manual-rule-term" value={manual} maxLength={500} disabled={disabled} aria-describedby="manual-term-help" onChange={(event) => { setManual(event.currentTarget.value); setManualError(validateTerm(event.currentTarget.value)); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addManual(); } }} />
      <button type="button" className="console-button console-button-quiet" disabled={disabled || !manual.trim() || Boolean(validateTerm(manual)) || selected.length >= 12} onClick={addManual}>Add term</button></div>
      <span id="manual-term-help" className={manualError ? 'console-field-error' : 'console-muted'} aria-live="polite">{manualError ?? '2 to 500 characters. A * may only go at the start or end of a word.'}</span></div>
    {selected.length > 0 && <div className="console-selected-terms"><h4>Selected terms ({selected.length})</h4><ul>{selected.map((term) => <li key={term}><span>{term}</span><button type="button" disabled={disabled} aria-label={`Remove ${term}`} onClick={() => toggle(term, false)}>Remove</button></li>)}</ul></div>}
  </section>;
}

export function ProofBars({ proof, results, selectedTerms, onPush, onUndo, busy, canUndo }: {
  proof: ProofResult | null; results: PushResult[]; selectedTerms: string[]; onPush: () => void; onUndo: () => void; busy: boolean; canUndo: boolean;
}) {
  const noMatches = Boolean(proof && proof.realChat.length === selectedTerms.length && selectedTerms.every((term) => proof.realChat.some((item) => item.term.toLowerCase() === term.toLowerCase() && item.count === 0)));
  return <section className="console-section" aria-labelledby="proof-title"><div className="console-section-heading"><h3 id="proof-title">Fresh-wave proof</h3><span>Local estimate</span></div>
    {!proof ? <p className="console-muted">Choose terms in the previous step to build a held-out wave.</p> : <>
      <p className="console-muted">Blocked attack lines before and after the selected terms · local estimate</p>
      <div className="console-proof-bars"><ProofBar label="Before" value={proof.blockedBefore} total={proof.total} /><ProofBar label="After" value={proof.blockedAfter} total={proof.total} /></div>
      <h4>Real-chat match checks · local estimate</h4>{proof.realChat.map((item) => <p className={item.count === 0 ? 'console-proof-safe' : 'console-proof-unsafe'} key={item.term}>{item.term}: {item.count === 0 ? t('rules.zeroMatches') : `${item.count} real-chat matches · local estimate${item.example ? ` · “${item.example}”` : ''}`}</p>)}
      {proof.stillByTag.length > 0 && <><h4>Still gets through · local estimate</h4><ul className="console-tag-list">{proof.stillByTag.map((item) => <li key={item.tag}>{item.tag} · {item.count}{item.needsBotRule && <strong>{t('rules.botRule')}</strong>}</li>)}</ul></>}
    </>}
    <div className="console-push-actions"><button type="button" className="console-button console-button-primary" disabled={busy || !proof || !proof.pushAllowed || !noMatches} onClick={onPush}>{t('push.button', { n: selectedTerms.length })}</button><button type="button" className="console-button console-button-danger" disabled={busy || !canUndo} onClick={onUndo}>{t('push.undo')}</button></div>
    {results.length > 0 && <ul className="console-push-results" aria-live="polite">{results.map((item, index) => <li className={`is-${item.status}`} key={`${item.term}-${index}`}><strong>{item.term}</strong><span>{item.status === 'failed' ? `Twitch rejected '${item.term}': ${item.error ?? 'Try again.'}` : item.status === 'added' ? 'Added to Twitch' : item.status === 'preexisting' ? 'Already in your Twitch filters' : 'Removed from Twitch'}</span></li>)}</ul>}
  </section>;
}

export function ReportCard({ report }: { report: ReportView }) {
  const grade = report.grading.find((item) => item.phase === 'A');
  return <section className="console-section console-report-card" aria-labelledby="report-card-title"><p className="console-context">After-action report</p><h3 id="report-card-title">Drill summary</h3>
    <div className="console-report-stats"><span>{report.score.attacksShown} attacks shown</span><span>{report.score.slipped} slipped through</span>{grade && <span>{grade.passed} of {grade.total} passed · {engineName(grade.engine)}</span>}{report.proof && <span>Fresh wave: {report.proof.blockedBefore} of {report.proof.total} blocked before, {report.proof.blockedAfter} after · local estimate; {report.proof.realChatMatches} real-chat matches · local estimate</span>}</div>
    <h4>Moderator scores</h4>{report.score.mods.length === 0 ? <p className="console-muted">No mods took part.</p> : <ul className="console-score-list">{report.score.mods.map((mod) => <li key={mod.participantId}><strong>{mod.name}{mod.isSim ? ' (sim)' : ''}</strong><span>{mod.caught} caught · {mod.falseBans} false bans · {mod.avgReactionMs === null ? '—' : `${(mod.avgReactionMs / 1000).toFixed(1)} s average`}</span></li>)}</ul>}
    {report.rules && <><h4>Proposed terms · local estimate</h4><p>{report.rules.accepted.length ? report.rules.accepted.map((item) => item.term).join(', ') : 'No safe terms proposed.'}</p><h4>Rejected terms · local estimate</h4><p>{report.rules.rejected.length ? report.rules.rejected.map((item) => item.term).join(', ') : 'None.'}</p><h4>Needs a bot rule · local estimate</h4><p>{report.rules.needsBotRule.length ? report.rules.needsBotRule.map((item) => `${item.tag} (${item.count})`).join(', ') : 'None.'}</p></>}
    <h4>Pushed terms</h4>{report.pushes.length === 0 ? <p className="console-muted">No terms were pushed.</p> : <ul className="console-push-results">{report.pushes.map((item, index) => <li key={`${item.term}-${index}`}><strong>{item.term}</strong><span>{item.status}{item.error ? ` · ${item.error}` : ''}</span></li>)}</ul>}
  </section>;
}

function ProofBar({ label, value, total }: { label: string; value: number; total: number }) {
  return <div className="console-proof-row"><div><strong>{label}</strong><span>{value} of {total} blocked · local estimate</span></div><progress max={total || 1} value={value} aria-label={`${label}: ${value} of ${total} attack lines blocked by the local estimate`} /></div>;
}

function engineName(engine: string): string {
  return engine === 'twitch' ? t('grade.engine.twitch') : engine === 'local' ? t('grade.engine.local') : 'mixed engines';
}
