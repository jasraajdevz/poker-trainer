import { describe, it, expect } from 'vitest';
import { parseCards, makeDeck, createRng } from '../cards';
import {
  parseRange, rangeToString, rangeToPercent, comboCount, handClassName, handClassOf,
  classCombos, classComboCount, ALL_HAND_CLASSES, FULL_RANGE, TOTAL_COMBOS,
  isPairClass, isSuitedClass, isOffsuitClass, rangeCombos,
} from '../ranges';
import { openingRange, openingPercent, OPENING_NOTATION, QUOTED_PERCENT } from '../preflopChart';

describe('the 169 hand classes', () => {
  it('splits into 13 pairs, 78 suited, 78 offsuit', () => {
    expect(ALL_HAND_CLASSES.filter(isPairClass)).toHaveLength(13);
    expect(ALL_HAND_CLASSES.filter(isSuitedClass)).toHaveLength(78);
    expect(ALL_HAND_CLASSES.filter(isOffsuitClass)).toHaveLength(78);
  });

  it('accounts for exactly 1326 combos', () => {
    const total = ALL_HAND_CLASSES.reduce((n, hc) => n + classComboCount(hc), 0);
    expect(total).toBe(TOTAL_COMBOS);
    expect(13 * 6 + 78 * 4 + 78 * 12).toBe(1326);
  });

  it('classifies every one of the 1326 real combos, and only produces real cards', () => {
    const deck = makeDeck();
    const seen = new Map<number, number>();
    for (let i = 0; i < 52; i++)
      for (let j = i + 1; j < 52; j++) {
        const hc = handClassOf(deck[i]!, deck[j]!);
        seen.set(hc, (seen.get(hc) ?? 0) + 1);
      }
    expect(seen.size).toBe(169);
    for (const [hc, n] of seen) expect(n).toBe(classComboCount(hc));
  });

  it('round-trips class -> combos -> class', () => {
    for (const hc of ALL_HAND_CLASSES) {
      const combos = classCombos(hc);
      expect(combos).toHaveLength(classComboCount(hc));
      for (const [a, b] of combos) expect(handClassOf(a!, b!)).toBe(hc);
    }
  });

  it('names classes the conventional way', () => {
    expect(handClassName(handClassOf(...(parseCards('As Ks') as [number, number])))).toBe('AKs');
    expect(handClassName(handClassOf(...(parseCards('As Kh') as [number, number])))).toBe('AKo');
    expect(handClassName(handClassOf(...(parseCards('7h 7d') as [number, number])))).toBe('77');
    expect(handClassName(handClassOf(...(parseCards('2c 7s') as [number, number])))).toBe('72o');
  });
});

describe('range notation', () => {
  const names = (s: string) => [...parseRange(s)].map(handClassName).sort();

  it('parses exact hands', () => {
    expect(names('AKs')).toEqual(['AKs']);
    expect(names('KQo')).toEqual(['KQo']);
    expect(names('77')).toEqual(['77']);
  });

  it('treats a bare non-pair as both suited and offsuit', () => {
    expect(names('AK').sort()).toEqual(['AKo', 'AKs']);
  });

  it('expands pair plus', () => {
    expect(parseRange('77+').size).toBe(8);
    expect(parseRange('22+').size).toBe(13);
    expect(names('QQ+').sort()).toEqual(['AA', 'KK', 'QQ']);
  });

  it('expands kicker plus by climbing the kicker, not the top card', () => {
    expect(names('ATs+').sort()).toEqual(['AJs', 'AKs', 'AQs', 'ATs']);
    // T9s+ is degenerate under these semantics and that is correct
    expect(names('T9s+')).toEqual(['T9s']);
    expect(names('T8s+').sort()).toEqual(['T8s', 'T9s']);
  });

  it('expands bands in either order and tolerates an en dash', () => {
    expect(names('A5s-A2s').sort()).toEqual(['A2s', 'A3s', 'A4s', 'A5s']);
    expect(names('A2s-A5s').sort()).toEqual(['A2s', 'A3s', 'A4s', 'A5s']);
    expect(names('A5s–A2s').sort()).toEqual(['A2s', 'A3s', 'A4s', 'A5s']);
    expect(names('77-TT').sort()).toEqual(['77', '88', '99', 'TT']);
  });

  it('rejects nonsense', () => {
    expect(() => parseRange('AAs')).toThrow(/suited/);
    expect(() => parseRange('XY')).toThrow();
    expect(() => parseRange('A5s-K2s')).toThrow(/top card/);
    expect(() => parseRange('A5s-A2o')).toThrow(/suitedness/);
    expect(() => parseRange('77-AKs')).toThrow(/mixed/);
  });

  it('round-trips through canonical notation for 300 random ranges', () => {
    const rng = createRng('range-roundtrip');
    for (let t = 0; t < 300; t++) {
      const r = new Set<number>();
      for (const hc of ALL_HAND_CLASSES) if (rng.next() < 0.25) r.add(hc);
      if (r.size === 0) continue;
      const text = rangeToString(r);
      expect(parseRange(text), `failed for "${text}"`).toEqual(r);
    }
  });

  it('collapses runs when printing', () => {
    expect(rangeToString(parseRange('22+'))).toBe('22+');
    expect(rangeToString(parseRange('77-TT'))).toBe('TT-77');
    expect(rangeToString(parseRange('ATs+'))).toBe('ATs+');
  });
});

