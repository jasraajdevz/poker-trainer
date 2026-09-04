import { describe, it, expect } from 'vitest';
import { HELP, helpEntry, helpQuestions, searchHelp } from '../help';

describe('the ask-me-anything guide', () => {
  it('every entry has a question and a real answer in both modes', () => {
    expect(HELP.length).toBeGreaterThanOrEqual(12);
    expect(new Set(HELP.map((e) => e.id)).size).toBe(HELP.length);
    for (const e of HELP) {
      expect(e.q.kid.length, e.id).toBeGreaterThan(5);
      expect(e.q.adult.length, e.id).toBeGreaterThan(5);
      expect(e.a.kid.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.a.adult.length, e.id).toBeGreaterThanOrEqual(1);
      // "Gives you everything" means paragraphs, not one-liners.
      expect(e.a.kid.join(' ').length, e.id).toBeGreaterThan(100);
      expect(e.a.adult.join(' ').length, e.id).toBeGreaterThan(100);
    }
  });

  it('kid answers use no money, gambling or scolding words', () => {
    const banned = /\b(money|cash|bet|bets|betting|wager|gambl\w*|stake|blind|blinds|bankroll|bluff\w*)\b|\$/i;
    const harsh = /\b(wrong|bad|fail|stupid|dumb|loser)\b/i;
    for (const e of HELP) {
      const text = [e.q.kid, ...e.a.kid].join(' ');
      expect(banned.test(text), `${e.id}: ${text.match(banned)?.[0]}`).toBe(false);
      expect(harsh.test(text), `${e.id}: ${text.match(harsh)?.[0]}`).toBe(false);
    }
  });

  it('adult answers are allowed the real poker vocabulary', () => {
    const all = HELP.map((e) => e.a.adult.join(' ')).join(' ');
    expect(all).toMatch(/pot/i);
    expect(all).toMatch(/equity/i);
    expect(all).toMatch(/fold/i);
  });

  it('lists questions in the right vocabulary per mode', () => {
    const kid = helpQuestions('kid');
    const adult = helpQuestions('adult');
    expect(kid).toHaveLength(HELP.length);
    expect(kid.find((q) => q.id === 'practice')!.q).toBe('What is the Practice Zone?');
    expect(adult.find((q) => q.id === 'practice')!.q).toBe('What is the Mistake Dojo?');
  });

  it('finds entries by keyword, weighting question matches highest', () => {
    expect(searchHelp('fold', 'adult')[0]!.id).toBe('quitting');
    expect(searchHelp('sit out', 'kid').map((m) => m.id)).toContain('quitting');
    expect(searchHelp('how do i play', 'kid')[0]!.id).toBe('how-to-play');
    expect(searchHelp('outs equity', 'adult')[0]!.id).toBe('chances');
    expect(searchHelp('badge', 'kid')[0]!.id).toBe('progress');
  });

  it('returns nothing for junk instead of a wrong answer', () => {
    expect(searchHelp('', 'adult')).toEqual([]);
    expect(searchHelp('   ', 'kid')).toEqual([]);
    expect(searchHelp('zzzqqq', 'adult')).toEqual([]);
    expect(helpEntry('not-a-topic')).toBeUndefined();
  });

  it('answers what it claims to answer, spot-checked', () => {
    // The price answer must actually teach the division.
    expect(helpEntry('price')!.a.adult.join(' ')).toMatch(/call \/ \(pot after your call\)/);
    expect(helpEntry('price')!.a.kid.join(' ')).toMatch(/divided by/);
    // The single-player answer must actually say yes.
    expect(helpEntry('single-player')!.a.kid[0]).toMatch(/^Yes/);
    expect(helpEntry('single-player')!.a.adult[0]).toMatch(/^Fully/);
  });
});
