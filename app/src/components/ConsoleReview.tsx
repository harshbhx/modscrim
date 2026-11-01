import { useState } from 'react';
import { validateTerm } from '@mfd/core';
import { consoleCopy, t } from '../copy';
import type { GradesView, ProofResult, PushResult, ReportView, RuleResult } from '../lib/consoleContracts';
import { Chip, Icon } from './ConsoleIcons';

export type GradeLine = { id: string; text: string; tactic?: string; trick?: string; tags: string[] };

/** Split the grade headline after its lead figure ("10 of 14") so the figure can be set large. Text is unchanged. */
function HeadlineText({ passed, total }: { passed: number; total: number }) {
  const full = t('grade.headline', { n: passed, total });
  const cut = full.indexOf(' attack');
  if (cut < 1) return <>{full}</>;
  return <><span className="console-grade-figure">{full.slice(0, cut)}</span>{full.slice(cut)}</>;
}

export function GradeTable({ lines, grades, phase, onGradeTwitch, onGradeLocal, grading, busy, localOnly = false }: {
  lines: GradeLine[]; grades: GradesView | null; phase: GradesView['phases']['A'];
  onGradeTwitch: () => void; onGradeLocal: () => void; grading: boolean; busy: boolean; localOnly?: boolean;
}) {
  const rows = new Map((grades?.lines ?? []).filter((grade) => grade.phase === 'A').map((grade) => [grade.lineId, grade]));
  const share = phase && phase.total > 0 ? Math.round((phase.passed / phase.total) * 100) : 0;
  return <section className="console-section console-grades" aria-labelledby="grade-table-title">
    <div className="console-section-heading"><h3 id="grade-table-title">Attack line grades</h3>{phase && <span>{phase.done} of {phase.total} · {engineName(phase.engine)}</span>}</div>
    {!phase && <p className="console-empty">Grade the ended drill to see which attack lines pass your filters.</p>}
    {phase && <div className="console-grade-summary">
      <div className="console-grade-copy">
        <p className="console-grade-headline"><HeadlineText passed={phase.passed} total={phase.total} /></p>
        <Chip icon="shield">{engineName(phase.engine)}</Chip>
      </div>
      <div className="console-split-bar" aria-hidden="true"><span className="is-through" style={{ width: `${share}%` }} /><span className="is-blocked" /></div>
    </div>}
    {grading && <p className="console-muted console-grade-status" role="status"><Icon name="clock" size={14} />{localOnly ? 'Local estimate in progress' : 'Twitch grading in progress'}: {phase?.done ?? 0} of {phase?.total ?? lines.filter((line) => line.tactic).length} checked.</p>}
    {phase?.nextAt && phase.nextAt > Date.now() && <p className="console-warning" role="status"><Icon name="alert" /><span>Twitch's grading limit for this hour is used up. {phase.engine === 'local' || phase.engine === 'mixed' ? 'Showing a local estimate; ' : ''}Twitch grading resumes at {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(phase.nextAt)}.</span></p>}
    <div className="console-grade-actions">{!localOnly && <button type="button" className="console-button console-button-primary" disabled={busy || grading} onClick={onGradeTwitch}>Grade with Twitch</button>}<button type="button" className={`console-button ${localOnly ? 'console-button-primary' : 'console-button-quiet'}`} disabled={busy} onClick={onGradeLocal}>{localOnly ? 'Run local estimate' : 'Use local estimate now'}</button></div>
    <div className="console-table-wrap" tabIndex={0} role="region" aria-label="Attack line grades table"><table className="console-grade-table"><thead><tr><th scope="col">Attack line</th><th scope="col">Tactic</th><th scope="col">Trick</th><th scope="col">Result</th><th scope="col">Engine</th></tr></thead>
      <tbody>{lines.filter((line) => line.tactic).map((line) => {
        const grade = rows.get(line.id);
        return <tr key={line.id}>
          <td>{line.text}</td>
          <td><span className="console-tag">{line.tactic}</span></td>
          <td>{line.trick ?? line.tags.join(', ')}</td>
          <td>{grade
            ? grade.permitted
              ? <Chip tone="warn" icon="alert">Would get through</Chip>
              : <Chip tone="ok" icon="shield">Blocked by {grade.blockedBy ?? 'a filter'}</Chip>
            : <span className="console-pending">Not graded yet</span>}</td>
          <td>{grade ? engineName(grade.engine) : '—'}</td>
        </tr>;
      })}</tbody>
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
  return <div className="console-rules">
    <section className="console-section" aria-labelledby="accepted-rules-title">
      <div className="console-section-heading"><h3 id="accepted-rules-title">Proposed safe terms</h3><span>{rules.accepted.length} of 6 · local estimate</span></div>
      {rules.accepted.length === 0 ? <p className="console-empty">No safe rule found: every candidate would also match real chat. The tricks below need a bot rule.</p> : <ul className="console-rule-list">{rules.accepted.map((item) => {
        const example = lineById.get(item.exampleLineId); const checked = selected.some((term) => term.toLowerCase() === item.term.toLowerCase());
        return <li key={item.term} className={checked ? 'is-selected' : undefined}>
          <label className="console-rule-select"><input type="checkbox" checked={checked} disabled={disabled || (!checked && selected.length >= 12)} onChange={(event) => toggle(item.term, event.currentTarget.checked)} /><strong>{item.term}</strong></label>
          <div className="console-rule-facts">
            <Chip icon="shield">Catches {item.hits} attack lines · local estimate</Chip>
            <Chip tone="ok" icon="check">{t('rules.zeroMatches')}</Chip>
          </div>
          {example && <span className="console-rule-example">Example: {example.text}</span>}
        </li>;
      })}</ul>}
    </section>
    {(rules.rejected.length > 0 || rules.stillByTag.length > 0) && <div className="console-rules-side">
      {rules.rejected.length > 0 && <section className="console-section">
        <h4>Rejected: matches real chat · local estimate</h4>
        <ul className="console-rejected-list">{rules.rejected.map((item) => <li key={item.term}><strong>{item.term}</strong><span className="console-blurred-rejection">{t('rules.rejected', { hits: item.hits, example: item.fpExample })}</span></li>)}</ul>
        <p className="console-hint"><Icon name="eye" size={14} />{consoleCopy.rules.revealHint}</p>
      </section>}
      {rules.stillByTag.length > 0 && <section className="console-section">
        <h4>Still getting through · local estimate</h4>
        <ul className="console-tag-list">{rules.stillByTag.map((item) => <li key={item.tag}>{item.tag} · {item.count}{item.needsBotRule && <strong>{t('rules.botRule')}</strong>}</li>)}</ul>
      </section>}
    </div>}
    <section className="console-section console-manual-term">
      <label htmlFor="manual-rule-term">Add a blocked term</label>
      <div>
        <input id="manual-rule-term" value={manual} maxLength={500} disabled={disabled} aria-describedby="manual-term-help" onChange={(event) => { setManual(event.currentTarget.value); setManualError(validateTerm(event.currentTarget.value)); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addManual(); } }} />
        <button type="button" className="console-button console-button-quiet" disabled={disabled || !manual.trim() || Boolean(validateTerm(manual)) || selected.length >= 12} onClick={addManual}>Add term</button></div>
      <span id="manual-term-help" className={manualError ? 'console-field-error' : 'console-muted'} aria-live="polite">{manualError ?? '2 to 500 characters. A * may only go at the start or end of a word.'}</span>
    </section>
    {selected.length > 0 && <section className="console-section console-selected-terms"><h4>Selected terms ({selected.length})</h4><ul>{selected.map((term) => <li key={term}><span>{term}</span><button type="button" disabled={disabled} aria-label={`Remove ${term}`} onClick={() => toggle(term, false)}>Remove</button></li>)}</ul></section>}
  </div>;
}

