import { Link } from 'react-router-dom';
import { pages } from '../copy';

/** Stand-in for screens that later tickets build (T-20 to T-25, T-31). */
export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <h1>{title}</h1>
      <p>{pages.placeholder}</p>
      <Link to="/">{pages.back}</Link>
    </>
  );
}

export function NotFound() {
  return (
    <>
      <h1>404</h1>
      <p>{pages.notFound}</p>
      <Link to="/">{pages.back}</Link>
    </>
  );
}
