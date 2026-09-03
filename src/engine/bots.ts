/**
 * bots.ts — three opponent archetypes as real strategy objects.
 *
 * A bot is a profile (thresholds) plus shared machinery that reads the actual
 * board. Nothing is random-number-generator poker: every decision comes from
 * ranking the bot's own range on this exact board and comparing the result to
 * its thresholds, and every call is checked against real pot odds.
 *
 * respondTo() is the important one. It partitions the bot's whole range into
 * fold / call / raise for a given bet size, then measures hero's equity against
 * the calling subset with the equity engine. That is what lets L6 and L7 grade
 * a bet on EV against how this opponent actually behaves.
 */

import { Card, Rng, cardsToString, rankOf, suitOf } from './cards';
import { HandCategory, evaluate } from './evaluator';
import { asCards, asCombos, computeEquity } from './equity';
import { Range, rangeCombos } from './ranges';
import { Position, openingRange } from './preflopChart';
import { VillainResponse } from './ev';
import { potOdds } from './odds';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type ArchetypeId = 'nit' | 'station' | 'tag' | 'nemesis';

export interface BotProfile {
  id: ArchetypeId;
  name: string;
  blurb: string;
  /** Percentile of its own range needed to continue against a bet. */
  continueAt: number;
  /** Percentile needed to raise. */
  raiseAt: number;
  /** Percentile needed to bet when checked to. */
  betAt: number;
  /** How much a draw counts toward continuing, 0..1. */
  drawWeight: number;
  /** Share of pure draws turned into bluffs. */
  bluffFreq: number;
  /** How often it continuation-bets as the preflop raiser. */
  cbetFreq: number;
  /** Seats whose opening range it uses regardless of where it sits. */
  fixedSeat?: Position;
  /** Does it respect pot odds when calling? */
  usesPotOdds: boolean;
}

export const PROFILES: Record<ArchetypeId, BotProfile> = {
  nit: {
    id: 'nit', name: 'The Nit', fixedSeat: 'UTG',
    blurb: 'Plays 12% of hands from every seat, bets only when strong, folds to pressure, never bluffs.',
    continueAt: 0.80, raiseAt: 0.95, betAt: 0.86,
    drawWeight: 0.15, bluffFreq: 0, cbetFreq: 0.45, usesPotOdds: true,
  },
  station: {
    id: 'station', name: 'The Station', fixedSeat: 'BTN',
    blurb: 'Calls far too much, raises almost never, and will not fold a pair to a story.',
    continueAt: 0.26, raiseAt: 0.97, betAt: 0.90,
    drawWeight: 0.85, bluffFreq: 0, cbetFreq: 0.25, usesPotOdds: false,
  },
  tag: {
    id: 'tag', name: 'The TAG',
    blurb: 'Tight and aggressive. Opens by position, c-bets good textures, bluffs sometimes, folds when beaten.',
    continueAt: 0.55, raiseAt: 0.88, betAt: 0.62,
    drawWeight: 0.55, bluffFreq: 0.28, cbetFreq: 0.65, usesPotOdds: true,
  },
  nemesis: {
    id: 'nemesis', name: 'The Nemesis',
    blurb: 'Reads your logged leaks and shifts its thresholds to attack them. Upgraded mode only.',
    continueAt: 0.5, raiseAt: 0.82, betAt: 0.55,
    drawWeight: 0.6, bluffFreq: 0.34, cbetFreq: 0.72, usesPotOdds: true,
  },
};

export interface BotContext {
  cards: Card[];
  board: Card[];
  pot: number;
  toCall: number;
  minRaise: number;
  stack: number;
  position: Position;
  street: Street;
  bigBlind: number;
  isAggressor: boolean;
  /** What hero could be holding, for the bot's own equity checks. */
  heroRange?: Range;
  rng: Rng;
}

export interface BotDecision {
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  /** Total chips this action puts in on this street. */
  size: number;
  /** Computed lines, in the order the bot considered them. */
  reasoning: string[];
  numbers: Record<string, string>;
}

// --- range machinery -------------------------------------------------------

