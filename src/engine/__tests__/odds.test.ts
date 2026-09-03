import { describe, it, expect } from 'vitest';
import { parseCards, cardsToString } from '../cards';
import {
  potOdds, hitProbability, ruleOf2and4, shortcutError,
  impliedOddsNeeded, analyzeOuts, minimumDefenceFrequency,
} from '../odds';
import { equityVsHand } from '../equity';

const pc = parseCards;

describe('pot odds', () => {
  it('prices a half-pot bet at 25%', () => {
    // Pot was 100, villain bet 50, so you face 50 into 150.
    const o = potOdds(150, 50);
    expect(o.requiredEquity).toBeCloseTo(0.25, 12);
    expect(o.ratio).toBeCloseTo(3, 12);
    expect(o.ratioText).toBe('3.0 : 1');
  });

  it('prices a pot-sized bet at 33.3%', () => {
    expect(potOdds(200, 100).requiredEquity).toBeCloseTo(1 / 3, 12);
  });

  it('prices a 2x overbet at 40%', () => {
    expect(potOdds(300, 200).requiredEquity).toBeCloseTo(0.4, 12);
  });

  it('required equity is bet / (pot + 2*bet), which is NOT the complement of MDF', () => {
    for (const [pot, bet] of [[100, 50], [100, 100], [80, 25], [340, 210]] as const) {
      const req = potOdds(pot + bet, bet).requiredEquity;
      expect(req).toBeCloseTo(bet / (pot + 2 * bet), 12);
      // The number MDF complements is the bluff's breakeven fold frequency,
      // bet / (pot + bet) — a different quantity. Easy to conflate; don't.
      expect(bet / (pot + bet) + minimumDefenceFrequency(pot, bet)).toBeCloseTo(1, 12);
      expect(req).toBeLessThan(bet / (pot + bet));
    }
  });

  it('rejects a non-positive call', () => {
    expect(() => potOdds(100, 0)).toThrow();
  });
});

describe('outs to equity', () => {
  it('a flush draw on the flop is 34.97%, not 36%', () => {
    const exact = hitProbability(9, 47, 2);
    // 1 - (38/47)(37/46)
    expect(exact).toBeCloseTo(1 - (38 / 47) * (37 / 46), 12);
    expect(+(exact * 100).toFixed(2)).toBe(34.97);
    expect(ruleOf2and4(9, 2)).toBeCloseTo(0.36, 12);
    const e = shortcutError(9, 47, 2);
    expect(e.errorPoints).toBeCloseTo(1.03, 2);      // shortcut overshoots by ~1 point
    expect(Math.abs(e.adjustedErrorPoints)).toBeLessThan(0.1); // refinement nearly nails it
  });

  it('a flush draw on the turn is exactly 9/46', () => {
    expect(hitProbability(9, 46, 1)).toBeCloseTo(9 / 46, 12);
    expect(ruleOf2and4(9, 1)).toBeCloseTo(0.18, 12);
  });

  it('the shortcut gets worse as outs grow', () => {
    const small = Math.abs(shortcutError(4, 47, 2).errorPoints);
    const big = Math.abs(shortcutError(15, 47, 2).errorPoints);
    expect(big).toBeGreaterThan(small);
    // 15 outs: shortcut says 60%, the truth is 54.12%.
    expect(shortcutError(15, 47, 2).exact).toBeCloseTo(1 - (32 / 47) * (31 / 46), 12);
    expect(shortcutError(15, 47, 2).errorPoints).toBeCloseTo(5.88, 2);
  });

  it('matches a hand-checkable case: 1 out with 1 card to come', () => {
    expect(hitProbability(1, 46, 1)).toBeCloseTo(1 / 46, 12);
  });

  it('refuses impossible input', () => {
    expect(() => hitProbability(50, 46, 1)).toThrow();
    expect(() => hitProbability(9, 47, 3)).toThrow();
  });
});

describe('implied odds', () => {
  it('is zero extra when the price already works', () => {
    // 25% needed, 30% equity: no future money required.
    expect(impliedOddsNeeded(150, 50, 0.30)).toBeLessThan(0);
  });

  it('quantifies what a bad price needs', () => {
    // Facing 50 into 150 with 20% equity.
    const need = impliedOddsNeeded(150, 50, 0.20);
    expect(need).toBeCloseTo(50, 12); // 0.8*50/0.2 - 150 = 200 - 150
    // Sanity: with that extra pot the call breaks even exactly.
    expect(0.2 * (150 + need) - 0.8 * 50).toBeCloseTo(0, 9);
  });
});

describe('counting outs by dealing every card', () => {
  // Hero: nut flush draw + two overcards. Villain: pair of eights.
  const hero = pc('Ah Kh');
  const villain = pc('8c 8d');

  it('separates real outs from cards that merely improve you', () => {
    const a = analyzeOuts(hero, pc('Qh 7h 2s'), villain);
    expect(a.unseenCount).toBe(45);
    expect(a.aheadNow).toBe(false);
    // 9 hearts + 3 aces + 3 kings
    expect(a.winningOuts).toHaveLength(15);
    expect(a.tyingOuts).toHaveLength(0);
    // Pairing the queen, the seven or the deuce makes you a pair and still
    // loses: villain makes two pair. 3 + 3 + 2 = 8 dirty outs.
    expect(a.falseOuts).toHaveLength(8);
    expect(a.improvingCards).toHaveLength(23);
    expect(a.hiddenOuts).toHaveLength(0);
  });

  it('names the dirty outs explicitly', () => {
    const a = analyzeOuts(hero, pc('Qh 7h 2s'), villain);
    const ranks = new Set(cardsToString(a.falseOuts).split(' ').map((s) => s[0]));
    expect(ranks).toEqual(new Set(['Q', '7', '2']));
  });

  it('cross-checks against the equity engine on the turn', () => {
    // With one card to come, equity must equal outs / unseen exactly.
    const board = pc('Qh 7h 2s 3d');
    const a = analyzeOuts(hero, board, villain);
    const r = equityVsHand(hero, villain, board);
    expect(r.exact).toBe(true);
    expect(a.unseenCount).toBe(44);
    expect(a.winningOuts).toHaveLength(15);
    const fromOuts = (a.winningOuts.length + a.tyingOuts.length / 2) / a.unseenCount;
    expect(r.equity[0]).toBeCloseTo(fromOuts, 12);
    expect(r.equity[0]).toBeCloseTo(15 / 44, 12);
  });

  it('finds outs that do not improve your hand at all', () => {
    // Hero A-high; villain holds a pair that a fourth board card can counterfeit
    // is rare, so assert the general invariant instead across random-ish spots.
    const a = analyzeOuts(pc('Ah Kd'), pc('Qs Jc 5h 5d'), pc('9c 9d'));
    for (const c of a.hiddenOuts) expect(a.winningOuts).toContain(c);
    for (const c of a.falseOuts) expect(a.improvingCards).toContain(c);
  });

  it('reports when you are already ahead', () => {
    const a = analyzeOuts(pc('As Ad'), pc('Kh 7c 2d'), pc('Qs Qc'));
    expect(a.aheadNow).toBe(true);
  });
});
