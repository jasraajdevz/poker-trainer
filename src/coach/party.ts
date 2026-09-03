/**
 * party.ts — birthday mode.
 *
 * There is no server, so a party spreads the way everything else here spreads:
 * it rides in the links you share. The owner starts one from the admin panel,
 * and from then on every score and board link they hand out carries a `#pty=`
 * payload. Anyone who opens one drops straight into the disco, starts earning
 * birthday points, and their own links carry the party onward.
 *
 * A party has an expiry so a link found in a chat log next March does not
 * relaunch the confetti.
 */

const PARTY_KEY = 'poker-trainer:party';
const POINTS_KEY = 'poker-trainer:bp';
const SEEN_KEY = 'poker-trainer:party-seen';

export const DEFAULT_HOURS = 24;

/** Points, all earned by doing something. */
export const JOIN_BONUS = 100;
export const DRILL_POINTS = 25;
export const CORRECT_BONUS = 25;
export const TAP_POINTS = 5;
export const TAP_COOLDOWN_MS = 120;
export const TAP_CAP = 500;

export interface Party {
  /** Whose birthday it is. Free text from the owner. */
  name: string;
  /** Who started it. */
  host: string;
  /** Epoch ms. */
  at: number;
  /** How long it runs, ms. */
  duration: number;
}

export const isLive = (p: Party | null, now = Date.now()): boolean =>
  !!p && now >= p.at && now < p.at + p.duration;

export const remainingMs = (p: Party | null, now = Date.now()): number =>
  p ? Math.max(0, p.at + p.duration - now) : 0;

export function makeParty(name: string, host: string, hours = DEFAULT_HOURS, now = Date.now()): Party {
  const clean = (s: string): string =>
    [...s.replace(/\s+/g, ' ').trim()].slice(0, 24).join('').trim();
  return {
    name: clean(name) || 'Everybody',
    host: clean(host) || 'The owner',
    at: now,
    duration: Math.max(1, Math.min(168, hours)) * 3600_000,
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const read = <T>(key: string, fallback: T): T => {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode */ }
};

export function loadParty(): Party | null {
  const p = read<Party | null>(PARTY_KEY, null);
  if (!p || typeof p.at !== 'number' || typeof p.duration !== 'number') return null;
  return { ...p, name: String(p.name ?? ''), host: String(p.host ?? '') };
}

export const saveParty = (p: Party | null): void => write(PARTY_KEY, p);

export const loadPoints = (): number => {
  const n = read<number>(POINTS_KEY, 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export const savePoints = (n: number): void =>
  write(POINTS_KEY, Math.max(0, Math.min(1_000_000, Math.floor(n))));

/** Party ids already joined, so the join bonus is paid exactly once each. */
const seen = (): number[] => {
  const v = read<number[]>(SEEN_KEY, []);
  return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : [];
};

/** Pay the join bonus if this is a party we have not been to before. */
export function claimJoinBonus(p: Party, points: number): { points: number; fresh: boolean } {
  const list = seen();
  if (list.includes(p.at)) return { points, fresh: false };
  write(SEEN_KEY, [...list, p.at].slice(-20));
  return { points: points + JOIN_BONUS, fresh: true };
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

export interface Title { label: string; emoji: string; blurb: string; }

/** Earned by rank on birthday points. First place is the one that matters. */
export const TITLES: Title[] = [
  { label: 'Disco Monarch', emoji: '👑', blurb: 'Most birthday points. Undisputed.' },
  { label: 'Glitter Lieutenant', emoji: '🪩', blurb: 'Second on the dancefloor.' },
  { label: 'Confetti Sergeant', emoji: '🎉', blurb: 'Third, and still shining.' },
];

export const titleForRank = (rank: number): Title | null => TITLES[rank] ?? null;

/** Everyone at the party who scored anything gets called something. */
export const PARTYGOER = 'Partygoer';

// ---------------------------------------------------------------------------
// Link payload
// ---------------------------------------------------------------------------

function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const b64url = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const unb64url = (s: string): string => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function encodeParty(p: Party): string {
  const row = [p.name, p.host, p.at, p.duration];
  return b64url(JSON.stringify({ v: 1, p: row, h: fnv1a(JSON.stringify(row)) }));
}

export function decodeParty(payload: string): Party | null {
  try {
    const raw = JSON.parse(unb64url(payload.trim())) as { v?: unknown; p?: unknown };
    if (raw.v !== 1 || !Array.isArray(raw.p) || raw.p.length < 4) return null;
    const [name, host, at, duration] = raw.p as [unknown, unknown, unknown, unknown];
    if (typeof at !== 'number' || !Number.isFinite(at)) return null;
    if (typeof duration !== 'number' || !Number.isFinite(duration)) return null;
    return makeParty(
      typeof name === 'string' ? name : '',
      typeof host === 'string' ? host : '',
      Math.max(1, Math.min(168, duration / 3600_000)),
      Math.max(0, Math.min(Date.now() + 3600_000, at)),
    );
  } catch {
    return null;
  }
}

export function partyFromHash(hash: string): Party | null {
  const m = /[#&]pty=([A-Za-z0-9\-_]+)/.exec(hash);
  return m ? decodeParty(m[1]!) : null;
}

/** Append the party to any link that is going out while one is running. */
export function withParty(url: string, p: Party | null): string {
  if (!isLive(p)) return url;
  return `${url}${url.includes('#') ? '&' : '#'}pty=${encodeParty(p!)}`;
}
