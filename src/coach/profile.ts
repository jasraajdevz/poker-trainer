/**
 * profile.ts — who is playing, and everything that makes playing feel good.
 *
 * Two modes.
 *
 *   adult — poker as poker. Chips, pots, big blinds, EV in bb/100.
 *   kid   — the same maths with the gambling stripped out. Chips become stars,
 *           nothing is ever money, nobody "loses" anything, the tolerances are
 *           kinder and every good answer is a moment.
 *
 * The engine underneath is identical in both. Kid mode does not dumb the poker
 * down; it changes the language, the generosity and the celebration. A ten year
 * old counting outs is doing exactly the same hypergeometric arithmetic.
 */

import { Progress, levelProgress, median } from './progress';
import { LEVEL_ORDER } from './progress';

export type Mode = 'kid' | 'adult';

const MODE_KEY = 'poker-trainer:mode';
const XP_KEY = 'poker-trainer:xp';
const STREAK_KEY = 'poker-trainer:streak';
const BADGE_KEY = 'poker-trainer:badges';

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

export interface ModeConfig {
  /** Share of drills needed to unlock the next level. */
  passMark: number;
  /** Outs may be off by this many and still count. */
  outsTolerance: number;
  /** Equity guesses may be off by this many points. */
  equityTolerance: number;
  /** Pot-odds answers may be off by this many points. */
  priceTolerance: number;
  /** Show the working before you answer. */
  hintsByDefault: boolean;
  /** Put a clock on it. */
  timed: boolean;
  /** Loud praise, or a quiet tick. */
  celebration: 'big' | 'calm';
}

export const MODE_CONFIG: Record<Mode, ModeConfig> = {
  kid: {
    passMark: 0.6,
    outsTolerance: 1,
    equityTolerance: 10,
    priceTolerance: 5,
    hintsByDefault: true,
    timed: false,
    celebration: 'big',
  },
  adult: {
    passMark: 0.8,
    outsTolerance: 0,
    equityTolerance: 5,
    priceTolerance: 2,
    hintsByDefault: false,
    timed: true,
    celebration: 'calm',
  },
};

/**
 * The active mode. A module-level setting rather than a parameter threaded
 * through nine level modules; the app has exactly one player at a time.
 * Tests set it explicitly.
 */
let active: Mode = 'adult';

export const getMode = (): Mode => active;
export const setMode = (m: Mode): void => {
  active = m;
  try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ }
};
export const cfg = (): ModeConfig => MODE_CONFIG[active];

export function loadMode(): Mode | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'kid' || v === 'adult' ? v : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export interface Terms {
  chips: string;
  chip: string;
  pot: string;
  bet: string;
  betting: string;
  raise: string;
  fold: string;
  opponent: string;
  opponents: string;
  /** What a unit of score is called. */
  unit: string;
  /** How EV is described. */
  evName: string;
  /** Table stakes line under the title. */
  tagline: string;
}

export const TERMS: Record<Mode, Terms> = {
  kid: {
    chips: 'stars', chip: 'star', pot: 'star pile', bet: 'add stars',
    betting: 'adding stars', raise: 'add more', fold: 'sit out',
    opponent: 'the other player', opponents: 'the other players',
    unit: 'stars', evName: 'stars you win on average',
    tagline: 'A card game about counting, reading and clever guesses.',
  },
  adult: {
    chips: 'chips', chip: 'chip', pot: 'pot', bet: 'bet',
    betting: 'betting', raise: 'raise', fold: 'fold',
    opponent: 'villain', opponents: 'villains',
    unit: 'chips', evName: 'EV',
    tagline: "No-Limit Hold'em · 6-max · 100bb. Every number it shows you, it computed.",
  },
};

export const terms = (m: Mode = active): Terms => TERMS[m];

/**
 * Kid-facing names for the levels. Same content behind each door; a ten year
 * old should not have to parse "Board texture" to find out what it is.
 */
export const KID_LEVEL_LABELS: Record<string, { title: string; subtitle: string }> = {
  L0: { title: 'Who wins?', subtitle: 'Spot the better hand, fast' },
  L1: { title: 'Counting cards', subtitle: 'How many cards can save you?' },
  L2: { title: 'Is it worth it?', subtitle: 'Compare the price to your chances' },
  L3: { title: 'Where you sit', subtitle: 'Going last is a superpower' },
  L4: { title: 'Which hands to play', subtitle: 'Build your starting hand map' },
  L5: { title: 'Reading the table', subtitle: 'Which cards help who?' },
  L6: { title: 'How many stars?', subtitle: 'Pick the size that wins most' },
  L7: { title: 'Bet or wait?', subtitle: 'Would a worse hand pay you?' },
  L8: { title: 'Play a real game', subtitle: 'Six players, all the way to the end' },
};

