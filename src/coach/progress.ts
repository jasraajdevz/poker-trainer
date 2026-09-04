/**
 * progress.ts — everything the app remembers, persisted to localStorage.
 */

import { LevelId, PASS_MARK } from '../curriculum/types';
import { ErrorTag, MistakeRecord, newMistake, recordFailure, recordSuccess } from './mistakes';

const KEY = 'poker-trainer:progress:v1';

export interface DrillResult {
  drillId: string;
  levelId: LevelId;
  index: number;
  seed: string;
  correct: boolean;
  elapsedMs: number;
  tags: ErrorTag[];
  evLostBB: number;
  at: number;
  meta?: Record<string, string | number>;
}

export interface LevelAttempt {
  startedAt: number;
  finishedAt?: number;
  results: DrillResult[];
}

export interface LevelProgress {
  unlocked: boolean;
  attempts: LevelAttempt[];
  bestAccuracy: number;
  completed: boolean;
}

export interface Progress {
  version: 1;
  /** Total drills answered, ever. Drives the spaced-repetition schedule. */
  drillCounter: number;
  levels: Partial<Record<LevelId, LevelProgress>>;
  mistakes: MistakeRecord[];
  /** Median response time per level attempt, for the L0 speed trend. */
  history: DrillResult[];
}

export const LEVEL_ORDER: LevelId[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'];

export function emptyProgress(): Progress {
  return {
    version: 1,
    drillCounter: 0,
    levels: { L0: { unlocked: true, attempts: [], bestAccuracy: 0, completed: false } },
    mistakes: [],
    history: [],
  };
}

export function loadProgress(): Progress {
  if (typeof localStorage === 'undefined') return emptyProgress();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    const p = JSON.parse(raw) as Progress;
    if (p.version !== 1) return emptyProgress();
    return { ...emptyProgress(), ...p };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* quota or private mode: progress is a convenience, not a requirement */
  }
}

export function levelProgress(p: Progress, id: LevelId): LevelProgress {
  return p.levels[id] ?? { unlocked: false, attempts: [], bestAccuracy: 0, completed: false };
}

export function isUnlocked(p: Progress, id: LevelId): boolean {
  if (id === 'L0') return true;
  const prev = LEVEL_ORDER[LEVEL_ORDER.indexOf(id) - 1]!;
  return levelProgress(p, prev).completed;
}

/** Fold one answered drill into progress: history, accuracy, unlocks, mistakes. */
export function applyResult(p: Progress, r: DrillResult): Progress {
  const next: Progress = {
    ...p,
    drillCounter: p.drillCounter + 1,
    history: [...p.history, r].slice(-2000),
    levels: { ...p.levels },
    mistakes: [...p.mistakes],
  };
  const counter = next.drillCounter;

  const lp = levelProgress(next, r.levelId);
  const attempts = [...lp.attempts];
  if (attempts.length === 0) attempts.push({ startedAt: r.at, results: [] });
  const cur = { ...attempts[attempts.length - 1]!, results: [...attempts[attempts.length - 1]!.results, r] };
  attempts[attempts.length - 1] = cur;
  const accuracy = cur.results.filter((x) => x.correct).length / cur.results.length;
  next.levels[r.levelId] = {
    ...lp,
    unlocked: true,
    attempts,
    bestAccuracy: Math.max(lp.bestAccuracy, accuracy),
  };

  // Mistakes: a failure creates or refreshes a record; a clean answer advances
  // any due record carrying a tag this drill could have caught.
  for (const tag of r.tags) {
    const i = next.mistakes.findIndex((m) => m.tag === tag);
    if (i >= 0) next.mistakes[i] = recordFailure(next.mistakes[i]!, r.at, counter, r.evLostBB);
    else next.mistakes.push(newMistake(tag, r.levelId, r.seed, r.at, counter, r.evLostBB));
  }
  if (r.correct) {
    next.mistakes = next.mistakes.map((m) =>
      !m.retired && m.levelId === r.levelId && counter >= m.dueAtDrill
        ? recordSuccess(m, counter)
        : m,
    );
  }
  return next;
}

/** Close out a level run and unlock the next one if the pass mark was met. */
export function finishAttempt(
  p: Progress, id: LevelId, drillCount: number, passMark: number = PASS_MARK,
): Progress {
  const next: Progress = { ...p, levels: { ...p.levels } };
  const lp = levelProgress(next, id);
  const attempts = [...lp.attempts];
  const cur = attempts[attempts.length - 1];
  if (!cur) return next;
  attempts[attempts.length - 1] = { ...cur, finishedAt: Date.now() };
  const accuracy = cur.results.length ? cur.results.filter((r) => r.correct).length / drillCount : 0;
  const completed = lp.completed || accuracy >= passMark;
  next.levels[id] = { ...lp, attempts, bestAccuracy: Math.max(lp.bestAccuracy, accuracy), completed };
  if (completed) {
    const nextId = LEVEL_ORDER[LEVEL_ORDER.indexOf(id) + 1];
    if (nextId) {
      next.levels[nextId] = levelProgress(next, nextId).unlocked
        ? next.levels[nextId]!
        : { unlocked: true, attempts: [], bestAccuracy: 0, completed: false };
    }
  }
  return next;
}

export function startAttempt(p: Progress, id: LevelId): Progress {
  const lp = levelProgress(p, id);
  return {
    ...p,
    levels: {
      ...p.levels,
      [id]: { ...lp, unlocked: true, attempts: [...lp.attempts, { startedAt: Date.now(), results: [] }] },
    },
  };
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Median response time per completed attempt of a level, oldest first. */
export function timeTrend(p: Progress, id: LevelId): number[] {
  return levelProgress(p, id)
    .attempts.filter((a) => a.results.length > 0)
    .map((a) => median(a.results.map((r) => r.elapsedMs)));
}
