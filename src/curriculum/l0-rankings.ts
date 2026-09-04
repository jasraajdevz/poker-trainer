/**
 * L0 — Hand rankings. Two hole hands, one shared board, pick the winner.
 *
 * Difficulty is not a hand-authored list. Each deal is classified by how the
 * evaluator actually separated the two hands, and drills are rejection-sampled
 * until they hit the tier this drill index calls for. So the nasty ones —
 * kicker battles, chops, boards that play — are found, not scripted.
 */

import { Card, cardsToString, createRng, makeDeck, shuffle } from '../engine/cards';
import { CATEGORY_NAMES, HandCategory, HandValue, evaluate } from '../engine/evaluator';
import { ErrorTag } from '../coach/mistakes';
import { Drill, DrillAnswers, DrillFeedback, LevelModule, ProofLine } from './types';

/** 1 = obvious, 5 = a chop you have to see. */
type Tier = 1 | 2 | 3 | 4 | 5;

const TIER_BY_INDEX: Tier[] = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5];

interface Deal {
  a: Card[];
  b: Card[];
  board: Card[];
  va: HandValue;
  vb: HandValue;
  tier: Tier;
  /** Index of the first tiebreaker that differs, or -1 for a chop. */
  splitAt: number;
  boardPlays: boolean;
}

function firstDifference(va: HandValue, vb: HandValue): number {
  for (let i = 0; i < 5; i++) if (va.tiebreakers[i] !== vb.tiebreakers[i]) return i;
  return -1;
}

function classify(a: Card[], b: Card[], board: Card[]): Deal {
  const va = evaluate([...a, ...board]);
  const vb = evaluate([...b, ...board]);
  const boardSet = new Set(board);
  const boardPlays =
    va.best5.every((c) => boardSet.has(c)) && vb.best5.every((c) => boardSet.has(c));
  let tier: Tier;
  let splitAt = -1;
  if (va.value === vb.value) {
    tier = 5;
  } else if (va.category !== vb.category) {
    tier = Math.abs(va.category - vb.category) >= 2 ? 1 : 2;
  } else {
    splitAt = firstDifference(va, vb);
    tier = splitAt === 0 ? 3 : 4;
  }
  return { a, b, board, va, vb, tier, splitAt, boardPlays };
}

function deal(seed: string, wanted: Tier): Deal {
  const rng = createRng(seed);
  const deck = makeDeck();
  let fallback: Deal | null = null;
  for (let attempt = 0; attempt < 6000; attempt++) {
    shuffle(deck, rng);
    const d = classify(deck.slice(0, 2), deck.slice(2, 4), deck.slice(4, 9));
    if (d.tier === wanted) return d;
    if (!fallback || Math.abs(d.tier - wanted) < Math.abs(fallback.tier - wanted)) fallback = d;
  }
  return fallback!;
}

/** What the differing tiebreaker slot means for this category, in English. */
function slotLabel(cat: HandCategory, i: number): string {
  switch (cat) {
    case HandCategory.FourOfAKind: return i === 0 ? 'the quads' : 'the kicker';
    case HandCategory.FullHouse: return i === 0 ? 'the trips' : 'the pair';
    case HandCategory.ThreeOfAKind: return i === 0 ? 'the trips' : `kicker ${i}`;
    case HandCategory.TwoPair:
      return i === 0 ? 'the top pair' : i === 1 ? 'the second pair' : 'the kicker';
    case HandCategory.Pair: return i === 0 ? 'the pair' : `kicker ${i}`;
    case HandCategory.Straight:
    case HandCategory.StraightFlush: return 'the top of the run';
    case HandCategory.Flush:
    case HandCategory.HighCard: return i === 0 ? 'the top card' : `card ${i + 1}`;
    default: return `card ${i + 1}`;
  }
}

function reason(d: Deal): string {
  if (d.va.value === d.vb.value) {
    return d.boardPlays
      ? 'Neither hole card improves on the board, so the board plays and the pot is split.'
      : 'Both players make the identical five-card hand, so the pot is split.';
  }
  const hi = d.va.value > d.vb.value ? d.va : d.vb;
  const lo = d.va.value > d.vb.value ? d.vb : d.va;
  if (hi.category !== lo.category) {
    return `${CATEGORY_NAMES[hi.category]} beats ${CATEGORY_NAMES[lo.category]}.`;
  }
  return `Both make ${CATEGORY_NAMES[hi.category].toLowerCase()}; ${slotLabel(hi.category, d.splitAt)} separates them.`;
}

