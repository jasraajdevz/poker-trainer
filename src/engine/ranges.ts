/**
 * ranges.ts — the 169 starting-hand classes, range notation, combo counting.
 *
 * A HandClass is an index into the standard 13x13 grid, `row * 13 + col`,
 * where grid index 0 = Ace .. 12 = Deuce.
 *   row === col  -> pocket pair   (6 combos)
 *   row <  col   -> suited        (4 combos)   [above the diagonal]
 *   row >  col   -> offsuit       (12 combos)  [below the diagonal]
 *
 * Notation understood (PokerStove style, kicker-increment semantics):
 *   77          exact pair
 *   77+         77 through AA
 *   77-TT       inclusive pair band (either order)
 *   AKs / AKo   exact
 *   AK          both suited and offsuit
 *   ATs+        ATs AJs AQs AKs        (kicker climbs to one below the top card)
 *   A5s-A2s     inclusive kicker band  (either order, en dash tolerated)
 */

import { Card, Rank, Suit, rankOf, suitOf, makeCard, RANK_CHARS } from './cards';

export type HandClass = number; // 0..168
export type Range = Set<HandClass>;

export const TOTAL_COMBOS = 1326; // C(52,2)

/** Grid index for a rank: A -> 0, K -> 1, ... 2 -> 12. */
export const rankToGrid = (r: Rank): number => 14 - r;
/** Rank for a grid index. */
export const gridToRank = (i: number): Rank => 14 - i;

export const isPairClass = (hc: HandClass): boolean => (hc / 13 | 0) === hc % 13;
export const isSuitedClass = (hc: HandClass): boolean => (hc / 13 | 0) < hc % 13;
export const isOffsuitClass = (hc: HandClass): boolean => (hc / 13 | 0) > hc % 13;

/** Number of specific two-card combinations in a class, ignoring dead cards. */
export function classComboCount(hc: HandClass): number {
  if (isPairClass(hc)) return 6;
  return isSuitedClass(hc) ? 4 : 12;
}

export function handClassName(hc: HandClass): string {
  const row = (hc / 13) | 0;
  const col = hc % 13;
  if (row === col) return RANK_CHARS[gridToRank(row) - 2]!.repeat(2);
  const hi = RANK_CHARS[gridToRank(Math.min(row, col)) - 2]!;
  const lo = RANK_CHARS[gridToRank(Math.max(row, col)) - 2]!;
  return hi + lo + (row < col ? 's' : 'o');
}

/** Class of two specific cards. */
export function handClassOf(a: Card, b: Card): HandClass {
  const ra = rankOf(a);
  const rb = rankOf(b);
  const suited = suitOf(a) === suitOf(b);
  if (ra === rb) {
    const g = rankToGrid(ra);
    return g * 13 + g;
  }
  const hi = rankToGrid(Math.max(ra, rb));
  const lo = rankToGrid(Math.min(ra, rb));
  return suited ? hi * 13 + lo : lo * 13 + hi;
}

/** Every specific two-card combo in a class. */
export function classCombos(hc: HandClass): Card[][] {
  const row = (hc / 13) | 0;
  const col = hc % 13;
  const out: Card[][] = [];
  if (row === col) {
    const r = gridToRank(row);
    for (let s1 = 0; s1 < 4; s1++)
      for (let s2 = s1 + 1; s2 < 4; s2++)
        out.push([makeCard(r, s1 as Suit), makeCard(r, s2 as Suit)]);
    return out;
  }
  const hiRank = gridToRank(Math.min(row, col));
  const loRank = gridToRank(Math.max(row, col));
  if (row < col) {
    for (let s = 0; s < 4; s++) out.push([makeCard(hiRank, s as Suit), makeCard(loRank, s as Suit)]);
  } else {
    for (let s1 = 0; s1 < 4; s1++)
      for (let s2 = 0; s2 < 4; s2++)
        if (s1 !== s2) out.push([makeCard(hiRank, s1 as Suit), makeCard(loRank, s2 as Suit)]);
  }
  return out;
}

