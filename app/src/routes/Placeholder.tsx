import { Link } from 'react-router-dom';
import { pages } from '../copy';

/** Stand-in for screens that later tickets build (T-20 to T-25, T-31). */
export function Placeholder({ title }: { title: string }) {
  return (
    <section className="page" aria-labelledby="placeholder-title">
      <div className="wrap">
        <div className="prose">
          <h1 id="placeholder-title">{title}</h1>
          <p>{pages.placeholder}</p>
          <Link to="/">{pages.back}</Link>
        </div>
      </div>
    </section>
  );
}

export function NotFound() {
  return (
    <section className="page" aria-labelledby="not-found-title">
      <div className="wrap">
        <div className="prose">
          <h1 id="not-found-title">404</h1>
          <p>{pages.notFound}</p>
          <Link to="/">{pages.back}</Link>
        </div>
      </div>
    </section>
  );
}
