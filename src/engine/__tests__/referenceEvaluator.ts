/**
 * A deliberately slow, deliberately DIFFERENT implementation used only as a
 * test oracle. It enumerates all C(7,5)=21 five-card subsets and scores each
 * one with naive array logic (no bitmasks, no early-exit category ordering,
 * no shared helpers with evaluator.ts). If the two agree on 100k random hands
 * the fast path is almost certainly right.
 */

import { Card, rankOf, suitOf } from '../cards';

export interface RefValue {
  category: number;
  tiebreakers: number[]; // length 5, padded with 0
}

function pad(t: number[]): number[] {
  const out = t.slice(0, 5);
  while (out.length < 5) out.push(0);
  return out;
}

/** Score exactly five cards. */
export function refEvaluate5(cards: Card[]): RefValue {
  if (cards.length !== 5) throw new Error('refEvaluate5 needs 5 cards');
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const suits = cards.map(suitOf);

  const isFlush = suits.every((s) => s === suits[0]);

  const distinct = Array.from(new Set(ranks)).sort((a, b) => b - a);
  let straightHigh = 0;
  if (distinct.length === 5) {
    if (distinct[0]! - distinct[4]! === 4) straightHigh = distinct[0]!;
    else if (distinct[0] === 14 && distinct[1] === 5 && distinct[4] === 2) straightHigh = 5;
  }

  // rank -> count, ordered by count desc then rank desc
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = Array.from(counts.entries()).sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  const shape = groups.map((g) => g[1]).join('');
  const byGroup = groups.map((g) => g[0]);

  if (isFlush && straightHigh) return { category: 8, tiebreakers: pad([straightHigh]) };
  if (shape === '41') return { category: 7, tiebreakers: pad(byGroup) };
  if (shape === '32') return { category: 6, tiebreakers: pad(byGroup) };
  if (isFlush) return { category: 5, tiebreakers: pad(ranks) };
  if (straightHigh) return { category: 4, tiebreakers: pad([straightHigh]) };
  if (shape === '311') return { category: 3, tiebreakers: pad(byGroup) };
  if (shape === '221') return { category: 2, tiebreakers: pad(byGroup) };
  if (shape === '2111') return { category: 1, tiebreakers: pad(byGroup) };
  return { category: 0, tiebreakers: pad(ranks) };
}

export function refCompare(a: RefValue, b: RefValue): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < 5; i++) {
    if (a.tiebreakers[i] !== b.tiebreakers[i]) return a.tiebreakers[i]! - b.tiebreakers[i]!;
  }
  return 0;
}

/** Best 5-card score out of 5, 6 or 7 cards, by exhaustive enumeration. */
export function refEvaluate(cards: Card[]): RefValue {
  const n = cards.length;
  let best: RefValue | null = null;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const v = refEvaluate5([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!]);
            if (best === null || refCompare(v, best) > 0) best = v;
          }
  return best!;
}
