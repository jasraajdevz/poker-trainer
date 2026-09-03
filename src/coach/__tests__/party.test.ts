import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HOURS, JOIN_BONUS, TITLES, decodeParty, encodeParty, isLive, makeParty,
  partyFromHash, remainingMs, titleForRank, withParty,
} from '../party';
import { decodeScore, encodeScore, SharedScore } from '../share';
import { buildBoard, decodeBoard, encodeBoard, StoredEntry } from '../leaderboard';

const NOW = 1_700_000_000_000;

describe('starting a party', () => {
  it('cleans the name and clamps the length', () => {
    const p = makeParty('  Ravi   the   Legend  ', 'Jas', 24, NOW);
    expect(p.name).toBe('Ravi the Legend');
    expect(p.host).toBe('Jas');
    expect(p.duration).toBe(24 * 3600_000);
    expect(makeParty('x'.repeat(80), 'h', 24, NOW).name).toHaveLength(24);
  });

  it('falls back when nobody is named', () => {
    const p = makeParty('', '', DEFAULT_HOURS, NOW);
    expect(p.name).toBe('Everybody');
    expect(p.host).toBe('The owner');
  });

  it('clamps the duration to something sane', () => {
    expect(makeParty('a', 'b', 0, NOW).duration).toBe(3600_000);
    expect(makeParty('a', 'b', 9999, NOW).duration).toBe(168 * 3600_000);
  });
});

describe('when a party is on', () => {
  const p = makeParty('Ravi', 'Jas', 2, NOW);

  it('runs from its start until it expires', () => {
    expect(isLive(p, NOW - 1)).toBe(false);
    expect(isLive(p, NOW)).toBe(true);
    expect(isLive(p, NOW + 3600_000)).toBe(true);
    expect(isLive(p, NOW + 2 * 3600_000)).toBe(false);
    expect(isLive(null, NOW)).toBe(false);
  });

  it('counts down', () => {
    expect(remainingMs(p, NOW)).toBe(2 * 3600_000);
    expect(remainingMs(p, NOW + 2 * 3600_000 + 5)).toBe(0);
    expect(remainingMs(null, NOW)).toBe(0);
  });

  it('an old link found next March does not relaunch the confetti', () => {
    const stale = makeParty('Ravi', 'Jas', 24, NOW - 90 * 24 * 3600_000);
    expect(isLive(stale, NOW)).toBe(false);
  });
});