export const ALL_HAND_CLASSES: HandClass[] = Array.from({ length: 169 }, (_, i) => i);

// ---------------------------------------------------------------------------
// Notation
// ---------------------------------------------------------------------------

const HAND_RE = /^([2-9tjqkaTJQKA])([2-9tjqkaTJQKA])([soSO])?$/;

interface ParsedHand {
  hi: Rank;
  lo: Rank;
  suit: 's' | 'o' | null; // null = both
}

function parseHandToken(tok: string): ParsedHand {
  const m = HAND_RE.exec(tok);
  if (!m) throw new Error(`unrecognised hand "${tok}"`);
  const r1 = RANK_CHARS.indexOf(m[1]!.toUpperCase()) + 2;
  const r2 = RANK_CHARS.indexOf(m[2]!.toUpperCase()) + 2;
  const suit = m[3] ? (m[3].toLowerCase() as 's' | 'o') : null;
  if (r1 === r2) {
    if (suit === 's') throw new Error(`"${tok}" is impossible: a pair cannot be suited`);
    return { hi: r1, lo: r2, suit: null };
  }
  return { hi: Math.max(r1, r2), lo: Math.min(r1, r2), suit };
}

function classesFor(h: ParsedHand): HandClass[] {
  if (h.hi === h.lo) {
    const g = rankToGrid(h.hi);
    return [g * 13 + g];
  }
  const hi = rankToGrid(h.hi);
  const lo = rankToGrid(h.lo);
  if (h.suit === 's') return [hi * 13 + lo];
  if (h.suit === 'o') return [lo * 13 + hi];
  return [hi * 13 + lo, lo * 13 + hi];
}

/** Parse one comma-separated token such as "ATs+" or "A5s-A2s". */
export function parseRangeToken(rawToken: string): HandClass[] {
  const tok = rawToken.trim().replace(/[–—]/g, '-');
  if (tok === '') return [];

  // Band:  77-TT  |  A5s-A2s
  if (tok.includes('-')) {
    const [aRaw, bRaw, ...rest] = tok.split('-');
    if (rest.length || !aRaw || !bRaw) throw new Error(`malformed band "${rawToken}"`);
    const a = parseHandToken(aRaw.trim());
    const b = parseHandToken(bRaw.trim());
    if (a.hi === a.lo || b.hi === b.lo) {
      if (a.hi !== a.lo || b.hi !== b.lo) throw new Error(`mixed pair/non-pair band "${rawToken}"`);
      const lo = Math.min(a.hi, b.hi);
      const hi = Math.max(a.hi, b.hi);
      const out: HandClass[] = [];
      for (let r = lo; r <= hi; r++) out.push(...classesFor({ hi: r, lo: r, suit: null }));
      return out;
    }
    if (a.hi !== b.hi) throw new Error(`band "${rawToken}" must share a top card`);
    if (a.suit !== b.suit) throw new Error(`band "${rawToken}" must share suitedness`);
    const lo = Math.min(a.lo, b.lo);
    const hi = Math.max(a.lo, b.lo);
    const out: HandClass[] = [];
    for (let k = lo; k <= hi; k++) out.push(...classesFor({ hi: a.hi, lo: k, suit: a.suit }));
    return out;
  }

  // Plus: 77+ | ATs+
  if (tok.endsWith('+')) {
    const h = parseHandToken(tok.slice(0, -1).trim());
    const out: HandClass[] = [];
    if (h.hi === h.lo) {
      for (let r = h.hi; r <= 14; r++) out.push(...classesFor({ hi: r, lo: r, suit: null }));
    } else {
      for (let k = h.lo; k <= h.hi - 1; k++) out.push(...classesFor({ hi: h.hi, lo: k, suit: h.suit }));
    }
    return out;
  }

  return classesFor(parseHandToken(tok));
}

