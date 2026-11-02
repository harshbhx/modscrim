import { useMemo } from 'react';
import { pages } from '../copy.js';
import { createDemoQrMatrix } from '../lib/demoQr.js';
import { CopyField } from './CopyField.js';
import '../styles/demo.css';

/** Client-side QR for a join URL. Generated from the string only, no network calls. */
export function JoinQrCode({ url, label }: { url: string; label: string }) {
  const qr = useMemo(() => createDemoQrMatrix(url), [url]);
  return <svg className="demo-join-qr" role="img" aria-label={label} viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`}>
    <rect x={-2} y={-2} width={qr.size + 4} height={qr.size + 4} className="demo-join-qr-ground" />
    <path d={qr.path} className="demo-join-qr-ink" />
  </svg>;
}

export function DemoJoinQr({ url }: { url: string }) {
  return <aside className="demo-join-card" aria-label="Join this demo on a phone">
    <div className="demo-join-copy">
      <p className="console-context">Practice together</p>
      <h2>{pages.demo.phone}</h2>
      <p className="console-muted">Scan to open the moderator view on your phone.</p>
      <CopyField label="Mod link" value={url} />
    </div>
    <JoinQrCode url={url} label="QR code for the demo moderator link" />
  </aside>;
}