/** Cheap, purely structural draw score: flush draws and straight draws. */
export function drawStrength(cards: Card[], board: Card[]): number {
  if (board.length < 3 || board.length > 4) return 0;
  const all = [...cards, ...board];
  const suits = [0, 0, 0, 0];
  for (const c of all) suits[suitOf(c)]!++;
  const flushDraw = suits.some((n) => n === 4) ? 0.9 : 0;

  const ranks = new Set(all.map(rankOf));
  if (ranks.has(14)) ranks.add(1);
  let best = 0;
  for (let hi = 14; hi >= 5; hi--) {
    let have = 0;
    for (let k = 0; k < 5; k++) if (ranks.has(hi - k)) have++;
    if (have === 4) best = Math.max(best, 0.65);
    else if (have === 3) best = Math.max(best, 0.2);
  }
  return Math.min(1, Math.max(flushDraw, best));
}

interface RankedCombo { combo: Card[]; value: number; rank: number; draw: number; score: number; }

/** Rank every combo in a range by how strong it actually is on this board. */
export function rankRange(
  range: Range | Card[][], board: Card[], dead: Card[], drawWeight: number,
): RankedCombo[] {
  const combos = Array.isArray(range) ? range : rangeCombos(range, [...board, ...dead]);
  const live = Array.isArray(range)
    ? combos.filter((c) => ![...board, ...dead].some((d) => d === c[0] || d === c[1]))
    : combos;
  const scored = live.map((combo) => ({
    combo,
    value: board.length >= 3 ? evaluate([...combo, ...board]).value : preflopValue(combo),
    draw: board.length >= 3 ? drawStrength(combo, board) : 0,
    rank: 0,
    score: 0,
  }));
  scored.sort((a, b) => a.value - b.value);
  const n = Math.max(1, scored.length - 1);
  scored.forEach((s, i) => {
    s.rank = i / n;
    s.score = Math.min(1, s.rank + s.draw * drawWeight * (1 - s.rank));
  });
  return scored.sort((a, b) => b.score - a.score);
}

/** Preflop ordering proxy: pair rank, then high card, then suitedness. */
function preflopValue(c: Card[]): number {
  const a = rankOf(c[0]!);
  const b = rankOf(c[1]!);
  const suited = suitOf(c[0]!) === suitOf(c[1]!) ? 1 : 0;
  if (a === b) return 10000 + a * 10;
  return Math.max(a, b) * 100 + Math.min(a, b) * 4 + suited * 30 - Math.abs(a - b) * 3;
}

export class Bot {
  readonly profile: BotProfile;
  private last: BotDecision | null = null;
  /** Tag weights for the Nemesis: leak id -> how hard to attack it. */
  leaks: Record<string, number> = {};

  constructor(profile: BotProfile) { this.profile = profile; }

  get id(): ArchetypeId { return this.profile.id; }
  get name(): string { return this.profile.name; }

  /** The range this bot opens from a seat. */
  openingRange(pos: Position): Range {
    return openingRange(this.profile.fixedSeat ?? pos);
  }

  /** Effective thresholds, after any Nemesis adaptation. */
  thresholds(): Pick<BotProfile, 'continueAt' | 'raiseAt' | 'betAt' | 'bluffFreq' | 'cbetFreq'> {
    const p = this.profile;
    if (p.id !== 'nemesis') return p;
    // Attack what you actually do wrong: more bluffs against a folder, more
    // value bets and fewer bluffs against a caller.
    const folds = this.leaks['folds-with-odds'] ?? 0;
    const calls = this.leaks['calls-without-odds'] ?? 0;
    const passive = this.leaks['too-passive-with-draws'] ?? 0;
    const t = folds + passive - calls;
    return {
      continueAt: clamp(p.continueAt - calls * 0.06, 0.2, 0.9),
      raiseAt: clamp(p.raiseAt - t * 0.04, 0.6, 0.98),
      betAt: clamp(p.betAt - t * 0.05, 0.3, 0.95),
      bluffFreq: clamp(p.bluffFreq + t * 0.12 - calls * 0.15, 0, 0.7),
      cbetFreq: clamp(p.cbetFreq + t * 0.08, 0.2, 0.95),
    };
  }

