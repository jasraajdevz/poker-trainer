/**
 * L6 — Bet sizing, graded on EV against the opponent's real response function.
 *
 * For every size we ask the bot to partition its range into fold / call / raise,
 * measure hero's equity against the calling part with the equity engine, and
 * run that through evBet(). The winner is whichever size actually prints most.
 */

import { Card, cardsToString, createRng, makeDeck, shuffle } from '../engine/cards';
import { evaluate } from '../engine/evaluator';
import { asCards, asRange, computeEquity } from '../engine/equity';
import { ArchetypeId, Bot, makeBot } from '../engine/bots';
import { Position, openingPercent } from '../engine/preflopChart';
import { ActionEV, breakevenFoldFrequency, evBet, evCheck, rankActions } from '../engine/ev';
import { minimumDefenceFrequency } from '../engine/odds';
import { ErrorTag } from '../coach/mistakes';
import { Drill, DrillAnswers, DrillFeedback, LevelModule, ProofLine } from './types';

const BB = 10;
const SIZES = [
  { key: '33', frac: 0.33, label: '33% pot', hotkey: '1' },
  { key: '66', frac: 0.66, label: '66% pot', hotkey: '2' },
  { key: '100', frac: 1.0, label: 'Pot', hotkey: '3' },
  { key: '150', frac: 1.5, label: 'Overbet 150%', hotkey: '4' },
];

const CAST: Array<{ bot: ArchetypeId; seat: Position }> = [
  { bot: 'tag', seat: 'CO' }, { bot: 'station', seat: 'BTN' }, { bot: 'nit', seat: 'HJ' },
  { bot: 'tag', seat: 'BTN' }, { bot: 'station', seat: 'CO' }, { bot: 'nit', seat: 'CO' },
];

export interface SizingLine {
  key: string; label: string; bet: number; ev: number;
  fold: number; call: number; raise: number; equityWhenCalled: number;
}

export function sizingLines(bot: Bot, hero: Card[], board: Card[], pot: number, seat: Position, seed: string): SizingLine[] {
  const range = bot.openingRange(seat);
  return SIZES.map((s) => {
    const bet = Math.max(BB, Math.round((pot * s.frac) / 5) * 5);
    const r = bot.respondTo(hero, board, pot, bet, range, `${seed}:${s.key}`);
    return {
      key: s.key, label: s.label, bet, ev: evBet(pot, bet, r),
      fold: r.fold, call: r.call, raise: r.raise, equityWhenCalled: r.equityWhenCalled,
    };
  });
}

