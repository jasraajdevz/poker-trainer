/**
 * preflopChart.ts — Appendix A. THE ONLY HARDCODED POKER KNOWLEDGE IN THE APP.
 *
 * Everything else the coach says is computed. This chart is a teaching
 * baseline: a simplified, human-memorisable approximation of a reasonable
 * 6-max 100bb opening strategy. It is not solver output and the UI must say so
 * wherever it is used to grade you.
 *
 * The percentages the source chart quoted alongside each position are
 * approximations that do not match the notation. We display the computed
 * figure from rangeToPercent() instead, and keep the quoted one here so the
 * difference is visible rather than hidden.
 */

import { parseRange, rangeToPercent, Range } from './ranges';

export const CHART_LABEL = 'Simplified baseline — a learning chart, not GTO output';

export type Position = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

/** Seats in acting order preflop for 6-max. */
export const POSITIONS: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

export const POSITION_NAMES: Record<Position, string> = {
  UTG: 'Under the Gun',
  HJ: 'Hijack',
  CO: 'Cutoff',
  BTN: 'Button',
  SB: 'Small Blind',
  BB: 'Big Blind',
};

/** How many players still act behind you preflop. Fewer = you can open wider. */
export const PLAYERS_BEHIND: Record<Position, number> = {
  UTG: 5, HJ: 4, CO: 3, BTN: 2, SB: 1, BB: 0,
};

export const OPENING_NOTATION: Record<Exclude<Position, 'BB'>, string> = {
  UTG: '22+, ATs+, KTs+, QTs+, JTs, T9s, 98s, AQo+, KQo',
  HJ: '22+, A9s+, A5s-A2s, K9s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, AJo+, KQo',
  CO: '22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, ATo+, KJo+, QJo',
  BTN: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 54s, A2o+, K8o+, Q9o+, J9o+, T9o',
  SB: '22+, A2s+, K5s+, Q7s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, A7o+, A5o, K9o+, Q9o+, JTo',
};

/** The figure printed next to each range in the source chart, for comparison. */
export const QUOTED_PERCENT: Record<Exclude<Position, 'BB'>, number> = {
  UTG: 15, HJ: 19, CO: 26, BTN: 42, SB: 38,
};

const cache = new Map<Position, Range>();

/** Opening range for a seat. BB never opens — it defends, so its range is empty. */
export function openingRange(pos: Position): Range {
  if (pos === 'BB') return new Set();
  let r = cache.get(pos);
  if (!r) {
    r = parseRange(OPENING_NOTATION[pos]);
    cache.set(pos, r);
  }
  return r;
}

/** Computed opening frequency, i.e. the honest percentage. */
export function openingPercent(pos: Position): number {
  return rangeToPercent(openingRange(pos));
}
