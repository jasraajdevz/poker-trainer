/**
 * L5 — Board texture, decided by measurement rather than adjectives.
 *
 * Two computed quantities:
 *   coverage — the share of all 1326 starting hands that connect with this flop
 *              (a pair or better, or a real draw). This is "wetness".
 *   split    — actual range-versus-range equity between the preflop raiser and
 *              the caller on this exact board.
 *
 * The wet/dry cut-off is not a taste call: it is the median coverage across a
 * fixed sample of random flops, computed once on first use.
 */

import { Card, cardsToString, createRng, makeDeck, shuffle, rankOf, suitOf } from '../engine/cards';
import { HandCategory, evaluate } from '../engine/evaluator';
import { drawStrength } from '../engine/bots';
import { asRange, computeEquity } from '../engine/equity';
import { rangeCombos, FULL_RANGE } from '../engine/ranges';
import { openingPercent, openingRange } from '../engine/preflopChart';
import { ErrorTag } from '../coach/mistakes';
import { Drill, DrillAnswers, DrillFeedback, LevelModule, ProofLine } from './types';

export interface Texture {
  coverage: number;   // share of all hands that connect
  strong: number;     // share making two pair or better
  suits: number;      // most cards of one suit on the flop
  paired: boolean;
  spanTop: number;    // highest card rank
  gap: number;        // rank span of the three cards
}

export function measure(board: Card[]): Texture {
  const combos = rangeCombos(FULL_RANGE, board);
  let connect = 0;
  let strong = 0;
  for (const c of combos) {
    const v = evaluate([...c, ...board]);
    const hit = v.category >= HandCategory.Pair || drawStrength(c, board) >= 0.6;
    if (hit) connect++;
    if (v.category >= HandCategory.TwoPair) strong++;
  }
  const suitCount = [0, 0, 0, 0];
  for (const c of board) suitCount[suitOf(c)]!++;
  const ranks = board.map(rankOf).sort((a, b) => b - a);
  return {
    coverage: connect / combos.length,
    strong: strong / combos.length,
    suits: Math.max(...suitCount),
    paired: new Set(ranks).size < ranks.length,
    spanTop: ranks[0]!,
    gap: ranks[0]! - ranks[ranks.length - 1]!,
  };
}

let cachedCut: number | null = null;
/** Median coverage over a fixed sample of flops — the wet/dry line. */
export function wetnessCutoff(): number {
  if (cachedCut !== null) return cachedCut;
  const rng = createRng('texture-calibration');
  const deck = makeDeck();
  const xs: number[] = [];
  for (let i = 0; i < 120; i++) {
    shuffle(deck, rng);
    xs.push(measure(deck.slice(0, 3)).coverage);
  }
  xs.sort((a, b) => a - b);
  cachedCut = xs[xs.length >> 1]!;
  return cachedCut;
}

const RAISER = 'CO';
const CALLER = 'BTN'; // stands in for the defending blind: the widest chart range

