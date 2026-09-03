/**
 * mistakes.ts — the error taxonomy and the spaced-repetition queue.
 *
 * Tags are assigned by the grading code from computed facts, never guessed.
 * Each tag records WHY it fires so the Dojo can explain the leak rather than
 * just name it.
 */

export type ErrorTag =
  // L0 — reading a showdown
  | 'misreads-hand-strength'
  | 'misreads-kickers'
  | 'misses-chops'
  | 'misses-board-plays'
  // L1 — outs and equity
  | 'overcounts-outs'
  | 'undercounts-outs'
  | 'counts-dirty-outs'
  | 'overestimates-equity'
  | 'underestimates-equity'
  // L2 — price
  | 'miscomputes-pot-odds'
  | 'calls-without-odds'
  | 'folds-with-odds'
  | 'overvalues-top-pair'
  | 'too-passive-with-draws'
  // later levels
  | 'ignores-position'
  | 'opens-too-loose'
  | 'opens-too-tight'
  | 'overplays-offsuit-aces'
  | 'too-tight-with-suited-connectors'
  | 'misreads-board-texture'
  | 'wrong-size-for-texture'
  | 'bluffs-into-calling-stations'
  | 'bets-with-no-value-and-no-fold-equity'
  | 'checks-back-value';

export interface TagInfo {
  id: ErrorTag;
  label: string;
  /** What you actually did. */
  description: string;
  /** The fix, in one line. */
  fix: string;
}

export const TAGS: Record<ErrorTag, TagInfo> = {
  'misreads-hand-strength': {
    id: 'misreads-hand-strength',
    label: 'Misreads hand strength',
    description: 'Picked the losing hand when the two hands were different categories.',
    fix: 'Name both hands out loud before choosing: "flush" beats "straight" beats "trips".',
  },
  'misreads-kickers': {
    id: 'misreads-kickers',
    label: 'Loses kicker battles',
    description: 'Both hands were the same category; the kicker decided it and you missed it.',
    fix: 'When the pair matches, read across: the fifth card is still a card.',
  },
  'misses-chops': {
    id: 'misses-chops',
    label: 'Misses chops',
    description: 'The pot was split and you called a winner.',
    fix: 'If neither hole card improves on the board, it is a chop.',
  },
  'misses-board-plays': {
    id: 'misses-board-plays',
    label: 'Misses when the board plays',
    description: 'The best five cards were all on the board and you read a hand into it.',
    fix: 'Ask "does my hole card beat the fifth board card?" If not, you play the board.',
  },
  'overcounts-outs': {
    id: 'overcounts-outs',
    label: 'Overcounts outs',
    description: 'Counted more outs than actually win the hand.',
    fix: 'An out has to win, not just improve you.',
  },
  'undercounts-outs': {
    id: 'undercounts-outs',
    label: 'Undercounts outs',
    description: 'Missed outs that do win the hand.',
    fix: 'Count overcards and backdoor-free wins too, not just the obvious draw.',
  },
  'counts-dirty-outs': {
    id: 'counts-dirty-outs',
    label: 'Counts dirty outs',
    description: 'Your number matched outs-plus-dirty-outs: you counted cards that pair you but also improve villain.',
    fix: 'Deal the card in your head and ask who wins after it lands.',
  },
  'overestimates-equity': {
    id: 'overestimates-equity',
    label: 'Overestimates equity',
    description: 'Guessed a higher equity than the simulation gives.',
    fix: 'The rule of 4 overshoots above 8 outs. Subtract the excess.',
  },
  'underestimates-equity': {
    id: 'underestimates-equity',
    label: 'Underestimates equity',
    description: 'Guessed a lower equity than the simulation gives.',
    fix: 'Count every way you win, including pairing up, not just the draw.',
  },
  'miscomputes-pot-odds': {
    id: 'miscomputes-pot-odds',
    label: 'Miscomputes pot odds',
    description: 'The required equity you entered was not call / (pot + call).',
    fix: 'Required equity = what you put in, over the pot after you put it in.',
  },
  'calls-without-odds': {
    id: 'calls-without-odds',
    label: 'Calls without the odds',
    description: 'Called when your equity was below the price.',
    fix: 'Compare two numbers before every call: the price, and your equity.',
  },
  'folds-with-odds': {
    id: 'folds-with-odds',
    label: 'Folds with the odds',
    description: 'Folded a call that was profitable on price alone.',
    fix: 'Cheap calls with real equity are how draws pay for themselves.',
  },
  'overvalues-top-pair': {
    id: 'overvalues-top-pair',
    label: 'Overvalues top pair',
    description: 'Put money in with one pair against a range that has you crushed.',
    fix: 'Top pair is a bluff catcher on the turn and river, not a value hand.',
  },
  'too-passive-with-draws': {
    id: 'too-passive-with-draws',
    label: 'Too passive with draws',
    description: 'Folded or checked a draw that had the equity to continue.',
    fix: 'A big draw is often the equity favourite. Price it, do not fear it.',
  },
  'ignores-position': {
    id: 'ignores-position',
    label: 'Ignores position',
    description: 'Played the same hand the same way regardless of seat.',
    fix: 'Acting last is worth real money. Widen on the button, tighten up front.',
  },
  'opens-too-loose': {
    id: 'opens-too-loose',
    label: 'Opens too loose',
    description: 'Opened hands outside the baseline range for that seat.',
    fix: 'Every extra hand you open from early position plays out of position all night.',
  },
  'opens-too-tight': {
    id: 'opens-too-tight',
    label: 'Opens too tight',
    description: 'Folded hands the baseline range opens from that seat.',
    fix: 'Late position steals are most of a winning player edge.',
  },
  'overplays-offsuit-aces': {
    id: 'overplays-offsuit-aces',
    label: 'Overplays offsuit aces',
    description: 'Played weak offsuit aces from seats that should fold them.',
    fix: 'A9o is dominated by everything that calls you. Suited aces are the playable ones.',
  },
  'too-tight-with-suited-connectors': {
    id: 'too-tight-with-suited-connectors',
    label: 'Too tight with suited connectors',
    description: 'Folded suited connectors the baseline range plays.',
    fix: 'They flop draws that pay off, which offsuit broadways do not.',
  },
  'misreads-board-texture': {
    id: 'misreads-board-texture',
    label: 'Misreads board texture',
    description: 'Classified the board against the computed equity split.',
    fix: 'Dry, disconnected, high boards favour the raiser. Wet middling boards favour the caller.',
  },
  'wrong-size-for-texture': {
    id: 'wrong-size-for-texture',
    label: 'Wrong size for the texture',
    description: 'Chose a bet size with lower EV than an available alternative.',
    fix: 'Small on dry boards, big on wet ones where you must charge draws.',
  },
  'bluffs-into-calling-stations': {
    id: 'bluffs-into-calling-stations',
    label: 'Bluffs into calling stations',
    description: 'Bluffed an opponent whose modelled fold frequency cannot make it profitable.',
    fix: 'You cannot bluff someone who does not fold. Value bet them instead.',
  },
  'bets-with-no-value-and-no-fold-equity': {
    id: 'bets-with-no-value-and-no-fold-equity',
    label: 'Bets with neither value nor fold equity',
    description: 'Bet a hand that worse hands do not call and better hands do not fold.',
    fix: 'If nobody worse calls and nobody better folds, checking is free.',
  },
  'checks-back-value': {
    id: 'checks-back-value',
    label: 'Checks back value',
    description: 'Checked a hand that beats enough of villain calling range to bet.',
    fix: 'Ask "would a worse hand call?" If yes, bet it.',
  },
};

