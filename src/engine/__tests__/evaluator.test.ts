import { describe, it, expect } from 'vitest';
import { parseCards, cardsToString, createRng, makeDeck, shuffle } from '../cards';
import { evaluate, compareHands, HandCategory } from '../evaluator';
import { refEvaluate, refCompare } from './referenceEvaluator';

const ev = (s: string) => evaluate(parseCards(s));
const cmp = (a: string, b: string) => compareHands(parseCards(a), parseCards(b));

describe('every hand category', () => {
  const cases: Array<[string, string, HandCategory, string]> = [
    ['high card', 'As Kd 9h 7c 5s 3d 2c', HandCategory.HighCard, 'High Card, Ace'],
    ['one pair', 'As Ad 9h 7c 5s 3d 2c', HandCategory.Pair, 'Pair of Aces'],
    ['two pair', 'As Ad 9h 9c 5s 3d 2c', HandCategory.TwoPair, 'Two Pair, Aces and Nines'],
    ['trips', 'As Ad Ah 9c 5s 3d 2c', HandCategory.ThreeOfAKind, 'Three of a Kind, Aces'],
    ['straight', '9s 8d 7h 6c 5s Kd 2c', HandCategory.Straight, 'Straight, Nine high'],
    ['flush', 'As Ks 9s 7s 5s 3d 2c', HandCategory.Flush, 'Flush, Ace high'],
    ['full house', 'As Ad Ah 9c 9s 3d 2c', HandCategory.FullHouse, 'Full House, Aces full of Nines'],
    ['quads', 'As Ad Ah Ac 9s 3d 2c', HandCategory.FourOfAKind, 'Four of a Kind, Aces'],
    ['straight flush', '9s 8s 7s 6s 5s Kd 2c', HandCategory.StraightFlush, 'Straight Flush, Nine high'],
    ['royal flush', 'As Ks Qs Js Ts 3d 2c', HandCategory.StraightFlush, 'Royal Flush'],
  ];
  for (const [label, cards, cat, name] of cases) {
    it(`recognizes ${label}`, () => {
      const h = ev(cards);
      expect(h.category).toBe(cat);
      expect(h.name).toBe(name);
      expect(h.best5).toHaveLength(5);
    });
  }

  it('orders the categories strictly', () => {
    const ladder = cases.slice(0, 9).map(([, c]) => evaluate(parseCards(c)).value);
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]).toBeGreaterThan(ladder[i - 1]!);
    }
  });
});

