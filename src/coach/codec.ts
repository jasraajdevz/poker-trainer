/**
 * codec.ts — the one copy of the link-payload primitives.
 *
 * share.ts, leaderboard.ts, party.ts and pro.ts all hash and base64url the
 * same way; four private copies had drifted into existence. The algorithms
 * are frozen: every existing share/board/party link in the wild validates
 * against these exact bytes, so changing them is a breaking change to links.
 */

/** FNV-1a over UTF-16 code units, as every checksum in the app has always used. */
export function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** UTF-8 string -> URL-safe unpadded base64. */
export function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** URL-safe base64 -> UTF-8 string. Throws on malformed input; callers catch. */
export function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}