describe('combo counting and percentages', () => {
  it('measures the whole range as 100%', () => {
    expect(comboCount(FULL_RANGE)).toBe(1326);
    expect(rangeToPercent(FULL_RANGE)).toBeCloseTo(100, 9);
  });

  it('measures pairs correctly', () => {
    expect(comboCount(parseRange('22+'))).toBe(78);
    expect(rangeToPercent(parseRange('22+'))).toBeCloseTo((78 / 1326) * 100, 9);
  });

  it('removes blocked combos', () => {
    // Holding two aces leaves exactly one AA combo behind.
    expect(comboCount(parseRange('AA'), parseCards('As Ah'))).toBe(1);
    // Holding one ace leaves C(3,2) = 3.
    expect(comboCount(parseRange('AA'), parseCards('As'))).toBe(3);
    // AKs: holding the ace of spades kills the spade combo.
    expect(comboCount(parseRange('AKs'), parseCards('As'))).toBe(3);
    expect(comboCount(parseRange('AKo'), parseCards('As'))).toBe(9);
  });

  it('rangeCombos never returns a dead card', () => {
    const dead = parseCards('As Kd 7h');
    for (const combo of rangeCombos(FULL_RANGE, dead)) {
      for (const c of combo) expect(dead).not.toContain(c);
    }
  });
});

describe('Appendix A baseline chart', () => {
  const expectedCombos: Record<string, number> = {
    UTG: 162, HJ: 222, CO: 298, BTN: 550, SB: 418,
  };

  for (const pos of Object.keys(OPENING_NOTATION) as Array<keyof typeof OPENING_NOTATION>) {
    it(`${pos} parses to ${expectedCombos[pos]} combos`, () => {
      expect(comboCount(openingRange(pos))).toBe(expectedCombos[pos]);
    });
  }

  it('opens progressively wider from UTG to the button', () => {
    const utg = openingPercent('UTG');
    const hj = openingPercent('HJ');
    const co = openingPercent('CO');
    const btn = openingPercent('BTN');
    expect(hj).toBeGreaterThan(utg);
    expect(co).toBeGreaterThan(hj);
    expect(btn).toBeGreaterThan(co);
  });

  it('has no opening range in the big blind', () => {
    expect(openingRange('BB').size).toBe(0);
  });

  it('records where the quoted percentages disagree with the notation', () => {
    // Documented, not hidden: the chart's quoted figures are approximations.
    const drift: Record<string, number> = {};
    for (const pos of Object.keys(QUOTED_PERCENT) as Array<keyof typeof QUOTED_PERCENT>) {
      drift[pos] = +(QUOTED_PERCENT[pos] - openingPercent(pos)).toFixed(1);
    }
    expect(drift).toEqual({ UTG: 2.8, HJ: 2.3, CO: 3.5, BTN: 0.5, SB: 6.5 });
  });
});
