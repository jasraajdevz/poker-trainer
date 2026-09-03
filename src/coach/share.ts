/**
 * share.ts — scores that travel in the URL, because there is no server.
 *
 * A score is packed into a compact object, base64url encoded, and hung off the
 * fragment so it never reaches a network log. A checksum rides along.
 *
 * IMPORTANT: the checksum detects a link that got mangled in transit or was
 * casually edited. It is NOT proof of anything. Anyone can craft a link
 * claiming any score, the same way anyone can type a number into a group chat.
 * Everything decoded here is untrusted input from a stranger, and is validated
 * and clamped before it is rendered.
 */

import { ErrorTag, TAGS } from './mistakes';
import { LEVEL_ORDER, Progress, levelProgress, median } from './progress';
import { LevelId, PASS_MARK } from '../curriculum/types';

export interface SharedScore {
  v: 1;
  /** Display name, free text supplied by whoever made the link. */
  n: string;
  /** Drills answered. */
  d: number;
  /** Accuracy, 0..100. */
  a: number;
  /** Levels passed, 0..9. */
  l: number;
  /** Big blinds of EV given up. */
  e: number;
  /** Median response time in ms; 0 when not tracked. */
  t: number;
  /** Top leak tag, if any. */
  k?: ErrorTag;
  /** Optional single-run headline, e.g. "L2 - Pot odds". */
  s?: string;
  /** Correct and total, for a single run. */
  c?: number;
  o?: number;
  /** Made in upgraded mode. */
  p?: 1;
}

const MAX_NAME = 24;

/**
 * Control characters, zero-width characters and bidi overrides. A display name
 * arrives from whoever built the link, so it gets stripped of anything that
 * could hide text or reverse it on screen.
 */
const CONTROL = new RegExp(
  '[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]',
  'g',
);

function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Strip hidden characters, collapse whitespace, cap the length. */
export function cleanName(raw: string): string {
  return [...raw.replace(CONTROL, '').replace(/\s+/g, ' ').trim()]
    .slice(0, MAX_NAME)
    .join('')
    .trim();
}

const clamp = (n: unknown, lo: number, hi: number, dp = 0): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : lo;
  const c = Math.min(hi, Math.max(lo, v));
  return dp === 0 ? Math.round(c) : Math.round(c * 10 ** dp) / 10 ** dp;
};

function utf8ToBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The payload without its checksum, in a stable order. */
function canonical(s: SharedScore): string {
  return JSON.stringify([
    s.v, s.n, s.d, s.a, s.l, s.e, s.t, s.k ?? '', s.s ?? '', s.c ?? -1, s.o ?? -1, s.p ?? 0,
  ]);
}

export function encodeScore(score: SharedScore): string {
  return utf8ToBase64Url(JSON.stringify({ ...score, h: fnv1a(canonical(score)) }));
}

export interface DecodedScore {
  score: SharedScore;
  /** False when the checksum does not match: mangled or hand-edited. */
  intact: boolean;
}

/** Decode a fragment payload. Null only when it is not a score at all. */
export function decodeScore(payload: string): DecodedScore | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(base64UrlToUtf8(payload.trim())) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || raw['v'] !== 1) return null;

  const tag = typeof raw['k'] === 'string' && raw['k'] in TAGS ? (raw['k'] as ErrorTag) : undefined;
  const score: SharedScore = {
    v: 1,
    n: cleanName(typeof raw['n'] === 'string' ? raw['n'] : '') || 'A friend',
    d: clamp(raw['d'], 0, 1_000_000),
    a: clamp(raw['a'], 0, 100),
    l: clamp(raw['l'], 0, LEVEL_ORDER.length),
    e: clamp(raw['e'], 0, 1_000_000, 1),
    t: clamp(raw['t'], 0, 3_600_000),
    ...(tag ? { k: tag } : {}),
    ...(typeof raw['s'] === 'string' ? { s: cleanName(raw['s']).slice(0, 32) } : {}),
    ...(raw['c'] !== undefined && Number(raw['c']) >= 0 ? { c: clamp(raw['c'], 0, 999) } : {}),
    ...(raw['o'] !== undefined && Number(raw['o']) > 0 ? { o: clamp(raw['o'], 1, 999) } : {}),
    ...(raw['p'] === 1 ? { p: 1 as const } : {}),
  };
  if (score.c !== undefined && score.o !== undefined && score.c > score.o) score.c = score.o;

  return { score, intact: raw['h'] === fnv1a(canonical(score)) };
}

export function shareUrl(score: SharedScore): string {
  const base = typeof location === 'undefined'
    ? 'https://jasraajdevz.github.io/poker-trainer/'
    : location.origin + location.pathname;
  return `${base}#s=${encodeScore(score)}`;
}

/** Read a score out of a URL fragment, if there is one. */
export function scoreFromHash(hash: string): DecodedScore | null {
  const m = /[#&]s=([A-Za-z0-9\-_]+)/.exec(hash);
  return m ? decodeScore(m[1]!) : null;
}

/** Everything a player has done so far, as a shareable card. */
export function buildScore(p: Progress, name: string, pro: boolean): SharedScore {
  const answered = p.history.length;
  const right = p.history.filter((r) => r.correct).length;
  const passed = LEVEL_ORDER.filter((id) => levelProgress(p, id).completed).length;
  const top = [...p.mistakes]
    .filter((m) => !m.retired)
    .sort((a, b) => b.evLostBB - a.evLostBB || b.occurrences - a.occurrences)[0];
  const l0 = p.history.filter((r) => r.levelId === 'L0');
  return {
    v: 1,
    n: cleanName(name) || 'Anonymous',
    d: answered,
    a: answered ? Math.round((right / answered) * 100) : 0,
    l: passed,
    e: Math.round(p.history.reduce((s, r) => s + r.evLostBB, 0) * 10) / 10,
    t: l0.length ? Math.round(median(l0.map((r) => r.elapsedMs))) : 0,
    ...(top ? { k: top.tag } : {}),
    ...(pro ? { p: 1 as const } : {}),
  };
}

/** One level run, as a shareable card. */
export function buildRunScore(
  base: SharedScore, levelId: LevelId, title: string,
  correct: number, total: number, medianMs: number,
): SharedScore {
  return {
    ...base,
    s: cleanName(`${levelId} - ${title}`).slice(0, 32),
    c: correct,
    o: total,
    t: Math.round(medianMs),
  };
}

export const runPassed = (s: SharedScore): boolean =>
  s.c !== undefined && s.o !== undefined && s.c / s.o >= PASS_MARK;

const NAME_KEY = 'poker-trainer:name';

export const loadName = (): string => {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
};

export const saveName = (n: string): void => {
  try { localStorage.setItem(NAME_KEY, cleanName(n)); } catch { /* private mode */ }
};
