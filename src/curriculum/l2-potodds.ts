/**
 * L2 — Pot odds.
 *
 * Two numbers, every time: the price you are being offered, and your equity
 * against the hands villain can hold. You compute the first; the engine
 * computes the second; the comparison decides.
 *
 * Villain's range is a MODEL and is shown on screen: their Appendix A opening
 * range for that seat, narrowed to the strongest fraction on this board. The
 * narrowing is done by the evaluator, not by a table of "hands villain bets".
 */

import { Card, cardsToString, createRng, makeDeck, shuffle } from '../engine/cards';
import { HandCategory, evaluate } from '../engine/evaluator';
import { asCards, asCombos, computeEquity } from '../engine/equity';
import { rangeCombos } from '../engine/ranges';
import { Position, openingRange, openingPercent } from '../engine/preflopChart';
import { potOdds, impliedOddsNeeded } from '../engine/odds';
import { evCall, evFold } from '../engine/ev';
import { ErrorTag } from '../coach/mistakes';
import { cfg, getMode } from '../coach/profile';
import { Drill, DrillAnswers, DrillFeedback, LevelModule, ProofLine } from './types';

const BIG_BLIND = 10;

/** Bet sizes as a fraction of the pot, and how tight villain's betting range is. */
const PLAN = [
  { betFrac: 0.5, tight: 0.6, seat: 'CO' as Position },
  { betFrac: 0.75, tight: 0.45, seat: 'BTN' as Position },
  { betFrac: 0.33, tight: 0.7, seat: 'HJ' as Position },
  { betFrac: 1.0, tight: 0.3, seat: 'CO' as Position },
  { betFrac: 0.5, tight: 0.4, seat: 'UTG' as Position },
  { betFrac: 0.66, tight: 0.5, seat: 'BTN' as Position },
  { betFrac: 0.75, tight: 0.35, seat: 'HJ' as Position },
  { betFrac: 0.33, tight: 0.55, seat: 'BTN' as Position },
  { betFrac: 1.0, tight: 0.45, seat: 'CO' as Position },
  { betFrac: 0.5, tight: 0.3, seat: 'UTG' as Position },
  { betFrac: 0.66, tight: 0.65, seat: 'BTN' as Position },
  { betFrac: 1.5, tight: 0.25, seat: 'CO' as Position },
];

/**
 * Villain's betting range: their opening range, ranked by how strong each combo
 * actually is on this board, keeping the top slice. Computed, not tabulated.
 */
function bettingCombos(seat: Position, board: Card[], dead: Card[], keep: number): Card[][] {
  const combos = rangeCombos(openingRange(seat), [...board, ...dead]);
  const scored = combos
    .map((c) => ({ c, v: evaluate([...c, ...board]).value }))
    .sort((x, y) => y.v - x.v);
  const n = Math.max(4, Math.round(scored.length * keep));
  return scored.slice(0, n).map((s) => s.c);
}

interface Spot {
  hero: Card[];
  board: Card[];
  combos: Card[][];
  pot: number;
  bet: number;
  seat: Position;
  keep: number;
  equity: number;
  margin: number;
}

function findSpot(seed: string, plan: (typeof PLAN)[number]): Spot {
  const rng = createRng(seed);
  const deck = makeDeck();
  let fallback: Spot | null = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    shuffle(deck, rng);
    const hero = deck.slice(0, 2);
    const boardSize = rng.next() < 0.6 ? 3 : 4;
    const board = deck.slice(2, 2 + boardSize);
    const combos = bettingCombos(plan.seat, board, hero, plan.tight);
    if (combos.length < 4) continue;

    const potBefore = 60 + rng.int(9) * 10;
    const bet = Math.round((potBefore * plan.betFrac) / 5) * 5;
    if (bet <= 0) continue;
    const pot = potBefore + bet;

    const probe = computeEquity([asCards(hero), asCombos(combos)], board, {
      iterations: 3000, seed: `${seed}:probe:${attempt}`, forceMonteCarlo: true,
    });
    const eq = probe.equity[0]! * 100;
    const need = potOdds(pot, bet).requiredEquity * 100;
    const spot: Spot = {
      hero, board, combos, pot, bet, seat: plan.seat, keep: plan.tight,
      equity: eq, margin: probe.margin95[0]!,
    };
    if (!fallback) fallback = spot;
    const gap = Math.abs(eq - need);
    if (gap >= 4 && gap <= 30) return spot;
  }
  return fallback!;
}