function build(index: number, seed: string, iterations = 25_000): Drill {
  const drillSeed = `${seed}:L5:${index}`;
  const rng = createRng(drillSeed);
  const deck = makeDeck();
  const wantWet = index % 2 === 0;
  const cut = wetnessCutoff();
  let board: Card[] = [];
  let tex = {} as Texture;
  for (let i = 0; i < 120; i++) {
    shuffle(deck, rng);
    board = deck.slice(0, 3);
    tex = measure(board);
    if ((tex.coverage >= cut) === wantWet && Math.abs(tex.coverage - cut) > 0.015) break;
  }
  const isWet = tex.coverage >= cut;

  const split = computeEquity(
    [asRange(openingRange(RAISER)), asRange(openingRange(CALLER))],
    board, { iterations, seed: `${drillSeed}:split`, forceMonteCarlo: true },
  );
  const raiserEq = split.equity[0]! * 100;
  const favoursRaiser = raiserEq > 50;

  return {
    id: drillSeed, levelId: 'L5', index, seed: drillSeed,
    scene: {
      board, street: 'flop',
      caption: `The ${RAISER} raised preflop and the ${CALLER} called. This is the flop.`,
      villainRangeText: `${RAISER} ${openingPercent(RAISER).toFixed(0)}% vs ${CALLER} ${openingPercent(CALLER).toFixed(0)}%`,
    },
    facts: [
      { label: 'Flop', value: cardsToString(board), key: true },
      { label: 'Top card', value: String(tex.spanTop) },
      { label: 'Suits', value: tex.suits === 3 ? 'monotone' : tex.suits === 2 ? 'two-tone' : 'rainbow' },
      { label: 'Paired', value: tex.paired ? 'yes' : 'no' },
    ],
    steps: [
      {
        kind: 'choice', id: 'texture', question: 'Wet or dry?',
        options: [
          { key: 'wet', label: 'Wet — connects with a lot of hands', hotkey: '1' },
          { key: 'dry', label: 'Dry — misses most hands', hotkey: '2' },
        ],
      },
      {
        kind: 'choice', id: 'favours', question: 'Which range does this flop favour?',
        options: [
          { key: 'raiser', label: `The raiser (${RAISER})`, hotkey: '1' },
          { key: 'caller', label: `The caller (${CALLER})`, hotkey: '2' },
        ],
      },
    ],
    grade(answers: DrillAnswers): DrillFeedback {
      const gTex = String(answers['texture'] ?? '');
      const gFav = String(answers['favours'] ?? '');
      const texOk = gTex === (isWet ? 'wet' : 'dry');
      const favOk = gFav === (favoursRaiser ? 'raiser' : 'caller');
      const correct = texOk && favOk;
      const tags: ErrorTag[] = [];
      if (!texOk || !favOk) tags.push('misreads-board-texture');

      const proof: ProofLine[] = [
        {
          label: 'Hands that connect',
          value: `${(tex.coverage * 100).toFixed(1)}%`,
          key: true,
          tone: isWet ? 'bad' : 'good',
          note: `of all 1326 starting hands make a pair or better, or a real draw. Median flop: ${(cut * 100).toFixed(1)}%`,
        },
        { label: 'Hands making two pair+', value: `${(tex.strong * 100).toFixed(1)}%` },
        {
          label: `${RAISER} range equity`,
          value: `${raiserEq.toFixed(1)}%`,
          key: true,
          tone: favoursRaiser ? 'good' : 'bad',
          note: `range vs range, ${split.samples.toLocaleString()} hands, ±${split.margin95[0]!.toFixed(2)}`,
        },
        { label: `${CALLER} range equity`, value: `${(100 - raiserEq).toFixed(1)}%` },
        {
          label: 'Structure',
          value: [
            tex.suits === 3 ? 'monotone' : tex.suits === 2 ? 'two-tone' : 'rainbow',
            tex.paired ? 'paired' : 'unpaired',
            tex.gap <= 4 ? 'connected' : 'disconnected',
          ].join(', '),
        },
      ];

      return {
        correct,
        verdicts: [
          { stepId: 'texture', correct: texOk, given: gTex || '(none)', expected: isWet ? 'wet' : 'dry' },
          {
            stepId: 'favours', correct: favOk,
            given: gFav === 'raiser' ? RAISER : gFav === 'caller' ? CALLER : '(none)',
            expected: favoursRaiser ? RAISER : CALLER,
          },
        ],
        correctAction: `${isWet ? 'Wet' : 'Dry'}, favours the ${favoursRaiser ? `raiser (${RAISER})` : `caller (${CALLER})`}`,
        proof,
        principle: 'High disconnected boards belong to the raiser because only they hold the big cards; low connected ones belong to the caller because their looser range is what actually connects.',
        counterfactual: `This flop connects with ${(tex.coverage * 100).toFixed(1)}% of hands against a median flop's ${(cut * 100).toFixed(1)}%, so it is ${isWet ? 'wet' : 'dry'}. The equity split is ${raiserEq.toFixed(1)} / ${(100 - raiserEq).toFixed(1)}; it would have to move ${Math.abs(raiserEq - 50).toFixed(1)} points to flip.`,
        errorTags: tags,
        evLostBB: 0,
      };
    },
  };
}

export const L5: LevelModule = {
  id: 'L5', title: 'Board texture', subtitle: 'Who does this flop favour?', drillCount: 12,
  lesson: {
    body: [
      'A dry board misses almost everybody. Ace, seven, deuce with three different suits gives most hands nothing at all.',
      'A wet board hits a lot of hands and keeps changing. Nine, eight, seven with two hearts is full of straights, draws and pairs, and the best hand on the flop often is not the best hand on the river.',
      'Then ask who the board belongs to. The preflop raiser holds more big cards, so high disconnected flops belong to them. The caller holds more small suited and connected hands, so low coordinated flops belong to the caller.',
      'This app does not use adjectives to decide. It counts how many of the 1326 starting hands connect with the flop, and it runs the raiser range against the caller range to see who is actually ahead.',
    ],
    terms: [
      { term: 'Wet', definition: 'A board that connects with many hands and many draws.' },
      { term: 'Range advantage', definition: 'Having more of the strong hands on a given board than your opponent does.' },
    ],
  },
  generate: (i, s, n) => build(i, s, n),
};

export const buildL5 = build;
