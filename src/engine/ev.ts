/**
 * ev.ts — expected value of each action, in chips.
 *
 * Sign convention: EV is measured from this decision forward. Money already in
 * the pot is sunk and never appears. Folding is therefore exactly 0, and every
 * other action is scored against it.
 *
 * `pot` is the pot before your action, including any bet you are facing.
 *
 * This is a ONE-DECISION model: it resolves at showdown with no further
 * betting, except that a raise from villain is modelled explicitly. It is the
 * right tool for grading a single drill decision. The full multi-street tree is
 * handled by game.ts + bots.ts in the L8 hand replays.
 */

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface VillainResponse {
  /** Probabilities, must sum to 1. */
  fold: number;
  call: number;
  raise: number;
  /** Your equity against the subset of hands that calls. */
  equityWhenCalled: number;
  /** Your equity against the subset that raises. Defaults to 0. */
  equityWhenRaised?: number;
  /** Villain's total raise amount. Required if raise > 0. */
  raiseTo?: number;
}

export const evFold = (): number => 0;

/** Check it down: you invest nothing and win the pot with your equity share. */
export const evCheck = (pot: number, equity: number): number => equity * pot;

/** Call a bet: win the pot with your equity, otherwise lose the call. */
export const evCall = (pot: number, toCall: number, equity: number): number =>
  equity * pot - (1 - equity) * toCall;

/** Equity at which calling exactly breaks even. Same number as pot odds. */
export const breakevenEquity = (pot: number, toCall: number): number =>
  toCall / (pot + toCall);

/**
 * EV of betting `bet` into `pot` against a response model.
 * When villain raises you take the better of folding and calling the raise.
 */
export function evBet(pot: number, bet: number, r: VillainResponse): number {
  const total = r.fold + r.call + r.raise;
  if (Math.abs(total - 1) > 1e-6) throw new Error(`response probabilities sum to ${total}, not 1`);
  if (r.raise > 0 && r.raiseTo === undefined) throw new Error('raiseTo required when raise > 0');

  const whenFolds = pot;
  const eqC = r.equityWhenCalled;
  const whenCalls = eqC * (pot + bet) - (1 - eqC) * bet;

  let whenRaises = 0;
  if (r.raise > 0) {
    const R = r.raiseTo!;
    const eqR = r.equityWhenRaised ?? 0;
    const foldToRaise = -bet;
    const callRaise = eqR * (pot + R) - (1 - eqR) * R;
    whenRaises = Math.max(foldToRaise, callRaise);
  }

  return r.fold * whenFolds + r.call * whenCalls + r.raise * whenRaises;
}

/**
 * How often a bet must take the pot down immediately to break even, given the
 * equity it retains when called. With zero equity this is the familiar
 * risk / (risk + reward).
 *
 * Returns 0 when the bet is already profitable against a caller — there is no
 * fold frequency you need, so the honest answer is "none".
 */
export function breakevenFoldFrequency(pot: number, bet: number, equityWhenCalled = 0): number {
  // f*pot + (1-f)*[e*(pot+bet) - (1-e)*bet] = 0
  const called = equityWhenCalled * (pot + bet) - (1 - equityWhenCalled) * bet;
  const denom = pot - called;
  if (Math.abs(denom) < 1e-12) return called >= 0 ? 0 : 1;
  const f = -called / denom;
  return Math.min(1, Math.max(0, f));
}

export interface ActionEV {
  action: ActionKind;
  /** Size in chips; 0 for fold and check. */
  size: number;
  ev: number;
  label: string;
}

/** Highest-EV option, with the gap to the runner-up. */
export function rankActions(options: ActionEV[]): {
  best: ActionEV;
  ranked: ActionEV[];
  /** EV the second-best option gives up, in chips. */
  gapToSecond: number;
} {
  if (options.length === 0) throw new Error('no actions to rank');
  const ranked = [...options].sort((a, b) => b.ev - a.ev);
  return {
    best: ranked[0]!,
    ranked,
    gapToSecond: ranked.length > 1 ? ranked[0]!.ev - ranked[1]!.ev : 0,
  };
}

export const toBB = (chips: number, bigBlind: number): number => chips / bigBlind;

/** EV you gave up by choosing `chosen` instead of the best option, in chips. */
export function evLost(options: ActionEV[], chosen: ActionKind, size = 0): number {
  const { best } = rankActions(options);
  const mine = options.find(
    (o) => o.action === chosen && (o.size === size || chosen === 'fold' || chosen === 'check'),
  );
  if (!mine) throw new Error(`chosen action ${chosen} ${size} is not among the options`);
  return best.ev - mine.ev;
}