describe('tricky cases', () => {
  it('1. wheel A2345 is a FIVE high straight, not ace high', () => {
    const h = ev('As 2d 3h 4c 5s Kd 9c');
    expect(h.category).toBe(HandCategory.Straight);
    expect(h.tiebreakers[0]).toBe(5);
    expect(h.name).toBe('Straight, Five high');
  });

  it('2. wheel loses to a six-high straight', () => {
    expect(cmp('6s 2d 3h 4c 5s Kd 9c', 'As 2d 3h 4c 5s Kd 9c')).toBe(1);
  });

  it('3. steel wheel is a five-high straight flush', () => {
    const h = ev('As 2s 3s 4s 5s Kd 9c');
    expect(h.category).toBe(HandCategory.StraightFlush);
    expect(h.tiebreakers[0]).toBe(5);
  });

  it('4. steel wheel loses to a six-high straight flush', () => {
    expect(cmp('6s 2s 3s 4s 5s Kd 9c', 'As 2s 3s 4s 5s Kd 9c')).toBe(1);
  });

  it('5. steel wheel beats the ace-high flush it sits inside', () => {
    // As2s3s4s5s + Ks: naive code returns "flush, ace high". It is a straight flush.
    const h = ev('As 2s 3s 4s 5s Ks Qc');
    expect(h.category).toBe(HandCategory.StraightFlush);
    expect(h.tiebreakers[0]).toBe(5);
  });

  it('6. broadway is an ace-high straight and beats a king-high straight', () => {
    expect(ev('As Ks Qd Jh Tc 3d 2c').tiebreakers[0]).toBe(14);
    expect(cmp('As Ks Qd Jh Tc 3d 2c', 'Ks Qd Jh Tc 9h 3d 2c')).toBe(1);
  });

  it('7. the ace does not wrap: Q-K-A-2-3 is not a straight', () => {
    const h = ev('Qs Kd Ah 2c 3s 9d 7c');
    expect(h.category).toBe(HandCategory.HighCard);
    expect(h.tiebreakers).toEqual([14, 13, 12, 9, 7]);
  });

  it('8. a flush and a straight can coexist; the flush wins', () => {
    const h = ev('5h 6h 7h Kh Ah 8s 9d');
    expect(h.category).toBe(HandCategory.Flush);
    expect(h.tiebreakers).toEqual([14, 13, 7, 6, 5]);
  });

  it('9. board plays: counterfeited two pair chops', () => {
    // Both players are pure spectators: AAKK9 plays for everyone.
    expect(cmp('3h 2c Ah Ad Kc Ks 9h', '5s 4d Ah Ad Kc Ks 9h')).toBe(0);
  });

  it('10. board full house plays and chops', () => {
    expect(cmp('2s 3d Ah Ad Ac Ks Kd', '4s 5d Ah Ad Ac Ks Kd')).toBe(0);
  });

  it('11. three pair uses the top two pairs, third pair is the kicker', () => {
    const h = ev('As Ad Ks Kd 9h 9c 4s');
    expect(h.category).toBe(HandCategory.TwoPair);
    expect(h.tiebreakers).toEqual([14, 13, 9, 0, 0]);
  });

  it('12. two trips make a full house, lower trip plays as the pair', () => {
    const h = ev('As Ad Ah Ks Kd Kh 4s');
    expect(h.category).toBe(HandCategory.FullHouse);
    expect(h.tiebreakers).toEqual([14, 13, 0, 0, 0]);
    expect(h.value).toBe(ev('As Ad Ah Ks Kd 4s 2c').value);
  });

  it('13. full house compares trips first, then the pair', () => {
    expect(cmp('As Ad Ah 2s 2d 9c 7h', 'Ks Kd Kh Qs Qd 9c 7h')).toBe(1);
    expect(cmp('Ks Kd Kh Qs Qd 9c 7h', 'Ks Kd Kh Js Jd 9c 7h')).toBe(1);
  });

  it('14. set over set', () => {
    expect(cmp('9h 9c 9s 5s 2d Kh Qd', '5h 5c 5s 9s 2d Kh Qd')).toBe(1);
  });

  it('15. kicker battle on a paired-nothing board', () => {
    expect(cmp('As Kd Ah 9s 4d 7c 2h', 'Ac Qd Ah 9s 4d 7c 2h')).toBe(1);
  });

  it('16. only three kickers count with one pair', () => {
    const h = ev('9h 9c As Kd Qh Js 2c');
    expect(h.category).toBe(HandCategory.Pair);
    expect(h.tiebreakers).toEqual([9, 14, 13, 12, 0]);
    // The jack is irrelevant, so swapping it changes nothing.
    expect(h.value).toBe(ev('9h 9c As Kd Qh 3s 2c').value);
  });

  it('17. quads on the board: the hand kicker decides', () => {
    expect(cmp('Ah 3d 7h 7d 7c 7s 2d', 'Kh 4d 7h 7d 7c 7s 2d')).toBe(1);
  });

  it('18. quads on the board with an ace kicker on the board: chop', () => {
    expect(cmp('Kh 3d 7h 7d 7c 7s Ad', 'Qh 4d 7h 7d 7c 7s Ad')).toBe(0);
  });

  it('19. flush kicker battle runs all five cards', () => {
    // A-9-7-5-2 beats K-Q-9-7-5: the top card outranks everything below it.
    expect(cmp('Ah 2h 9h 7h 5h 2c 3d', 'Kh Qh 9h 7h 5h 2c 3d')).toBe(1);
    // second card breaks the tie when the first matches
    expect(cmp('Ah 2h 9h 7h 5h 2c 3d', 'Ah 3h 9h 7h 5h 2c 3d')).toBe(-1);
  });

  it('20. a six-card flush uses only the best five', () => {
    const h = ev('Ah Kh Qh Jh 9h 8h 2c');
    expect(h.category).toBe(HandCategory.Flush);
    expect(h.tiebreakers).toEqual([14, 13, 12, 11, 9]);
  });

  it('21. a seven-card flush uses only the best five', () => {
    const h = ev('Ah Kh Qh 9h 7h 5h 3h');
    expect(h.tiebreakers).toEqual([14, 13, 12, 9, 7]);
  });

  it('22. straight flush beats quads', () => {
    expect(cmp('6s 5s 9s 9d 7s 8s 2d', '9h 9c 9s 9d 7s 8s 2d')).toBe(1);
  });

  it('23. the straight uses the highest available run', () => {
    expect(ev('Jh 2d 6c 7d 8h 9s Tc').tiebreakers[0]).toBe(11);
    expect(cmp('Jh 2d 6c 7d 8h 9s Tc', '5h 2c 6c 7d 8h 9s Tc')).toBe(1);
  });

  it('24. both players play the board straight: chop', () => {
    expect(cmp('2h 3d 6c 7d 8h 9s Tc', '4h 5d 6c 7d 8h 9s Tc')).toBe(0);
  });

  it('25. four of one suit plus three of another is not a flush', () => {
    const h = ev('Ah Kh Qh Jh 9d 8d 7d');
    expect(h.category).toBe(HandCategory.HighCard);
    expect(h.tiebreakers).toEqual([14, 13, 12, 11, 9]);
  });

  it('26. straight flush with a higher off-run flush card ranks by the run', () => {
    const h = ev('3s 4s 5s 6s 7s As 2c');
    expect(h.category).toBe(HandCategory.StraightFlush);
    expect(h.tiebreakers[0]).toBe(7);
  });

  it('27. six suited connectors take the highest straight flush', () => {
    expect(ev('3s 4s 5s 6s 7s 8s 2c').tiebreakers[0]).toBe(8);
  });

  it('28. counterfeited two pair loses to a live overpair', () => {
    // Hero holds 65 on 6-5-2-A-A. The board's aces demote the five to a kicker.
    expect(cmp('6h 5c 6s 5d 2h Ac Ad', 'Kh Kd 6s 5d 2h Ac Ad')).toBe(-1);
  });

  it('29. full house beats a flush when both are possible across players', () => {
    // Hero: 9h9c on 9s Qh 2h 5h 8h -> trips. Villain: Ah Kh -> flush.
    expect(cmp('9h 9c 9s Qh 2h 5h 8h', 'Ah Kh 9s Qh 2h 5h 8h')).toBe(-1);
    // Add a board pair and the full house takes over.
    expect(cmp('9h 9c 9s Qh Qd 5h 8h', 'Ah Kh 9s Qh Qd 5h 8h')).toBe(1);
  });

  it('30. best5 reports the actual five cards used', () => {
    const h = ev('As Ad Ah Ks Kd 4s 2c');
    expect(cardsToString(h.best5)).toBe('As Ad Ah Ks Kd');
    const w = ev('As 2d 3h 4c 5s Kd 9c');
    expect(new Set(cardsToString(w.best5).split(' ')))
      .toEqual(new Set(['5s', '4c', '3h', '2d', 'As']));
  });

  it('31. evaluates 5- and 6-card hands too', () => {
    expect(ev('As Ks Qs Js Ts').name).toBe('Royal Flush');
    expect(ev('As Ks Qs Js Ts 2c').name).toBe('Royal Flush');
  });
});

