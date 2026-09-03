/**
 * odds.ts — prices, outs and the shortcuts, all computed.
 *
 * Convention used everywhere: `pot` is the size of the pot BEFORE your call and
 * INCLUDING the bet you are facing. So "pot 100, villain bets 50" is
 * potOdds(150, 50).
 */

import { Card, deckWithout } from './cards';
import { evaluate } from './evaluator';

export interface PotOdds {
  /** Chips you must put in. */
  toCall: number;
  /** Pot before your call, including villain's bet. */
  pot: number;
  /** Equity you need for calling to break even, as a fraction 0..1. */
  requiredEquity: number;
  /** e.g. 3 means "3 to 1". */
  ratio: number;
  ratioText: string;
}

export function potOdds(pot: number, toCall: number): PotOdds {
  if (toCall <= 0) throw new Error('toCall must be positive');
  const requiredEquity = toCall / (pot + toCall);
  const ratio = pot / toCall;
  return {
    toCall,
    pot,
    requiredEquity,
    ratio,
    ratioText: `${ratio.toFixed(ratio < 10 ? 1 : 0)} : 1`,
  };
}

/** Fraction of hands villain must continue with to stop a bluff printing money. */
export function minimumDefenceFrequency(pot: number, bet: number): number {
  return pot / (pot + bet);
}

/** Exact chance of hitting at least one out. Hypergeometric, no shortcuts. */
export function hitProbability(outs: number, unseen: number, cardsToCome: number): number {
  if (outs < 0 || outs > unseen) throw new Error('outs out of range');
  if (cardsToCome === 0) return 0;
  if (cardsToCome === 1) return outs / unseen;
  if (cardsToCome === 2) {
    const miss = ((unseen - outs) / unseen) * ((unseen - outs - 1) / (unseen - 1));
    return 1 - miss;
  }
  throw new Error('only 1 or 2 cards to come');
}

/** The classroom shortcut: outs x 4 on the flop, outs x 2 on the turn. */
export function ruleOf2and4(outs: number, cardsToCome: number): number {
  return (cardsToCome === 2 ? outs * 4 : outs * 2) / 100;
}

/** The refinement most books add: subtract (outs - 8) when using x4. */
export function ruleOf2and4Adjusted(outs: number, cardsToCome: number): number {
  if (cardsToCome === 1) return (outs * 2) / 100;
  const raw = outs * 4;
  return (outs > 8 ? raw - (outs - 8) : raw) / 100;
}

export interface ShortcutError {
  outs: number;
  cardsToCome: number;
  shortcut: number;
  adjusted: number;
  exact: number;
  /** Signed error of the plain shortcut, in percentage points. */
  errorPoints: number;
  adjustedErrorPoints: number;
}

export function shortcutError(outs: number, unseen: number, cardsToCome: number): ShortcutError {
  const exact = hitProbability(outs, unseen, cardsToCome);
  const shortcut = ruleOf2and4(outs, cardsToCome);
  const adjusted = ruleOf2and4Adjusted(outs, cardsToCome);
  return {
    outs,
    cardsToCome,
    shortcut,
    adjusted,
    exact,
    errorPoints: (shortcut - exact) * 100,
    adjustedErrorPoints: (adjusted - exact) * 100,
  };
}

/**
 * Extra chips you must expect to win on later streets for a call to break even.
 * Negative means the call is already profitable on pot odds alone.
 */
export function impliedOddsNeeded(pot: number, toCall: number, equity: number): number {
  if (equity <= 0) return Infinity;
  return ((1 - equity) * toCall) / equity - pot;
}

// ---------------------------------------------------------------------------
// Outs, counted by dealing every unseen card rather than by pattern matching
// ---------------------------------------------------------------------------

export interface OutsAnalysis {
  unseenCount: number;
  aheadNow: boolean;
  /** Cards that leave you winning the hand outright. */
  winningOuts: Card[];
  /** Cards that leave you chopping. */
  tyingOuts: Card[];
  /** Cards that make you a better HAND but still lose — the dirty outs. */
  falseOuts: Card[];
  /** Cards that win without making you a better hand (villain got counterfeited). */
  hiddenOuts: Card[];
  /**
   * Cards that raise your hand's CATEGORY, i.e. what someone counting outs at
   * the table sees. Deliberately not "hand value went up": a blank that nudges
   * your fifth kicker from a deuce to a trey raises your value and is not
   * something anyone would call an out.
   */
  improvingCards: Card[];
}

/**
 * One card to come from the given board. An "out" is defined by outcome, not by
 * appearance: deal the card, re-evaluate both hands, see who wins. That is what
 * makes dirty outs fall out of the arithmetic instead of being asserted.
 */
export function analyzeOuts(hero: Card[], board: Card[], villain: Card[]): OutsAnalysis {
  const unseen = deckWithout([...hero, ...board, ...villain]);
  const heroNowEval = evaluate([...hero, ...board]);
  const villainNow = evaluate([...villain, ...board]).value;
  const aheadNow = heroNowEval.value > villainNow;

  const winningOuts: Card[] = [];
  const tyingOuts: Card[] = [];
  const falseOuts: Card[] = [];
  const hiddenOuts: Card[] = [];
  const improvingCards: Card[] = [];

  for (const c of unseen) {
    const hEval = evaluate([...hero, ...board, c]);
    const h = hEval.value;
    const v = evaluate([...villain, ...board, c]).value;
    const improves = hEval.category > heroNowEval.category;
    if (improves) improvingCards.push(c);
    if (h > v) {
      winningOuts.push(c);
      if (!improves) hiddenOuts.push(c);
    } else if (h === v) {
      tyingOuts.push(c);
    } else if (improves) {
      falseOuts.push(c);
    }
  }

  return {
    unseenCount: unseen.length,
    aheadNow,
    winningOuts,
    tyingOuts,
    falseOuts,
    hiddenOuts,
    improvingCards,
  };
}