function build(index: number, seed: string): Drill {
  const plan = PLAN[index % PLAN.length]!;
  const drillSeed = `${seed}:L2:${index}`;
  const spot = findSpot(drillSeed, plan);
  const { hero, board, combos, pot, bet, seat } = spot;

  // Grading-quality equity: many more samples than the generator probe used.
  const eqResult = computeEquity([asCards(hero), asCombos(combos)], board, {
    iterations: 30_000, seed: `${drillSeed}:grade`, forceMonteCarlo: true,
  });
  const equityPct = eqResult.equity[0]! * 100;
  const margin = eqResult.margin95[0]!;

  const price = potOdds(pot, bet);
  const requiredPct = price.requiredEquity * 100;
  const shouldCall = equityPct > requiredPct;
  const evOfCall = evCall(pot, bet, eqResult.equity[0]!);
  const heroRead = evaluate([...hero, ...board]);
  const potBefore = pot - bet;
  const betFracText = `${Math.round((bet / potBefore) * 100)}% pot`;

  return {
    id: drillSeed,
    levelId: 'L2',
    index,
    seed: drillSeed,
    scene: {
      heroCards: hero,
      board,
      potChips: pot,
      betChips: bet,
      bigBlind: BIG_BLIND,
      villainPosition: seat,
      street: board.length === 3 ? 'flop' : 'turn',
      villainRangeText: `${seat} opening range (${openingPercent(seat).toFixed(0)}%), strongest ${Math.round(
        spot.keep * 100,
      )}% on this board — ${combos.length} combos`,
      caption: getMode() === 'kid'
        ? `The other player adds ${bet} to a pile of ${potBefore}. It is ${bet} to you.`
        : `Villain bets ${bet} into ${potBefore}. It is ${bet} to you.`,
    },
    facts: [
      { label: 'Pot before the bet', value: `${potBefore}` },
      { label: getMode() === 'kid' ? 'They add' : 'Villain bets', value: `${bet}`, note: betFracText },
      { label: 'Pot now', value: `${pot}`, key: true },
      { label: 'To call', value: `${bet}` },
      { label: 'You hold', value: heroRead.name },
      {
        label: getMode() === 'kid' ? 'Their possible hands' : 'Villain range',
        value: `${combos.length} combos`,
        note: 'shown on the table — a model, not a read',
      },
    ],
    steps: [
      {
        kind: 'number',
        id: 'price',
        question: 'What equity do you need to break even on this call?',
        unit: '%',
        min: 0,
        max: 100,
        tolerance: cfg().priceTolerance,
        hint: 'What you put in, over the pot after you put it in.',
      },
      {
        kind: 'choice',
        id: 'action',
        question: 'Call or fold?',
        options: [
          { key: 'call', label: `Call ${bet}`, hotkey: 'c' },
          { key: 'fold', label: 'Fold', hotkey: 'f' },
        ],
      },
    ],
    grade(answers: DrillAnswers): DrillFeedback {
      const givenPrice = Number(answers['price']);
      const givenAction = String(answers['action'] ?? '');
      const priceTol = cfg().priceTolerance;
      const priceCorrect =
        Number.isFinite(givenPrice) && Math.abs(givenPrice - requiredPct) <= priceTol;
      const actionCorrect = givenAction === (shouldCall ? 'call' : 'fold');
      const correct = priceCorrect && actionCorrect;

      const tags: ErrorTag[] = [];
      if (!priceCorrect) tags.push('miscomputes-pot-odds');
      if (!actionCorrect) {
        if (givenAction === 'call') {
          tags.push('calls-without-odds');
          if (heroRead.category === HandCategory.Pair) tags.push('overvalues-top-pair');
        } else {
          tags.push('folds-with-odds');
          if (heroRead.category <= HandCategory.HighCard) tags.push('too-passive-with-draws');
        }
      }

      const evLostChips = actionCorrect ? 0 : Math.abs(evOfCall - evFold());
      const implied = impliedOddsNeeded(pot, bet, eqResult.equity[0]!);

      const proof: ProofLine[] = [
        {
          label: 'Price you are offered',
          value: `${price.ratioText}`,
          note: `${bet} to win ${pot}`,
        },
        {
          label: 'Equity needed',
          value: `${requiredPct.toFixed(1)}%`,
          key: true,
          note: `${bet} / (${pot} + ${bet})`,
        },
        {
          label: 'Your equity vs their range',
          value: `${equityPct.toFixed(1)}%`,
          key: true,
          tone: shouldCall ? 'good' : 'bad',
          note: `Monte Carlo, ${eqResult.samples.toLocaleString()} hands, +/- ${margin.toFixed(2)}`,
        },
        {
          label: 'EV of calling',
          value: `${evOfCall >= 0 ? '+' : ''}${evOfCall.toFixed(1)} chips (${(evOfCall / BIG_BLIND).toFixed(2)} bb)`,
          tone: evOfCall > 0 ? 'good' : 'bad',
          note: `${equityPct.toFixed(1)}% x ${pot} - ${(100 - equityPct).toFixed(1)}% x ${bet}`,
        },
        { label: 'EV of folding', value: '0.0 chips', note: 'always, by definition' },
      ];
      if (!shouldCall && Number.isFinite(implied) && implied > 0) {
        proof.push({
          label: 'Implied odds needed',
          value: `${implied.toFixed(0)} chips`,
          note: 'extra you would have to win later for the call to break even',
        });
      }
      proof.push({
        label: 'Villain range used',
        value: `${combos.length} combos`,
        note: `${cardsToString(combos[0]!)} … ${cardsToString(combos[combos.length - 1]!)} (strongest to weakest on this board)`,
      });

      const margin_ = Math.abs(equityPct - requiredPct);
      const counterfactual = shouldCall
        ? `Calling needs ${requiredPct.toFixed(1)}%; you have ${equityPct.toFixed(1)}%. Folding would become correct if villain's range tightened enough to drop you ${margin_.toFixed(1)} points.`
        : `You would need ${requiredPct.toFixed(1)}% and you have ${equityPct.toFixed(1)}% — short by ${margin_.toFixed(1)} points. A bet of ${Math.floor((equityPct / (100 - 2 * equityPct)) * potBefore)} or less would have priced you in.`;

      return {
        correct,
        verdicts: [
          {
            stepId: 'price',
            correct: priceCorrect,
            given: `${Number.isFinite(givenPrice) ? givenPrice.toFixed(0) : '?'}%`,
            expected: `${requiredPct.toFixed(1)}%`,
            detail: `+/- ${priceTol} points accepted`,
          },
          {
            stepId: 'action',
            correct: actionCorrect,
            given: givenAction === 'call' ? `Call ${bet}` : givenAction === 'fold' ? 'Fold' : '(no answer)',
            expected: shouldCall ? `Call ${bet}` : 'Fold',
          },
        ],
        correctAction: shouldCall ? `Call ${bet}` : 'Fold',
        proof,
        principle:
          'Every call is one comparison: the price the pot is offering against the equity you actually hold.',
        counterfactual,
        errorTags: tags,
        evLostBB: evLostChips / BIG_BLIND,
      };
    },
  };
}

export const L2: LevelModule = {
  id: 'L2',
  title: 'Pot odds',
  subtitle: 'Compare the price to your equity',
  drillCount: 12,
  lesson: {
    body: [
      'When someone bets, the pot offers you a price. Work it out the same way every time: what you have to put in, divided by the pot after you put it in.',
      'Villain bets 50 into 100. The pot is now 150 and it costs you 50, so the pot after your call is 200. You need 50 divided by 200, which is 25%.',
      'Then you need the other number: how often you actually win against the hands they could have. That is the part you cannot do in your head, and it is the part this app computes for you.',
      'Compare the two. Equity above the price, call. Below it, fold — unless you expect to win enough extra money later to cover the gap, which is what implied odds means.',
      'A note on breakeven: at exactly the price, calling and folding are worth the same. Neither is a mistake.',
    ],
    terms: [
      { term: 'Pot odds', definition: 'The equity you need for a call to break even.' },
      { term: 'Range', definition: 'All the hands an opponent could be holding here, not just the one you fear.' },
      { term: 'Implied odds', definition: 'Money you expect to win on later streets when you hit.' },
    ],
  },
  generate: build,
};
