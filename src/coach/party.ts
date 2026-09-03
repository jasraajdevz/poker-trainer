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
/** A party cannot run longer than this. */
export const MAX_HOURS = 168;
/** How far ahead a party may be booked. */
export const MAX_LEAD_DAYS = 400;

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

/** Booked, but not started yet. Invites can still go out. */
export const isPending = (p: Party | null, now = Date.now()): boolean =>
  !!p && now < p.at;

/** Finished. Links stop carrying it. */
export const isOver = (p: Party | null, now = Date.now()): boolean =>
  !!p && now >= p.at + p.duration;

export const startsInMs = (p: Party | null, now = Date.now()): number =>
  p ? Math.max(0, p.at - now) : 0;

/** How long until the party next changes state, for scheduling a wake-up. */
export function msUntilNextChange(p: Party | null, now = Date.now()): number | null {
  if (!p) return null;
  if (now < p.at) return p.at - now;
  if (now < p.at + p.duration) return p.at + p.duration - now;
  return null;
}

export const remainingMs = (p: Party | null, now = Date.now()): number =>
  p ? Math.max(0, p.at + p.duration - now) : 0;

export function makeParty(name: string, host: string, hours = DEFAULT_HOURS, now = Date.now()): Party {
  const clean = (s: string): string =>
    [...s.replace(/\s+/g, ' ').trim()].slice(0, 24).join('').trim();
  return {
    name: clean(name) || 'Everybody',
    host: clean(host) || 'The owner',
    at: now,
    // A minute is the floor, so a quick test party is genuinely quick.
    duration: Math.max(1 / 60, Math.min(MAX_HOURS, hours)) * 3600_000,
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

/** A party pinned to an explicit window rather than "starting now". */
export function scheduleParty(
  name: string, host: string, startMs: number, endMs: number,
): Party {
  const base = makeParty(name, host, 1, startMs);
  const span = Math.max(60_000, Math.min(MAX_HOURS * 3600_000, endMs - startMs));
  return { ...base, at: startMs, duration: span };
}

/**
 * The next time a given month and day comes round, in the viewer's own zone.
 * Month is 1-12. If today is that day, today counts.
 */
export function nextOccurrence(month: number, day: number, now = Date.now()): Date {
  const d = new Date(now);
  const candidate = new Date(d.getFullYear(), month - 1, day, 0, 0, 0, 0);
  const endOfThatDay = candidate.getTime() + 24 * 3600_000;
  if (now < endOfThatDay) return candidate;
  return new Date(d.getFullYear() + 1, month - 1, day, 0, 0, 0, 0);
}

/** Combine a yyyy-mm-dd and a HH:MM into local epoch ms. */
export function localMs(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  if (!y || !m || !d) return Date.now();
  return new Date(y, m - 1, d, hh ?? 0, mm ?? 0, 0, 0).getTime();
}

export const toDateInput = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const toTimeInput = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** "Fri 5 Mar 2027, 12:00 AM to 7:00 PM (19h)" — no room for ambiguity. */
export function describeWindow(p: Party): string {
  const start = new Date(p.at);
  const end = new Date(p.at + p.duration);
  const day = start.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const hours = p.duration / 3600_000;
  const span = hours >= 1 ? `${Number(hours.toFixed(1))}h` : `${Math.round(p.duration / 60_000)}m`;
  const sameDay = start.toDateString() === end.toDateString();
  return `${day}, ${t(start)} to ${t(end)}${sameDay ? '' : ' (next day)'} · ${span}`;
}

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
    // A party may be booked ahead, so a future start is legitimate — but only
    // within a bounded window, or a crafted link could sit dormant for years.
    const startAt = Math.max(0, Math.min(Date.now() + MAX_LEAD_DAYS * 86_400_000, at));
    return scheduleParty(
      typeof name === 'string' ? name : '',
      typeof host === 'string' ? host : '',
      startAt,
      startAt + Math.max(60_000, Math.min(MAX_HOURS * 3600_000, duration)),
    );
  } catch {
    return null;
  }
}

export function partyFromHash(hash: string): Party | null {
  const m = /[#&]pty=([A-Za-z0-9\-_]+)/.exec(hash);
  return m ? decodeParty(m[1]!) : null;
}

/**
 * Append the party to an outgoing link. A booked-but-not-started party still
 * travels, so invitations can go out in advance; a finished one does not.
 */
export function withParty(url: string, p: Party | null): string {
  if (!p || isOver(p)) return url;
  return `${url}${url.includes('#') ? '&' : '#'}pty=${encodeParty(p)}`;
}
