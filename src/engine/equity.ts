/**
 * equity.ts — hand-vs-hand, hand-vs-range and multiway equity.
 *
 * Two paths, chosen automatically:
 *   exact       full enumeration, used whenever the search is small enough
 *   monte carlo seeded sampling, used otherwise
 *
 * Every result reports which path ran and, for sampling, the standard error,
 * so the UI can show "36.2% +/- 0.3" instead of pretending to false precision.
 */

import { Card, createRng, Rng } from './cards';
import { evaluate } from './evaluator';
import { Range, rangeCombos } from './ranges';

export type HoleSpec =
  | { kind: 'cards'; cards: Card[] }
  | { kind: 'range'; range: Range }
  /** An explicit combo list, for ranges built by filtering rather than notation. */
  | { kind: 'combos'; combos: Card[][] };

export const asCards = (cards: Card[]): HoleSpec => ({ kind: 'cards', cards });
export const asRange = (range: Range): HoleSpec => ({ kind: 'range', range });
export const asCombos = (combos: Card[][]): HoleSpec => ({ kind: 'combos', combos });

export interface EquityOptions {
  /** Monte Carlo sample count when enumeration is too big. */
  iterations?: number;
  seed?: string | number;
  /** Enumerate exactly when the search space is at most this many leaves. */
  exactThreshold?: number;
  forceMonteCarlo?: boolean;
}

export interface EquityResult {
  /** Per player, 0..1, ties split evenly. Sums to 1. */
  equity: number[];
  /** Outright win share, ties excluded. */
  win: number[];
  /** Share of trials involving a chop for this player. */
  tie: number[];
  /** Trials actually scored. */
  samples: number;
  exact: boolean;
  /** Standard error of each equity estimate. Zero when exact. */
  stdErr: number[];
  /** Half-width of the 95% interval, in percentage points. Zero when exact. */
  margin95: number[];
}

const DEFAULTS = { iterations: 25_000, exactThreshold: 200_000 };

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

/** Score one complete showdown. Mutates the tally arrays. */
function scoreShowdown(
  holes: Card[][],
  board: Card[],
  eq: Float64Array,
  win: Float64Array,
  tie: Float64Array,
): void {
  const n = holes.length;
  let best = -1;
  let winners = 0;
  const isBest = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const v = evaluate([holes[p]![0]!, holes[p]![1]!, ...board]).value;
    if (v > best) {
      best = v;
      winners = 1;
      isBest.fill(0);
      isBest[p] = 1;
    } else if (v === best) {
      winners++;
      isBest[p] = 1;
    }
  }
  const share = 1 / winners;
  for (let p = 0; p < n; p++) {
    if (!isBest[p]) continue;
    eq[p]! += share;
    if (winners === 1) win[p]! += 1;
    else tie[p]! += 1;
  }
}

/** Cards not visible to anyone: 52 minus board minus every fixed hole card. */
function liveDeck(fixed: Card[]): Card[] {
  const used = new Uint8Array(52);
  for (const c of fixed) used[c] = 1;
  const d: Card[] = [];
  for (let i = 0; i < 52; i++) if (!used[i]) d.push(i);
  return d;
}

export function computeEquity(
  players: HoleSpec[],
  board: Card[] = [],
  opts: EquityOptions = {},
): EquityResult {
  const n = players.length;
  if (n < 2) throw new Error('equity needs at least two players');
  if (board.length > 5) throw new Error('board cannot exceed five cards');

  const iterations = opts.iterations ?? DEFAULTS.iterations;
  const exactThreshold = opts.exactThreshold ?? DEFAULTS.exactThreshold;

  const staticDead: Card[] = [...board];
  for (const p of players) if (p.kind === 'cards') staticDead.push(...p.cards);

  // Candidate combos for each range player, already blocked by static dead cards.
  const blocked = new Uint8Array(52);
  for (const c of staticDead) blocked[c] = 1;
  const combosFor: (Card[][] | null)[] = players.map((p) => {
    if (p.kind === 'range') return rangeCombos(p.range, staticDead);
    if (p.kind === 'combos') return p.combos.filter((c) => !blocked[c[0]!] && !blocked[c[1]!]);
    return null;
  });
  combosFor.forEach((c, i) => {
    if (c && c.length === 0) throw new Error(`player ${i}'s range has no combos left after card removal`);
  });

  const toCome = 5 - board.length;
  const deckSize = 52 - staticDead.length;

  let cost = choose(deckSize - 2 * players.filter((p) => p.kind !== 'cards').length, toCome);
  for (const c of combosFor) if (c) cost *= c.length;

  const useExact = !opts.forceMonteCarlo && cost > 0 && cost <= exactThreshold;

  const eq = new Float64Array(n);
  const win = new Float64Array(n);
  const tie = new Float64Array(n);
  let samples = 0;

  if (useExact) {
    samples = enumerateExact(players, combosFor, board, staticDead, eq, win, tie);
  } else {
    samples = monteCarlo(
      players, combosFor, board, staticDead, iterations,
      createRng(opts.seed ?? 'equity'), eq, win, tie,
    );
  }

  const equity = Array.from(eq, (v) => v / samples);
  const stdErr = equity.map((p) => (useExact ? 0 : Math.sqrt(Math.max(p * (1 - p), 0) / samples)));
  return {
    equity,
    win: Array.from(win, (v) => v / samples),
    tie: Array.from(tie, (v) => v / samples),
    samples,
    exact: useExact,
    stdErr,
    margin95: stdErr.map((s) => s * 1.96 * 100),
  };
}

