import { describe, it, expect } from 'vitest';
import { Card, parseCards, deckWithout, makeDeck, shuffle, createRng } from '../cards';
import { evaluate } from '../evaluator';
import { computeEquity, equityVsHand, equityVsRange, asCards, asRange } from '../equity';
import { parseRange, FULL_RANGE } from '../ranges';

/** Independent oracle: enumerate every board completion, no shortcuts. */
function bruteEquity(a: Card[], b: Card[], board: Card[]): [number, number] {
  const rest = deckWithout([...a, ...b, ...board]);
  const need = 5 - board.length;
  let ea = 0;
  let eb = 0;
  let n = 0;
  const run = (start: number, cur: Card[]) => {
    if (cur.length === need) {
      const full = [...board, ...cur];
      const va = evaluate([...a, ...full]).value;
      const vb = evaluate([...b, ...full]).value;
      if (va > vb) ea++;
      else if (vb > va) eb++;
      else { ea += 0.5; eb += 0.5; }
      n++;
      return;
    }
    for (let i = start; i < rest.length; i++) {
      cur.push(rest[i]!);
      run(i + 1, cur);
      cur.pop();
    }
  };
  run(0, []);
  return [ea / n, eb / n];
}

const pc = parseCards;

describe('river: equity is already decided', () => {
  it('is 1 / 0 when you are ahead', () => {
    const r = equityVsHand(pc('As Ad'), pc('Kc Kh'), pc('Ah 7d 2c 9s 3h'));
    expect(r.exact).toBe(true);
    expect(r.samples).toBe(1);
    expect(r.equity[0]).toBe(1);
    expect(r.equity[1]).toBe(0);
  });

  it('is 0.5 / 0.5 when the board plays', () => {
    const r = equityVsHand(pc('2c 3d'), pc('4c 5d'), pc('Ah Ad Kc Ks Qh'));
    expect(r.equity[0]).toBe(0.5);
    expect(r.equity[1]).toBe(0.5);
    expect(r.tie[0]).toBe(1);
  });
});

describe('exact enumeration agrees with the brute-force oracle', () => {
  const spots: Array<[string, string, string]> = [
    ['As Ks', 'Qh Qd', 'Jh 7c 2d'],
    ['Ah Kh', '8c 8d', 'Qh 7h 2s'],
    ['7c 7d', 'Ah Kd', '2s 9h Tc'],
    ['Js Ts', '9c 9h', '8s 7d 2c'],
    ['Ah Kh', '8c 8d', 'Qh 7h 2s 3d'],
    ['5c 4c', 'Ad Ac', '3h 2s Kd Qh'],
  ];
  for (const [h, v, b] of spots) {
    it(`${h} vs ${v} on ${b}`, () => {
      const [ea, eb] = bruteEquity(pc(h), pc(v), pc(b));
      const r = equityVsHand(pc(h), pc(v), pc(b));
      expect(r.exact).toBe(true);
      expect(r.equity[0]).toBeCloseTo(ea, 12);
      expect(r.equity[1]).toBeCloseTo(eb, 12);
      expect(r.equity[0]! + r.equity[1]!).toBeCloseTo(1, 12);
    });
  }
});

describe('monte carlo converges on the exact answer', () => {
  it('lands within four standard errors on ten random flops', () => {
    const rng = createRng('mc-vs-exact');
    const deck = makeDeck();
    for (let t = 0; t < 10; t++) {
      shuffle(deck, rng);
      const hero = deck.slice(0, 2);
      const villain = deck.slice(2, 4);
      const board = deck.slice(4, 7);
      const exact = equityVsHand(hero, villain, board).equity[0]!;
      const mc = equityVsHand(hero, villain, board, {
        forceMonteCarlo: true, iterations: 40_000, seed: `t${t}`,
      });
      expect(mc.exact).toBe(false);
      const err = Math.abs(mc.equity[0]! - exact);
      expect(err).toBeLessThan(4 * mc.stdErr[0]! + 1e-9);
    }
  });

  it('reports a shrinking margin as samples grow', () => {
    const args = [pc('Ah Kh'), pc('8c 8d'), pc('Qh 7h 2s')] as const;
    const small = equityVsHand(...args, { forceMonteCarlo: true, iterations: 2_000, seed: 'm' });
    const big = equityVsHand(...args, { forceMonteCarlo: true, iterations: 200_000, seed: 'm' });
    expect(big.margin95[0]!).toBeLessThan(small.margin95[0]!);
    expect(big.margin95[0]!).toBeLessThan(0.5); // sub-half-point precision
  });

  it('is reproducible for a fixed seed and varies across seeds', () => {
    const a = equityVsHand(pc('Ah Kh'), pc('8c 8d'), [], { iterations: 5000, seed: 'x' });
    const b = equityVsHand(pc('Ah Kh'), pc('8c 8d'), [], { iterations: 5000, seed: 'x' });
    const c = equityVsHand(pc('Ah Kh'), pc('8c 8d'), [], { iterations: 5000, seed: 'y' });
    expect(a.equity).toEqual(b.equity);
    expect(a.equity).not.toEqual(c.equity);
  });
});

