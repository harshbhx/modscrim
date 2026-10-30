import { Link } from 'react-router-dom';
import { pages } from '../copy';

export function Landing() {
  return (
    <>
      <h1>{pages.appName}</h1>
      <p>{pages.landing.pitch}</p>
      <div className="actions">
        {/* A plain anchor: the Worker answers /auth/login with a redirect to Twitch. */}
        <a className="button button-primary" href="/auth/login">
          {pages.landing.signIn}
        </a>
        <Link className="button button-secondary" to="/demo">
          {pages.landing.demo}
        </Link>
      </div>
    </>
  );
}