function enumerateExact(
  players: HoleSpec[],
  combosFor: (Card[][] | null)[],
  board: Card[],
  staticDead: Card[],
  eq: Float64Array,
  win: Float64Array,
  tie: Float64Array,
): number {
  const n = players.length;
  const holes: Card[][] = new Array(n);
  const used = new Uint8Array(52);
  for (const c of staticDead) used[c] = 1;
  for (let i = 0; i < n; i++) {
    const p = players[i]!;
    if (p.kind === 'cards') holes[i] = p.cards;
  }
  let samples = 0;
  const boardBuf = [...board];
  const toCome = 5 - board.length;

  const dealBoard = (start: number, need: number): void => {
    if (need === 0) {
      scoreShowdown(holes, boardBuf, eq, win, tie);
      samples++;
      return;
    }
    for (let c = start; c < 52; c++) {
      if (used[c]) continue;
      used[c] = 1;
      boardBuf.push(c);
      dealBoard(c + 1, need - 1);
      boardBuf.pop();
      used[c] = 0;
    }
  };

  const assign = (i: number): void => {
    if (i === n) {
      dealBoard(0, toCome);
      return;
    }
    const combos = combosFor[i];
    if (!combos) {
      assign(i + 1);
      return;
    }
    for (const combo of combos) {
      if (used[combo[0]!] || used[combo[1]!]) continue;
      used[combo[0]!] = 1;
      used[combo[1]!] = 1;
      holes[i] = combo;
      assign(i + 1);
      used[combo[0]!] = 0;
      used[combo[1]!] = 0;
    }
  };

  assign(0);
  if (samples === 0) throw new Error('no legal deals: ranges conflict completely');
  return samples;
}

function monteCarlo(
  players: HoleSpec[],
  combosFor: (Card[][] | null)[],
  board: Card[],
  staticDead: Card[],
  iterations: number,
  rng: Rng,
  eq: Float64Array,
  win: Float64Array,
  tie: Float64Array,
): number {
  const n = players.length;
  const base = liveDeck(staticDead);
  const holes: Card[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = players[i]!;
    if (p.kind === 'cards') holes[i] = p.cards;
  }
  const toCome = 5 - board.length;
  const boardBuf: Card[] = new Array(5);
  for (let i = 0; i < board.length; i++) boardBuf[i] = board[i]!;
  const used = new Uint8Array(52);
  const deck = base.slice();
  let samples = 0;

  outer: for (let iter = 0; iter < iterations; iter++) {
    used.fill(0);
    for (let i = 0; i < n; i++) {
      const combos = combosFor[i];
      if (!combos) continue;
      let ok = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        const combo = combos[rng.int(combos.length)]!;
        if (used[combo[0]!] || used[combo[1]!]) continue;
        used[combo[0]!] = 1;
        used[combo[1]!] = 1;
        holes[i] = combo;
        ok = true;
        break;
      }
      if (!ok) continue outer; // hopeless collision, skip this trial
    }
    // Partial Fisher-Yates over the live deck, skipping cards taken by ranges.
    let filled = 0;
    let lo = 0;
    const hi = deck.length;
    while (filled < toCome) {
      if (lo >= hi) continue outer;
      const j = lo + rng.int(hi - lo);
      const card = deck[j]!;
      deck[j] = deck[lo]!;
      deck[lo] = card;
      lo++;
      if (used[card]) continue;
      boardBuf[board.length + filled] = card;
      filled++;
    }
    scoreShowdown(holes, boardBuf, eq, win, tie);
    samples++;
  }
  if (samples === 0) throw new Error('monte carlo produced no legal deals');
  return samples;
}

// --- convenience -----------------------------------------------------------

export function equityVsHand(
  hero: Card[], villain: Card[], board: Card[] = [], opts: EquityOptions = {},
): EquityResult {
  return computeEquity([asCards(hero), asCards(villain)], board, opts);
}

export function equityVsRange(
  hero: Card[], range: Range, board: Card[] = [], opts: EquityOptions = {},
): EquityResult {
  return computeEquity([asCards(hero), asRange(range)], board, opts);
}

/** Hero's equity as a plain fraction, for call sites that want one number. */
export function heroEquity(
  hero: Card[], villain: HoleSpec, board: Card[] = [], opts: EquityOptions = {},
): number {
  return computeEquity([asCards(hero), villain], board, opts).equity[0]!;
}
