function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomId(bytes = 16): string {
  return bytesToBase64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** A six-digit join code with unbiased digit selection. */
export function joinCode(): string {
  let code = '';
  while (code.length < 6) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    for (const byte of bytes) {
      if (byte < 250) code += String(byte % 10);
      if (code.length === 6) break;
    }
  }
  return code;
}

/** 24 random bytes encoded as 32 base64url characters. */
export function overlayKey(): string {
  return randomId(24);
}

/** 16 random bytes encoded as base64url for report share links. */
export function reportId(): string {
  return randomId(16);
}