  /**
   * Partition the bot's range against a bet of `bet` into `pot`, and measure
   * hero's equity against the part that continues.
   */
  respondTo(
    heroCards: Card[], board: Card[], pot: number, bet: number, range: Range | Card[][],
    seed = 'respond',
  ): VillainResponse & { callCombos: Card[][]; raiseCombos: Card[][]; foldCombos: Card[][] } {
    const t = this.thresholds();
    const ranked = rankRange(range, board, heroCards, this.profile.drawWeight);
    const price = bet / (pot + bet); // what the bot must beat to keep calling
    // Bigger bets push the continue threshold up; this is the pot-odds link.
    const continueAt = this.profile.usesPotOdds
      ? clamp(t.continueAt + (price - 0.25) * 0.9, 0.05, 0.97)
      : t.continueAt;

    const raiseCombos: Card[][] = [];
    const callCombos: Card[][] = [];
    const foldCombos: Card[][] = [];
    let bluffBudget = Math.round(ranked.length * t.bluffFreq * 0.25);
    for (const r of ranked) {
      if (r.score >= t.raiseAt) raiseCombos.push(r.combo);
      else if (r.score >= continueAt) callCombos.push(r.combo);
      else if (r.draw > 0.6 && bluffBudget > 0) { raiseCombos.push(r.combo); bluffBudget--; }
      else foldCombos.push(r.combo);
    }
    const total = ranked.length || 1;

    const eqVs = (combos: Card[][]): number => {
      if (combos.length === 0) return 0;
      return computeEquity([asCards(heroCards), asCombos(combos)], board, {
        iterations: 8000, seed: `${seed}:eq`, forceMonteCarlo: true,
      }).equity[0]!;
    };

    return {
      fold: foldCombos.length / total,
      call: callCombos.length / total,
      raise: raiseCombos.length / total,
      equityWhenCalled: eqVs(callCombos),
      equityWhenRaised: eqVs(raiseCombos),
      raiseTo: Math.round(bet * 3 + pot * 0.1),
      callCombos, raiseCombos, foldCombos,
    };
  }

  decide(ctx: BotContext): BotDecision {
    const d = ctx.street === 'preflop' ? this.decidePreflop(ctx) : this.decidePostflop(ctx);
    this.last = d;
    return d;
  }

  /** Why the bot did what it did — used by the post-hand review. */
  explainAction(): string {
    if (!this.last) return `${this.name} has not acted yet.`;
    return `${this.name}: ${this.last.reasoning.join(' ')}`;
  }

  lastDecision(): BotDecision | null { return this.last; }

  private decidePreflop(ctx: BotContext): BotDecision {
    const range = this.openingRange(ctx.position);
    const inRange = range.has(handClassKey(ctx.cards));
    const why: string[] = [];
    const nums: Record<string, string> = {
      'my range': `${this.profile.fixedSeat ?? ctx.position} opening range`,
      'my hand': cardsToString(ctx.cards),
    };
    if (ctx.toCall === 0) {
      if (inRange) {
        why.push(`${cardsToString(ctx.cards)} is inside my opening range, so I raise.`);
        return { action: 'bet', size: Math.min(ctx.stack, ctx.bigBlind * 2.5), reasoning: why, numbers: nums };
      }
      why.push(`${cardsToString(ctx.cards)} is outside my opening range.`);
      return { action: 'check', size: 0, reasoning: why, numbers: nums };
    }
    const price = potOdds(ctx.pot, ctx.toCall);
    nums['price'] = `${(price.requiredEquity * 100).toFixed(0)}% needed`;
    if (!inRange) {
      why.push(`Facing ${ctx.toCall}, and this hand is not in my range. Fold.`);
      return { action: 'fold', size: 0, reasoning: why, numbers: nums };
    }
    const strong = preflopValue(ctx.cards) > 10000 + 110 || preflopValue(ctx.cards) > 1350;
    if (strong && this.profile.id !== 'station') {
      why.push(`This is at the top of my range, so I raise rather than call.`);
      return { action: 'raise', size: Math.min(ctx.stack, ctx.toCall * 3), reasoning: why, numbers: nums };
    }
    why.push(`In range and priced at ${(price.requiredEquity * 100).toFixed(0)}%, so I call.`);
    return { action: 'call', size: Math.min(ctx.stack, ctx.toCall), reasoning: why, numbers: nums };
  }

