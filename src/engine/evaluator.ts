/**
 * evaluator.ts — 5/6/7-card hand evaluator.
 *
 * Produces a HandValue whose `value` is a single integer that is directly
 * comparable: bigger is better, equal means a genuine chop. Packing:
 *
 *   value = category<<20 | t1<<16 | t2<<12 | t3<<8 | t4<<4 | t5
 *
 * Each tiebreaker is a rank 2..14 (fits in 4 bits), category 0..8.
 *
 * Correctness notes that matter and are covered by tests:
 *  - Wheel straights (A-2-3-4-5) rank as FIVE high, not ace high.
 *  - Steel wheel (A2345 suited) is a straight flush, five high.
 *  - A flush and a straight can coexist in 7 cards (e.g. Ah Kh 7h 6h 5h 8s 9d);
 *    category checks therefore run in strict descending order, never "first
 *    thing that matches".
 *  - A steel wheel alongside a higher spade (As 2s 3s 4s 5s Ks) is a five-high
 *    straight flush, not an ace-high flush.
 *  - Two trips make a full house whose "pair" is the lower trip's rank.
 *  - Three pair uses the top two pairs and the best remaining card as kicker,
 *    which may be the third pair's rank.
 */

import {
  Card, Rank, Suit, rankOf, suitOf, rankName, rankPlural, makeCard,
} from './cards';

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High Card',
  [HandCategory.Pair]: 'Pair',
  [HandCategory.TwoPair]: 'Two Pair',
  [HandCategory.ThreeOfAKind]: 'Three of a Kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full House',
  [HandCategory.FourOfAKind]: 'Four of a Kind',
  [HandCategory.StraightFlush]: 'Straight Flush',
};

export interface HandValue {
  /** Comparable integer. Higher wins; equal is a chop. */
  value: number;
  category: HandCategory;
  /** Ranks in significance order, padded with 0 to length 5. */
  tiebreakers: number[];
  /** Human readable, e.g. "Full House, Kings full of Threes". */
  name: string;
  /** The exact five cards that make the hand. */
  best5: Card[];
}

function pack(cat: HandCategory, t: number[]): number {
  return (
    (cat << 20) |
    ((t[0] ?? 0) << 16) |
    ((t[1] ?? 0) << 12) |
    ((t[2] ?? 0) << 8) |
    ((t[3] ?? 0) << 4) |
    (t[4] ?? 0)
  );
}

/** Highest straight in a rank bitmask (bits 2..14). Returns high rank, or 0. */
function straightHigh(rankMask: number): number {
  // Ace also plays low: mirror bit 14 down to bit 1 so A-5-4-3-2 is contiguous.
  let m = rankMask;
  if (m & (1 << 14)) m |= 1 << 1;
  for (let hi = 14; hi >= 5; hi--) {
    const window = (1 << hi) | (1 << (hi - 1)) | (1 << (hi - 2)) | (1 << (hi - 3)) | (1 << (hi - 4));
    if ((m & window) === window) return hi;
  }
  return 0;
}

/** Straight card list, high..low, honoring the ace-plays-low case. */
function straightRanks(high: number): number[] {
  const rs = [high, high - 1, high - 2, high - 3, high - 4];
  return rs.map((r) => (r === 1 ? 14 : r));
}

