import { Link } from 'react-router-dom';
import { pages } from '../copy';
import '../styles/landing.css';

/** `/`: the app's own entry page, in step with the website's home copy. */
export function Landing() {
  const { landing } = pages;
  return (
    <section className="landing" aria-labelledby="landing-title">
      <div className="wrap landing-inner">
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
      </div>
    </section>
  );
}
