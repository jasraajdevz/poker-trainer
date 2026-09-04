import { describe, it, expect, afterEach } from 'vitest';
import {
  BADGES, MODE_CONFIG, RANKS, TERMS, XP_CORRECT, XP_STREAK_CAP, badgeName, cfg,
  earnedBadges, getMode, newlyEarned, praise, rankFor, rankName, setMode, terms, xpForDrill,
} from '../profile';
import { DrillResult, Progress, applyResult, emptyProgress, finishAttempt } from '../progress';
import { TAGS, tagFix, tagLabel } from '../mistakes';
import { L1 } from '../../curriculum/l1-outs';
import { analyzeOuts } from '../../engine/odds';
import { equityVsHand } from '../../engine/equity';

afterEach(() => setMode('adult'));

const drill = (over: Partial<DrillResult> = {}): DrillResult => ({
  drillId: 'd', levelId: 'L0', index: 0, seed: 's', correct: true,
  elapsedMs: 2000, tags: [], evLostBB: 0, at: 1, ...over,
});

const ctx = (over: Partial<Parameters<typeof earnedBadges>[1]> = {}) =>
  ({ xp: 0, bestStreak: 0, birthdayPoints: 0, bossesCleared: 0, ...over });

const run = (p: Progress, n: number, over: Partial<DrillResult> = {}) => {
  let out = p;
  for (let i = 0; i < n; i++) out = applyResult(out, drill(over));
  return out;
};

describe('the two modes', () => {
  it('makes kid mode forgiving and adult mode strict', () => {
    const k = MODE_CONFIG.kid;
    const a = MODE_CONFIG.adult;
    expect(k.passMark).toBeLessThan(a.passMark);
    expect(k.outsTolerance).toBeGreaterThan(a.outsTolerance);
    expect(k.equityTolerance).toBeGreaterThan(a.equityTolerance);
    expect(k.priceTolerance).toBeGreaterThan(a.priceTolerance);
    expect(k.hintsByDefault).toBe(true);
    expect(k.timed).toBe(false);
    expect(a.timed).toBe(true);
  });

  it('switches the active config', () => {
    setMode('kid');
    expect(getMode()).toBe('kid');
    expect(cfg().passMark).toBe(MODE_CONFIG.kid.passMark);
    setMode('adult');
    expect(cfg().outsTolerance).toBe(0);
  });

  it('keeps money and gambling language out of kid vocabulary', () => {
    const banned = /\b(money|cash|bet|wager|gambl|stake|blind|bankroll|\$)/i;
    for (const [key, value] of Object.entries(TERMS.kid)) {
      expect(banned.test(value), `kid term "${key}" = "${value}"`).toBe(false);
    }
    // Adults get the real words, because for them it is real poker.
    expect(TERMS.adult.chips).toBe('chips');
    expect(TERMS.kid.chips).toBe('stars');
    expect(terms('kid').unit).toBe('stars');
  });

  it('actually marks a real drill more kindly for kids', () => {
    setMode('adult');
    const d = L1.generate(0, 'mode-test');
    const hero = d.scene.heroCards!;
    const board = d.scene.board!;
    const villain = d.scene.villainCards!;
    const outs = analyzeOuts(hero, board, villain).winningOuts.length;
    const eq = equityVsHand(hero, villain, board).equity[0]! * 100;

    // One out and eight points off: wrong for an adult.
    expect(d.grade({ outs: outs + 1, equity: eq + 8 }).correct).toBe(false);

    setMode('kid');
    const kidDrill = L1.generate(0, 'mode-test');
    expect(kidDrill.grade({ outs: outs + 1, equity: eq + 8 }).correct).toBe(true);
    // Still not a free pass.
    expect(kidDrill.grade({ outs: outs + 5, equity: eq + 40 }).correct).toBe(false);
  });

  it('lowers the bar to pass a level for kids', () => {
    setMode('kid');
    let p = emptyProgress();
    p = run(p, 10, { levelId: 'L0', correct: true });
    p = applyResult(p, drill({ levelId: 'L0', correct: false }));
    p = applyResult(p, drill({ levelId: 'L0', correct: false }));
    p = applyResult(p, drill({ levelId: 'L0', correct: false }));
    p = applyResult(p, drill({ levelId: 'L0', correct: false }));
    p = applyResult(p, drill({ levelId: 'L0', correct: false }));
    // 10 of 15 = 67%: passes at the kid bar, fails at the adult one.
    expect(finishAttempt(p, 'L0', 15, MODE_CONFIG.kid.passMark).levels.L0!.completed).toBe(true);
    expect(finishAttempt(p, 'L0', 15, MODE_CONFIG.adult.passMark).levels.L0!.completed).toBe(false);
  });
});

