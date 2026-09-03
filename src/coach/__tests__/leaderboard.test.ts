import { describe, it, expect } from 'vitest';
import { SharedScore } from '../share';
import {
  COLUMNS, MAX_ENTRIES, RANKED_MIN_DRILLS, StoredEntry, boardFromHash, boardUrl, buildBoard,
  decodeBoard, encodeBoard, evPer100, leakLabel, mergeEntry, mergeMany, removeEntry,
} from '../leaderboard';

const who = (n: string, over: Partial<SharedScore> = {}): SharedScore => ({
  v: 1, n, d: 100, a: 70, l: 3, e: 5, t: 3000, ...over,
});

const stored = (s: SharedScore): StoredEntry => ({ s, intact: true, at: 1 });

describe('roster bookkeeping', () => {
  it('keeps one row per player, newest wins', () => {
    let r: StoredEntry[] = [];
    r = mergeEntry(r, who('Ada', { a: 60 }), true, 1);
    r = mergeEntry(r, who('Ada', { a: 90 }), true, 2);
    expect(r).toHaveLength(1);
    expect(r[0]!.s.a).toBe(90);
  });

  it('matches names case- and space-insensitively', () => {
    let r = mergeEntry([], who('Ada Lovelace'), true, 1);
    r = mergeEntry(r, who('  ada   lovelace  ', { a: 99 }), true, 2);
    expect(r).toHaveLength(1);
    expect(r[0]!.s.a).toBe(99);
  });

  it('merges a whole board at once and removes by name', () => {
    let r = mergeMany([], [who('Ada'), who('Bo'), who('Cy')], true, 1);
    expect(r).toHaveLength(3);
    r = removeEntry(r, 'bo');
    expect(r.map((e) => e.s.n)).toEqual(['Ada', 'Cy']);
  });
});

describe('ranking', () => {
  const roster = [
    stored(who('Ada', { l: 5, a: 82, d: 400, e: 12, t: 2100 })),
    stored(who('Bo', { l: 5, a: 91, d: 300, e: 30, t: 4000 })),
    stored(who('Cy', { l: 2, a: 99, d: 5, e: 0, t: 900 })),   // provisional
  ];
  const me = who('You', { l: 4, a: 75, d: 200, e: 8, t: 2500 });

  it('sorts by levels then accuracy by default', () => {
    const board = buildBoard(roster, me);
    expect(board.map((e) => e.score.n)).toEqual(['Bo', 'Ada', 'You', 'Cy']);
  });

  it('sinks provisional entries below everyone who did the work', () => {
    // Cy has 99% accuracy but 5 drills, so cannot top an accuracy sort.
    const board = buildBoard(roster, me, 'accuracy');
    expect(board[0]!.score.n).toBe('Bo');
    expect(board[board.length - 1]!.score.n).toBe('Cy');
    expect(board.find((e) => e.score.n === 'Cy')!.provisional).toBe(true);
    expect(RANKED_MIN_DRILLS).toBeGreaterThan(5);
  });

  it('treats lower as better for EV and read time', () => {
    // bb/100: Ada 3.0, You 4.0, Bo 10.0 (Cy is provisional and sinks)
    expect(buildBoard(roster, me, 'ev').map((e) => e.score.n)).toEqual(['Ada', 'You', 'Bo', 'Cy']);
    // read time: Ada 2.1s, You 2.5s, Bo 4.0s
    expect(buildBoard(roster, me, 'speed').map((e) => e.score.n)).toEqual(['Ada', 'You', 'Bo', 'Cy']);
    // and the same data sorted the other way puts the worst first
    expect(buildBoard(roster, me, 'drills')[0]!.score.n).toBe('Ada');
  });

  it('measures EV per 100 drills, not raw EV', () => {
    expect(evPer100(who('x', { e: 12, d: 400 }))).toBe(3);
    expect(evPer100(who('x', { e: 12, d: 100 }))).toBe(12);
    expect(evPer100(who('x', { e: 5, d: 0 }))).toBe(0);
  });

  it('every column sorts without crashing and keeps everyone', () => {
    for (const c of COLUMNS) {
      const board = buildBoard(roster, me, c.key);
      expect(board).toHaveLength(4);
      expect(new Set(board.map((e) => e.score.n)).size).toBe(4);
    }
  });

  it('replaces a stale copy of you with your live score', () => {
    const withStaleMe = [...roster, stored(who('You', { l: 0, a: 10, d: 999 }))];
    const board = buildBoard(withStaleMe, me);
    const mine = board.filter((e) => e.isMe);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.score.a).toBe(75); // the live one, not the shared snapshot
    expect(board).toHaveLength(4);
  });

  it('caps the table', () => {
    const many = Array.from({ length: 40 }, (_, i) => stored(who(`P${i}`, { l: i % 9 })));
    expect(buildBoard(many, me)).toHaveLength(MAX_ENTRIES);
  });

  it('names a leak or shows a dash', () => {
    expect(leakLabel('calls-without-odds')).toBe('Calls without the odds');
    expect(leakLabel(undefined)).toBe('—');
  });
});

