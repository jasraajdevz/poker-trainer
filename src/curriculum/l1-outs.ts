/**
 * L1 — Outs and odds.
 *
 * You count outs and estimate equity; both are graded against the engine. The
 * teaching happens in the gap between three numbers the app computes for every
 * spot: how many cards improve you, how many actually win, and what your equity
 * really is once villain gets to redraw.
 */

import { Card, cardsToString, createRng, makeDeck, shuffle } from '../engine/cards';
import { HandCategory, evaluate } from '../engine/evaluator';
import { equityVsHand } from '../engine/equity';
import { analyzeOuts, hitProbability, ruleOf2and4, ruleOf2and4Adjusted } from '../engine/odds';
import { ErrorTag } from '../coach/mistakes';
import { cfg } from '../coach/profile';
import { Drill, DrillAnswers, DrillFeedback, LevelModule, ProofLine } from './types';


interface Spot {
  hero: Card[];
  villain: Card[];
  board: Card[];
  street: 'flop' | 'turn';
}

/** street and whether the spot should carry dirty outs, by drill index. */
const PLAN: Array<{ street: 'flop' | 'turn'; dirty: boolean }> = [
  { street: 'flop', dirty: false }, { street: 'flop', dirty: false },
  { street: 'flop', dirty: false }, { street: 'flop', dirty: false },
  { street: 'turn', dirty: false }, { street: 'turn', dirty: false },
  { street: 'turn', dirty: false },
  { street: 'flop', dirty: true }, { street: 'flop', dirty: true },
  { street: 'flop', dirty: true },
  { street: 'turn', dirty: true }, { street: 'turn', dirty: true },
];

function findSpot(seed: string, street: 'flop' | 'turn', wantDirty: boolean): Spot {
  const rng = createRng(seed);
  const deck = makeDeck();
  const boardSize = street === 'flop' ? 3 : 4;
  let fallback: Spot | null = null;
  for (let attempt = 0; attempt < 8000; attempt++) {
    shuffle(deck, rng);
    const hero = deck.slice(0, 2);
    const villain = deck.slice(2, 4);
    const board = deck.slice(4, 4 + boardSize);
    if (evaluate([...villain, ...board]).category < HandCategory.Pair) continue;
    const a = analyzeOuts(hero, board, villain);
    if (a.aheadNow) continue;
    const outs = a.winningOuts.length;
    if (outs < 6 || outs > 15) continue;
    if (a.tyingOuts.length > 2) continue;
    const spot: Spot = { hero, villain, board, street };
    if (!fallback) fallback = spot;
    const dirty = a.falseOuts.length;
    if (wantDirty ? dirty >= 4 : dirty <= 2) return spot;
  }
  return fallback!;
}

