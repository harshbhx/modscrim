import { Link } from 'react-router-dom';
import { copy, pages } from '../copy';
import '../styles/landing.css';

/**
 * A static, aria-hidden picture of the mod view, drawn with the real mod-view
 * classes (mod.css) so it can never drift from the product. Sample lines only:
 * every link ends in .invalid, the slur placeholder is the redaction bar, and
 * there are no scores, times or counts.
 */
function ModViewPreview() {
  const { landing } = pages;
  return (
    <figure className="landing-preview">
      <div className="landing-frame" aria-hidden="true">
        <div className="landing-frame-top">
          <span className="landing-frame-room">
            <span className="landing-frame-avatar">M</span>
            Practice room
          </span>
          <span className="mod-connection mod-connection-open">Connected</span>
        </div>
        <div className="mod-practice-banner">{copy['banner.practice']}</div>
        <div className="mod-chat-panel landing-chat">
          <ol className="mod-chat-list">
            <li className="mod-line mod-line-open">
              <div className="mod-line-head">
                <span className="mod-line-user">viewer_8841</span>
              </div>
              <p className="mod-line-text">
                want free followers? claim at <span className="mod-link-segment">fre3-fol.invalid/claim</span>
              </p>
              <div className="mod-actions">
                <span className="mod-action-button">
                  <span>Delete</span>
                  <kbd>D</kbd>
                </span>
                <span className="mod-action-button">
                  <span>Timeout</span>
                  <kbd>T</kbd>
                </span>
                <span className="mod-action-button" aria-label="Ban">
                  <span>Ban</span>
                  <kbd>B</kbd>
                </span>
              </div>
            </li>
            <li className="mod-line mod-line-acted">
              <div className="mod-line-head">
                <span className="mod-line-user">bot_wave_02</span>
              </div>
              <p className="mod-line-text">
                BUY cheap v1ewers now <span className="mod-link-segment">cheap-v.invalid</span>
              </p>
              <p className="mod-feedback mod-feedback-caught">Deleted by you</p>
            </li>
            <li className="mod-line mod-line-slipped">
              <div className="mod-line-head">
                <span className="mod-line-user">raider_x</span>
              </div>
              <p className="mod-line-text">
                go away{' '}
                <span className="mod-slur-segment" role="img" aria-label="Redacted term">
                  ▇▇▇▇▇
                </span>{' '}
                crew
              </p>
              <p className="mod-feedback mod-feedback-slipped">{copy['mod.slipped']}</p>
            </li>
          </ol>
        </div>
      </div>
      <figcaption>{landing.previewCaption}</figcaption>
    </figure>
  );
}

/** `/`: the app's own entry page, in step with the website's home copy. */
export function Landing() {
  const { landing } = pages;
  return (
    <section className="landing" aria-labelledby="landing-title">
      <div className="wrap landing-hero">
        <div className="landing-copy">
          <h1 id="landing-title" className="landing-title">
            {landing.title}
          </h1>
          <p className="landing-pitch">{landing.pitch}</p>
          <div className="landing-actions">
            {/* A plain anchor: the Worker answers /auth/login with a redirect to Twitch. */}
            <a className="landing-action landing-action-primary" href="/auth/login">
              {landing.signIn}
            </a>
            <Link className="landing-action landing-action-secondary" to="/demo">
              {landing.demo}
            </Link>
          </div>
          <p className="landing-note">{landing.note}</p>
        </div>
        <ModViewPreview />
      </div>
      <div className="wrap landing-steps-wrap">
        <h2 className="landing-steps-title">{landing.stepsTitle}</h2>
        <ol className="landing-steps">
          {landing.steps.map((step, index) => (
            <li key={step.title}>
              <span className="landing-step-plate" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