describe('board links', () => {
  const crew = [who('Ada'), who('Bo', { l: 7 }), who('Cy', { k: 'calls-without-odds' })];

  it('round-trips a whole board', () => {
    const out = decodeBoard(encodeBoard(crew))!;
    expect(out.intact).toBe(true);
    expect(out.scores.map((s) => s.n)).toEqual(['Ada', 'Bo', 'Cy']);
    expect(out.scores[1]!.l).toBe(7);
    expect(out.scores[2]!.k).toBe('calls-without-odds');
  });

  it('stays short enough to paste into a chat', () => {
    const full = Array.from({ length: MAX_ENTRIES }, (_, i) =>
      who(`Player${i}`, { k: 'bets-with-no-value-and-no-fold-equity' }));
    expect(boardUrl(full).length).toBeLessThan(1500);
  });

  it('is found in a fragment', () => {
    expect(boardFromHash(`#b=${encodeBoard(crew)}`)!.scores).toHaveLength(3);
    expect(boardFromHash('#s=abc')).toBeNull();
    expect(boardFromHash('')).toBeNull();
  });

  it('flags an edited board', () => {
    const b64 = encodeBoard(crew).replace(/-/g, '+').replace(/_/g, '/');
    const obj = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    obj.b[0][3] = 9; // promote Ada to nine levels
    const enc = btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const out = decodeBoard(enc)!;
    expect(out.intact).toBe(false);
    expect(out.scores[0]!.l).toBe(9);
  });

  it('refuses junk instead of throwing', () => {
    for (const junk of ['', '!!!', 'YWJj', 'e30', btoa('{"v":1}').replace(/=+$/, '')]) {
      expect(() => decodeBoard(junk)).not.toThrow();
      expect(decodeBoard(junk)).toBeNull();
    }
  });

  it('sanitises every row, because a board is a link from a stranger', () => {
    const evil = btoa(JSON.stringify({
      v: 1,
      b: [
        ['x'.repeat(300), 1e30, 9999, 77, -5, Number.MAX_SAFE_INTEGER, 'not-a-tag'],
        'not-an-array',
        [12345, null, undefined, {}, [], true, 'calls-without-odds'],
      ],
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const out = decodeBoard(evil)!;
    expect(out.intact).toBe(false);
    expect(out.scores).toHaveLength(2); // the string row is dropped
    const [a, b] = out.scores;
    expect(a!.n).toHaveLength(24);
    expect(a!.a).toBe(100);
    expect(a!.l).toBe(9);
    expect(a!.e).toBe(0);
    expect(a!.k).toBeUndefined();
    expect(b!.n).toBe('A friend');
    expect(b!.d).toBe(0);
    expect(b!.k).toBe('calls-without-odds');
  });

  it('never exceeds the cap even when handed more', () => {
    const many = Array.from({ length: 50 }, (_, i) => who(`P${i}`));
    expect(decodeBoard(encodeBoard(many))!.scores).toHaveLength(MAX_ENTRIES);
  });
});
