/**
 * L7 — Value, bluff or check, decided by the two questions that matter:
 * would a worse hand call, and would a better hand fold. Both are counted from
 * the opponent's actual partitioned range, not asserted.
 */

import { cardsToString, createRng, makeDeck, shuffle } from '../engine/cards';
import { evaluate } from '../engine/evaluator';
import { asCards, asRange, computeEquity } from '../engine/equity';
import { ArchetypeId, makeBot } from '../engine/bots';
import { Position } from '../engine/preflopChart';
import { breakevenFoldFrequency, evBet, evCheck } from '../engine/ev';
import { ErrorTag } from '../coach/mistakes';
import { Drill, DrillAnswers, DrillFeedback, LevelModule, ProofLine } from './types';

const BB = 10;
const CAST: Array<{ bot: ArchetypeId; seat: Position }> = [
  { bot: 'tag', seat: 'CO' }, { bot: 'station', seat: 'BTN' }, { bot: 'nit', seat: 'HJ' },
  { bot: 'station', seat: 'CO' }, { bot: 'tag', seat: 'BTN' }, { bot: 'nit', seat: 'BTN' },
];

function build(index: number, seed: string, iterations = 20_000): Drill {
  const drillSeed = `${seed}:L7:${index}`;
  const rng = createRng(drillSeed);
  const cast = CAST[index % CAST.length]!;
  const bot = makeBot(cast.bot);
  const deck = makeDeck();
  shuffle(deck, rng);
  const hero = deck.slice(0, 2);
  const board = deck.slice(2, 7); // river: the cleanest place to ask this
  const pot = 60 + rng.int(9) * 10;
  const bet = Math.round((pot * 0.66) / 5) * 5;

  const range = bot.openingRange(cast.seat);
  const r = bot.respondTo(hero, board, pot, bet, range, drillSeed);
  const heroVal = evaluate([...hero, ...board]).value;

  // Would a worse hand call? Count the calling subset this hand actually beats.
  const callBeaten = r.callCombos.filter((c) => evaluate([...c, ...board]).value < heroVal).length;
  const worseCalls = r.callCombos.length ? callBeaten / r.callCombos.length : 0;
  // Would a better hand fold? Count folders that currently beat this hand.
  const foldBetter = r.foldCombos.filter((c) => evaluate([...c, ...board]).value > heroVal).length;
  const betterFolds = r.foldCombos.length ? foldBetter / r.foldCombos.length : 0;

  const heroEq = computeEquity([asCards(hero), asRange(range)], board, {
    iterations, seed: `${drillSeed}:eq`, forceMonteCarlo: true,
  }).equity[0]!;

  const evOfBet = evBet(pot, bet, r);
  const evOfCheck = evCheck(pot, heroEq);
  const betWins = evOfBet > evOfCheck;
  const truth: 'value' | 'bluff' | 'check' =
    !betWins ? 'check' : r.equityWhenCalled >= 0.5 ? 'value' : 'bluff';

  return {
    id: drillSeed, levelId: 'L7', index, seed: drillSeed,
    scene: {
      heroCards: hero, board, potChips: pot, bigBlind: BB, street: 'river',
      villainPosition: cast.seat,
      villainRangeText: `${bot.name} in the ${cast.seat} — ${bot.profile.blurb}`,
      caption: `River. ${bot.name} checks to you. Pot ${pot}; a two-thirds bet is ${bet}.`,
    },
    facts: [
      { label: 'Pot', value: String(pot), key: true },
      { label: 'Bet under consideration', value: String(bet), note: '66% pot' },
      { label: 'You hold', value: evaluate([...hero, ...board]).name, note: cardsToString(hero) },
      { label: 'Opponent', value: bot.name, note: bot.profile.blurb },
    ],
    steps: [{
      kind: 'choice', id: 'plan', question: 'Bet for value, bluff, or check?',
      options: [
        { key: 'value', label: `Bet ${bet} for value`, hotkey: '1' },
        { key: 'bluff', label: `Bet ${bet} as a bluff`, hotkey: '2' },
        { key: 'check', label: 'Check', hotkey: 'x' },
      ],
    }],
    grade(answers: DrillAnswers): DrillFeedback {
      const given = String(answers['plan'] ?? '');
      const correct = given === truth;
      const tags: ErrorTag[] = [];
      if (!correct) {
        if (truth === 'check' && given !== 'check') {
          if (bot.id === 'station') tags.push('bluffs-into-calling-stations');
          else tags.push('bets-with-no-value-and-no-fold-equity');
        }
        if (truth === 'value' && given === 'check') tags.push('checks-back-value');
        if (truth === 'bluff' && given === 'check') tags.push('too-passive-with-draws');
        if (truth === 'value' && given === 'bluff') tags.push('checks-back-value');
        if (truth === 'bluff' && given === 'value') tags.push('overvalues-top-pair');
      }
      const need = breakevenFoldFrequency(pot, bet, r.equityWhenCalled);
      const label: Record<string, string> = {
        value: `Bet ${bet} for value`, bluff: `Bet ${bet} as a bluff`, check: 'Check',
      };

      const proof: ProofLine[] = [
        {
          label: 'Would a worse hand call?',
          value: `${(worseCalls * 100).toFixed(0)}% yes`,
          key: true,
          tone: worseCalls > 0.5 ? 'good' : 'bad',
          note: `${callBeaten} of the ${r.callCombos.length} combos that call are behind you`,
        },
        {
          label: 'Would a better hand fold?',
          value: `${(betterFolds * 100).toFixed(0)}% yes`,
          key: true,
          tone: betterFolds > 0.2 ? 'good' : 'bad',
          note: `${foldBetter} of the ${r.foldCombos.length} combos that fold are ahead of you`,
        },
        { label: 'They fold', value: `${(r.fold * 100).toFixed(0)}%`, note: `a bluff needs ${(need * 100).toFixed(0)}%` },
        { label: 'They call', value: `${(r.call * 100).toFixed(0)}%`, note: `you win ${(r.equityWhenCalled * 100).toFixed(0)}% when they do` },
        { label: 'They raise', value: `${(r.raise * 100).toFixed(0)}%` },
        {
          label: `EV of betting ${bet}`,
          value: `${evOfBet >= 0 ? '+' : ''}${evOfBet.toFixed(1)} chips`,
          tone: betWins ? 'good' : 'bad', key: betWins,
        },
        {
          label: 'EV of checking',
          value: `${evOfCheck >= 0 ? '+' : ''}${evOfCheck.toFixed(1)} chips`,
          tone: betWins ? 'bad' : 'good', key: !betWins,
          note: `${(heroEq * 100).toFixed(1)}% × ${pot}`,
        },
      ];

      return {
        correct,
        verdicts: [{ stepId: 'plan', correct, given: label[given] ?? '(none)', expected: label[truth]! }],
        correctAction: label[truth]!,
        proof,
        principle: 'Bet only if a worse hand calls you, or a better hand folds. If neither is true, checking costs nothing and betting costs the bet.',
        counterfactual: truth === 'check'
          ? `Neither test passes: ${(worseCalls * 100).toFixed(0)}% of callers are worse and only ${(betterFolds * 100).toFixed(0)}% of folders are better. Betting needs ${(need * 100).toFixed(0)}% folds and ${bot.name} gives you ${(r.fold * 100).toFixed(0)}%.`
          : truth === 'value'
            ? `You beat ${(r.equityWhenCalled * 100).toFixed(0)}% of what calls, so betting earns ${(evOfBet - evOfCheck).toFixed(1)} chips more than checking. Checking would only be right if their calling range beat you more than half the time.`
            : `You have little showdown value, but ${bot.name} folds ${(r.fold * 100).toFixed(0)}% and a bluff needs only ${(need * 100).toFixed(0)}%. That gap is worth ${(evOfBet - evOfCheck).toFixed(1)} chips.`,
        errorTags: tags,
        evLostBB: correct ? 0 : Math.abs(Math.max(evOfBet, evOfCheck) - (given === 'check' ? evOfCheck : evOfBet)) / BB,
      };
    },
  };
}

export const L7: LevelModule = {
  id: 'L7', title: 'Value or bluff', subtitle: 'Would a worse hand call?', drillCount: 12,
  lesson: {
    body: [
      'There are only two reasons to bet. Either a worse hand will call you, which is a value bet, or a better hand will fold, which is a bluff. If neither is true, betting is just donating.',
      'Beginners bet hands in the middle: too good to fold, not good enough to get called by worse. Those hands want to check. They win at showdown often enough and lose money every time they bet.',
      'The test is concrete. Look at the hands they would call with. Do you beat most of them? Then bet for value. Look at the hands they would fold. Are they beating you? Then a bluff has a job.',
      'One opponent breaks the rule entirely: the calling station. They never fold, so bluffing them is a pure loss and value betting them is a gift. The app counts their calling range for you.',
    ],
    terms: [
      { term: 'Value bet', definition: 'A bet that worse hands call.' },
      { term: 'Bluff catcher', definition: 'A hand that only beats bluffs — usually a check.' },
    ],
  },
  generate: (i, s, n) => build(i, s, n),
};

export const buildL7 = build;