// ---------------------------------------------------------------------------
// Spaced repetition
// ---------------------------------------------------------------------------

/** Drills to wait before a mistake resurfaces, in order. */
export const SR_INTERVALS = [1, 3, 10, 30] as const;

export interface MistakeRecord {
  id: string;
  tag: ErrorTag;
  levelId: string;
  drillSeed: string;
  firstSeenAt: number;
  lastSeenAt: number;
  /** Times this tag has been earned. */
  occurrences: number;
  /** Total EV surrendered across those occurrences, in big blinds. */
  evLostBB: number;
  /** Index into SR_INTERVALS. Graduates when it passes the last one. */
  stage: number;
  /** Global drill counter at which this becomes due again. */
  dueAtDrill: number;
  /** Consecutive clean repeats at the current and previous stages. */
  cleanReps: number;
  retired: boolean;
}

export function newMistake(
  tag: ErrorTag, levelId: string, drillSeed: string, now: number,
  drillCounter: number, evLostBB: number,
): MistakeRecord {
  return {
    id: `${tag}:${now}`,
    tag,
    levelId,
    drillSeed,
    firstSeenAt: now,
    lastSeenAt: now,
    occurrences: 1,
    evLostBB,
    stage: 0,
    dueAtDrill: drillCounter + SR_INTERVALS[0]!,
    cleanReps: 0,
    retired: false,
  };
}

/** A repeat failure resets the ladder to the first interval. */
export function recordFailure(
  m: MistakeRecord, now: number, drillCounter: number, evLostBB: number,
): MistakeRecord {
  return {
    ...m,
    lastSeenAt: now,
    occurrences: m.occurrences + 1,
    evLostBB: m.evLostBB + evLostBB,
    stage: 0,
    cleanReps: 0,
    dueAtDrill: drillCounter + SR_INTERVALS[0]!,
    retired: false,
  };
}

/** A clean repeat advances one interval; clearing the last one retires the tag. */
export function recordSuccess(m: MistakeRecord, drillCounter: number): MistakeRecord {
  const stage = m.stage + 1;
  const cleanReps = m.cleanReps + 1;
  if (stage >= SR_INTERVALS.length) {
    return { ...m, stage, cleanReps, retired: true, dueAtDrill: Infinity };
  }
  return {
    ...m,
    stage,
    cleanReps,
    dueAtDrill: drillCounter + SR_INTERVALS[stage]!,
    retired: false,
  };
}

export function isDue(m: MistakeRecord, drillCounter: number): boolean {
  return !m.retired && drillCounter >= m.dueAtDrill;
}
