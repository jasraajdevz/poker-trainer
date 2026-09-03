import { describe, it, expect } from 'vitest';
import { evaluate } from '../../engine/evaluator';
import { analyzeOuts, potOdds } from '../../engine/odds';
import { equityVsHand } from '../../engine/equity';
import { L0 } from '../l0-rankings';
import { L1 } from '../l1-outs';
import { L2 } from '../l2-potodds';
import { L3 } from '../l3-position';
import { L4 } from '../l4-preflop';
import { L5 } from '../l5-texture';
import { L6 } from '../l6-sizing';
import { L7 } from '../l7-valuebluff';
import { openingRange } from '../../engine/preflopChart';
import { handClassOf } from '../../engine/ranges';
import { LevelModule } from '../types';

const SEED = 'test-seed';

describe.each([['L0', L0], ['L1', L1], ['L2', L2], ['L3', L3], ['L4', L4], ['L5', L5], ['L6', L6], ['L7', L7]] as Array<[string, LevelModule]>)(
  '%s contract',
  (_name, level) => {
    it('is deterministic for a given seed', () => {
      const a = level.generate(0, SEED);
      const b = level.generate(0, SEED);
      expect(a.id).toBe(b.id);
      expect(a.scene).toEqual(b.scene);
      expect(a.steps).toEqual(b.steps);
    });

    it('produces different drills at different indexes', () => {
      const ids = [0, 1, 2].map((i) => level.generate(i, SEED).id);
      expect(new Set(ids).size).toBe(3);
    });

    it('keeps the lesson under 200 words', () => {
      const words = level.lesson.body.join(' ').split(/\s+/).filter(Boolean).length;
      expect(words).toBeLessThan(200);
    });

    it('asks between 10 and 20 drills', () => {
      expect(level.drillCount).toBeGreaterThanOrEqual(10);
      expect(level.drillCount).toBeLessThanOrEqual(20);
    });

    it('every feedback carries all five parts', () => {
      const d = level.generate(0, SEED);
      const answers: Record<string, string | number> = {};
      for (const s of d.steps) answers[s.id] = s.kind === 'choice' ? s.options[0]!.key : 1;
      const f = d.grade(answers);
      expect(typeof f.correct).toBe('boolean');            // 1. right / wrong
      expect(f.correctAction.length).toBeGreaterThan(0);   // 2. the correct action
      expect(f.proof.length).toBeGreaterThan(1);           // 3. the numbers
      expect(f.principle.length).toBeGreaterThan(20);      // 4. the principle
      expect(f.counterfactual.length).toBeGreaterThan(20); // 5. what you'd need
      expect(f.verdicts).toHaveLength(d.steps.length);
    });
  },
);

describe('L0 grading', () => {
  it('matches the evaluator on every generated drill', () => {
    for (let i = 0; i < L0.drillCount; i++) {
      const d = L0.generate(i, SEED);
      const board = d.scene.board!;
      const [A, B] = d.scene.hands!;
      const va = evaluate([...A!.cards, ...board]).value;
      const vb = evaluate([...B!.cards, ...board]).value;
      const truth = va > vb ? 'a' : vb > va ? 'b' : 'chop';
      expect(d.grade({ winner: truth }).correct).toBe(true);
      for (const other of ['a', 'b', 'chop'].filter((x) => x !== truth)) {
        const f = d.grade({ winner: other });
        expect(f.correct).toBe(false);
        expect(f.errorTags.length).toBeGreaterThan(0);
      }
    }
  });

  it('escalates: early drills are category gaps, late drills are chops', () => {
    const read = (i: number) => {
      const d = L0.generate(i, SEED);
      const board = d.scene.board!;
      const a = evaluate([...d.scene.hands![0]!.cards, ...board]);
      const b = evaluate([...d.scene.hands![1]!.cards, ...board]);
      return { sameCat: a.category === b.category, chop: a.value === b.value };
    };
    expect(read(0).sameCat).toBe(false);
    expect(read(1).sameCat).toBe(false);
    expect([12, 13, 14].map(read).filter((x) => x.chop).length).toBeGreaterThanOrEqual(2);
  });

  it('tags a missed chop as a missed chop', () => {
    let chops = 0;
    for (let i = 12; i < 15; i++) {
      const d = L0.generate(i, SEED);
      const board = d.scene.board!;
      const va = evaluate([...d.scene.hands![0]!.cards, ...board]).value;
      const vb = evaluate([...d.scene.hands![1]!.cards, ...board]).value;
      if (va !== vb) continue;
      chops++;
      expect(d.grade({ winner: 'a' }).errorTags).toContain('misses-chops');
    }
    expect(chops).toBeGreaterThan(0);
  });

  it('tags a lost kicker battle as a kicker problem', () => {
    let battles = 0;
    for (let i = 8; i < 12; i++) {
      const d = L0.generate(i, SEED);
      const board = d.scene.board!;
      const a = evaluate([...d.scene.hands![0]!.cards, ...board]);
      const b = evaluate([...d.scene.hands![1]!.cards, ...board]);
      if (a.category !== b.category || a.value === b.value) continue;
      if (a.tiebreakers[0] !== b.tiebreakers[0]) continue;
      battles++;
      const wrong = a.value > b.value ? 'b' : 'a';
      expect(d.grade({ winner: wrong }).errorTags).toContain('misreads-kickers');
    }
    expect(battles).toBeGreaterThan(0);
  });
});