describe('published preflop matchups', () => {
  const eq = (h: string, v: string) =>
    equityVsHand(pc(h), pc(v), [], { iterations: 200_000, seed: `${h}|${v}` }).equity[0]! * 100;

  it('AA vs KK is about 82%', () => {
    expect(eq('As Ad', 'Kc Kh')).toBeGreaterThan(81);
    expect(eq('As Ad', 'Kc Kh')).toBeLessThan(84);
  });

  it('AKs vs QQ is the classic near-coinflip, about 46%', () => {
    const v = eq('As Ks', 'Qc Qh');
    expect(v).toBeGreaterThan(44);
    expect(v).toBeLessThan(48);
  });

  it('AKo vs 22 is about 48%', () => {
    const v = eq('As Kh', '2c 2d');
    expect(v).toBeGreaterThan(45.5);
    expect(v).toBeLessThan(49.5);
  });

  it('AA against a random hand is about 85%', () => {
    const v = equityVsRange(pc('As Ad'), FULL_RANGE, [], {
      iterations: 200_000, seed: 'aa-vs-random',
    }).equity[0]! * 100;
    expect(v).toBeGreaterThan(84);
    expect(v).toBeLessThan(86.5);
  });
});

describe('equity against a range', () => {
  it('a one-hand range equals hand versus hand', () => {
    const board = pc('Jh 7c 2d');
    const a = equityVsHand(pc('As Ks'), pc('Qh Qd'), board).equity[0]!;
    const b = equityVsRange(pc('As Ks'), parseRange('QQ'), board, { exactThreshold: 1e9 });
    // QQ has 6 combos; two contain no blocked card here, so this is a real average.
    expect(b.exact).toBe(true);
    expect(b.equity[0]).toBeGreaterThan(0);
    const single = computeEquity(
      [asCards(pc('As Ks')), asRange(new Set([...parseRange('QQ')]))],
      board, { exactThreshold: 1e9 },
    );
    expect(single.equity[0]).toBeCloseTo(b.equity[0]!, 12);
    expect(a).toBeGreaterThan(0);
  });

  it('respects card removal: your own cards are gone from villain range', () => {
    // Hero holds two aces, so villain can only hold the last AA combo.
    const r = equityVsRange(pc('As Ad'), parseRange('AA'), pc('Kh 7c 2d'), { exactThreshold: 1e9 });
    expect(r.exact).toBe(true);
    // Exactly one villain combo (Ac Ah) and every board runout enumerated.
    const runouts = (45 * 44) / 2;
    expect(r.samples).toBe(runouts);
    // Aces against aces on a non-flush board: near-certain chop.
    expect(r.tie[0]!).toBeGreaterThan(0.9);
  });

  it('blockers move the number: holding an ace shrinks villain AK', () => {
    const board = pc('Ah 7c 2d');
    const withBlocker = equityVsRange(pc('As Ks'), parseRange('AA'), board, { exactThreshold: 1e9 });
    // Hero holds two of the four aces; villain's AA is down to one combo.
    expect(withBlocker.samples).toBe((45 * 44) / 2);
  });

  it('throws when the range is entirely blocked', () => {
    expect(() => equityVsRange(pc('As Ad'), parseRange('AA'), pc('Ac Ah 2d')))
      .toThrow(/no combos left/);
  });
});

describe('multiway', () => {
  it('three-way equities sum to one', () => {
    const r = computeEquity(
      [asCards(pc('As Ks')), asCards(pc('Qh Qd')), asCards(pc('7c 7d'))],
      pc('Jh 8c 2d'),
    );
    expect(r.equity.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(r.exact).toBe(true);
  });

  it('six-way equities sum to one and every seat gets a share', () => {
    const r = computeEquity(
      ['As Ks', 'Qh Qd', '7c 7d', 'Jd Ts', '9h 8h', '4c 3c'].map((s) => asCards(pc(s))),
      [], { iterations: 30_000, seed: 'six' },
    );
    expect(r.equity.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    for (const e of r.equity) expect(e).toBeGreaterThan(0);
  });

  it('range players multiway still sum to one', () => {
    const r = computeEquity(
      [asCards(pc('As Ks')), asRange(parseRange('QQ+')), asRange(parseRange('77-99'))],
      pc('Jh 8c 2d'), { iterations: 20_000, seed: 'mw-range' },
    );
    expect(r.equity.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
});

describe('sanity guards', () => {
  it('needs two players', () => {
    expect(() => computeEquity([asCards(pc('As Ks'))])).toThrow(/two players/);
  });
  it('rejects an oversized board', () => {
    expect(() => equityVsHand(pc('As Ks'), pc('Qh Qd'), pc('2c 3c 4c 5c 6c 7c')))
      .toThrow(/five cards/);
  });
});