/** "77+, ATs+, KQo" -> Set of hand classes. */
export function parseRange(notation: string): Range {
  const out: Range = new Set();
  for (const tok of notation.split(',')) {
    for (const hc of parseRangeToken(tok)) out.add(hc);
  }
  return out;
}

/** Canonical notation for a range, collapsing runs back into +/- bands. */
export function rangeToString(range: Range): string {
  const parts: string[] = [];
  const has = (hc: HandClass) => range.has(hc);

  // Pairs, high to low, collapsing consecutive runs.
  const pairRanks: Rank[] = [];
  for (let r = 14; r >= 2; r--) {
    const g = rankToGrid(r);
    if (has(g * 13 + g)) pairRanks.push(r);
  }
  for (let i = 0; i < pairRanks.length; ) {
    let j = i;
    while (j + 1 < pairRanks.length && pairRanks[j + 1] === pairRanks[j]! - 1) j++;
    const top = pairRanks[i]!;
    const bot = pairRanks[j]!;
    const nm = (r: Rank) => RANK_CHARS[r - 2]!.repeat(2);
    if (top === 14 && bot !== 14) parts.push(`${nm(bot)}+`);
    else if (top === bot) parts.push(nm(top));
    else parts.push(`${nm(top)}-${nm(bot)}`);
    i = j + 1;
  }

  for (const suit of ['s', 'o'] as const) {
    for (let hiR = 14; hiR >= 3; hiR--) {
      const kickers: Rank[] = [];
      for (let loR = hiR - 1; loR >= 2; loR--) {
        const [hc] = classesFor({ hi: hiR, lo: loR, suit });
        if (has(hc!)) kickers.push(loR);
      }
      const label = (lo: Rank) => `${RANK_CHARS[hiR - 2]}${RANK_CHARS[lo - 2]}${suit}`;
      for (let i = 0; i < kickers.length; ) {
        let j = i;
        while (j + 1 < kickers.length && kickers[j + 1] === kickers[j]! - 1) j++;
        const top = kickers[i]!;
        const bot = kickers[j]!;
        if (top === hiR - 1 && bot !== hiR - 1) parts.push(`${label(bot)}+`);
        else if (top === bot) parts.push(label(top));
        else parts.push(`${label(top)}-${label(bot)}`);
        i = j + 1;
      }
    }
  }
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Combo counting (with card removal — this is where blockers show up)
// ---------------------------------------------------------------------------

/** Specific combos in a range, dropping any that use a dead card. */
export function rangeCombos(range: Range, dead: readonly Card[] = []): Card[][] {
  const blocked = new Uint8Array(52);
  for (const c of dead) blocked[c] = 1;
  const out: Card[][] = [];
  for (const hc of range) {
    for (const combo of classCombos(hc)) {
      if (blocked[combo[0]!] || blocked[combo[1]!]) continue;
      out.push(combo);
    }
  }
  return out;
}

/** How many specific combos the range holds once dead cards are removed. */
export function comboCount(range: Range, dead: readonly Card[] = []): number {
  if (dead.length === 0) {
    let n = 0;
    for (const hc of range) n += classComboCount(hc);
    return n;
  }
  return rangeCombos(range, dead).length;
}

/**
 * Share of all starting hands the range represents, as a percentage.
 * With no dead cards the denominator is C(52,2) = 1326.
 */
export function rangeToPercent(range: Range, dead: readonly Card[] = []): number {
  if (dead.length === 0) return (comboCount(range) / TOTAL_COMBOS) * 100;
  const live = 52 - dead.length;
  return (comboCount(range, dead) / ((live * (live - 1)) / 2)) * 100;
}

/** Is this specific hand inside the range? */
export function rangeContains(range: Range, a: Card, b: Card): boolean {
  return range.has(handClassOf(a, b));
}

export const FULL_RANGE: Range = new Set(ALL_HAND_CLASSES);
