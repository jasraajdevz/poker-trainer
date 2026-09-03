/**
 * L4 — Preflop ranges, graded against the Appendix A baseline on a 13x13 grid.
 */

import { Card, cardsToString, createRng, makeDeck, shuffle } from '../engine/cards';
import { handClassName, handClassOf, comboCount } from '../engine/ranges';
import { Position, openingPercent, openingRange, CHART_LABEL, QUOTED_PERCENT } from '../engine/preflopChart';
import { equityVsRange } from '../engine/equity';
import { ErrorTag } from '../coach/mistakes';
import { Drill, DrillAnswers, DrillFeedback, LevelModule, ProofLine } from './types';

const SEATS: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];

function build(index: number, seed: string): Drill {
  const drillSeed = `${seed}:L4:${index}`;
  const rng = createRng(drillSeed);
  const pos = SEATS[index % SEATS.length]!;
  const range = openingRange(pos);
  const deck = makeDeck();
  // Alternate between hands inside and outside the range so the answer is not
  // guessable from the frequency, and favour marginal hands near the boundary.
  const wantIn = index % 2 === 0;
  let hand: Card[] = [];
  for (let i = 0; i < 800; i++) {
    shuffle(deck, rng);
    hand = deck.slice(0, 2);
    if (range.has(handClassOf(hand[0]!, hand[1]!)) === wantIn) break;
  }
  const hc = handClassOf(hand[0]!, hand[1]!);
  const name = handClassName(hc);
  const inRange = range.has(hc);

  return {
    id: drillSeed, levelId: 'L4', index, seed: drillSeed,
    scene: {
      heroCards: hand, street: 'preflop', heroPosition: pos,
      caption: `Folded to you in the ${pos}.`,
    },
    facts: [
      { label: 'Seat', value: pos, key: true },
      { label: 'Hand', value: `${name}  (${cardsToString(hand)})` },
      { label: `${pos} opens`, value: `${openingPercent(pos).toFixed(1)}%`, note: `${comboCount(range)} of 1326 combos` },
      { label: 'Reference', value: CHART_LABEL },
    ],
    steps: [{
      kind: 'choice', id: 'action', question: `${name} from the ${pos} — open or fold?`,
      options: [
        { key: 'open', label: 'Open', hotkey: 'r' },
        { key: 'fold', label: 'Fold', hotkey: 'f' },
      ],
    }],
    grade(answers: DrillAnswers): DrillFeedback {
      const given = String(answers['action'] ?? '');
      const correct = given === (inRange ? 'open' : 'fold');
      const tags: ErrorTag[] = [];
      if (!correct) {
        tags.push(given === 'open' ? 'opens-too-loose' : 'opens-too-tight');
        if (given === 'open' && name.endsWith('o') && name[0] === 'A') tags.push('overplays-offsuit-aces');
        if (given === 'fold' && name.endsWith('s')
            && Math.abs('AKQJT98765432'.indexOf(name[0]!) - 'AKQJT98765432'.indexOf(name[1]!)) <= 2) {
          tags.push('too-tight-with-suited-connectors');
        }
      }
      const wider = SEATS.filter((p) => openingRange(p).has(hc));
      const eqVsChart = equityVsRange(hand, openingRange('BTN'), [], {
        iterations: 20_000, seed: `${drillSeed}:eq`,
      }).equity[0]! * 100;

      const proof: ProofLine[] = [
        { label: 'Baseline verdict', value: inRange ? 'OPEN' : 'FOLD', key: true, tone: inRange ? 'good' : 'bad' },
        { label: 'Opened from', value: wider.length ? wider.join(', ') : 'no seat', note: 'in the baseline chart' },
        {
          label: `${pos} range width`,
          value: `${openingPercent(pos).toFixed(1)}%`,
          note: `the chart prints ~${QUOTED_PERCENT[pos as keyof typeof QUOTED_PERCENT]}%; the notation actually counts ${comboCount(range)} combos`,
        },
        {
          label: `${name} vs a button range`,
          value: `${eqVsChart.toFixed(1)}%`,
          note: 'all-in equity against a 41.5% opening range, computed',
        },
      ];

      return {
        correct,
        verdicts: [{
          stepId: 'action', correct,
          given: given === 'open' ? 'Open' : given === 'fold' ? 'Fold' : '(none)',
          expected: inRange ? 'Open' : 'Fold',
        }],
        correctAction: inRange ? 'Open' : 'Fold',
        proof,
        principle: 'A range is a shape, not a list — aces and pairs push down the left edge, suited hands spread up the diagonal, and offsuit junk never makes it in.',
        counterfactual: inRange
          ? `${name} is inside the ${pos} range. Moving one seat earlier${wider.length && wider[0] !== 'UTG' ? ` (to ${SEATS[Math.max(0, SEATS.indexOf(pos) - 1)]})` : ''} would ${wider.includes(SEATS[Math.max(0, SEATS.indexOf(pos) - 1)]!) ? 'still open it' : 'make it a fold'}.`
          : `${name} is outside the ${pos} range. It first becomes an open ${wider.length ? `from the ${wider[0]}` : 'from no seat in this chart'}.`,
        errorTags: tags,
        evLostBB: correct ? 0 : 0.4,
        meta: { handClass: name, handClassIndex: hc, position: pos, verdict: inRange ? 'open' : 'fold', given },
      };
    },
  };
}

export const L4: LevelModule = {
  id: 'L4', title: 'Preflop ranges', subtitle: 'Open or fold, graded on the grid', drillCount: 15,
  lesson: {
    body: [
      'Every starting hand belongs to one of 169 groups: thirteen pairs, seventy-eight suited hands, seventy-eight offsuit ones. Laid out on a grid, a good opening range has a recognisable shape.',
      'Pairs run down the diagonal. Suited hands sit above it and are worth far more than they look, because they flop draws. Offsuit hands sit below and fall away fast.',
      'You are graded against a simplified baseline chart, not a solver. It is a shape to learn, then break on purpose later.',
      'The app builds a heat map of where you differ from it — so you can see whether your leak is loose offsuit aces, or folding suited connectors you should be playing.',
    ],
    terms: [
      { term: 'Suited', definition: 'Both cards the same suit — worth roughly 3% more equity and a lot more playability.' },
      { term: 'Range shape', definition: 'The outline your opening hands trace on the grid.' },
    ],
  },
  generate: build,
};
