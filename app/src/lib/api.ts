export type ApiErrorBody = { error?: { code?: string; message?: string; field?: string } };

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | undefined, readonly field: string | undefined) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiOptions = { apiBase?: string; fetcher?: typeof fetch };

export function apiUrl(path: string, apiBase = '/api'): string {
  return `${apiBase.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await (options.fetcher ?? fetch)(apiUrl(path, options.apiBase), {
    ...init, headers, credentials: init.credentials ?? 'same-origin'
  });
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof body === 'object' && body !== null ? (body as ApiErrorBody).error : undefined;
    throw new ApiError(detail?.message ?? `Request failed (${response.status}).`, response.status, detail?.code, detail?.field);
  }
  return body as T;
}

export type SocketTicket = { ticket: string; wsUrl: string };
export function fetchConsoleTicket(options: ApiOptions = {}): Promise<SocketTicket> {
  return apiFetch<SocketTicket>('ws-ticket', { method: 'POST' }, options);
}
export function fetchModTicket(participantToken: string, options: ApiOptions = {}): Promise<SocketTicket> {
  return apiFetch<SocketTicket>('mod/ticket', { method: 'POST', body: JSON.stringify({ participantToken }) }, options);
}


