import { describe, it, expect } from 'vitest';
import {
  parseCard, parseCards, cardToString, cardsToString, makeDeck, makeCard,
  rankOf, suitOf, createRng, shuffle, deckWithout, assertNoDuplicates,
} from '../cards';

describe('card parsing', () => {
  it('round-trips every card in the deck', () => {
    for (const c of makeDeck()) {
      expect(parseCard(cardToString(c))).toBe(c);
    }
  });

  it('produces 52 distinct cards', () => {
    expect(new Set(makeDeck()).size).toBe(52);
    expect(new Set(makeDeck().map(cardToString)).size).toBe(52);
  });

  it('decodes rank and suit', () => {
    expect(rankOf(parseCard('As'))).toBe(14);
    expect(suitOf(parseCard('As'))).toBe(3);
    expect(rankOf(parseCard('2c'))).toBe(2);
    expect(suitOf(parseCard('2c'))).toBe(0);
    expect(parseCard('Th')).toBe(makeCard(10, 2));
  });

  it('is case tolerant on rank and suit', () => {
    expect(parseCard('as')).toBe(parseCard('As'));
    expect(parseCard('tH')).toBe(parseCard('Th'));
  });

  it('parses lists in several formats', () => {
    const want = cardsToString(parseCards('As Kd Qh'));
    expect(cardsToString(parseCards('AsKdQh'))).toBe(want);
    expect(cardsToString(parseCards('As,Kd,Qh'))).toBe(want);
    expect(cardsToString(parseCards('As  Kd Qh'))).toBe(want);
  });

  it('rejects garbage', () => {
    expect(() => parseCard('Xs')).toThrow();
    expect(() => parseCard('Az')).toThrow();
    expect(() => parseCard('A')).toThrow();
    expect(() => parseCards('AsK')).toThrow();
  });
});

describe('seedable rng', () => {
  it('is reproducible for a given seed', () => {
    const a = createRng('drill-7').next();
    const b = createRng('drill-7').next();
    expect(a).toBe(b);
  });

  it('differs across seeds', () => {
    expect(createRng('a').next()).not.toBe(createRng('b').next());
  });

  it('shuffles reproducibly and is a true permutation', () => {
    const d1 = shuffle(makeDeck(), createRng(42));
    const d2 = shuffle(makeDeck(), createRng(42));
    expect(d1).toEqual(d2);
    expect([...d1].sort((x, y) => x - y)).toEqual(makeDeck());
    expect(d1).not.toEqual(makeDeck()); // actually shuffled
  });

  it('int() stays in range and covers the space', () => {
    const rng = createRng('range');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(52);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(52);
      seen.add(v);
    }
    expect(seen.size).toBe(52);
  });
});

describe('deck bookkeeping', () => {
  it('removes dead cards', () => {
    const d = deckWithout(parseCards('As Kd'));
    expect(d).toHaveLength(50);
    expect(d).not.toContain(parseCard('As'));
  });

  it('refuses duplicates', () => {
    expect(() => deckWithout(parseCards('As As'))).toThrow(/duplicate/);
    expect(() => assertNoDuplicates(parseCards('Kd 9h Kd'))).toThrow(/duplicate/);
  });
});
