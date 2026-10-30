/** The room socket URL for a ticket: `wss://<host>/ws/<kind>/<id>?ticket=…` (`ws:` when the base URL is plain HTTP). */
export function socketUrl(publicBaseUrl: string, kind: 'ch' | 'demo', id: string, ticket: string): string {
  const base = new URL(publicBaseUrl);
  return `${base.protocol === 'https:' ? 'wss' : 'ws'}://${base.host}/ws/${kind}/${encodeURIComponent(id)}?ticket=${encodeURIComponent(ticket)}`;
}
