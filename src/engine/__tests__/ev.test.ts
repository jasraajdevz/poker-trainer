import { describe, it, expect } from 'vitest';
import {
  evFold, evCheck, evCall, evBet, breakevenEquity, breakevenFoldFrequency,
  rankActions, evLost, toBB, ActionEV,
} from '../ev';
import { potOdds, minimumDefenceFrequency } from '../odds';

describe('the baseline', () => {
  it('folding is exactly zero', () => {
    expect(evFold()).toBe(0);
  });

  it('checking realises your share of the pot', () => {
    expect(evCheck(100, 0.4)).toBeCloseTo(40, 12);
    expect(evCheck(100, 0)).toBe(0);
    expect(evCheck(100, 1)).toBe(100);
  });
});

describe('calling', () => {
  it('breaks even exactly at the pot-odds equity', () => {
    for (const [pot, toCall] of [[150, 50], [200, 100], [300, 200], [83, 17]] as const) {
      const e = breakevenEquity(pot, toCall);
      expect(e).toBeCloseTo(potOdds(pot, toCall).requiredEquity, 12);
      expect(evCall(pot, toCall, e)).toBeCloseTo(0, 9);
    }
  });

  it('is positive above the price and negative below it', () => {
    const e = breakevenEquity(150, 50); // 0.25
    expect(evCall(150, 50, e + 0.05)).toBeGreaterThan(0);
    expect(evCall(150, 50, e - 0.05)).toBeLessThan(0);
  });

  it('scales linearly with equity', () => {
    const a = evCall(150, 50, 0.3);
    const b = evCall(150, 50, 0.4);
    const c = evCall(150, 50, 0.5);
    expect(b - a).toBeCloseTo(c - b, 9);
  });
});

describe('betting against a response model', () => {
  const pure = (fold: number, call: number, eq: number) => ({
    fold, call, raise: 0, equityWhenCalled: eq,
  });

  it('wins the pot outright when villain always folds', () => {
    expect(evBet(100, 66, pure(1, 0, 0))).toBeCloseTo(100, 12);
  });

  it('is a pure equity bet when villain always calls', () => {
    // 40% equity, 66 into 100: 0.4*166 - 0.6*66
    expect(evBet(100, 66, pure(0, 1, 0.4))).toBeCloseTo(0.4 * 166 - 0.6 * 66, 12);
  });

  it('breaks even at the computed fold frequency whenever folds are needed', () => {
    for (const eq of [0, 0.1, 0.25]) {
      const f = breakevenFoldFrequency(100, 66, eq);
      expect(f).toBeGreaterThan(0);
      expect(evBet(100, 66, pure(f, 1 - f, eq))).toBeCloseTo(0, 9);
    }
  });

  it('needs no folds at all once the bet profits against a caller', () => {
    // 66 into 100 with 40% equity: 0.4*166 - 0.6*66 = +26.8 even if never folded.
    expect(breakevenFoldFrequency(100, 66, 0.4)).toBe(0);
    expect(evBet(100, 66, pure(0, 1, 0.4))).toBeCloseTo(26.8, 9);
  });

  it('needs more folds the less equity the bet keeps', () => {
    const f0 = breakevenFoldFrequency(100, 66, 0);
    const f1 = breakevenFoldFrequency(100, 66, 0.1);
    const f2 = breakevenFoldFrequency(100, 66, 0.25);
    expect(f0).toBeGreaterThan(f1);
    expect(f1).toBeGreaterThan(f2);
  });

  it('a zero-equity bluff needs risk / (risk + reward)', () => {
    expect(breakevenFoldFrequency(100, 50, 0)).toBeCloseTo(50 / 150, 12);
    expect(breakevenFoldFrequency(100, 100, 0)).toBeCloseTo(0.5, 12);
    // and that is the exact complement of villain's minimum defence frequency
    expect(breakevenFoldFrequency(100, 50, 0) + minimumDefenceFrequency(100, 50))
      .toBeCloseTo(1, 12);
  });

  it('bigger bluffs need more folds', () => {
    const third = breakevenFoldFrequency(100, 33, 0);
    const pot = breakevenFoldFrequency(100, 100, 0);
    const over = breakevenFoldFrequency(100, 200, 0);
    expect(pot).toBeGreaterThan(third);
    expect(over).toBeGreaterThan(pot);
  });

  it('handles a raising villain by taking hero’s better option', () => {
    const withRaise = {
      fold: 0.3, call: 0.5, raise: 0.2,
      equityWhenCalled: 0.45, equityWhenRaised: 0.05, raiseTo: 250,
    };
    // Hero folds to the raise (calling 250 with 5% is terrible), so that branch
    // costs exactly the bet.
    const ev = evBet(100, 66, withRaise);
    const expected = 0.3 * 100 + 0.5 * (0.45 * 166 - 0.55 * 66) + 0.2 * -66;
    expect(ev).toBeCloseTo(expected, 9);
  });

  it('calls the raise instead when hero is actually strong', () => {
    const strong = {
      fold: 0.1, call: 0.4, raise: 0.5,
      equityWhenCalled: 0.7, equityWhenRaised: 0.75, raiseTo: 250,
    };
    const ev = evBet(100, 66, strong);
    const callRaise = 0.75 * (100 + 250) - 0.25 * 250;
    const expected = 0.1 * 100 + 0.4 * (0.7 * 166 - 0.3 * 66) + 0.5 * callRaise;
    expect(ev).toBeCloseTo(expected, 9);
    expect(callRaise).toBeGreaterThan(-66);
  });

  it('rejects malformed response models', () => {
    expect(() => evBet(100, 50, { fold: 0.5, call: 0.4, raise: 0, equityWhenCalled: 0.5 }))
      .toThrow(/sum to/);
    expect(() => evBet(100, 50, { fold: 0.5, call: 0.3, raise: 0.2, equityWhenCalled: 0.5 }))
      .toThrow(/raiseTo/);
  });
});

describe('ranking and cost of a mistake', () => {
  const options: ActionEV[] = [
    { action: 'fold', size: 0, ev: 0, label: 'Fold' },
    { action: 'call', size: 50, ev: 12.5, label: 'Call 50' },
    { action: 'raise', size: 150, ev: 4.0, label: 'Raise to 150' },
  ];

  it('picks the best and reports the gap', () => {
    const r = rankActions(options);
    expect(r.best.action).toBe('call');
    expect(r.gapToSecond).toBeCloseTo(8.5, 9);
    expect(r.ranked.map((o) => o.action)).toEqual(['call', 'raise', 'fold']);
  });

  it('prices the mistake in chips and big blinds', () => {
    expect(evLost(options, 'fold')).toBeCloseTo(12.5, 9);
    expect(evLost(options, 'raise', 150)).toBeCloseTo(8.5, 9);
    expect(evLost(options, 'call', 50)).toBeCloseTo(0, 9);
    expect(toBB(evLost(options, 'fold'), 10)).toBeCloseTo(1.25, 9);
  });

  it('refuses to score an action that was not offered', () => {
    expect(() => evLost(options, 'bet', 75)).toThrow(/not among/);
  });
});
