import { LevelId, LevelModule } from './types';
import { L0 } from './l0-rankings';
import { L1 } from './l1-outs';
import { L2 } from './l2-potodds';
import { L3 } from './l3-position';
import { L4 } from './l4-preflop';
import { L5 } from './l5-texture';
import { L6 } from './l6-sizing';
import { L7 } from './l7-valuebluff';
import { L8 } from './l8-fullhands';

export const LEVELS: LevelModule[] = [L0, L1, L2, L3, L4, L5, L6, L7, L8];

export const LEVELS_BY_ID = new Map<LevelId, LevelModule>(LEVELS.map((l) => [l.id, l]));

export function getLevel(id: LevelId): LevelModule | undefined {
  return LEVELS_BY_ID.get(id);
}

/** L8 is played as whole hands rather than stepped drills. */
export const isHandPlay = (id: LevelId): boolean => id === 'L8';