export function levelLabel(
  id: string, title: string, subtitle: string, m: Mode = active,
): { title: string; subtitle: string } {
  return (m === 'kid' && KID_LEVEL_LABELS[id]) || { title, subtitle };
}

// ---------------------------------------------------------------------------
// Ranks
// ---------------------------------------------------------------------------

export interface Rank { at: number; kid: string; adult: string; emoji: string; }

/** Thresholds are cumulative XP. Reaching one is a moment. */
export const RANKS: Rank[] = [
  { at: 0, kid: 'Card Cub', adult: 'Novice', emoji: '🐣' },
  { at: 100, kid: 'Card Scout', adult: 'Student', emoji: '🔎' },
  { at: 300, kid: 'Card Star', adult: 'Regular', emoji: '⭐' },
  { at: 700, kid: 'Card Hero', adult: 'Grinder', emoji: '🎴' },
  { at: 1400, kid: 'Card Champion', adult: 'Crusher', emoji: '🏆' },
  { at: 2600, kid: 'Card Legend', adult: 'Shark', emoji: '🦈' },
  { at: 4500, kid: 'Card Myth', adult: 'Nemesis', emoji: '👑' },
];

export interface RankState {
  rank: Rank;
  index: number;
  next: Rank | null;
  /** 0..1 through the current rank. */
  progress: number;
  toNext: number;
}

export function rankFor(xp: number): RankState {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (xp >= RANKS[k]!.at) i = k;
  const rank = RANKS[i]!;
  const next = RANKS[i + 1] ?? null;
  const span = next ? next.at - rank.at : 1;
  return {
    rank,
    index: i,
    next,
    progress: next ? Math.min(1, (xp - rank.at) / span) : 1,
    toNext: next ? Math.max(0, next.at - xp) : 0,
  };
}

export const rankName = (r: Rank, m: Mode = active): string => (m === 'kid' ? r.kid : r.adult);

// ---------------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------------

export const XP_CORRECT = 10;
export const XP_STREAK_STEP = 2;
export const XP_STREAK_CAP = 20;
export const XP_LEVEL_PASS = 60;
export const XP_BOSS_CLEAR = 120;
export const XP_FAST = 5;

/** XP for one answered drill, given the streak it lands on. */
export function xpForDrill(correct: boolean, streakAfter: number, fast = false): number {
  if (!correct) return 0;
  const bonus = Math.min(XP_STREAK_CAP, Math.max(0, streakAfter - 1) * XP_STREAK_STEP);
  return XP_CORRECT + bonus + (fast ? XP_FAST : 0);
}

// ---------------------------------------------------------------------------
// Badges — every one decided by looking at what actually happened
// ---------------------------------------------------------------------------

export interface BadgeDef {
  id: string;
  kid: string;
  adult: string;
  emoji: string;
  how: string;
  earned: (p: Progress, extra: BadgeContext) => boolean;
}

export interface BadgeContext {
  xp: number;
  bestStreak: number;
  birthdayPoints: number;
  bossesCleared: number;
}

