import { describe, it, expect } from 'vitest';
import { codeIsValid, normalise, budget } from '../pro';
import { SR_INTERVALS, TAGS, newMistake, recordFailure, recordSuccess, isDue } from '../mistakes';
import { DrillResult, applyResult, emptyProgress, finishAttempt, isUnlocked, median } from '../progress';
import { TAG_LEVEL, bossFight, dojoSession, leakBoard, clearTag, BOSS_PASS } from '../dojo';
import { LevelId } from '../../curriculum/types';

const result = (over: Partial<DrillResult> = {}): DrillResult => ({
  drillId: 'd', levelId: 'L2' as LevelId, index: 0, seed: 's', correct: false,
  elapsedMs: 1000, tags: ['calls-without-odds'], evLostBB: 1.5, at: 1, ...over,
});

// The real code is deliberately absent from this repository. The assertion that
// it unlocks lives in owner-code.local.test.ts, which is gitignored, so the
// public source proves the mechanism without handing over the secret.
describe('upgrade code', () => {
  it('rejects everything in a wordlist of plausible guesses', () => {
    const guesses = [
      '', 'omega', 'OMEGA', 'PASSWORD', 'password', 'admin', 'letmein', 'poker',
      'unlock', 'pro', 'PRO', 'owner', 'OWNER', '1234', '0000', 'trainer',
      'omegamode', 'upgraded', 'jasraaj', 'secret', 'test', 'free',
    ];
    for (const bad of guesses) expect(codeIsValid(bad)).toBe(false);
  });

  it('normalises casing and punctuation before comparing', () => {
    expect(normalise(' aB-c 1_2 ')).toBe('ABC12');
    expect(normalise('x-y-z')).toBe(normalise('X Y Z'));
    expect(normalise('')).toBe('');
  });

  it('is a pure function of the normalised input', () => {
    // Whatever the code is, differently punctuated spellings must agree.
    for (const s of ['ab-12', 'Q R S', 'zz_99']) {
      expect(codeIsValid(s)).toBe(codeIsValid(normalise(s).toLowerCase()));
    }
  });

  it('buys precision, not different answers', () => {
    expect(budget(true).iterations).toBeGreaterThan(budget(false).iterations);
    expect(budget(true).exactThreshold).toBeGreaterThan(budget(false).exactThreshold);
  });
});

describe('the error taxonomy', () => {
  it('gives every tag copy and a level that can drill it', () => {
    for (const tag of Object.keys(TAGS) as Array<keyof typeof TAGS>) {
      expect(TAGS[tag].label.length).toBeGreaterThan(3);
      expect(TAGS[tag].fix.length).toBeGreaterThan(10);
      expect(TAG_LEVEL[tag]).toMatch(/^L[0-8]$/);
    }
  });
});

describe('spaced repetition', () => {
  it('walks 1, 3, 10, 30 drills and only then retires the tag', () => {
    let m = newMistake('calls-without-odds', 'L2', 's', 1, 0, 1);
    const dues = [m.dueAtDrill];
    for (let i = 0; i < SR_INTERVALS.length; i++) {
      m = recordSuccess(m, m.dueAtDrill);
      if (!m.retired) dues.push(m.dueAtDrill);
    }
    expect(dues).toEqual([1, 4, 14, 44]);
    expect(m.retired).toBe(true);
    expect(m.cleanReps).toBe(4);
  });

  it('resets the ladder on a repeat failure', () => {
    let m = newMistake('calls-without-odds', 'L2', 's', 1, 0, 1);
    m = recordSuccess(m, 1);
    m = recordSuccess(m, 4);
    expect(m.stage).toBe(2);
    m = recordFailure(m, 2, 20, 0.5);
    expect(m.stage).toBe(0);
    expect(m.occurrences).toBe(2);
    expect(m.evLostBB).toBe(1.5);
    expect(m.dueAtDrill).toBe(21);
    expect(m.retired).toBe(false);
  });

  it('comes due only once the drill counter passes', () => {
    const m = newMistake('calls-without-odds', 'L2', 's', 1, 5, 1);
    expect(isDue(m, 5)).toBe(false);
    expect(isDue(m, 6)).toBe(true);
  });
});

describe('progress and unlocking', () => {
  it('starts with only L0 open', () => {
    const p = emptyProgress();
    expect(isUnlocked(p, 'L0')).toBe(true);
    expect(isUnlocked(p, 'L1')).toBe(false);
  });

  it('unlocks the next level at exactly 80% and not at 73%', () => {
    let pass = emptyProgress();
    for (let i = 0; i < 15; i++) pass = applyResult(pass, result({ levelId: 'L0', correct: i < 12, tags: [] }));
    pass = finishAttempt(pass, 'L0', 15);
    expect(pass.levels.L0!.completed).toBe(true);
    expect(isUnlocked(pass, 'L1')).toBe(true);

    let fail = emptyProgress();
    for (let i = 0; i < 15; i++) fail = applyResult(fail, result({ levelId: 'L0', correct: i < 11, tags: [] }));
    fail = finishAttempt(fail, 'L0', 15);
    expect(fail.levels.L0!.completed).toBe(false);
    expect(isUnlocked(fail, 'L1')).toBe(false);
  });

  it('accumulates a repeated mistake instead of duplicating it', () => {
    let p = emptyProgress();
    p = applyResult(p, result());
    p = applyResult(p, result());
    expect(p.mistakes).toHaveLength(1);
    expect(p.mistakes[0]!.occurrences).toBe(2);
    expect(p.mistakes[0]!.evLostBB).toBe(3);
  });

  it('computes medians for the speed trend', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('the dojo', () => {
  const seeded = () => {
    let p = emptyProgress();
    p = applyResult(p, result({ tags: ['calls-without-odds'], evLostBB: 3 }));
    p = applyResult(p, result({ tags: ['counts-dirty-outs'], levelId: 'L1', evLostBB: 0 }));
    p = applyResult(p, result({ tags: ['misreads-kickers'], levelId: 'L0', evLostBB: 0 }));
    return p;
  };

  it('ranks leaks by measured cost per 100 hands', () => {
    const board = leakBoard(seeded());
    expect(board[0]!.tag).toBe('calls-without-odds');
    expect(board[0]!.bbPer100).toBeGreaterThan(0);
    expect(board.every((l) => l.fix.length > 0)).toBe(true);
  });

  it('builds a mixed session from the top leaks, never a replay', () => {
    const p = seeded();
    const a = dojoSession(p, 'seedA', 10);
    const b = dojoSession(p, 'seedB', 10);
    expect(a).toHaveLength(10);
    expect(new Set(a.map((d) => d.levelId)).size).toBeGreaterThan(1);
    expect(a[0]!.id).not.toBe(b[0]!.id);
    expect(a.some((d) => d.seed === 's')).toBe(false);
  });

  it('builds a boss fight of ten distinct drills from one leak', () => {
    const fight = bossFight('calls-without-odds', 'boss');
    expect(fight).toHaveLength(10);
    expect(new Set(fight.map((d) => d.levelId))).toEqual(new Set(['L2']));
    expect(new Set(fight.map((d) => d.id)).size).toBe(10);
    expect(BOSS_PASS).toBe(8);
  });

  it('retires a tag when the boss is beaten', () => {
    const p = clearTag(seeded(), 'calls-without-odds');
    expect(p.mistakes.find((m) => m.tag === 'calls-without-odds')!.retired).toBe(true);
    expect(leakBoard(p).filter((l) => !l.retired).map((l) => l.tag)).not.toContain('calls-without-odds');
  });
});
