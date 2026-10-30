import { Link, Outlet } from 'react-router-dom';
import { pages } from '../copy';

export function Layout() {
  return (
    <>
      <a className="skip-link" href="#main">
        {pages.nav.skip}
      </a>
      <div className="hazard-stripe" aria-hidden="true" />
      <header className="site-header">
        <Link to="/">{pages.appName}</Link>
        <Link to="/privacy">{pages.nav.privacy}</Link>
      </header>
      <main id="main" className="site-main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
