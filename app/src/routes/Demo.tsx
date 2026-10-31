import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiFetch, ApiError } from '../lib/api.js';
import { pages } from '../copy.js';
import '../styles/demo.css';

const DemoRoomZ = z.object({ room: z.string().min(1), joinCode: z.string().regex(/^\d{6}$/), modUrl: z.string().url() });

export function Demo() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  async function start(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (starting) return;
    setStarting(true);
    setError('');
    try {
      const value: unknown = await apiFetch('demo', { method: 'POST' });
      const parsed = DemoRoomZ.safeParse(value);
      if (!parsed.success) throw new Error('A demo room could not be created. Try again.');
      navigate(`/demo/${encodeURIComponent(parsed.data.room)}`, { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : 'A demo room could not be created. Try again.');
      setStarting(false);
    }
  }

  return <section className="page demo-page" aria-labelledby="demo-title">
    <div className="wrap demo-wrap">
      <div className="demo-intro">
        <p className="demo-eyebrow">Private practice room</p>
        <h1 id="demo-title">Try a fire drill with your mod team</h1>
        <p className="demo-lead">{pages.demo.intro}</p>
        <ul className="demo-points">
          <li>A separate room for this visit</li>
          <li>A fake channel with Kai (sim)</li>
          <li>Local filter estimates and a simulated push</li>
        </ul>
        {error && <p className="demo-error" role="alert">{error}</p>}
        <form onSubmit={(event) => void start(event)}>
          <button className="btn btn-orange demo-start" type="submit" disabled={starting}>
            {starting ? 'Starting your demo…' : pages.demo.start}
          </button>
        </form>
      </div>
      <aside className="demo-card" aria-label="How the demo works">
        <span className="demo-card-mark" aria-hidden="true">M</span>
        <p className="demo-card-kicker">No Twitch account needed</p>
        <h2>Practice safely</h2>
        <p>Every chat line stays inside the practice room. Nothing is posted to a real Twitch channel.</p>
        <p className="demo-card-time">Your room closes after two hours without activity.</p>
      </aside>
    </div>
  </section>;
}
