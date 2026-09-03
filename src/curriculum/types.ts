/**
 * types.ts — the drill contract every level implements.
 *
 * A level generates Drills. A Drill carries a Scene (what you see), a list of
 * Steps (what you answer) and a grade() built from real computation. Nothing in
 * a DrillFeedback may be a canned string except `principle`, which states the
 * lesson; every claim about this specific spot comes from `proof`.
 */

import { Card } from '../engine/cards';
import { Position } from '../engine/preflopChart';
import { ErrorTag } from '../coach/mistakes';

export type LevelId = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8';

/** What the table looks like for this drill. */
export interface Scene {
  /** Two or more labelled hands, used by L0's showdown reading. */
  hands?: Array<{ label: string; cards: Card[]; hint?: string }>;
  heroCards?: Card[];
  villainCards?: Card[];
  villainLabel?: string;
  villainRangeText?: string;
  board?: Card[];
  potChips?: number;
  betChips?: number;
  bigBlind?: number;
  heroPosition?: Position;
  villainPosition?: Position;
  /** One line of table talk setting the spot up. */
  caption?: string;
  street?: 'preflop' | 'flop' | 'turn' | 'river';
}

export interface ChoiceOption {
  key: string;
  label: string;
  sublabel?: string;
  hotkey: string;
}

export type DrillStep =
  | { kind: 'choice'; id: string; question: string; options: ChoiceOption[] }
  | {
      kind: 'number';
      id: string;
      question: string;
      unit: string;
      min: number;
      max: number;
      /** Answers within this absolute distance count as correct. */
      tolerance: number;
      hint?: string;
    };

export type DrillAnswers = Record<string, string | number>;

/** A single computed line in the coach panel. */
export interface ProofLine {
  label: string;
  value: string;
  note?: string;
  /** Highlighted as the number that settles the decision. */
  key?: boolean;
  tone?: 'good' | 'bad' | 'neutral';
}

export interface StepVerdict {
  stepId: string;
  correct: boolean;
  given: string;
  expected: string;
  detail?: string;
}

export interface DrillFeedback {
  correct: boolean;
  verdicts: StepVerdict[];
  /** "Call" / "Fold" / "Left hand wins" — the answer, stated plainly. */
  correctAction: string;
  /** The computed numbers that prove it. */
  proof: ProofLine[];
  /** One sentence of principle. This is the only permitted canned text. */
  principle: string;
  /** "You'd need 34% to call; you have 28%." */
  counterfactual: string;
  errorTags: ErrorTag[];
  /** EV given up by the chosen line, in big blinds. Zero where EV is undefined. */
  evLostBB: number;
  /** Level-specific data kept in history, e.g. which grid cell L4 asked about. */
  meta?: Record<string, string | number>;
}

export interface Drill {
  id: string;
  levelId: LevelId;
  index: number;
  seed: string;
  scene: Scene;
  steps: DrillStep[];
  /** Facts you are entitled to know before answering. */
  facts: ProofLine[];
  grade: (answers: DrillAnswers) => DrillFeedback;
}

export interface Lesson {
  /** Plain English, under 200 words total. */
  body: string[];
  terms?: Array<{ term: string; definition: string }>;
}

export interface LevelModule {
  id: LevelId;
  title: string;
  subtitle: string;
  lesson: Lesson;
  drillCount: number;
  /** Deterministic: same (index, seed) always yields the same drill.
   *  `iterations` raises simulation precision in upgraded mode. */
  generate: (index: number, seed: string, iterations?: number) => Drill;
  /** L0 grades on speed as well as accuracy. */
  tracksTime?: boolean;
}

export const PASS_MARK = 0.8;