export function evaluate(cards: readonly Card[]): HandValue {
  const n = cards.length;
  if (n < 5 || n > 7) throw new Error(`evaluate() needs 5-7 cards, got ${n}`);

  const rankCount = new Int8Array(15);
  const suitCount = new Int8Array(4);
  const suitRankMask = new Int32Array(4);
  let rankMask = 0;

  for (let i = 0; i < n; i++) {
    const c = cards[i]!;
    const r = rankOf(c);
    const s = suitOf(c);
    rankCount[r]!++;
    suitCount[s]!++;
    suitRankMask[s]! |= 1 << r;
    rankMask |= 1 << r;
  }

  // Pick cards of a given rank (up to `count` of them) out of the input.
  const pickRank = (r: number, count: number, excludeSuit = -1): Card[] => {
    const out: Card[] = [];
    for (let i = 0; i < n && out.length < count; i++) {
      const c = cards[i]!;
      if (rankOf(c) === r && suitOf(c) !== excludeSuit) out.push(c);
    }
    return out;
  };

  let flushSuit: Suit | -1 = -1;
  for (let s = 0; s < 4; s++) if (suitCount[s]! >= 5) flushSuit = s as Suit;

  // ---- 8. Straight flush ---------------------------------------------------
  if (flushSuit >= 0) {
    const hi = straightHigh(suitRankMask[flushSuit]!);
    if (hi > 0) {
      const best5 = straightRanks(hi).map((r) => makeCard(r, flushSuit as Suit));
      const name = hi === 14 ? 'Royal Flush' : `Straight Flush, ${rankName(hi === 1 ? 14 : hi)} high`;
      return {
        value: pack(HandCategory.StraightFlush, [hi]),
        category: HandCategory.StraightFlush,
        tiebreakers: [hi, 0, 0, 0, 0],
        name,
        best5,
      };
    }
  }

  // Group ranks by multiplicity, each group sorted high->low.
  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  const singles: number[] = [];
  for (let r = 14; r >= 2; r--) {
    const c = rankCount[r]!;
    if (c === 4) quads.push(r);
    else if (c === 3) trips.push(r);
    else if (c === 2) pairs.push(r);
    else if (c === 1) singles.push(r);
  }
  /** Best kickers by rank, excluding the given ranks. */
  const kickerRanks = (exclude: number[], count: number): number[] => {
    const out: number[] = [];
    for (let r = 14; r >= 2 && out.length < count; r--) {
      if (rankCount[r]! === 0 || exclude.includes(r)) continue;
      out.push(r);
    }
    return out;
  };

  // ---- 7. Four of a kind ---------------------------------------------------
  if (quads.length > 0) {
    const q = quads[0]!;
    const k = kickerRanks([q], 1)[0]!;
    const t = [q, k];
    return {
      value: pack(HandCategory.FourOfAKind, t),
      category: HandCategory.FourOfAKind,
      tiebreakers: [q, k, 0, 0, 0],
      name: `Four of a Kind, ${rankPlural(q)}`,
      best5: [...pickRank(q, 4), ...pickRank(k, 1)],
    };
  }

  // ---- 6. Full house -------------------------------------------------------
  // With two trips the lower trip plays as the pair; compare it against pairs.
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const t3 = trips[0]!;
    const secondTrip = trips[1] ?? 0;
    const bestPair = pairs[0] ?? 0;
    const t2 = Math.max(secondTrip, bestPair);
    const t = [t3, t2];
    return {
      value: pack(HandCategory.FullHouse, t),
      category: HandCategory.FullHouse,
      tiebreakers: [t3, t2, 0, 0, 0],
      name: `Full House, ${rankPlural(t3)} full of ${rankPlural(t2)}`,
      best5: [...pickRank(t3, 3), ...pickRank(t2, 2)],
    };
  }

  // ---- 5. Flush ------------------------------------------------------------
  if (flushSuit >= 0) {
    const fr: number[] = [];
    for (let r = 14; r >= 2 && fr.length < 5; r--) {
      if (suitRankMask[flushSuit]! & (1 << r)) fr.push(r);
    }
    return {
      value: pack(HandCategory.Flush, fr),
      category: HandCategory.Flush,
      tiebreakers: [fr[0]!, fr[1]!, fr[2]!, fr[3]!, fr[4]!],
      name: `Flush, ${rankName(fr[0]!)} high`,
      best5: fr.map((r) => makeCard(r, flushSuit as Suit)),
    };
  }

  // ---- 4. Straight ---------------------------------------------------------
  {
    const hi = straightHigh(rankMask);
    if (hi > 0) {
      const rs = straightRanks(hi);
      return {
        value: pack(HandCategory.Straight, [hi]),
        category: HandCategory.Straight,
        tiebreakers: [hi, 0, 0, 0, 0],
        name: `Straight, ${rankName(hi === 1 ? 14 : hi)} high`,
        best5: rs.map((r) => pickRank(r, 1)[0]!),
      };
    }
  }

  // ---- 3. Three of a kind --------------------------------------------------
  if (trips.length > 0) {
    const t3 = trips[0]!;
    const ks = kickerRanks([t3], 2);
    const t = [t3, ...ks];
    return {
      value: pack(HandCategory.ThreeOfAKind, t),
      category: HandCategory.ThreeOfAKind,
      tiebreakers: [t3, ks[0]!, ks[1]!, 0, 0],
      name: `Three of a Kind, ${rankPlural(t3)}`,
      best5: [...pickRank(t3, 3), ...ks.map((r) => pickRank(r, 1)[0]!)],
    };
  }

  // ---- 2. Two pair ---------------------------------------------------------
  if (pairs.length >= 2) {
    const hi = pairs[0]!;
    const lo = pairs[1]!;
    // Kicker may be the third pair's rank; kickerRanks scans all ranks present.
    const k = kickerRanks([hi, lo], 1)[0]!;
    const t = [hi, lo, k];
    return {
      value: pack(HandCategory.TwoPair, t),
      category: HandCategory.TwoPair,
      tiebreakers: [hi, lo, k, 0, 0],
      name: `Two Pair, ${rankPlural(hi)} and ${rankPlural(lo)}`,
      best5: [...pickRank(hi, 2), ...pickRank(lo, 2), ...pickRank(k, 1)],
    };
  }

  // ---- 1. One pair ---------------------------------------------------------
  if (pairs.length === 1) {
    const p = pairs[0]!;
    const ks = kickerRanks([p], 3);
    const t = [p, ...ks];
    return {
      value: pack(HandCategory.Pair, t),
      category: HandCategory.Pair,
      tiebreakers: [p, ks[0]!, ks[1]!, ks[2]!, 0],
      name: `Pair of ${rankPlural(p)}`,
      best5: [...pickRank(p, 2), ...ks.map((r) => pickRank(r, 1)[0]!)],
    };
  }

  // ---- 0. High card --------------------------------------------------------
  const hc = singles.slice(0, 5);
  return {
    value: pack(HandCategory.HighCard, hc),
    category: HandCategory.HighCard,
    tiebreakers: [hc[0]!, hc[1]!, hc[2]!, hc[3]!, hc[4]!],
    name: `High Card, ${rankName(hc[0]!)}`,
    best5: hc.map((r) => pickRank(r, 1)[0]!),
  };
}

/**
 * Fast path used by Monte Carlo: returns only the comparable integer.
 * Kept as a thin wrapper so there is exactly one implementation to trust.
 */
export function evaluateValue(cards: readonly Card[]): number {
  return evaluate(cards).value;
}

/** -1 if a loses, 0 chop, 1 a wins. */
export function compareHands(a: readonly Card[], b: readonly Card[]): -1 | 0 | 1 {
  const av = evaluateValue(a);
  const bv = evaluateValue(b);
  return av > bv ? 1 : av < bv ? -1 : 0;
}

export function categoryOf(value: number): HandCategory {
  return (value >> 20) as HandCategory;
}

/** Short label for HUD use, e.g. "Two Pair". */
export function categoryName(value: number): string {
  return CATEGORY_NAMES[categoryOf(value)];
}

export type { Rank, Suit };