const TIER_PRINCIPLE: Record<Tier, string> = {
  1: 'Name the category first — the ladder settles most showdowns before you look at a single kicker.',
  2: 'Adjacent categories are where people slip: a flush beats a straight, a full house beats both.',
  3: 'Same category means you compare the thing that names it — the pair, the trips, the top of the run.',
  4: 'When the headline matches, keep reading across. The fifth card is still a card.',
  5: 'If neither hole card improves on the board, nobody wins — check for the chop before you celebrate.',
};

function build(index: number, seed: string): Drill {
  const tier = TIER_BY_INDEX[index % TIER_BY_INDEX.length]!;
  const drillSeed = `${seed}:L0:${index}`;
  const d = deal(drillSeed, tier);
  const truth: 'a' | 'b' | 'chop' =
    d.va.value > d.vb.value ? 'a' : d.vb.value > d.va.value ? 'b' : 'chop';

  const label: Record<string, string> = {
    a: 'Hand A wins', b: 'Hand B wins', chop: 'Split pot',
  };

  return {
    id: drillSeed,
    levelId: 'L0',
    index,
    seed: drillSeed,
    scene: {
      board: d.board,
      street: 'river',
      hands: [
        { label: 'Hand A', cards: d.a },
        { label: 'Hand B', cards: d.b },
      ],
      caption: 'Both hands are face up. Who takes it?',
    },
    facts: [],
    steps: [
      {
        kind: 'choice',
        id: 'winner',
        question: 'Who wins at showdown?',
        options: [
          { key: 'a', label: 'Hand A', hotkey: '1' },
          { key: 'b', label: 'Hand B', hotkey: '2' },
          { key: 'chop', label: 'Split pot', hotkey: '3' },
        ],
      },
    ],
    grade(answers: DrillAnswers): DrillFeedback {
      const given = String(answers['winner'] ?? '');
      const correct = given === truth;
      const tags: ErrorTag[] = [];
      if (!correct) {
        if (truth === 'chop') {
          tags.push('misses-chops');
          if (d.boardPlays) tags.push('misses-board-plays');
        } else if (d.tier === 4) tags.push('misreads-kickers');
        else tags.push('misreads-hand-strength');
      }

      const proof: ProofLine[] = [
        {
          label: 'Hand A plays',
          value: d.va.name,
          note: cardsToString(d.va.best5),
          tone: truth === 'a' ? 'good' : truth === 'chop' ? 'neutral' : 'bad',
        },
        {
          label: 'Hand B plays',
          value: d.vb.name,
          note: cardsToString(d.vb.best5),
          tone: truth === 'b' ? 'good' : truth === 'chop' ? 'neutral' : 'bad',
        },
        {
          label: 'Decided by',
          value: reason(d),
          key: true,
        },
        {
          label: 'Hand strength',
          value: `A: ${d.va.value.toLocaleString()}   B: ${d.vb.value.toLocaleString()}`,
          note: 'the evaluator’s comparable score — equal means a genuine chop',
        },
      ];

      const counterfactual =
        truth === 'chop'
          ? 'For either player to win outright, one hole card would have to beat the fifth board card.'
          : `${label[truth]}. ${label[truth === 'a' ? 'b' : 'a']} would need to improve ${slotLabel(
              Math.max(d.va.category, d.vb.category),
              Math.max(d.splitAt, 0),
            )}.`;

      return {
        correct,
        verdicts: [
          {
            stepId: 'winner',
            correct,
            given: label[given] ?? '(no answer)',
            expected: label[truth]!,
          },
        ],
        correctAction: label[truth]!,
        proof,
        principle: TIER_PRINCIPLE[d.tier],
        counterfactual,
        errorTags: tags,
        evLostBB: 0,
      };
    },
  };
}

export const L0: LevelModule = {
  id: 'L0',
  title: 'Hand rankings',
  subtitle: 'Read a showdown instantly',
  tracksTime: true,
  drillCount: 15,
  lesson: {
    body: [
      'Every hand you will ever hold is one of nine shapes. From the top: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card.',
      'You get seven cards — your two plus the five on the board — and you play the best five of them. Your other two simply vanish. That is why the board sometimes wins for everybody.',
      'When two players land in the same shape, you compare the thing that names it first: the pair, then the trips, then the top of the run. If those match, you keep reading across to the kickers.',
      'Speed comes with practice, and the app quietly notices your reads getting faster — never as a score, just so you can watch yourself improve. A visible clock is in settings if you ever want one.',
    ],
    terms: [
      { term: 'Kicker', definition: 'A card that is not part of your pair or trips but still breaks ties.' },
      { term: 'The board plays', definition: 'The best five cards are all community cards, so everyone still in has the same hand.' },
      { term: 'Counterfeited', definition: 'The board pairs higher than your pair, demoting your two pair to a worse one.' },
    ],
  },
  generate: build,
};
