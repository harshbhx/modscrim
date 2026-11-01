import { Link, NavLink, Outlet } from 'react-router-dom';
import { SITE_URL, pages } from '../copy';
import '../styles/shell.css';

/** App shell: green header band, the page on the OS ground (chalk or green), green footer band. */
export function Layout() {
  const { nav } = pages;
  return (
    <>
      <a className="skip-link" href="#main">
        {nav.skip}
      </a>
      <header className="site-header on-green">
        <div className="wrap">
          <Link className="brand" to="/" aria-label={nav.home}>
            <img src="/img/modscrim-horizontal-reverse.svg" alt="" width="168" height="34" />
          </Link>
          <nav className="site-nav" aria-label={nav.main}>
            <NavLink to="/privacy">{nav.privacy}</NavLink>
          </nav>
        </div>
      </header>
      <main id="main" className="site-main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer on-green">
        <div className="wrap">
          <div className="site-footer-about">
            <img src="/img/modscrim-mark-small-reverse.svg" alt="" width="28" height="28" />
            <p>{nav.notTwitch}</p>
          </div>
          <nav aria-label={nav.footer}>
            <ul>
              <li>
                <a href={SITE_URL}>{nav.website}</a>
              </li>
              <li>
                <Link to="/privacy">{nav.privacy}</Link>
              </li>
              <li>
                <a href={`${SITE_URL}/terms`}>{nav.terms}</a>
              </li>
              <li>
                <a href="https://github.com/harshbhx/modscrim">{nav.source}</a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </>
  );
}
