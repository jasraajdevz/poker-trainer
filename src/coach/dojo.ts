/**
 * dojo.ts — the leak leaderboard, targeted drill generation, spaced repetition.
 *
 * A leak's cost is measured, not assigned: it is the EV actually surrendered on
 * the drills that earned the tag, projected to a per-100-hands rate.
 */

import { Drill, LevelId } from '../curriculum/types';
import { getLevel } from '../curriculum/registry';
import { ErrorTag, MistakeRecord, SR_INTERVALS, TAGS, isDue } from './mistakes';
import { Progress } from './progress';

/** Which level can produce a fresh spot that tests this leak. */
export const TAG_LEVEL: Record<ErrorTag, LevelId> = {
  'misreads-hand-strength': 'L0', 'misreads-kickers': 'L0',
  'misses-chops': 'L0', 'misses-board-plays': 'L0',
  'overcounts-outs': 'L1', 'undercounts-outs': 'L1', 'counts-dirty-outs': 'L1',
  'overestimates-equity': 'L1', 'underestimates-equity': 'L1',
  'miscomputes-pot-odds': 'L2', 'calls-without-odds': 'L2', 'folds-with-odds': 'L2',
  'overvalues-top-pair': 'L2', 'too-passive-with-draws': 'L2',
  'ignores-position': 'L3', 'opens-too-loose': 'L4', 'opens-too-tight': 'L4',
  'overplays-offsuit-aces': 'L4', 'too-tight-with-suited-connectors': 'L4',
  'misreads-board-texture': 'L5',
  'wrong-size-for-texture': 'L6', 'bluffs-into-calling-stations': 'L6',
  'bets-with-no-value-and-no-fold-equity': 'L7', 'checks-back-value': 'L7',
};

export interface Leak {
  tag: ErrorTag;
  label: string;
  fix: string;
  level: LevelId;
  occurrences: number;
  evLostBB: number;
  /** Projected cost per 100 hands, from the EV actually given up. */
  bbPer100: number;
  stage: number;
  stageLabel: string;
  due: boolean;
  retired: boolean;
}

export function leakBoard(p: Progress): Leak[] {
  const answered = Math.max(1, p.history.length);
  return p.mistakes
    .map((m: MistakeRecord): Leak => ({
      tag: m.tag,
      label: TAGS[m.tag]?.label ?? m.tag,
      fix: TAGS[m.tag]?.fix ?? '',
      level: TAG_LEVEL[m.tag],
      occurrences: m.occurrences,
      evLostBB: m.evLostBB,
      bbPer100: (m.evLostBB / answered) * 100,
      stage: m.stage,
      stageLabel: m.retired
        ? 'cleared'
        : `${m.stage}/${SR_INTERVALS.length} — next check in ${Math.max(0, m.dueAtDrill - p.drillCounter)} drills`,
      due: isDue(m, p.drillCounter),
      retired: m.retired,
    }))
    .sort((a, b) => (b.bbPer100 - a.bbPer100) || (b.occurrences - a.occurrences));
}

export const activeLeaks = (p: Progress): Leak[] => leakBoard(p).filter((l) => !l.retired);

/** Mistakes whose spaced-repetition interval has come due. */
export const dueLeaks = (p: Progress): Leak[] => activeLeaks(p).filter((l) => l.due);

/**
 * A brand new drill that exercises the same skill — never a replay of the spot
 * you failed. The seed is fresh, so the cards are too.
 */
export function drillForTag(tag: ErrorTag, seed: string, index: number): Drill | null {
  const level = getLevel(TAG_LEVEL[tag]);
  if (!level) return null;
  return level.generate(index % level.drillCount, `dojo:${tag}:${seed}`);
}

/** A mixed session covering the top leaks, round-robin so it never drills one thing. */
export function dojoSession(p: Progress, seed: string, count = 10): Drill[] {
  const top = activeLeaks(p).slice(0, 3);
  if (top.length === 0) return [];
  const out: Drill[] = [];
  for (let i = 0; i < count; i++) {
    const leak = top[i % top.length]!;
    const d = drillForTag(leak.tag, `${seed}:${i}`, i);
    if (d) out.push(d);
  }
  return out;
}

/** Ten drills built entirely from one leak. Clear it by scoring 8 or better. */
export function bossFight(tag: ErrorTag, seed: string): Drill[] {
  const out: Drill[] = [];
  for (let i = 0; i < 10; i++) {
    const d = drillForTag(tag, `boss:${seed}:${i}`, i);
    if (d) out.push(d);
  }
  return out;
}

export const BOSS_PASS = 8;

/** Retire a tag outright — used when a Boss Fight is beaten. */
export function clearTag(p: Progress, tag: ErrorTag): Progress {
  return {
    ...p,
    mistakes: p.mistakes.map((m) =>
      m.tag === tag ? { ...m, retired: true, stage: SR_INTERVALS.length, dueAtDrill: Infinity } : m),
  };
}
