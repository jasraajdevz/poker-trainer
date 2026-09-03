/**
 * L3 — Position. The same hand, six seats, and the number that explains why.
 *
 * Model, stated on screen: each player behind continues with a hand from their
 * own Appendix A opening range. The big blind has no opening range in the chart,
 * so it is modelled with the button's — the widest one available — because the
 * blind defends widest of all.
 */

import { Card, createRng, makeDeck, shuffle, cardsToString } from '../engine/cards';
import { equityVsRange } from '../engine/equity';
import { Range, handClassName, handClassOf, parseRange, rangeToPercent } from '../engine/ranges';
import { POSITIONS, Position, openingPercent, openingRange } from '../engine/preflopChart';
import { ErrorTag } from '../coach/mistakes';
import { Drill, DrillAnswers, DrillFeedback, LevelModule, ProofLine } from './types';

const OPEN_TO = 2.5;   // big blinds
const BLINDS = 1.5;

const SEATS: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];

/** Hands whose verdict actually changes with the seat — the interesting ones. */
function seatVerdicts(a: Card, b: Card): Record<Position, boolean> {
  const hc = handClassOf(a, b);
  const out = {} as Record<Position, boolean>;
  for (const p of SEATS) out[p] = openingRange(p).has(hc);
  out['BB'] = false;
  return out;
}

function behind(pos: Position): Position[] {
  const i = POSITIONS.indexOf(pos);
  return POSITIONS.slice(i + 1);
}

/** Continue range for a seat; BB is modelled with the widest chart range. */
function continueRange(pos: Position): Range {
  return pos === 'BB' ? openingRange('BTN') : openingRange(pos);
}

function continuePct(pos: Position): number {
  return pos === 'BB' ? openingPercent('BTN') : openingPercent(pos);
}

interface SeatMath { pos: Position; walk: number; equity: number; ev: number; chartOpens: boolean; }

function seatMath(hand: Card[], pos: Position, chartOpens: boolean, iterations: number, seed: string): SeatMath {
  const rest = behind(pos);
  const walk = rest.reduce((p, s) => p * (1 - continuePct(s) / 100), 1);
  const union = new Set<number>();
  for (const s of rest) for (const hc of continueRange(s)) union.add(hc);
  const equity = rest.length === 0
    ? 1
    : equityVsRange(hand, union, [], { iterations, seed: `${seed}:${pos}` }).equity[0]!;
  const ev = walk * BLINDS + (1 - walk) * (equity * (2 * OPEN_TO + 0.5 - OPEN_TO) - (1 - equity) * OPEN_TO);
  return { pos, walk, equity, ev, chartOpens };
}

