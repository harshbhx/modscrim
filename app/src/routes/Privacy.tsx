import { SITE_URL, copy, pages } from '../copy';
import '../styles/shell.css';

/**
 * `/privacy`: the copy-deck summary plus a link to the one full policy on the website,
 * so there are never two policies to keep in step.
 */
export function Privacy() {
  const { privacy } = pages;
  return (
    <section className="page page-inner legal" aria-labelledby="privacy-title">
      <header className="page-head on-green">
        <div className="wrap">
          <h1 id="privacy-title">{privacy.title}</h1>
          <p className="lead">{privacy.lead}</p>
        </div>
      </header>
      <div className="wrap legal-body">
        <div className="prose legal-prose">
          <p>{copy['privacy.short']}</p>
          <p>{privacy.deleteNote}</p>
        </div>
        <aside className="legal-card">
          <p>{privacy.full}</p>
          <div className="actions">
            <a className="btn btn-line" href={`${SITE_URL}/privacy`}>
              {privacy.link}
            </a>
          </div>
          <p className="muted contact">
            {privacy.contact} <a href={`mailto:${privacy.email}`}>{privacy.email}</a>
          </p>
        </aside>
      </div>
    </section>
  );
}