  private decidePostflop(ctx: BotContext): BotDecision {
    const t = this.thresholds();
    const myRange = this.openingRange(ctx.position);
    const ranked = rankRange(myRange, ctx.board, ctx.cards, this.profile.drawWeight);
    const mine = evaluate([...ctx.cards, ...ctx.board]);
    const draw = drawStrength(ctx.cards, ctx.board);
    // Where does my actual hand sit inside the range I would have here?
    const myValue = mine.value;
    const beaten = ranked.filter((r) => r.value < myValue).length;
    const rank = ranked.length ? beaten / ranked.length : 0.5;
    const score = Math.min(1, rank + draw * this.profile.drawWeight * (1 - rank));

    const why: string[] = [];
    const nums: Record<string, string> = {
      'my hand': mine.name,
      'strength in my range': `${ordinal(rank * 100)} percentile`,
    };
    if (draw > 0) nums['draw'] = `${(draw * 100).toFixed(0)}% draw score`;

    if (ctx.toCall === 0) {
      const shouldBet = score >= t.betAt
        || (ctx.isAggressor && ctx.rng.next() < t.cbetFreq && score >= t.betAt * 0.72)
        || (draw > 0.6 && ctx.rng.next() < t.bluffFreq);
      if (shouldBet) {
        const frac = score >= t.raiseAt ? 0.75 : draw > 0.6 && score < t.betAt ? 0.6 : 0.5;
        const size = Math.min(ctx.stack, Math.max(ctx.bigBlind, Math.round(ctx.pot * frac)));
        why.push(
          score >= t.betAt
            ? `${mine.name} sits in the ${ordinal(rank * 100)} percentile of my range here, above my ${ordinal(t.betAt * 100)} percentile betting bar, so I bet for value.`
            : `I have a ${(draw * 100).toFixed(0)}% draw score and no showdown value, so this is a bluff at ${(t.bluffFreq * 100).toFixed(0)}% frequency.`,
        );
        return { action: 'bet', size, reasoning: why, numbers: nums };
      }
      why.push(`${mine.name} is only ${ordinal(rank * 100)} percentile, below my ${ordinal(t.betAt * 100)} percentile bar. I check.`);
      return { action: 'check', size: 0, reasoning: why, numbers: nums };
    }

    const price = potOdds(ctx.pot, ctx.toCall);
    const needed = price.requiredEquity;
    nums['price'] = `${(needed * 100).toFixed(0)}% needed to call`;
    const continueAt = this.profile.usesPotOdds
      ? clamp(t.continueAt + (needed - 0.25) * 0.9, 0.05, 0.97)
      : t.continueAt;
    nums['my bar'] = `${ordinal(continueAt * 100)} percentile`;

    if (score >= t.raiseAt) {
      why.push(`${mine.name} is ${ordinal(rank * 100)} percentile, past my ${ordinal(t.raiseAt * 100)} percentile raising bar. I raise for value.`);
      return { action: 'raise', size: Math.min(ctx.stack, ctx.toCall + Math.max(ctx.minRaise, Math.round(ctx.pot * 0.6))), reasoning: why, numbers: nums };
    }
    if (score >= continueAt) {
      why.push(
        this.profile.usesPotOdds
          ? `The bet asks for ${(needed * 100).toFixed(0)}% and ${mine.name} clears my ${ordinal(continueAt * 100)} percentile bar, so I call.`
          : `I have ${mine.name}. I do not fold that. Call.`,
      );
      return { action: 'call', size: Math.min(ctx.stack, ctx.toCall), reasoning: why, numbers: nums };
    }
    why.push(`${mine.name} is ${ordinal(rank * 100)} percentile, under the ${ordinal(continueAt * 100)} percentile this price demands. I fold.`);
    return { action: 'fold', size: 0, reasoning: why, numbers: nums };
  }
}

function clamp(x: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, x)); }

/** 1st, 2nd, 3rd, 4th ... 82nd. Reads as English rather than "82th". */
export function ordinal(n: number): string {
  const r = Math.round(n);
  const tens = r % 100;
  if (tens >= 11 && tens <= 13) return `${r}th`;
  return `${r}${['th', 'st', 'nd', 'rd'][r % 10] ?? 'th'}`;
}

/** Grid index for two cards; duplicated from ranges.ts to avoid a cycle. */
function handClassKey(c: Card[]): number {
  const a = rankOf(c[0]!);
  const b = rankOf(c[1]!);
  const suited = suitOf(c[0]!) === suitOf(c[1]!);
  const g = (r: number) => 14 - r;
  if (a === b) return g(a) * 13 + g(a);
  const hi = g(Math.max(a, b));
  const lo = g(Math.min(a, b));
  return suited ? hi * 13 + lo : lo * 13 + hi;
}

export const makeBot = (id: ArchetypeId): Bot => new Bot(PROFILES[id]);
export const ARCHETYPES: ArchetypeId[] = ['nit', 'station', 'tag'];

/** Best made-hand category a bot can hold on this board, for review copy. */
export const topOfRange = (range: Range, board: Card[], dead: Card[]): HandCategory =>
  rankRange(range, board, dead, 0)[0]
    ? evaluate([...rankRange(range, board, dead, 0)[0]!.combo, ...board]).category
    : HandCategory.HighCard;