function pushStatusText(item: PushResult, demo: boolean): string {
  if (item.status === 'failed') return `${demo ? 'Simulated push failed' : `Twitch rejected '${item.term}'`}: ${item.error ?? 'Try again.'}`;
  if (item.status === 'added') return demo ? 'Added to this demo only' : 'Added to Twitch';
  if (item.status === 'preexisting') return demo ? 'Already in this demo' : 'Already in your Twitch filters';
  return demo ? 'Removed from this demo' : 'Removed from Twitch';
}

export function ProofBars({ proof, results, selectedTerms, onPush, onUndo, busy, canUndo, demo = false }: {
  proof: ProofResult | null; results: PushResult[]; selectedTerms: string[]; onPush: () => void; onUndo: () => void; busy: boolean; canUndo: boolean; demo?: boolean;
}) {
  const noMatches = Boolean(proof && proof.realChat.length === selectedTerms.length && selectedTerms.every((term) => proof.realChat.some((item) => item.term.toLowerCase() === term.toLowerCase() && item.count === 0)));
  return <section className="console-section console-proof" aria-labelledby="proof-title"><div className="console-section-heading"><h3 id="proof-title">Fresh-wave proof</h3><span>Local estimate</span></div>
    {!proof ? <><p className="console-empty">Choose terms in the previous step to build a held-out wave.</p></> : <>
      <p className="console-muted">Blocked attack lines before and after the selected terms · local estimate</p>
      <div className="console-proof-bars"><ProofBar label="Before" value={proof.blockedBefore} total={proof.total} /><ProofBar label="After" value={proof.blockedAfter} total={proof.total} tone="after" /></div>
      <div className="console-proof-grid">
        <div>
          <h4>Real-chat match checks · local estimate</h4>
          <div className="console-proof-checks">{proof.realChat.map((item) => <p className={item.count === 0 ? 'console-proof-safe' : 'console-proof-unsafe'} key={item.term}><Icon name={item.count === 0 ? 'check' : 'alert'} size={16} /><span><code>{item.term}</code>: {item.count === 0 ? t('rules.zeroMatches') : `${item.count} real-chat matches · local estimate${item.example ? ` · “${item.example}”` : ''}`}</span></p>)}</div>
        </div>
        {proof.stillByTag.length > 0 && <div>
          <h4>Still gets through · local estimate</h4>
          <ul className="console-tag-list">{proof.stillByTag.map((item) => <li key={item.tag}>{item.tag} · {item.count}{item.needsBotRule && <strong>{t('rules.botRule')}</strong>}</li>)}</ul>
        </div>}
      </div>
    </>}
    <div className="console-push-bar">
      <p className="console-push-note"><Icon name="shield" size={16} />{demo ? consoleCopy.push.demoNote : consoleCopy.push.liveNote}</p>
      <div className="console-push-actions"><button type="button" className="console-button console-button-primary" disabled={busy || !proof || !proof.pushAllowed || !noMatches} onClick={onPush}>{demo ? `Simulate push of ${selectedTerms.length} terms` : t('push.button', { n: selectedTerms.length })}</button><button type="button" className="console-button console-button-danger" disabled={busy || !canUndo} onClick={onUndo}>{demo ? 'Undo simulated push' : t('push.undo')}</button></div>
    </div>
    {results.length > 0 && <ul className="console-push-results" aria-live="polite">{results.map((item, index) => <li className={`is-${item.status}`} key={`${item.term}-${index}`}><strong>{item.term}</strong>
      <span><Chip tone={item.status === 'added' ? 'ok' : item.status === 'failed' ? 'warn' : 'neutral'} icon={item.status === 'added' ? 'check' : item.status === 'failed' ? 'alert' : item.status === 'removed' ? 'x' : 'info'}>{pushStatusText(item, demo)}</Chip></span></li>)}</ul>}
  </section>;
}

