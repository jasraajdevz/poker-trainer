/**
 * leaderboard.ts — a group board with no server behind it.
 *
 * There is nowhere to host a live leaderboard, so this one propagates instead.
 * Opening someone's share link files their score into your roster. Sharing the
 * board hands over everyone you know about in a single link. Pass that around a
 * group and everybody converges on the same table.
 *
 * What that means honestly: this is a snapshot of what YOU have been sent, not
 * a live global ranking. Someone who has not sent a link since Tuesday shows
 * Tuesday's numbers, and the view says so.
 *
 * Board payloads use tuple entries rather than objects, because the whole thing
 * has to survive being pasted into a chat window.
 */

import { ErrorTag, TAGS } from './mistakes';
import { SharedScore, cleanName } from './share';

const KEY = 'poker-trainer:roster';

/** Beyond this a link stops being pasteable, so the weakest entries are cut. */
export const MAX_ENTRIES = 12;

/** Drills needed before an entry is ranked rather than shown as provisional. */
export const RANKED_MIN_DRILLS = 20;

export type SortKey = 'levels' | 'accuracy' | 'ev' | 'drills' | 'speed';

export interface Column {
  key: SortKey;
  label: string;
  short: string;
  /** True when a bigger number is a better result. */
  higherWins: boolean;
  hint: string;
}

export const COLUMNS: Column[] = [
  { key: 'levels', label: 'Levels passed', short: 'Levels', higherWins: true, hint: 'How far through the curriculum' },
  { key: 'accuracy', label: 'Accuracy', short: 'Acc', higherWins: true, hint: 'Share of drills answered correctly' },
  { key: 'ev', label: 'EV per 100', short: 'bb/100', higherWins: false, hint: 'Big blinds given up per 100 drills — lower is better' },
  { key: 'drills', label: 'Drills', short: 'Drills', higherWins: true, hint: 'Total drills answered' },
  { key: 'speed', label: 'Median read', short: 'Read', higherWins: false, hint: 'Median L0 response time — lower is better' },
];

export interface Entry {
  score: SharedScore;
  /** True for the row belonging to whoever is looking. */
  isMe: boolean;
  /** Checksum held up when this entry arrived. */
  intact: boolean;
  /** Fewer than RANKED_MIN_DRILLS answered, so it is not ranked. */
  provisional: boolean;
  /** EV given up per 100 drills; 0 when nothing has been answered. */
  evPer100: number;
}

const idOf = (s: SharedScore): string => cleanName(s.n).toLowerCase() || 'anonymous';

export const evPer100 = (s: SharedScore): number =>
  s.d > 0 ? Math.round((s.e / s.d) * 100 * 10) / 10 : 0;

// ---------------------------------------------------------------------------
// Roster storage
// ---------------------------------------------------------------------------

export interface StoredEntry { s: SharedScore; intact: boolean; at: number; }

export function loadRoster(): StoredEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is StoredEntry =>
        !!e && typeof e === 'object' && 's' in e && !!(e as StoredEntry).s,
    );
  } catch {
    return [];
  }
}

export function saveRoster(entries: StoredEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES * 2)));
  } catch {
    /* quota or private mode */
  }
}

/**
 * File a score into the roster. One row per name; the newer arrival wins, since
 * a fresh link is by definition a more recent claim than an older one.
 */
export function mergeEntry(
  roster: StoredEntry[], score: SharedScore, intact: boolean, at: number,
): StoredEntry[] {
  const id = idOf(score);
  const rest = roster.filter((e) => idOf(e.s) !== id);
  return [...rest, { s: score, intact, at }];
}

export function mergeMany(
  roster: StoredEntry[], scores: SharedScore[], intact: boolean, at: number,
): StoredEntry[] {
  return scores.reduce((acc, s) => mergeEntry(acc, s, intact, at), roster);
}

/** Rewrite one row in place. Used by the owner's admin panel. */
export function updateEntry(
  roster: StoredEntry[], name: string, patch: Partial<SharedScore>,
): StoredEntry[] {
  const id = cleanName(name).toLowerCase();
  return roster.map((e) =>
    idOf(e.s) === id ? { ...e, s: { ...e.s, ...patch } } : e);
}