describe('a party travels in a link', () => {
  const p = makeParty('Ravi', 'Jas', 6, NOW);

  it('round-trips', () => {
    const out = decodeParty(encodeParty(p))!;
    expect(out.name).toBe('Ravi');
    expect(out.host).toBe('Jas');
    expect(out.at).toBe(NOW);
    expect(out.duration).toBe(6 * 3600_000);
  });

  it('is found in a fragment beside a score', () => {
    const hash = `#s=abc&pty=${encodeParty(p)}`;
    expect(partyFromHash(hash)!.name).toBe('Ravi');
    expect(partyFromHash('#s=abc')).toBeNull();
    expect(partyFromHash('')).toBeNull();
  });

  it('attaches to a link with the right separator', () => {
    const live = makeParty('Ravi', 'Jas', 6); // now, so it is actually running
    expect(withParty('https://x/y', live)).toContain('#pty=');
    expect(withParty('https://x/y#s=abc', live)).toContain('&pty=');
  });

  it('attaches nothing when there is no party to attach', () => {
    expect(withParty('https://x/y', null)).toBe('https://x/y');
    // An expired party is not a party.
    expect(withParty('https://x/y', makeParty('a', 'b', 1, NOW))).toBe('https://x/y');
  });

  it('refuses junk and clamps hostile values', () => {
    for (const junk of ['', '!!!', 'YWJj', 'e30']) {
      expect(() => decodeParty(junk)).not.toThrow();
      expect(decodeParty(junk)).toBeNull();
    }
    const evil = btoa(JSON.stringify({
      v: 1, p: ['x'.repeat(300), 'y', Number.MAX_SAFE_INTEGER, 1e30],
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const out = decodeParty(evil)!;
    expect(out.name).toHaveLength(24);
    expect(out.duration).toBeLessThanOrEqual(168 * 3600_000);
    // Cannot be dated into next year to keep the disco running forever.
    expect(out.at).toBeLessThanOrEqual(Date.now() + 3600_000);
  });

  it('rejects a payload with the wrong shape', () => {
    const bad = btoa(JSON.stringify({ v: 1, p: ['only', 'two'] }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeParty(bad)).toBeNull();
  });
});

describe('birthday points and titles', () => {
  it('hands out a title for the top three and nothing after', () => {
    expect(titleForRank(0)!.label).toBe('Disco Monarch');
    expect(titleForRank(1)!.label).toBe(TITLES[1]!.label);
    expect(titleForRank(2)).not.toBeNull();
    expect(titleForRank(3)).toBeNull();
    expect(titleForRank(99)).toBeNull();
  });

  it('is worth turning up for', () => {
    expect(JOIN_BONUS).toBeGreaterThan(0);
  });

  it('ranks the board by points, and turning up is the only qualification', () => {
    const who = (n: string, over: Partial<SharedScore> = {}): SharedScore =>
      ({ v: 1, n, d: 100, a: 70, l: 3, e: 5, t: 3000, ...over });
    const roster: StoredEntry[] = [
      { s: who('Ravi', { b: 200, d: 400 }), intact: true, at: 1 },
      { s: who('Tom', { b: 900, d: 3 }), intact: true, at: 1 },   // 3 drills, tons of points
    ];
    const me = who('Jas', { b: 50 });
    const board = buildBoard(roster, me, 'birthday');
    // Tom is provisional on skill but he danced hardest, so he tops this column.
    expect(board[0]!.score.n).toBe('Tom');
    expect(board.map((e) => e.score.n)).toEqual(['Tom', 'Ravi', 'Jas']);
  });
});

describe('party fields do not break existing links', () => {
  const legacy: SharedScore = { v: 1, n: 'Jas', d: 64, a: 80, l: 4, e: 9.1, t: 2839 };

  it('a score made before birthday mode still validates', () => {
    const out = decodeScore(encodeScore(legacy))!;
    expect(out.intact).toBe(true);
    expect(out.score.b).toBeUndefined();
    expect(out.score.g).toBeUndefined();
  });

  it('a score carrying points and a title round-trips and validates', () => {
    const partying: SharedScore = { ...legacy, b: 425, g: 'Disco Monarch' };
    const out = decodeScore(encodeScore(partying))!;
    expect(out.intact).toBe(true);
    expect(out.score.b).toBe(425);
    expect(out.score.g).toBe('Disco Monarch');
  });

  it('a board made before birthday mode still validates', () => {
    // Seven-element rows, as the old encoder produced.
    const rows = [['Ravi', 420, 84, 6, 31.5, 2050, '']];
    const body = JSON.stringify(rows);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < body.length; i++) { h ^= body.charCodeAt(i); h = Math.imul(h, 16777619); }
    const payload = btoa(JSON.stringify({ v: 1, b: rows, h: h >>> 0 }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const out = decodeBoard(payload)!;
    expect(out.intact).toBe(true);
    expect(out.scores[0]!.n).toBe('Ravi');
  });

  it('a new board carries points and titles', () => {
    const out = decodeBoard(encodeBoard([
      { v: 1, n: 'Jas', d: 10, a: 50, l: 1, e: 1, t: 2000, b: 300, g: 'Disco Monarch' },
    ]))!;
    expect(out.intact).toBe(true);
    expect(out.scores[0]!.b).toBe(300);
    expect(out.scores[0]!.g).toBe('Disco Monarch');
  });
});