function gradeText(report: ReportView): string | null {
  const grade = report.grading.find((item) => item.phase === 'A');
  return grade ? `${grade.passed} of ${grade.total} passed · ${engineName(grade.engine)}` : null;
}

function reaction(value: number | null): string {
  return value === null ? '—' : `${(value / 1000).toFixed(1)} s average`;
}

export function ReportCard({ report }: { report: ReportView }) {
  const gradeLabel = gradeText(report);
  return <section className="console-section console-report-card" aria-labelledby="report-card-title"><p className="console-context">After-action report</p><h3 id="report-card-title">Drill summary</h3>
    <div className="console-report-stats">
      <span><b className="console-num">{report.score.attacksShown}</b> attacks shown</span>
      <span><b className="console-num">{report.score.slipped}</b> slipped through</span>
      {gradeLabel && <span>{gradeLabel}</span>}
      {report.proof && <span className="is-wide">Fresh wave: {report.proof.blockedBefore} of {report.proof.total} blocked before, {report.proof.blockedAfter} after · local estimate; {report.proof.realChatMatches} real-chat matches · local estimate</span>}
    </div>
    <div className="console-report-grid">
      <div>
        <h4>Moderator scores</h4>{report.score.mods.length === 0 ? <p className="console-empty">No mods took part.</p> : <ul className="console-score-list">{report.score.mods.map((mod) => <li key={mod.participantId}><strong>{mod.name}{mod.isSim ? ' (sim)' : ''}</strong><span><span className="console-num">{mod.caught}</span> caught · <span className="console-num">{mod.falseBans}</span> false bans · {reaction(mod.avgReactionMs)}</span></li>)}</ul>}
        {report.modHistory && report.modHistory.length > 0 && <><h4>Moderator history across drills</h4><ul className="console-score-list">{report.modHistory.map((mod) => <li key={mod.name}><strong>{mod.name}</strong><span className="console-history">{mod.drills.map((item, index) => <span key={item.drillId}>{`Drill ${index + 1}: ${item.caught} caught · ${item.falseBans} false bans · ${reaction(item.avgReactionMs)}`}</span>)}</span></li>)}</ul></>}
      </div>
      <div>
        {report.rules && <>
          <h4>Proposed terms · local estimate</h4>{report.rules.accepted.length ? <ul className="console-chip-list">{report.rules.accepted.map((item) => <li key={item.term}><Chip tone="ok" icon="check">{item.term}</Chip></li>)}</ul> : <p className="console-muted">No safe terms proposed.</p>}
          <h4>Rejected terms · local estimate</h4>{report.rules.rejected.length ? <ul className="console-chip-list">{report.rules.rejected.map((item) => <li key={item.term}><Chip tone="warn" icon="x">{item.term}</Chip></li>)}</ul> : <p className="console-muted">None.</p>}
          <h4>Needs a bot rule · local estimate</h4>{report.rules.needsBotRule.length ? <ul className="console-chip-list">{report.rules.needsBotRule.map((item) => <li key={item.tag}><Chip tone="info">{`${item.tag} (${item.count})`}</Chip></li>)}</ul> : <p className="console-muted">None.</p>}
        </>}
        <h4>Pushed terms</h4>{report.pushes.length === 0 ? <p className="console-muted">No terms were pushed.</p> : <ul className="console-push-results">{report.pushes.map((item, index) => <li key={`${item.term}-${index}`}><strong>{item.term}</strong><span><Chip tone={item.status === 'added' ? 'ok' : item.status === 'failed' ? 'warn' : 'neutral'}>{`${item.status}${item.error ? ` · ${item.error}` : ''}`}</Chip></span></li>)}</ul>}
      </div>
    </div>
  </section>;
}

function ProofBar({ label, value, total, tone }: { label: string; value: number; total: number; tone?: 'after' }) {
  return <div className={`console-proof-row${tone ? ` is-${tone}` : ''}`}><div><strong>{label}</strong><span><span className="console-num">{value}</span> of <span className="console-num">{total}</span> blocked · local estimate</span></div><progress max={total || 1} value={value} aria-label={`${label}: ${value} of ${total} attack lines blocked by the local estimate`} /></div>;
}

function engineName(engine: string): string {
  return engine === 'twitch' ? t('grade.engine.twitch') : engine === 'local' ? t('grade.engine.local') : 'mixed engines';
}
