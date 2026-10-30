const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = {
  enc(buf: ArrayBuffer | Uint8Array): string {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = ''; for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(s: string): Uint8Array {
    const p = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(p + '==='.slice((p.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

const aesKey = (keyB64: string) =>
  crypto.subtle.importKey('raw', b64u.dec(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt']);

/** AES-256-GCM, random 96-bit IV, additional data binds the ciphertext to its owner. */
export async function seal(plain: string, keyB64: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    await aesKey(keyB64), enc.encode(plain));
  return `v1.${b64u.enc(iv)}.${b64u.enc(ct)}`;
}

export async function unseal(sealed: string, keyB64: string, aad: string): Promise<string> {
  const [v, iv, ct] = sealed.split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('bad sealed value');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u.dec(iv), additionalData: enc.encode(aad) },
    await aesKey(keyB64), b64u.dec(ct));
  return dec.decode(pt);
}