describe('differential test against brute-force oracle', () => {
  it('agrees on 100,000 random 7-card hands', { timeout: 180_000 }, () => {
    const rng = createRng('differential-100k');
    const deck = makeDeck();
    let checked = 0;
    for (let i = 0; i < 100_000; i++) {
      shuffle(deck, rng);
      const hand = deck.slice(0, 7);
      const fast = evaluate(hand);
      const ref = refEvaluate(hand);
      if (fast.category !== ref.category ||
          fast.tiebreakers.join(',') !== ref.tiebreakers.join(',')) {
        throw new Error(
          `mismatch on ${cardsToString(hand)}\n` +
          `  fast: cat=${fast.category} tb=[${fast.tiebreakers}] (${fast.name})\n` +
          `  ref : cat=${ref.category} tb=[${ref.tiebreakers}]`
        );
      }
      checked++;
    }
    expect(checked).toBe(100_000);
  });

  it('packed value ordering matches the oracle ordering on 50,000 pairs', { timeout: 180_000 }, () => {
    const rng = createRng('ordering-50k');
    const deck = makeDeck();
    for (let i = 0; i < 50_000; i++) {
      shuffle(deck, rng);
      const board = deck.slice(0, 5);
      const a = [deck[5]!, deck[6]!, ...board];
      const b = [deck[7]!, deck[8]!, ...board];
      const fast = Math.sign(evaluate(a).value - evaluate(b).value);
      const ref = Math.sign(refCompare(refEvaluate(a), refEvaluate(b)));
      if (fast !== ref) {
        throw new Error(`ordering mismatch: ${cardsToString(a)} vs ${cardsToString(b)}`);
      }
    }
    expect(true).toBe(true);
  });
});

