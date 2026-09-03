/**
 * game.ts — a real 6-max hand: blinds, streets, betting rounds, side pots.
 */

import { Card, Rng, createRng, makeDeck, shuffle } from './cards';
import { evaluate } from './evaluator';
import { Position } from './preflopChart';
import { ArchetypeId, Bot, BotDecision, Street, makeBot } from './bots';

export const SEAT_ORDER: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

export interface Seat {
  id: number;
  name: string;
  position: Position;
  stack: number;
  cards: Card[];
  folded: boolean;
  allIn: boolean;
  streetCommitted: number;
  totalCommitted: number;
  isHero: boolean;
  botId?: ArchetypeId;
}

export type PlayerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; to: number }
  | { type: 'raise'; to: number };

export interface ActionRecord {
  seatId: number;
  name: string;
  street: Street;
  action: PlayerAction['type'];
  amount: number;
  potBefore: number;
  toCallBefore: number;
  /** Bot reasoning, captured at the moment it acted. */
  reasoning?: string[];
  numbers?: Record<string, string>;
  boardAtTime: Card[];
  cards: Card[];
}

export interface PotAward { amount: number; winners: number[]; label: string; }

export interface HandState {
  seats: Seat[];
  board: Card[];
  deck: Card[];
  deckAt: number;
  street: Street;
  currentBet: number;
  minRaise: number;
  toAct: number;
  aggressor: number;
  acted: Set<number>;
  history: ActionRecord[];
  complete: boolean;
  awards: PotAward[];
  bigBlind: number;
  rng: Rng;
  bots: Map<number, Bot>;
}

export const pot = (s: HandState): number =>
  s.seats.reduce((n, x) => n + x.totalCommitted, 0);

export const liveSeats = (s: HandState): Seat[] => s.seats.filter((x) => !x.folded);
const actionable = (s: HandState): Seat[] => s.seats.filter((x) => !x.folded && !x.allIn);

export interface NewHandConfig {
  heroPosition: Position;
  bots: ArchetypeId[];
  bigBlind?: number;
  stackBB?: number;
  seed: string;
}

export function newHand(cfg: NewHandConfig): HandState {
  const bb = cfg.bigBlind ?? 10;
  const stack = (cfg.stackBB ?? 100) * bb;
  const rng = createRng(cfg.seed);
  const deck = shuffle(makeDeck(), rng);
  const bots = new Map<number, Bot>();

  let botIdx = 0;
  const seats: Seat[] = SEAT_ORDER.map((position, id) => {
    const isHero = position === cfg.heroPosition;
    const botId = isHero ? undefined : cfg.bots[botIdx++ % cfg.bots.length]!;
    if (botId) bots.set(id, makeBot(botId));
    return {
      id, position, isHero, botId,
      name: isHero ? 'You' : `${bots.get(id)!.name} (${position})`,
      stack, cards: [], folded: false, allIn: false,
      streetCommitted: 0, totalCommitted: 0,
    };
  });

  let at = 0;
  for (const s of seats) { s.cards = [deck[at]!, deck[at + 1]!]; at += 2; }

  const state: HandState = {
    seats, board: [], deck, deckAt: at, street: 'preflop',
    currentBet: bb, minRaise: bb, toAct: 0, aggressor: 5,
    acted: new Set(), history: [], complete: false, awards: [],
    bigBlind: bb, rng, bots,
  };

  post(state, 4, bb / 2);
  post(state, 5, bb);
  state.toAct = 0; // UTG acts first preflop
  return state;
}

function post(s: HandState, id: number, amount: number): void {
  const seat = s.seats[id]!;
  const put = Math.min(seat.stack, amount);
  seat.stack -= put;
  seat.streetCommitted += put;
  seat.totalCommitted += put;
  if (seat.stack === 0) seat.allIn = true;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxTo: number;
}

export function legalActions(s: HandState): LegalActions {
  const seat = s.seats[s.toAct]!;
  const callAmount = Math.min(seat.stack, s.currentBet - seat.streetCommitted);
  const maxTo = seat.streetCommitted + seat.stack;
  const minRaiseTo = Math.min(maxTo, s.currentBet + s.minRaise);
  return {
    canFold: callAmount > 0,
    canCheck: callAmount === 0,
    callAmount,
    canRaise: maxTo > s.currentBet,
    minRaiseTo,
    maxTo,
  };
}

/** Apply one action for the seat currently to act. Advances play. */
export function applyAction(s: HandState, action: PlayerAction, meta?: Partial<ActionRecord>): HandState {
  const seat = s.seats[s.toAct]!;
  const legal = legalActions(s);
  const potBefore = pot(s);
  let amount = 0;

  switch (action.type) {
    case 'fold':
      seat.folded = true;
      break;
    case 'check':
      if (!legal.canCheck) throw new Error('cannot check facing a bet');
      break;
    case 'call':
      amount = legal.callAmount;
      post(s, seat.id, amount);
      break;
    case 'bet':
    case 'raise': {
      const to = Math.max(action.to, legal.minRaiseTo);
      const capped = Math.min(to, legal.maxTo);
      amount = capped - seat.streetCommitted;
      post(s, seat.id, amount);
      if (capped > s.currentBet) {
        s.minRaise = Math.max(s.minRaise, capped - s.currentBet);
        s.currentBet = capped;
        s.aggressor = seat.id;
        s.acted = new Set();
      }
      break;
    }
  }

  s.history.push({
    seatId: seat.id, name: seat.name, street: s.street, action: action.type,
    amount, potBefore, toCallBefore: legal.callAmount,
    boardAtTime: [...s.board], cards: [...seat.cards],
    reasoning: meta?.reasoning, numbers: meta?.numbers,
  });
  s.acted.add(seat.id);

  if (liveSeats(s).length <= 1) return finish(s);
  if (roundComplete(s)) return nextStreet(s);
  s.toAct = nextToAct(s, seat.id);
  return s;
}

