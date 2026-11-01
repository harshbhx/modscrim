import { Link } from 'react-router-dom';
import { pages } from '../copy';
import '../styles/shell.css';

/** Stand-in for screens that later tickets build (T-20 to T-25, T-31). */
export function Placeholder({ title }: { title: string }) {
  return (
    <section className="page page-inner notice" aria-labelledby="placeholder-title">
      <div className="wrap notice-wrap">
        <div className="notice-text">
          <h1 id="placeholder-title">{title}</h1>
          <p>{pages.placeholder}</p>
          <Link className="btn btn-orange" to="/">{pages.back}</Link>
        </div>
      </div>
    </section>
  );
}

export function NotFound() {
  return (
    <section className="page page-inner notice" aria-labelledby="not-found-title">
      <div className="wrap notice-wrap">
        <h1 id="not-found-title" className="notice-plate">404</h1>
        <div className="notice-text">
          <p className="lead">{pages.notFound}</p>
          <Link className="btn btn-orange" to="/">{pages.back}</Link>
        </div>
      </div>
    </section>
  );
}
