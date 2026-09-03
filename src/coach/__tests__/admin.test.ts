import { describe, it, expect } from 'vitest';
import { SharedScore } from '../share';
import { buildBoard, StoredEntry } from '../leaderboard';
import {
  FIELDS, Override, applyOverride, beatTheBoard, isOverridden, sanitiseField,
} from '../admin';

const who = (n: string, over: Partial<SharedScore> = {}): SharedScore => ({
  v: 1, n, d: 100, a: 70, l: 3, e: 5, t: 3000, ...over,
});
const stored = (s: SharedScore): StoredEntry => ({ s, intact: true, at: 1 });

describe('field editing', () => {
  it('clamps every field to a range the board can render', () => {
    expect(sanitiseField('l', 99)).toBe(9);
    expect(sanitiseField('l', -4)).toBe(0);
    expect(sanitiseField('a', 1000)).toBe(100);
    expect(sanitiseField('a', -1)).toBe(0);
    expect(sanitiseField('e', -20)).toBe(0);
    expect(sanitiseField('t', 10 ** 12)).toBe(600_000);
  });

  it('copes with junk typed into a number box', () => {
    for (const f of FIELDS) {
      expect(Number.isFinite(sanitiseField(f.key, 'abc') as number)).toBe(true);
      expect(Number.isFinite(sanitiseField(f.key, '') as number)).toBe(true);
      expect(Number.isFinite(sanitiseField(f.key, NaN) as number)).toBe(true);
    }
  });

  it('keeps EV to one decimal and everything else whole', () => {
    expect(sanitiseField('e', 12.3456)).toBe(12.3);
    expect(sanitiseField('a', 82.7)).toBe(83);
    expect(sanitiseField('d', 100.4)).toBe(100);
  });

  it('cleans an edited name the same way a shared one is cleaned', () => {
    expect(sanitiseField('n', '  Big   Dog  ')).toBe('Big Dog');
    expect(String(sanitiseField('n', 'x'.repeat(80)))).toHaveLength(24);
  });
});

describe('applying an override', () => {
  const real = who('Jas', { l: 2, a: 61, d: 40, e: 9, t: 3400 });

  it('is a no-op without one, which is how non-admins see it', () => {
    expect(applyOverride(real, null)).toEqual(real);
    expect(applyOverride(real, {})).toEqual(real);
    expect(isOverridden(null)).toBe(false);
    expect(isOverridden({})).toBe(false);
  });

  it('replaces only the fields it names', () => {
    const out = applyOverride(real, { l: 8, a: 94 });
    expect(out.l).toBe(8);
    expect(out.a).toBe(94);
    expect(out.d).toBe(40);      // untouched
    expect(out.n).toBe('Jas');
    expect(isOverridden({ l: 8 })).toBe(true);
  });

  it('sanitises on the way in, so a hand-edited store cannot break the board', () => {
    const out = applyOverride(real, { l: 400, a: -12, e: -5 } as Override);
    expect(out.l).toBe(9);
    expect(out.a).toBe(0);
    expect(out.e).toBe(0);
  });

  it('ignores fields that are not editable', () => {
    const out = applyOverride(real, { v: 99, p: 1 } as unknown as Override);
    expect(out.v).toBe(1);
    expect(out.p).toBeUndefined();
  });

  it('never blanks the name', () => {
    expect(applyOverride(real, { n: '   ' }).n).toBe('Jas');
  });
});

describe('make me number one', () => {
  const rivals = [
    who('Ravi', { l: 6, a: 84, d: 420, e: 31.5, t: 2050 }),
    who('Mei', { l: 5, a: 79, d: 260, e: 18.2, t: 2600 }),
  ];
  const me = who('Jas', { l: 2, a: 61, d: 40, e: 9, t: 3400 });

  it('actually reaches the top of the table', () => {
    const faked = applyOverride(me, beatTheBoard(rivals, me));
    const board = buildBoard(rivals.map(stored), faked, 'levels');
    expect(board[0]!.isMe).toBe(true);
  });

  it('tops every sortable column, not just the default one', () => {
    const faked = applyOverride(me, beatTheBoard(rivals, me));
    for (const sort of ['levels', 'accuracy', 'ev', 'drills', 'speed'] as const) {
      const board = buildBoard(rivals.map(stored), faked, sort);
      expect(board[0]!.isMe, `sorted by ${sort}`).toBe(true);
    }
  });

  it('edges past the leader instead of maxing out, so it reads as plausible', () => {
    const o = beatTheBoard(rivals, me);
    expect(o.l).toBe(7);              // one past Ravi's six, not nine
    expect(o.a).toBe(86);             // two past Ravi's 84, not 100
    expect(o.a).toBeLessThan(100);
    expect(o.t!).toBeGreaterThan(0);  // not an impossible zero-second read
  });

  it('clears the ceiling gracefully when a rival is already maxed', () => {
    const maxed = [who('God', { l: 9, a: 100, d: 9999, e: 0, t: 400 })];
    const o = beatTheBoard(maxed, me);
    expect(o.l).toBe(9);
    expect(o.a).toBeLessThanOrEqual(99);
    expect(o.e!).toBeGreaterThanOrEqual(0);
    expect(o.t!).toBeGreaterThanOrEqual(600);
    const board = buildBoard(maxed.map(stored), applyOverride(me, o), 'levels');
    expect(board[0]!.score.l).toBe(9);
  });

  it('still does something sensible on an empty board', () => {
    const o = beatTheBoard([], me);
    expect(o.l).toBe(3);
    expect(o.a).toBe(85);
  });

  it('leaves you ranked, never provisional', () => {
    const faked = applyOverride(me, beatTheBoard(rivals, me));
    expect(buildBoard(rivals.map(stored), faked)[0]!.provisional).toBe(false);
  });
});