function roundComplete(s: HandState): boolean {
  const live = actionable(s);
  if (live.length === 0) return true;
  if (live.length === 1 && liveSeats(s).length === 1) return true;
  return live.every((x) => s.acted.has(x.id) && x.streetCommitted === s.currentBet);
}

function order(s: HandState): number[] {
  return s.street === 'preflop' ? [0, 1, 2, 3, 4, 5] : [4, 5, 0, 1, 2, 3];
}

function nextToAct(s: HandState, from: number): number {
  const seq = order(s);
  const i = seq.indexOf(from);
  for (let k = 1; k <= seq.length; k++) {
    const id = seq[(i + k) % seq.length]!;
    const seat = s.seats[id]!;
    if (!seat.folded && !seat.allIn) return id;
  }
  return from;
}

function nextStreet(s: HandState): HandState {
  for (const x of s.seats) x.streetCommitted = 0;
  s.currentBet = 0;
  s.minRaise = s.bigBlind;
  s.acted = new Set();

  const next: Record<Street, Street | null> = {
    preflop: 'flop', flop: 'turn', turn: 'river', river: null,
  };
  const n = next[s.street];
  if (n === null) return finish(s);
  s.street = n;
  const draw = n === 'flop' ? 3 : 1;
  for (let i = 0; i < draw; i++) s.board.push(s.deck[s.deckAt++]!);

  if (actionable(s).length <= 1) return nextStreet(s); // everyone all in: run it out
  const seq = order(s);
  for (const id of seq) {
    const seat = s.seats[id]!;
    if (!seat.folded && !seat.allIn) { s.toAct = id; break; }
  }
  return s;
}

/** Side pots: split by commitment level, award each to the best eligible hand. */
export function settle(s: HandState): PotAward[] {
  // Levels come from the players still in the hand: a side pot exists only when
  // a live player is all in for less than the others. Chips from folded players
  // simply fall into whichever pot their commitment reaches.
  const live = s.seats.filter((x) => !x.folded && x.totalCommitted > 0);
  const levels = [...new Set(live.map((x) => x.totalCommitted))].sort((a, b) => a - b);
  const awards: PotAward[] = [];
  let previous = 0;

  for (const level of levels) {
    let amount = 0;
    for (const x of s.seats) amount += Math.max(0, Math.min(x.totalCommitted, level) - previous);
    if (amount === 0) { previous = level; continue; }
    const eligible = s.seats.filter((x) => !x.folded && x.totalCommitted >= level);
    if (eligible.length === 0) { previous = level; continue; }
    let best = -1;
    let winners: number[] = [];
    for (const x of eligible) {
      const v = s.board.length === 5 ? evaluate([...x.cards, ...s.board]).value : 0;
      if (v > best) { best = v; winners = [x.id]; }
      else if (v === best) winners.push(x.id);
    }
    awards.push({
      amount, winners,
      label: awards.length === 0 ? 'Main pot' : `Side pot ${awards.length}`,
    });
    previous = level;
  }
  return awards;
}

function finish(s: HandState): HandState {
  // Run out any remaining board so showdown is well defined.
  while (s.board.length < 5 && liveSeats(s).length > 1) s.board.push(s.deck[s.deckAt++]!);
  const live = liveSeats(s);
  if (live.length === 1) {
    s.awards = [{ amount: pot(s), winners: [live[0]!.id], label: 'Main pot' }];
  } else {
    s.awards = settle(s);
  }
  for (const a of s.awards) {
    const share = a.amount / a.winners.length;
    for (const w of a.winners) s.seats[w]!.stack += share;
  }
  s.complete = true;
  return s;
}

/** Net chips won or lost this hand, per seat. */
export function netResult(s: HandState, seatId: number): number {
  const seat = s.seats[seatId]!;
  const won = s.awards
    .filter((a) => a.winners.includes(seatId))
    .reduce((n, a) => n + a.amount / a.winners.length, 0);
  return won - seat.totalCommitted;
}

/** Let bots act until it is hero's turn, or the hand ends. */
export function runBots(s: HandState, heroSeat: number): HandState {
  let guard = 0;
  while (!s.complete && s.toAct !== heroSeat && guard++ < 200) {
    const seat = s.seats[s.toAct]!;
    const bot = s.bots.get(seat.id);
    if (!bot) break;
    const legal = legalActions(s);
    const d: BotDecision = bot.decide({
      cards: seat.cards, board: s.board, pot: pot(s), toCall: legal.callAmount,
      minRaise: s.minRaise, stack: seat.stack, position: seat.position,
      street: s.street, bigBlind: s.bigBlind, isAggressor: s.aggressor === seat.id,
      rng: s.rng,
    });
    const act: PlayerAction =
      d.action === 'fold' ? { type: 'fold' }
        : d.action === 'check' ? (legal.canCheck ? { type: 'check' } : { type: 'fold' })
          : d.action === 'call' ? (legal.canCheck ? { type: 'check' } : { type: 'call' })
            : { type: legal.canCheck ? 'bet' : 'raise', to: Math.max(legal.minRaiseTo, seat.streetCommitted + d.size) };
    s = applyAction(s, act, { reasoning: d.reasoning, numbers: d.numbers });
  }
  if (!s.complete && liveSeats(s).length <= 1) s = finish(s);
  return s;
}
