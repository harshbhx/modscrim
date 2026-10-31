import { useMemo } from 'react';
import { pages } from '../copy.js';
import { createDemoQrMatrix } from '../lib/demoQr.js';
import { CopyField } from './CopyField.js';

export function DemoJoinQr({ url }: { url: string }) {
  const qr = useMemo(() => createDemoQrMatrix(url), [url]);
  return <aside className="demo-join-card" aria-label="Join this demo on a phone">
    <div className="demo-join-copy">
      <p className="console-context">Practice together</p>
      <h2>{pages.demo.phone}</h2>
      <p className="console-muted">Scan to open the moderator view on your phone.</p>
      <CopyField label="Mod link" value={url} />
    </div>
    <svg className="demo-join-qr" role="img" aria-label="QR code for the demo moderator link" viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`}>
      <rect x={-2} y={-2} width={qr.size + 4} height={qr.size + 4} fill="white" />
      <path d={qr.path} fill="#082319" />
    </svg>
  </aside>;
}