describe('ranks and XP', () => {
  it('climbs in order with no gaps', () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i]!.at).toBeGreaterThan(RANKS[i - 1]!.at);
    }
    expect(RANKS[0]!.at).toBe(0);
  });

  it('places you in the right rank', () => {
    expect(rankFor(0).index).toBe(0);
    expect(rankFor(99).index).toBe(0);
    expect(rankFor(100).index).toBe(1);
    expect(rankFor(999_999).index).toBe(RANKS.length - 1);
    expect(rankFor(999_999).next).toBeNull();
    expect(rankFor(999_999).progress).toBe(1);
  });

  it('reports honest progress toward the next rank', () => {
    const s = rankFor(200);
    expect(s.next!.at).toBe(300);
    expect(s.toNext).toBe(100);
    expect(s.progress).toBeCloseTo(0.5, 6);
  });

  it('names ranks differently for kids and adults', () => {
    expect(rankName(RANKS[0]!, 'kid')).toBe('Card Cub');
    expect(rankName(RANKS[0]!, 'adult')).toBe('Novice');
    for (const r of RANKS) {
      expect(r.kid).not.toBe(r.adult);
      expect(r.emoji.length).toBeGreaterThan(0);
    }
  });

  it('pays nothing for a wrong answer and more for a streak', () => {
    expect(xpForDrill(false, 0)).toBe(0);
    expect(xpForDrill(false, 9)).toBe(0);
    expect(xpForDrill(true, 1)).toBe(XP_CORRECT);
    expect(xpForDrill(true, 2)).toBe(XP_CORRECT + 2);
    expect(xpForDrill(true, 5)).toBe(XP_CORRECT + 8);
    expect(xpForDrill(true, 1, true)).toBeGreaterThan(xpForDrill(true, 1, false));
  });

  it('caps the streak bonus so it cannot run away', () => {
    expect(xpForDrill(true, 500)).toBe(XP_CORRECT + XP_STREAK_CAP);
  });
});

describe('badges', () => {
  it('are all distinct, named for both modes, and explain themselves', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    for (const b of BADGES) {
      expect(b.kid.length).toBeGreaterThan(2);
      expect(b.adult.length).toBeGreaterThan(2);
      expect(b.how.length).toBeGreaterThan(10);
      expect(badgeName(b, 'kid')).toBe(b.kid);
    }
  });

  it('start empty and unlock from real history', () => {
    expect(earnedBadges(emptyProgress(), ctx())).toEqual([]);
    const one = applyResult(emptyProgress(), drill());
    expect(earnedBadges(one, ctx())).toContain('first-light');
  });

  it('needs eight L0 reads in a row for the eagle eye', () => {
    let p = run(emptyProgress(), 7, { levelId: 'L0' });
    expect(earnedBadges(p, ctx())).not.toContain('sharp-eye');
    p = run(p, 1, { levelId: 'L0' });
    expect(earnedBadges(p, ctx())).toContain('sharp-eye');
    // A miss resets the run.
    let broken = run(emptyProgress(), 5, { levelId: 'L0' });
    broken = applyResult(broken, drill({ levelId: 'L0', correct: false }));
    broken = run(broken, 5, { levelId: 'L0' });
    expect(earnedBadges(broken, ctx())).not.toContain('sharp-eye');
  });

  it('measures speed from the median, not one lucky answer', () => {
    const quick = run(emptyProgress(), 12, { levelId: 'L0', elapsedMs: 2100 });
    expect(earnedBadges(quick, ctx())).toContain('lightning');
    const slow = run(emptyProgress(), 12, { levelId: 'L0', elapsedMs: 5000 });
    expect(earnedBadges(slow, ctx())).not.toContain('lightning');
  });

  it('awards the party and boss badges from their own counters', () => {
    const p = applyResult(emptyProgress(), drill());
    expect(earnedBadges(p, ctx({ birthdayPoints: 499 }))).not.toContain('party');
    expect(earnedBadges(p, ctx({ birthdayPoints: 500 }))).toContain('party');
    expect(earnedBadges(p, ctx({ bossesCleared: 1 }))).toContain('boss');
    expect(earnedBadges(p, ctx({ bestStreak: 12 }))).toContain('streak');
  });

  it('reports only what is newly true', () => {
    expect(newlyEarned(['a'], ['a', 'b'])).toEqual(['b']);
    expect(newlyEarned(['a', 'b'], ['a', 'b'])).toEqual([]);
    expect(newlyEarned([], ['a'])).toEqual(['a']);
  });
});

describe('kid copy for the mistake tags', () => {
  const banned = /\b(money|cash|bet|bets|wager|gambl|stake|blind|bankroll|bluff)\b|\$/i;
  const harsh = /\b(wrong|bad|fail|stupid|dumb|never learn)\b/i;

  it('every tag has kid copy with no money, gambling or scolding words', () => {
    for (const tag of Object.keys(TAGS) as Array<keyof typeof TAGS>) {
      const info = TAGS[tag];
      expect(info.kidLabel.length, tag).toBeGreaterThan(3);
      expect(info.kidFix.length, tag).toBeGreaterThan(10);
      expect(banned.test(info.kidLabel), `${tag} label: "${info.kidLabel}"`).toBe(false);
      expect(banned.test(info.kidFix), `${tag} fix: "${info.kidFix}"`).toBe(false);
      expect(harsh.test(info.kidLabel), `${tag} label: "${info.kidLabel}"`).toBe(false);
      expect(harsh.test(info.kidFix), `${tag} fix: "${info.kidFix}"`).toBe(false);
    }
  });

  it('accessors pick the right vocabulary per mode', () => {
    expect(tagLabel('calls-without-odds', false)).toBe('Calls without the odds');
    expect(tagLabel('calls-without-odds', true)).toBe('Pays when it is too pricey');
    expect(tagFix('bluffs-into-calling-stations', true)).not.toMatch(/bluff/i);
    expect(tagFix('bluffs-into-calling-stations', false)).toMatch(/bluff/i);
  });
});

describe('praise', () => {
  it('is deterministic, so replaying does not reshuffle the words', () => {
    expect(praise(true, 3, 'kid')).toBe(praise(true, 3, 'kid'));
    expect(praise(true, 3, 'kid')).not.toBe(praise(true, 3, 'adult'));
  });

  it('never scolds a child', () => {
    const harsh = /\b(wrong|bad|fail|stupid|no)\b/i;
    for (let i = 0; i < 20; i++) {
      expect(harsh.test(praise(false, i, 'kid')), praise(false, i, 'kid')).toBe(false);
    }
  });
});
