/** Cookie names and attributes from SRS §5.13. All are HttpOnly, Secure, SameSite=Lax, Path=/. */
export const COOKIES = {
  streamer: { name: '__Host-mfd_s', maxAge: 7 * 24 * 60 * 60 },
  demo: { name: '__Host-mfd_demo', maxAge: 2 * 60 * 60 },
  oauth: { name: '__Host-mfd_oauth', maxAge: 10 * 60 }
} as const;

export type CookieKind = keyof typeof COOKIES;

const ATTRIBUTES = 'Path=/; HttpOnly; Secure; SameSite=Lax';

export function setCookie(kind: CookieKind, value: string): string {
  const { name, maxAge } = COOKIES[kind];
  return `${name}=${value}; ${ATTRIBUTES}; Max-Age=${maxAge}`;
}

export function clearCookie(kind: CookieKind): string {
  return `${COOKIES[kind].name}=; ${ATTRIBUTES}; Max-Age=0`;
}

export function readCookie(header: string | null | undefined, kind: CookieKind): string | undefined {
  if (!header) return undefined;
  const prefix = `${COOKIES[kind].name}=`;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length) || undefined;
  }
  return undefined;
}
