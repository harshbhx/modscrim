import { SITE_URL, copy, pages } from '../copy';

/**
 * `/privacy`: the copy-deck summary plus a link to the one full policy on the website,
 * so there are never two policies to keep in step.
 */
export function Privacy() {
  const { privacy } = pages;
  return (
    <section className="page" aria-labelledby="privacy-title">
      <div className="wrap">
        <div className="prose">
          <h1 id="privacy-title">{privacy.title}</h1>
          <p className="lead">{privacy.lead}</p>
          <p>{copy['privacy.short']}</p>
          <p>{privacy.deleteNote}</p>
          <p>{privacy.full}</p>
          <div className="actions">
            <a className="btn btn-line" href={`${SITE_URL}/privacy`}>
              {privacy.link}
            </a>
          </div>
          <p className="muted contact">
            {privacy.contact} <a href={`mailto:${privacy.email}`}>{privacy.email}</a>
          </p>
        </div>
      </div>
    </section>
  );
}