function build(index: number, seed: string, iterations = 20_000): Drill {
  const drillSeed = `${seed}:L6:${index}`;
  const rng = createRng(drillSeed);
  const cast = CAST[index % CAST.length]!;
  const bot = makeBot(cast.bot);
  const deck = makeDeck();
  shuffle(deck, rng);
  const hero = deck.slice(0, 2);
  const board = deck.slice(2, rng.next() < 0.6 ? 5 : 6);
  const pot = 60 + rng.int(9) * 10;

  const lines = sizingLines(bot, hero, board, pot, cast.seat, drillSeed);
  const heroEq = computeEquity([asCards(hero), asRange(bot.openingRange(cast.seat))], board, {
    iterations, seed: `${drillSeed}:eq`, forceMonteCarlo: true,
  }).equity[0]!;
  const checkEV = evCheck(pot, heroEq);

  const options: ActionEV[] = [
    ...lines.map((l) => ({ action: 'bet' as const, size: l.bet, ev: l.ev, label: l.label })),
    { action: 'check' as const, size: 0, ev: checkEV, label: 'Check' },
  ];
  const ranked = rankActions(options);
  const bestKey = ranked.best.action === 'check'
    ? 'check'
    : lines.find((l) => l.bet === ranked.best.size)!.key;

  const heroRead = evaluate([...hero, ...board]);

  return {
    id: drillSeed, levelId: 'L6', index, seed: drillSeed,
    scene: {
      heroCards: hero, board, potChips: pot, bigBlind: BB,
      street: board.length === 3 ? 'flop' : 'turn',
      villainPosition: cast.seat,
      villainRangeText: `${bot.name} in the ${cast.seat} — ${bot.profile.blurb}`,
      caption: `${bot.name} checks to you. Pot is ${pot}.`,
    },
    facts: [
      { label: 'Pot', value: String(pot), key: true },
      { label: 'You hold', value: heroRead.name, note: cardsToString(hero) },
      { label: 'Opponent', value: bot.name, note: `${cast.seat}, opening ${openingPercent(cast.seat).toFixed(0)}%` },
      { label: 'Their style', value: bot.profile.blurb },
    ],
    steps: [{
      kind: 'choice', id: 'size', question: 'How much do you bet?',
      options: [
        ...SIZES.map((s, i) => ({
          key: s.key, label: `${s.label} — ${lines[i]!.bet}`, hotkey: s.hotkey,
        })),
        { key: 'check', label: 'Check', hotkey: 'x' },
      ],
    }],
    grade(answers: DrillAnswers): DrillFeedback {
      const given = String(answers['size'] ?? '');
      const correct = given === bestKey;
      const chosen = options.find((o) =>
        given === 'check' ? o.action === 'check' : o.size === lines.find((l) => l.key === given)?.bet);
      const evLost = chosen ? ranked.best.ev - chosen.ev : ranked.best.ev;

      const tags: ErrorTag[] = [];
      if (!correct) {
        tags.push('wrong-size-for-texture');
        const line = lines.find((l) => l.key === given);
        if (line && heroEq < 0.4 && line.fold < breakevenFoldFrequency(pot, line.bet, line.equityWhenCalled)) {
          tags.push(bot.id === 'station' ? 'bluffs-into-calling-stations' : 'bets-with-no-value-and-no-fold-equity');
        }
        if (given === 'check' && heroEq > 0.6) tags.push('checks-back-value');
      }

      const proof: ProofLine[] = lines.map((l) => ({
        label: `${l.label}  (${l.bet})`,
        value: `${l.ev >= 0 ? '+' : ''}${l.ev.toFixed(1)} chips`,
        note: `folds ${(l.fold * 100).toFixed(0)}% · calls ${(l.call * 100).toFixed(0)}% · raises ${(l.raise * 100).toFixed(0)}% · your equity when called ${(l.equityWhenCalled * 100).toFixed(0)}%`,
        key: l.key === bestKey,
        tone: l.key === bestKey ? 'good' : undefined,
      }));
      proof.push({
        label: 'Check', value: `${checkEV >= 0 ? '+' : ''}${checkEV.toFixed(1)} chips`,
        note: `${(heroEq * 100).toFixed(1)}% equity × ${pot} pot`,
        key: bestKey === 'check', tone: bestKey === 'check' ? 'good' : undefined,
      });
      const bestLine = lines.find((l) => l.key === bestKey);
      if (bestLine) {
        proof.push({
          label: 'What belongs at this size',
          value: heroEq > bestLine.equityWhenCalled ? 'value' : 'pressure',
          note: heroEq >= 0.55
            ? `You beat the ${(bestLine.call * 100).toFixed(0)}% that calls, so this is a value bet — you want hands ahead of their calling range here.`
            : `A bluff at this size needs ${(breakevenFoldFrequency(pot, bestLine.bet, bestLine.equityWhenCalled) * 100).toFixed(0)}% folds and gets ${(bestLine.fold * 100).toFixed(0)}%. Their minimum defence frequency is ${(minimumDefenceFrequency(pot, bestLine.bet) * 100).toFixed(0)}%.`,
        });
      }

      return {
        correct,
        verdicts: [{
          stepId: 'size', correct,
          given: given === 'check' ? 'Check' : (lines.find((l) => l.key === given)?.label ?? '(none)'),
          expected: ranked.best.label,
        }],
        correctAction: ranked.best.label,
        proof,
        principle: 'Size is a question about their range, not yours: pick the number that makes the most money against how this specific opponent responds to it.',
        counterfactual: correct
          ? `${ranked.best.label} beats the runner-up by ${ranked.gapToSecond.toFixed(1)} chips (${(ranked.gapToSecond / BB).toFixed(2)}bb).`
          : `${ranked.best.label} makes ${ranked.best.ev.toFixed(1)} chips; your choice makes ${(chosen?.ev ?? 0).toFixed(1)}. You gave up ${(evLost / BB).toFixed(2)}bb. For your size to win, ${bot.name} would have to fold ${((breakevenFoldFrequency(pot, lines.find((l) => l.key === given)?.bet ?? pot, 0) * 100)).toFixed(0)}% instead of ${((lines.find((l) => l.key === given)?.fold ?? 0) * 100).toFixed(0)}%.`,
        errorTags: tags,
        evLostBB: Math.max(0, evLost) / BB,
      };
    },
  };
}

export const L6: LevelModule = {
  id: 'L6', title: 'Bet sizing', subtitle: 'Pick a size, grade it on EV', drillCount: 12,
  lesson: {
    body: [
      'A bet size is a question you ask your opponent, and different sizes ask different questions.',
      'Small, around a third of the pot, asks a lot of hands to keep paying. It works on dry boards where they have almost nothing and you want the weak stuff to stick around.',
      'Big, two thirds up to the whole pot, charges draws properly and puts real pressure on one-pair hands. Use it on wet boards where letting them see a card cheaply costs you.',
      'An overbet says one thing only: I am either the nuts or nothing. Save it for boards where your range has hands theirs cannot have.',
      'Against a calling station, none of this applies to bluffs — they do not fold, so you size up with value and stop bluffing entirely. This level computes the EV of every size against the exact opponent in front of you.',
    ],
    terms: [
      { term: 'Fold equity', definition: 'The money you make from the times they simply give up.' },
      { term: 'Overbet', definition: 'A bet larger than the pot.' },
    ],
  },
  generate: (i, s, n) => build(i, s, n),
};

export const buildL6 = build;