function build(index: number, seed: string, iterations = 25_000): Drill {
  const drillSeed = `${seed}:L3:${index}`;
  const rng = createRng(drillSeed);
  const deck = makeDeck();
  let hand: Card[] = [];
  let verdicts: Record<Position, boolean> = {} as Record<Position, boolean>;
  for (let i = 0; i < 500; i++) {
    shuffle(deck, rng);
    hand = deck.slice(0, 2);
    verdicts = seatVerdicts(hand[0]!, hand[1]!);
    const opens = SEATS.filter((p) => verdicts[p]).length;
    if (opens >= 1 && opens <= 4) break; // the verdict must actually change
  }
  const pos = SEATS[index % SEATS.length]!;
  const chartOpens = verdicts[pos];
  const className = handClassName(handClassOf(hand[0]!, hand[1]!));

  return {
    id: drillSeed, levelId: 'L3', index, seed: drillSeed,
    scene: {
      heroCards: hand, street: 'preflop', heroPosition: pos,
      caption: `Folded to you in the ${pos}. Six-max, 100bb, everyone still to act behind you.`,
      villainRangeText: `${behind(pos).length} players behind, each continuing with their own opening range`,
    },
    facts: [
      { label: 'Your seat', value: pos, key: true },
      { label: 'Your hand', value: `${className}  (${cardsToString(hand)})` },
      { label: 'Players behind', value: String(behind(pos).length) },
      { label: 'Open size', value: `${OPEN_TO}bb` },
    ],
    steps: [{
      kind: 'choice', id: 'action', question: `Open or fold ${className} from the ${pos}?`,
      options: [
        { key: 'open', label: `Open to ${OPEN_TO}bb`, hotkey: 'r' },
        { key: 'fold', label: 'Fold', hotkey: 'f' },
      ],
    }],
    grade(answers: DrillAnswers): DrillFeedback {
      const given = String(answers['action'] ?? '');
      const correct = given === (chartOpens ? 'open' : 'fold');
      const table = SEATS.map((p) => seatMath(hand, p, verdicts[p], iterations, drillSeed));
      const mine = table.find((t) => t.pos === pos)!;
      const opensAt = table.filter((t) => t.chartOpens).map((t) => t.pos);

      const tags: ErrorTag[] = [];
      if (!correct) {
        tags.push('ignores-position');
        tags.push(given === 'open' ? 'opens-too-loose' : 'opens-too-tight');
        const nm = className;
        if (given === 'open' && nm.endsWith('o') && nm.startsWith('A')) tags.push('overplays-offsuit-aces');
        if (given === 'fold' && nm.endsWith('s') && Math.abs(nm.charCodeAt(0) - nm.charCodeAt(1)) <= 2) {
          tags.push('too-tight-with-suited-connectors');
        }
      }

      const proof: ProofLine[] = table.map((t) => ({
        label: t.pos === pos ? `${t.pos}  ← you` : t.pos,
        value: `${t.chartOpens ? 'OPEN' : 'fold'}   ${t.ev >= 0 ? '+' : ''}${t.ev.toFixed(2)} bb`,
        note: `everyone folds ${(t.walk * 100).toFixed(0)}% · equity when called ${(t.equity * 100).toFixed(1)}%`,
        key: t.pos === pos,
        tone: t.chartOpens ? 'good' : 'bad',
      }));
      proof.push({
        label: 'Why it moves',
        value: `${(table[0]!.walk * 100).toFixed(0)}% → ${(table[table.length - 1]!.walk * 100).toFixed(0)}%`,
        note: 'chance everyone folds, UTG through SB. That is the whole of position in one number.',
      });
      proof.push({
        label: 'EV model',
        value: `walk × ${BLINDS}bb + called × (eq × 3.0bb − (1−eq) × ${OPEN_TO}bb)`,
        note: 'single-decision open model, one caller assumed',
      });

      return {
        correct,
        verdicts: [{
          stepId: 'action', correct,
          given: given === 'open' ? `Open to ${OPEN_TO}bb` : given === 'fold' ? 'Fold' : '(none)',
          expected: chartOpens ? `Open to ${OPEN_TO}bb` : 'Fold',
        }],
        correctAction: chartOpens ? `Open to ${OPEN_TO}bb` : 'Fold',
        proof,
        principle: 'Position is not a feeling: it is the chance everybody folds, and that chance triples between the first seat and the button.',
        counterfactual: opensAt.length
          ? `${className} is an open from ${opensAt.join(', ')} and a fold everywhere else. From the ${pos} the field folds ${(mine.walk * 100).toFixed(0)}% of the time, worth ${mine.ev >= 0 ? '+' : ''}${mine.ev.toFixed(2)}bb; you would need the field to fold ${(((OPEN_TO * (1 - mine.equity) - mine.equity * 3) / (BLINDS + OPEN_TO * (1 - mine.equity) - mine.equity * 3)) * 100).toFixed(0)}% for a bare steal to break even.`
          : `${className} is a fold from every seat in the baseline chart.`,
        errorTags: tags,
        evLostBB: correct ? 0 : Math.abs(mine.ev),
        meta: { handClass: className, position: pos },
      };
    },
  };
}

export const L3: LevelModule = {
  id: 'L3', title: 'Position', subtitle: 'The same hand from six seats', drillCount: 12,
  lesson: {
    body: [
      'Position means how many people still get to act after you. In the first seat, five players can wake up with a better hand. On the button, only two can.',
      'That single fact changes everything. The same hand that is an easy fold up front is a clear raise on the button, and nothing about the cards changed.',
      'Here is the number that makes it concrete: from the first seat, everyone folds to your raise about a third of the time. From the button, it is more than half. Stealing the blinds uncontested is most of what late position is worth.',
      'This level shows you one seat, asks for a decision, then lays out all six with the computed win rate and expected value of opening from each.',
    ],
    terms: [
      { term: 'Open', definition: 'Being the first player to put in a raise.' },
      { term: 'Steal', definition: 'Raising late with a mediocre hand hoping the blinds simply fold.' },
    ],
  },
  generate: (i, s, n) => build(i, s, n),
};

export const buildL3 = build;
export { SEATS as L3_SEATS };
export const L3_REFERENCE = parseRange('22+');
export const rangeWidth = rangeToPercent;