const answered = (p: Progress) => p.history.length;
const correctRun = (p: Progress, levelId?: string): number => {
  let best = 0;
  let run = 0;
  for (const r of p.history) {
    if (levelId && r.levelId !== levelId) continue;
    run = r.correct ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
};

export const BADGES: BadgeDef[] = [
  {
    id: 'first-light', kid: 'First Card', adult: 'First Light', emoji: '🃏',
    how: 'Answer your very first question.',
    earned: (p) => answered(p) >= 1,
  },
  {
    id: 'sharp-eye', kid: 'Eagle Eyes', adult: 'Sharp Eye', emoji: '👁️',
    how: 'Read eight showdowns correctly in a row.',
    earned: (p) => correctRun(p, 'L0') >= 8,
  },
  {
    id: 'lightning', kid: 'Lightning Hands', adult: 'Lightning', emoji: '⚡',
    how: 'Get your median showdown read under three seconds.',
    earned: (p) => {
      const l0 = p.history.filter((r) => r.levelId === 'L0');
      return l0.length >= 10 && median(l0.map((r) => r.elapsedMs)) < 3000;
    },
  },
  {
    id: 'counter', kid: 'Super Counter', adult: 'The Counter', emoji: '🔢',
    how: 'Get ten outs counts right.',
    earned: (p) => p.history.filter((r) => r.levelId === 'L1' && r.correct).length >= 10,
  },
  {
    id: 'priced-in', kid: 'Good Chooser', adult: 'Priced In', emoji: '⚖️',
    how: 'Make ten correct price decisions.',
    earned: (p) => p.history.filter((r) => r.levelId === 'L2' && r.correct).length >= 10,
  },
  {
    id: 'flawless', kid: 'Perfect Round', adult: 'Flawless', emoji: '💎',
    how: 'Finish any level without a single mistake.',
    earned: (p) => LEVEL_ORDER.some((id) =>
      levelProgress(p, id).attempts.some(
        (a) => a.results.length >= 8 && a.results.every((r) => r.correct))),
  },
  {
    id: 'streak', kid: 'On Fire', adult: 'Heater', emoji: '🔥',
    how: 'Get twelve right in a row.',
    earned: (_p, x) => x.bestStreak >= 12,
  },
  {
    id: 'marathon', kid: 'Marathon', adult: 'Volume', emoji: '🏃',
    how: 'Answer one hundred questions.',
    earned: (p) => answered(p) >= 100,
  },
  {
    id: 'comeback', kid: 'Never Give Up', adult: 'Comeback', emoji: '💪',
    how: 'Pass a level you failed before.',
    earned: (p) => LEVEL_ORDER.some((id) => {
      const lp = levelProgress(p, id);
      return lp.completed && lp.attempts.length >= 2;
    }),
  },
  {
    id: 'boss', kid: 'Boss Beater', adult: 'Leak Slayer', emoji: '🗡️',
    how: 'Win a Boss Fight and clear a leak for good.',
    earned: (_p, x) => x.bossesCleared >= 1,
  },
  {
    id: 'party', kid: 'Party Star', adult: 'Party Animal', emoji: '🪩',
    how: 'Collect five hundred birthday points.',
    earned: (_p, x) => x.birthdayPoints >= 500,
  },
  {
    id: 'all-nine', kid: 'Grand Master', adult: 'The Full Nine', emoji: '👑',
    how: 'Pass every one of the nine levels.',
    earned: (p) => LEVEL_ORDER.every((id) => levelProgress(p, id).completed),
  },
];

export const badgeName = (b: BadgeDef, m: Mode = active): string => (m === 'kid' ? b.kid : b.adult);

/** Which badges are earned right now. Pure: derived, never stored as truth. */
export function earnedBadges(p: Progress, x: BadgeContext): string[] {
  return BADGES.filter((b) => b.earned(p, x)).map((b) => b.id);
}

/** Ones that just became true, so the UI can make a fuss about them. */
export function newlyEarned(before: string[], after: string[]): string[] {
  const had = new Set(before);
  return after.filter((id) => !had.has(id));
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const num = (key: string): number => {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
};

export const loadXp = (): number => num(XP_KEY);
export const saveXp = (n: number): void => {
  try { localStorage.setItem(XP_KEY, String(Math.max(0, Math.floor(n)))); } catch { /* ignore */ }
};

export const loadBestStreak = (): number => num(STREAK_KEY);
export const saveBestStreak = (n: number): void => {
  try { localStorage.setItem(STREAK_KEY, String(Math.max(0, Math.floor(n)))); } catch { /* ignore */ }
};

export const loadSeenBadges = (): string[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const v = JSON.parse(localStorage.getItem(BADGE_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export const saveSeenBadges = (ids: string[]): void => {
  try { localStorage.setItem(BADGE_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
};

// ---------------------------------------------------------------------------
// Praise
// ---------------------------------------------------------------------------

const KID_PRAISE = [
  'Brilliant!', 'Nailed it!', 'Superstar!', 'Yes! Perfect!', 'You genius!',
  'Spot on!', 'Amazing!', 'Too easy for you!', 'Champion move!',
];
const ADULT_PRAISE = ['Correct.', 'Right.', 'Good.', 'That is the one.', 'Clean.'];

const KID_MISS = [
  'So close! Look again.', 'Nearly! Here is the trick.', 'Good try — watch this.',
  'Not this time. You will get the next one.',
];
const ADULT_MISS = ['Wrong.', 'Not quite.', 'Miss.'];

/** Deterministic praise, so replaying a drill does not reshuffle the words. */
export function praise(correct: boolean, seed: number, m: Mode = active): string {
  const list = correct
    ? (m === 'kid' ? KID_PRAISE : ADULT_PRAISE)
    : (m === 'kid' ? KID_MISS : ADULT_MISS);
  return list[Math.abs(seed) % list.length]!;
}