describe('L1 grading', () => {
  it('grades outs against a fresh analyzeOuts call', () => {
    for (let i = 0; i < L1.drillCount; i++) {
      const d = L1.generate(i, SEED);
      const hero = d.scene.heroCards!;
      const villain = d.scene.villainCards!;
      const board = d.scene.board!;
      const outs = analyzeOuts(hero, board, villain).winningOuts.length;
      const eq = equityVsHand(hero, villain, board).equity[0]! * 100;
      const f = d.grade({ outs, equity: Math.round(eq) });
      expect(f.correct, `drill ${i} outs=${outs} eq=${eq.toFixed(1)}`).toBe(true);
      expect(d.grade({ outs: outs + 1, equity: Math.round(eq) }).correct).toBe(false);
    }
  });

  it('detects the specific mistake of counting dirty outs', () => {
    let checked = 0;
    for (let i = 0; i < L1.drillCount; i++) {
      const d = L1.generate(i, SEED);
      const a = analyzeOuts(d.scene.heroCards!, d.scene.board!, d.scene.villainCards!);
      if (a.falseOuts.length < 4) continue;
      const eq = equityVsHand(d.scene.heroCards!, d.scene.villainCards!, d.scene.board!).equity[0]! * 100;
      const f = d.grade({ outs: a.winningOuts.length + a.falseOuts.length, equity: Math.round(eq) });
      expect(f.errorTags).toContain('counts-dirty-outs');
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('accepts equity within tolerance and rejects outside it', () => {
    const d = L1.generate(0, SEED);
    const outs = analyzeOuts(d.scene.heroCards!, d.scene.board!, d.scene.villainCards!).winningOuts.length;
    const eq = equityVsHand(d.scene.heroCards!, d.scene.villainCards!, d.scene.board!).equity[0]! * 100;
    expect(d.grade({ outs, equity: eq + 4.9 }).correct).toBe(true);
    expect(d.grade({ outs, equity: eq + 6 }).correct).toBe(false);
    expect(d.grade({ outs, equity: eq + 6 }).errorTags).toContain('overestimates-equity');
    expect(d.grade({ outs, equity: eq - 6 }).errorTags).toContain('underestimates-equity');
  });

  it('always presents a spot where hero is behind and drawing', () => {
    for (let i = 0; i < L1.drillCount; i++) {
      const d = L1.generate(i, SEED);
      const a = analyzeOuts(d.scene.heroCards!, d.scene.board!, d.scene.villainCards!);
      expect(a.aheadNow).toBe(false);
      expect(a.winningOuts.length).toBeGreaterThanOrEqual(6);
      expect(a.winningOuts.length).toBeLessThanOrEqual(15);
    }
  });
});

describe('L2 grading', () => {
  it('grades the price against potOdds computed from the visible scene', () => {
    for (let i = 0; i < L2.drillCount; i++) {
      const d = L2.generate(i, SEED);
      const need = potOdds(d.scene.potChips!, d.scene.betChips!).requiredEquity * 100;
      expect(d.grade({ price: need, action: 'call' }).verdicts[0]!.correct, `drill ${i}`).toBe(true);
      expect(d.grade({ price: need + 3, action: 'call' }).verdicts[0]!.correct).toBe(false);
      expect(d.grade({ price: need + 3, action: 'call' }).errorTags).toContain('miscomputes-pot-odds');
    }
  });

  it('accepts exactly one of call and fold, matching the stated action', () => {
    for (let i = 0; i < L2.drillCount; i++) {
      const d = L2.generate(i, SEED);
      const need = potOdds(d.scene.potChips!, d.scene.betChips!).requiredEquity * 100;
      const call = d.grade({ price: need, action: 'call' });
      const fold = d.grade({ price: need, action: 'fold' });
      expect(call.correct !== fold.correct, `drill ${i}`).toBe(true);
      const winner = call.correct ? call : fold;
      expect(winner.correctAction).toBe(winner.verdicts[1]!.given);
      expect(winner.evLostBB).toBe(0);
      expect((call.correct ? fold : call).evLostBB).toBeGreaterThan(0);
    }
  });

  it('tags loose calls and tight folds distinctly', () => {
    let loose = 0;
    let tight = 0;
    for (let i = 0; i < L2.drillCount; i++) {
      const d = L2.generate(i, SEED);
      const need = potOdds(d.scene.potChips!, d.scene.betChips!).requiredEquity * 100;
      const call = d.grade({ price: need, action: 'call' });
      if (!call.correct) { expect(call.errorTags).toContain('calls-without-odds'); loose++; }
      const fold = d.grade({ price: need, action: 'fold' });
      if (!fold.correct) { expect(fold.errorTags).toContain('folds-with-odds'); tight++; }
    }
    expect(loose).toBeGreaterThan(0);
    expect(tight).toBeGreaterThan(0);
  });

  it('shows villain range on the table rather than hiding the assumption', () => {
    const d = L2.generate(0, SEED);
    expect(d.scene.villainRangeText).toMatch(/opening range/);
    expect(d.scene.villainRangeText).toMatch(/combos/);
  });
});


describe('L4 grading', () => {
  it('matches the Appendix A chart exactly', () => {
    for (let i = 0; i < L4.drillCount; i++) {
      const d = L4.generate(i, SEED);
      const pos = d.scene.heroPosition!;
      const hc = handClassOf(d.scene.heroCards![0]!, d.scene.heroCards![1]!);
      const truth = openingRange(pos).has(hc) ? 'open' : 'fold';
      expect(d.grade({ action: truth }).correct, `${pos} drill ${i}`).toBe(true);
      const wrong = d.grade({ action: truth === 'open' ? 'fold' : 'open' });
      expect(wrong.correct).toBe(false);
      expect(wrong.errorTags).toContain(truth === 'open' ? 'opens-too-tight' : 'opens-too-loose');
      expect(wrong.meta!['handClassIndex']).toBe(hc);
    }
  });

  it('alternates in-range and out-of-range so the answer is not guessable', () => {
    const verdicts = Array.from({ length: 10 }, (_, i) => {
      const d = L4.generate(i, SEED);
      return openingRange(d.scene.heroPosition!).has(
        handClassOf(d.scene.heroCards![0]!, d.scene.heroCards![1]!));
    });
    expect(verdicts.filter(Boolean).length).toBeGreaterThan(2);
    expect(verdicts.filter((v) => !v).length).toBeGreaterThan(2);
  });
});

describe('L6 and L7 grade on computed EV', () => {
  it('L6 names a best size that is genuinely the highest EV shown', () => {
    for (let i = 0; i < 4; i++) {
      const d = L6.generate(i, SEED);
      const f = d.grade({ size: 'check' });
      const evs = f.proof
        .filter((p) => /chips$/.test(p.value))
        .map((p) => parseFloat(p.value));
      const best = Math.max(...evs);
      const keyLine = f.proof.find((p) => p.key && /chips$/.test(p.value));
      expect(keyLine).toBeDefined();
      expect(parseFloat(keyLine!.value)).toBeCloseTo(best, 6);
    }
  });

  it('L7 exposes both value tests as counted fractions', () => {
    const d = L7.generate(0, SEED);
    const f = d.grade({ plan: 'check' });
    expect(f.proof.some((p) => p.label === 'Would a worse hand call?')).toBe(true);
    expect(f.proof.some((p) => p.label === 'Would a better hand fold?')).toBe(true);
    expect(['Bet', 'Check'].some((w) => f.correctAction.includes(w))).toBe(true);
  });

  it('L5 grades texture against the measured coverage, not an adjective', () => {
    const d = L5.generate(0, SEED);
    const f = d.grade({ texture: 'wet', favours: 'raiser' });
    const cov = f.proof.find((p) => p.label === 'Hands that connect');
    expect(cov).toBeDefined();
    expect(cov!.note).toMatch(/Median flop/);
  });
});
