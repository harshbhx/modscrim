import { Link } from 'react-router-dom';
import { pages } from '../copy';

/** `/`: the app's own entry page, in step with the website's home copy. */
export function Landing() {
  const { landing } = pages;
  return (
    <section className="hero on-green" aria-labelledby="landing-title">
      <div className="wrap">
        <h1 id="landing-title">{landing.title}</h1>
        <p className="lead">{landing.pitch}</p>
        <div className="actions">
          {/* A plain anchor: the Worker answers /auth/login with a redirect to Twitch. */}
          <a className="btn btn-orange" href="/auth/login">
            {landing.signIn}
          </a>
          <Link className="btn btn-line" to="/demo">
            {landing.demo}
          </Link>
        </div>
      </div>
    </section>
  );
}