describe('consistency and transitivity', () => {
  it('is permutation invariant', () => {
    const rng = createRng('perm');
    const deck = makeDeck();
    for (let i = 0; i < 5_000; i++) {
      shuffle(deck, rng);
      const hand = deck.slice(0, 7);
      const base = evaluate(hand).value;
      const permuted = shuffle(hand.slice(), rng);
      expect(evaluate(permuted).value).toBe(base);
    }
  });

  it('is antisymmetric', () => {
    const rng = createRng('antisym');
    const deck = makeDeck();
    for (let i = 0; i < 20_000; i++) {
      shuffle(deck, rng);
      const a = deck.slice(0, 7);
      const b = deck.slice(7, 14);
      expect(compareHands(a, b)).toBe(-compareHands(b, a) || 0);
    }
  });

  it('is transitive over 100,000 random triples', { timeout: 120_000 }, () => {
    const rng = createRng('transitive');
    const deck = makeDeck();
    for (let i = 0; i < 100_000; i++) {
      shuffle(deck, rng);
      const board = deck.slice(0, 5);
      const va = evaluate([deck[5]!, deck[6]!, ...board]).value;
      const vb = evaluate([deck[7]!, deck[8]!, ...board]).value;
      const vc = evaluate([deck[9]!, deck[10]!, ...board]).value;
      if (va >= vb && vb >= vc) expect(va).toBeGreaterThanOrEqual(vc);
      if (va <= vb && vb <= vc) expect(va).toBeLessThanOrEqual(vc);
    }
  });

  it('equal values mean an identical oracle verdict (real chops only)', () => {
    const rng = createRng('chops');
    const deck = makeDeck();
    let chops = 0;
    for (let i = 0; i < 50_000; i++) {
      shuffle(deck, rng);
      const board = deck.slice(0, 5);
      const a = [deck[5]!, deck[6]!, ...board];
      const b = [deck[7]!, deck[8]!, ...board];
      if (evaluate(a).value === evaluate(b).value) {
        chops++;
        expect(refCompare(refEvaluate(a), refEvaluate(b))).toBe(0);
      }
    }
    expect(chops).toBeGreaterThan(100); // sanity: chops actually occurred
  });
});
