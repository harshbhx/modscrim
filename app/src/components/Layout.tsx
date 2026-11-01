import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { SITE_URL, pages } from '../copy';
import '../styles/shell.css';

/**
 * Header and footer links. The marketing site's pages are served from SITE_URL
 * (site/*.html, extensionless on Cloudflare Pages); Demo and Privacy stay in the app.
 */
function siteLinks() {
  const { nav } = pages;
  return [
    { label: nav.howItWorks, href: `${SITE_URL}/how-it-works` },
    { label: nav.forMods, href: `${SITE_URL}/mods` },
    { label: nav.safety, href: `${SITE_URL}/safety` },
    { label: nav.faq, href: `${SITE_URL}/faq` }
  ];
}

function NavItems() {
  const { nav } = pages;
  const links = siteLinks();
  return (
    <>
      {links.slice(0, 3).map((link) => (
        <a key={link.href} href={link.href}>
          {link.label}
        </a>
      ))}
      <NavLink to="/demo">{nav.demo}</NavLink>
      <a href={links[3]?.href}>{links[3]?.label}</a>
      <NavLink to="/privacy">{nav.privacy}</NavLink>
    </>
  );
}

/** App shell: green header band, the page on the OS ground (chalk or dugout), green footer band. */
export function Layout() {
  const { nav } = pages;
  const location = useLocation();
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
            <NavItems />
          </nav>
          {/* Small screens: the same links in a disclosure; remounted per route so it closes after a click. */}
          <details className="site-menu" key={location.pathname}>
            <summary>{nav.menu}</summary>
            <nav aria-label={nav.menuNav}>
              <NavItems />
            </nav>
          </details>
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
          <nav className="site-footer-nav" aria-label={nav.footer}>
            <div>
              <h2>{nav.product}</h2>
              <ul>
                <li>
                  <a href={`${SITE_URL}/how-it-works`}>{nav.howItWorks}</a>
                </li>
                <li>
                  <a href={`${SITE_URL}/setup`}>{nav.setup}</a>
                </li>
                <li>
                  <a href={`${SITE_URL}/overlay`}>{nav.overlay}</a>
                </li>
              </ul>
            </div>
            <div>
              <h2>{nav.trust}</h2>
              <ul>
                <li>
                  <a href={`${SITE_URL}/safety`}>{nav.safety}</a>
                </li>
                <li>
                  <Link to="/privacy">{nav.privacy}</Link>
                </li>
                <li>
                  <a href={`${SITE_URL}/terms`}>{nav.terms}</a>
                </li>
              </ul>
            </div>
            <div>
              <h2>{nav.more}</h2>
              <ul>
                <li>
                  <a href={`${SITE_URL}/faq`}>{nav.faq}</a>
                </li>
                <li>
                  <a href="https://github.com/harshbhx/modscrim">{nav.source}</a>
                </li>
                <li>
                  <a href="https://github.com/harshbhx/modscrim/issues">{nav.report}</a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </footer>
    </>
  );
}
