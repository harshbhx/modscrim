import { useId, useState } from 'react';

export function CopyField({ label, value }: { label: string; value: string }) {
  const id = useId();
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return <div className="console-copy-field">
    <label htmlFor={id}>{label}</label>
    <div>
      <input id={id} readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
      <button type="button" className="console-button console-button-quiet" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
    <span className="console-sr-only" aria-live="polite">{copied ? `${label} copied.` : ''}</span>
  </div>;
}
