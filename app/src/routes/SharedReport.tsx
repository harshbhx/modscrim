import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { SITE_URL, pages, t } from '../copy';
import { SharedReportZ } from '../lib/contracts';
import { percentOf } from '../lib/percent';
import '../styles/report.css';

/**
 * `/r/:reportId` (FR-27 P1, PRD F-20): the read-only report card a streamer chose to share. Numbers only
 * (S-06): the API sends counts, the grade and the fresh-wave proof, with mods shown as "Mod 1", "Mod 2".
 */

type Shared = z.infer<typeof SharedReportZ>;
type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'ready'; report: Shared };

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' });

function engineLabel(engine: 'twitch' | 'local' | 'mixed'): string {
  if (engine === 'twitch') return t('grade.engine.twitch');
  if (engine === 'local') return t('grade.engine.local');
  return pages.report.engineMixed;
}

export function SharedReport() {
  const { reportId = '' } = useParams();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState({ kind: 'loading' });
      try {
        const res = await fetch(`/api/public/reports/${encodeURIComponent(reportId)}`, {
          headers: { Accept: 'application/json' },
          ...(signal ? { signal } : {})
        });
        if (res.status === 404) return setState({ kind: 'missing' });
        if (!res.ok) return setState({ kind: 'error' });
        const parsed = SharedReportZ.safeParse(await res.json());
        setState(parsed.success ? { kind: 'ready', report: parsed.data } : { kind: 'error' });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setState({ kind: 'error' });
      }
    },
    [reportId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const r = pages.report;

  if (state.kind !== 'ready') {
    return (
      <section className="page" aria-labelledby="report-title" aria-busy={state.kind === 'loading'}>
        <div className="wrap">
          <div className="prose">
            <p className="eyebrow">{r.eyebrow}</p>
            {state.kind === 'loading' && (
              <h1 id="report-title" className="report-pending" role="status">
                {r.loading}
              </h1>
            )}
            {state.kind === 'missing' && (
              <>
                <h1 id="report-title">{r.notSharedTitle}</h1>
                <p>{r.notShared}</p>
                <Link to="/">{pages.back}</Link>
              </>
            )}
            {state.kind === 'error' && (
              <>
                <h1 id="report-title">{r.notSharedTitle}</h1>
                <p role="alert">{r.error}</p>
                <div className="actions">
                  <button type="button" className="btn btn-line" onClick={() => void load()}>
                    {r.retry}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  const { report } = state;
  const { card } = report;
  const caught = card.mods.reduce((sum, m) => sum + m.caught, 0);

  const passed = card.grade?.passed ?? null;
  const siteHost = SITE_URL.replace(/^https?:\/\//, '');

  return (
    <section className="page share" aria-labelledby="report-title">
      <div className="wrap">
        <article className="share-card on-green">
          <header className="share-head">
            <div className="share-brand">
              <img src="/img/modscrim-mark-small-color.svg" alt="" width="44" height="44" />
              <img src="/img/modscrim-wordmark-reverse.svg" alt="ModScrim" width="132" height="34" />
              <p className="eyebrow share-chip">{r.eyebrow}</p>
            </div>
            <h1 id="report-title">{report.channel.displayName}</h1>
            <p className="share-date">
              <time dateTime={new Date(report.createdAt).toISOString()}>{dateFormat.format(report.createdAt)}</time>
            </p>
          </header>

          <div className="share-hero">
            <section className="share-hero-grade" aria-labelledby="report-filters">
              <h2 id="report-filters">{r.filters}</h2>
              {card.grade ? (
                <div className="share-grade">
                  <span className="share-score" aria-hidden="true">
                    <b>{passed}</b>
                    <i>/ {card.grade.total}</i>
                  </span>
                  <p>
                    {t('grade.headline', { n: card.grade.passed, total: card.grade.total })}{' '}
                    <span className="share-engine">{engineLabel(card.grade.engine)}</span>
                  </p>
                </div>
              ) : (
                <p className="muted">{r.notGraded}</p>
              )}
            </section>

            <section className="share-hero-fresh" aria-labelledby="report-fresh">
              <h2 id="report-fresh">{r.fresh}</h2>
              {card.fresh ? (
                <div className="share-fresh">
                  <div className="share-bars" aria-hidden="true">
                    <span className="share-bar-row">
                      <i>{r.before}</i>
                      <span className="share-bar share-bar-before" style={{ width: `${percentOf(card.fresh.before, card.fresh.total)}%` }}>
                        {card.fresh.before}
                      </span>
                    </span>
                    <span className="share-bar-row">
                      <i>{r.after}</i>
                      <span className="share-bar share-bar-after" style={{ width: `${percentOf(card.fresh.after, card.fresh.total)}%` }}>
                        {card.fresh.after}
                      </span>
                    </span>
                  </div>
                  <p>{t2(r.freshLine, card.fresh)}</p>
                </div>
              ) : (
                <p className="muted">{r.notProven}</p>
              )}
            </section>
          </div>

          <dl className="share-stats">
            <div className="share-stat">
              <dt>{r.attacksShown}</dt>
              <dd>{card.attacksShown}</dd>
            </div>
            <div className="share-stat share-stat-caught">
              <dt>{r.caught}</dt>
              <dd>{caught}</dd>
            </div>
            <div className="share-stat share-stat-slipped">
              <dt>{r.slipped}</dt>
              <dd>{card.slipped}</dd>
            </div>
            <div className="share-stat">
              <dt>{r.termsPushed}</dt>
              <dd>{card.termsPushed}</dd>
            </div>
          </dl>

          <section className="share-mods" aria-labelledby="report-mods">
            <h2 id="report-mods">{r.mods}</h2>
            {card.mods.length === 0 ? (
              <p className="muted">{r.noMods}</p>
            ) : (
              <div className="share-table-wrap">
                <table className="share-table">
                  <thead>
                    <tr>
                      <th scope="col">{r.mod}</th>
                      <th scope="col">{r.caught}</th>
                      <th scope="col">{r.falseBans}</th>
                      <th scope="col">{r.reaction}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.mods.map((m) => (
                      <tr key={m.name}>
                        <th scope="row">{m.name}</th>
                        <td>{m.caught}</td>
                        <td>{m.falseBans}</td>
                        <td>{m.avgReactionMs === null ? '–' : t2(r.seconds, { s: (m.avgReactionMs / 1000).toFixed(1) })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <footer className="share-foot">
            <div className="share-cta-text">
              <p className="share-cta-lead">{r.ctaLead}</p>
              <p className="share-domain">{siteHost}</p>
            </div>
            <Link className="btn btn-orange" to="/">
              {r.cta}
            </Link>
            <p className="share-note">{r.note}</p>
          </footer>
        </article>
      </div>
    </section>
  );
}

/** Fill `{name}` placeholders in a page string (the copy deck's `t` covers only PRD §9.6 keys). */
function t2(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}