function build(index: number, seed: string): Drill {
  const plan = PLAN[index % PLAN.length]!;
  const drillSeed = `${seed}:L1:${index}`;
  const spot = findSpot(drillSeed, plan.street, plan.dirty);
  const { hero, villain, board } = spot;

  const a = analyzeOuts(hero, board, villain);
  const outs = a.winningOuts.length;
  const cardsToCome = 5 - board.length;
  const unseen = a.unseenCount;

  const eqResult = equityVsHand(hero, villain, board);
  const equityPct = eqResult.equity[0]! * 100;
  const hitPct = hitProbability(outs, unseen, cardsToCome) * 100;
  const shortcutPct = ruleOf2and4(outs, cardsToCome) * 100;
  const adjustedPct = ruleOf2and4Adjusted(outs, cardsToCome) * 100;

  const heroRead = evaluate([...hero, ...board]);
  const villainRead = evaluate([...villain, ...board]);

  return {
    id: drillSeed,
    levelId: 'L1',
    index,
    seed: drillSeed,
    scene: {
      heroCards: hero,
      villainCards: villain,
      villainLabel: 'Villain (face up)',
      board,
      street: plan.street,
      caption:
        plan.street === 'flop'
          ? 'Two cards to come. Villain has turned their hand face up.'
          : 'One card to come. Villain has turned their hand face up.',
    },
    facts: [
      { label: 'Street', value: plan.street === 'flop' ? 'Flop — 2 cards to come' : 'Turn — 1 card to come' },
      { label: 'Unseen cards', value: String(unseen) },
      { label: 'You hold', value: heroRead.name },
      { label: 'Villain holds', value: villainRead.name, tone: 'bad' },
    ],
    steps: [
      {
        kind: 'number',
        id: 'outs',
        question: 'How many outs do you have?',
        unit: 'outs',
        min: 0,
        max: 25,
        tolerance: cfg().outsTolerance,
        hint: 'Count cards that WIN the hand, not cards that merely improve you.',
      },
      {
        kind: 'number',
        id: 'equity',
        question: 'What is your equity by the river?',
        unit: '%',
        min: 0,
        max: 100,
        tolerance: cfg().equityTolerance,
        hint: `Rule of ${cardsToCome === 2 ? '4' : '2'}: outs x ${cardsToCome === 2 ? 4 : 2}.`,
      },
    ],
    grade(answers: DrillAnswers): DrillFeedback {
      const givenOuts = Number(answers['outs']);
      const givenEq = Number(answers['equity']);
      const outsTol = cfg().outsTolerance;
      const eqTol = cfg().equityTolerance;
      const outsCorrect = Number.isFinite(givenOuts) && Math.abs(givenOuts - outs) <= outsTol;
      const eqCorrect = Number.isFinite(givenEq) && Math.abs(givenEq - equityPct) <= eqTol;
      const correct = outsCorrect && eqCorrect;

      const tags: ErrorTag[] = [];
      const dirtyTotal = outs + a.falseOuts.length;
      if (!outsCorrect) {
        if (a.falseOuts.length > 0 && Math.abs(givenOuts - dirtyTotal) <= 1) tags.push('counts-dirty-outs');
        else if (givenOuts > outs) tags.push('overcounts-outs');
        else tags.push('undercounts-outs');
      }
      if (!eqCorrect) {
        tags.push(givenEq > equityPct ? 'overestimates-equity' : 'underestimates-equity');
      }

      const proof: ProofLine[] = [
        {
          label: 'Cards that make you a hand',
          value: String(a.improvingCards.length),
          note: 'what naive counting sees',
        },
        {
          label: 'Cards that actually win',
          value: `${outs} of ${unseen}`,
          key: true,
          tone: 'good',
        },
      ];
      if (a.falseOuts.length > 0) {
        proof.push({
          label: 'Dirty outs',
          value: String(a.falseOuts.length),
          note: `${cardsToString(a.falseOuts)} — these pair you up and hand villain a better hand`,
          tone: 'bad',
        });
      }
      if (a.tyingOuts.length > 0) {
        proof.push({
          label: 'Cards that chop',
          value: String(a.tyingOuts.length),
          note: cardsToString(a.tyingOuts),
        });
      }
      proof.push({
        label: `Rule of ${cardsToCome === 2 ? '4' : '2'} on ${outs} outs`,
        value: `${shortcutPct.toFixed(0)}%`,
        note:
          cardsToCome === 2
            ? `adjusted (subtract outs over 8): ${adjustedPct.toFixed(0)}%`
            : 'on one card the shortcut is close to exact',
      });
      proof.push({
        label: 'Chance an out lands',
        value: `${hitPct.toFixed(1)}%`,
        note: 'exact hypergeometric, not the shortcut',
      });
      proof.push({
        label: 'Your real equity',
        value: `${equityPct.toFixed(1)}%`,
        key: true,
        note: eqResult.exact
          ? `exact — all ${eqResult.samples.toLocaleString()} runouts enumerated`
          : `Monte Carlo, +/- ${eqResult.margin95[0]!.toFixed(2)}`,
      });
      const gap = hitPct - equityPct;
      if (Math.abs(gap) > 0.75) {
        proof.push({
          label: 'Why those differ',
          value: `${gap > 0 ? '-' : '+'}${Math.abs(gap).toFixed(1)} points`,
          note:
            gap > 0
              ? 'villain redraws: sometimes you hit and still lose'
              : 'runner-runner: you win some pots without hitting a listed out',
        });
      }

      const parts: string[] = [];
      if (!outsCorrect) {
        parts.push(
          `You said ${givenOuts} outs; ${outs} of the ${unseen} unseen cards actually win.` +
            (a.falseOuts.length && Math.abs(givenOuts - dirtyTotal) <= 1
              ? ` You counted the ${a.falseOuts.length} dirty ones.`
              : ''),
        );
      }
      if (!eqCorrect) {
        parts.push(
          `You said ${givenEq.toFixed(0)}%; it is ${equityPct.toFixed(1)}%. ` +
            `You were allowed ${eqTol} points either side.`,
        );
      }
      if (parts.length === 0) {
        parts.push(
          `${outs} outs and ${equityPct.toFixed(1)}% — the rule of ${cardsToCome === 2 ? 4 : 2} said ` +
            `${shortcutPct.toFixed(0)}%, off by ${Math.abs(shortcutPct - equityPct).toFixed(1)} points.`,
        );
      }

      return {
        correct,
        verdicts: [
          { stepId: 'outs', correct: outsCorrect, given: `${givenOuts}`, expected: `${outs}` },
          {
            stepId: 'equity',
            correct: eqCorrect,
            given: `${Number.isFinite(givenEq) ? givenEq.toFixed(0) : '?'}%`,
            expected: `${equityPct.toFixed(1)}%`,
            detail: `+/- ${eqTol} points accepted`,
          },
        ],
        correctAction: `${outs} outs, ${equityPct.toFixed(1)}% equity`,
        proof,
        principle:
          cardsToCome === 2
            ? 'Multiply outs by four on the flop, then subtract the outs above eight — and remember an out has to win, not just improve you.'
            : 'On the turn, outs divided by unseen cards is your equity exactly. No shortcut needed.',
        counterfactual: parts.join(' '),
        errorTags: tags,
        evLostBB: 0,
      };
    },
  };
}

export const L1: LevelModule = {
  id: 'L1',
  title: 'Outs and odds',
  subtitle: 'Turn cards into a percentage',
  drillCount: 12,
  lesson: {
    body: [
      'An out is a card that wins you the hand. Not a card that improves you — a card that wins. That distinction is the whole level.',
      'Count them, then convert. On the flop, with two cards to come, multiply your outs by four. On the turn, with one card left, multiply by two. Nine outs on the flop is roughly 36%.',
      'The shortcut drifts. It overshoots badly above eight outs, so subtract the excess: fifteen outs is not 60%, it is about 54%. This level shows you the exact number every time so you can feel where the shortcut lies to you.',
      'Two traps. A dirty out pairs you and simultaneously gives villain something better. And hitting your card is not the same as winning the pot, because villain still gets to draw too.',
    ],
    terms: [
      { term: 'Out', definition: 'An unseen card that takes you from losing to winning.' },
      { term: 'Dirty out', definition: 'A card that improves your hand but improves theirs more.' },
      { term: 'Equity', definition: 'Your share of the pot if the hand were played to the river a thousand times.' },
    ],
  },
  generate: build,
};