export function removeEntry(roster: StoredEntry[], name: string): StoredEntry[] {
  const id = cleanName(name).toLowerCase();
  return roster.filter((e) => idOf(e.s) !== id);
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

const valueOf = (s: SharedScore, key: SortKey): number => {
  switch (key) {
    case 'levels': return s.l;
    case 'accuracy': return s.a;
    case 'ev': return evPer100(s);
    case 'drills': return s.d;
    case 'speed': return s.t > 0 ? s.t : Number.MAX_SAFE_INTEGER; // no time = last
  }
};

/**
 * Build the table. Your own live score always replaces any stale copy of you
 * that arrived inside somebody else's board link.
 */
export function buildBoard(
  roster: StoredEntry[], me: SharedScore, sort: SortKey = 'levels',
): Entry[] {
  const withoutMe = roster.filter((e) => idOf(e.s) !== idOf(me));
  const rows: Entry[] = [
    { score: me, isMe: true, intact: true, provisional: me.d < RANKED_MIN_DRILLS, evPer100: evPer100(me) },
    ...withoutMe.map((e) => ({
      score: e.s,
      isMe: false,
      intact: e.intact,
      provisional: e.s.d < RANKED_MIN_DRILLS,
      evPer100: evPer100(e.s),
    })),
  ];

  const col = COLUMNS.find((c) => c.key === sort)!;
  const cmp = (a: Entry, b: Entry): number => {
    // Provisional entries sink below everyone who has done the work.
    if (a.provisional !== b.provisional) return a.provisional ? 1 : -1;
    const av = valueOf(a.score, sort);
    const bv = valueOf(b.score, sort);
    if (av !== bv) return col.higherWins ? bv - av : av - bv;
    // Ties break on levels, then accuracy, then volume.
    return (b.score.l - a.score.l) || (b.score.a - a.score.a) || (b.score.d - a.score.d);
  };
  return rows.sort(cmp).slice(0, MAX_ENTRIES);
}

export const leakLabel = (tag?: ErrorTag): string => (tag ? TAGS[tag].label : '—');

// ---------------------------------------------------------------------------
// Board links
// ---------------------------------------------------------------------------

type Tuple = [string, number, number, number, number, number, string];

const toTuple = (s: SharedScore): Tuple => [s.n, s.d, s.a, s.l, s.e, s.t, s.k ?? ''];

function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function utf8ToBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

const clamp = (n: unknown, lo: number, hi: number, dp = 0): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : lo;
  const c = Math.min(hi, Math.max(lo, v));
  return dp === 0 ? Math.round(c) : Math.round(c * 10 ** dp) / 10 ** dp;
};

export function encodeBoard(scores: SharedScore[]): string {
  const rows = scores.slice(0, MAX_ENTRIES).map(toTuple);
  const body = JSON.stringify(rows);
  return utf8ToBase64Url(JSON.stringify({ v: 1, b: rows, h: fnv1a(body) }));
}

export interface DecodedBoard { scores: SharedScore[]; intact: boolean; }

/** Decode a board payload. Every field is re-validated: this came from a link. */
export function decodeBoard(payload: string): DecodedBoard | null {
  let raw: { v?: unknown; b?: unknown; h?: unknown };
  try {
    raw = JSON.parse(base64UrlToUtf8(payload.trim())) as typeof raw;
  } catch {
    return null;
  }
  if (!raw || raw.v !== 1 || !Array.isArray(raw.b)) return null;

  const scores: SharedScore[] = [];
  for (const row of raw.b.slice(0, MAX_ENTRIES)) {
    if (!Array.isArray(row)) continue;
    const tag = typeof row[6] === 'string' && row[6] in TAGS ? (row[6] as ErrorTag) : undefined;
    scores.push({
      v: 1,
      n: cleanName(typeof row[0] === 'string' ? row[0] : '') || 'A friend',
      d: clamp(row[1], 0, 1_000_000),
      a: clamp(row[2], 0, 100),
      l: clamp(row[3], 0, 9),
      e: clamp(row[4], 0, 1_000_000, 1),
      t: clamp(row[5], 0, 3_600_000),
      ...(tag ? { k: tag } : {}),
    });
  }
  if (scores.length === 0) return null;
  return { scores, intact: raw.h === fnv1a(JSON.stringify(raw.b)) };
}

export function boardUrl(scores: SharedScore[]): string {
  const base = typeof location === 'undefined'
    ? 'https://jasraajdevz.github.io/poker-trainer/'
    : location.origin + location.pathname;
  return `${base}#b=${encodeBoard(scores)}`;
}

export function boardFromHash(hash: string): DecodedBoard | null {
  const m = /[#&]b=([A-Za-z0-9\-_]+)/.exec(hash);
  return m ? decodeBoard(m[1]!) : null;
}
