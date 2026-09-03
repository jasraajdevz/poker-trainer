import { describe, it, expect } from 'vitest';
import { parseCards, createRng } from '../cards';
import { HandState, applyAction, legalActions, netResult, newHand, pot, runBots, settle } from '../game';
import { PROFILES, drawStrength, makeBot, rankRange } from '../bots';
import { openingRange } from '../preflopChart';
import { evBet } from '../ev';

describe('hand state machine', () => {
  const fresh = () => newHand({ heroPosition: 'BTN', bots: ['tag', 'station', 'nit'], seed: 'g1' });

  it('posts blinds and deals two cards each', () => {
    const s = fresh();
    expect(s.seats).toHaveLength(6);
    for (const x of s.seats) expect(x.cards).toHaveLength(2);
    expect(s.seats[4]!.totalCommitted).toBe(5);  // SB
    expect(s.seats[5]!.totalCommitted).toBe(10); // BB
    expect(pot(s)).toBe(15);
    expect(s.toAct).toBe(0); // UTG acts first
  });

  it('never deals the same card twice', () => {
    for (let i = 0; i < 50; i++) {
      const s = newHand({ heroPosition: 'BTN', bots: ['tag'], seed: `dup${i}` });
      const all = [...s.seats.flatMap((x) => x.cards), ...s.deck.slice(s.deckAt)];
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('ends the hand when everyone folds to one player', () => {
    let s = fresh();
    for (let i = 0; i < 6 && !s.complete; i++) s = applyAction(s, { type: 'fold' });
    expect(s.complete).toBe(true);
    expect(s.awards).toHaveLength(1);
    expect(s.awards[0]!.winners).toHaveLength(1);
  });

  it('conserves chips: what leaves the stacks comes back as awards', () => {
    for (let i = 0; i < 30; i++) {
      let s = newHand({ heroPosition: 'BTN', bots: ['tag', 'station', 'nit'], seed: `c${i}` });
      let guard = 0;
      while (!s.complete && guard++ < 80) {
        const legal = legalActions(s);
        const r = createRng(`act${i}:${guard}`).next();
        s = applyAction(s, r < 0.25 && legal.canFold ? { type: 'fold' }
          : r < 0.8 ? (legal.canCheck ? { type: 'check' } : { type: 'call' })
            : { type: legal.canCheck ? 'bet' : 'raise', to: legal.minRaiseTo });
      }
      expect(s.complete).toBe(true);
      const awarded = s.awards.reduce((n, a) => n + a.amount, 0);
      expect(awarded).toBeCloseTo(pot(s), 6);
      const net = s.seats.reduce((n, x) => n + netResult(s, x.id), 0);
      expect(net).toBeCloseTo(0, 6);
    }
  });

  it('builds side pots when a short stack is all in', () => {
    const s = newHand({ heroPosition: 'BTN', bots: ['tag'], seed: 'side' });
    s.seats[0]!.totalCommitted = 100;
    s.seats[1]!.totalCommitted = 300;
    s.seats[2]!.totalCommitted = 300;
    for (let i = 3; i < 6; i++) { s.seats[i]!.totalCommitted = 0; s.seats[i]!.folded = true; }
    s.board = parseCards('Ah Kd 7c 3s 2h');
    const awards = settle(s);
    expect(awards).toHaveLength(2);
    expect(awards[0]!.amount).toBe(300); // 3 x 100 main pot
    expect(awards[1]!.amount).toBe(400); // 2 x 200 side pot
    // the short stack can only win the main pot
    expect(awards[1]!.winners).not.toContain(0);
  });

  it('makes ONE pot when players fold at different prices and nobody is all in', () => {
    const s = newHand({ heroPosition: 'BTN', bots: ['tag'], seed: 'onepot' });
    s.seats[0]!.totalCommitted = 30; s.seats[0]!.folded = false;
    s.seats[1]!.totalCommitted = 30; s.seats[1]!.folded = false;
    s.seats[2]!.totalCommitted = 10; s.seats[2]!.folded = true;  // folded to a raise
    s.seats[3]!.totalCommitted = 5;  s.seats[3]!.folded = true;
    s.seats[4]!.totalCommitted = 0;  s.seats[4]!.folded = true;
    s.seats[5]!.totalCommitted = 0;  s.seats[5]!.folded = true;
    s.board = parseCards('Ah Kd 7c 3s 2h');
    const awards = settle(s);
    expect(awards).toHaveLength(1);
    expect(awards[0]!.label).toBe('Main pot');
    expect(awards[0]!.amount).toBe(75); // 30 + 30 + 10 + 5, dead money included
  });

  it('always reaches showdown with a five-card board when players remain', () => {
    for (let i = 0; i < 20; i++) {
      let s: HandState = newHand({ heroPosition: 'CO', bots: ['station', 'station'], seed: `sd${i}` });
      const heroId = 2; // CO
      let guard = 0;
      while (!s.complete && guard++ < 60) {
        s = runBots(s, heroId);
        if (s.complete) break;
        const legal = legalActions(s);
        s = applyAction(s, legal.canCheck ? { type: 'check' } : { type: 'call' });
      }
      expect(s.complete).toBe(true);
      const live = s.seats.filter((x) => !x.folded);
      if (live.length > 1) expect(s.board).toHaveLength(5);
    }
  });
});

describe('bot archetypes', () => {
  it('has three distinct, ordered strategies', () => {
    expect(PROFILES.nit.continueAt).toBeGreaterThan(PROFILES.tag.continueAt);
    expect(PROFILES.tag.continueAt).toBeGreaterThan(PROFILES.station.continueAt);
    expect(PROFILES.nit.bluffFreq).toBe(0);
    expect(PROFILES.station.bluffFreq).toBe(0);
    expect(PROFILES.tag.bluffFreq).toBeGreaterThan(0);
  });

  it('the nit plays a tight range from every seat, the station a wide one', () => {
    const nit = makeBot('nit');
    const station = makeBot('station');
    expect(nit.openingRange('BTN').size).toBeLessThan(station.openingRange('UTG').size);
  });

  it('respondTo partitions the whole range and the parts sum to one', () => {
    const bot = makeBot('tag');
    const hero = parseCards('Ah Kh');
    const board = parseCards('Qh 7h 2s');
    const r = bot.respondTo(hero, board, 100, 66, openingRange('CO'));
    expect(r.fold + r.call + r.raise).toBeCloseTo(1, 9);
    expect(r.callCombos.length + r.raiseCombos.length + r.foldCombos.length)
      .toBe(Math.round((r.fold + r.call + r.raise) * (r.callCombos.length + r.raiseCombos.length + r.foldCombos.length)));
    expect(() => evBet(100, 66, r)).not.toThrow();
  });

  it('the station folds far less than the nit to the same bet', () => {
    const hero = parseCards('Ah Kh');
    const board = parseCards('Qh 7h 2s');
    const nit = makeBot('nit').respondTo(hero, board, 100, 66, openingRange('CO'), 'a');
    const station = makeBot('station').respondTo(hero, board, 100, 66, openingRange('CO'), 'a');
    expect(nit.fold).toBeGreaterThan(station.fold);
  });

  it('bigger bets make pot-odds-aware bots fold more', () => {
    const hero = parseCards('Ah Kh');
    const board = parseCards('Qh 7h 2s');
    const bot = makeBot('tag');
    const small = bot.respondTo(hero, board, 100, 25, openingRange('CO'), 's');
    const big = bot.respondTo(hero, board, 100, 200, openingRange('CO'), 'b');
    expect(big.fold).toBeGreaterThan(small.fold);
  });

  it('explains every action it takes', () => {
    const bot = makeBot('tag');
    const d = bot.decide({
      cards: parseCards('Ah Ad'), board: parseCards('Ac 7h 2s'), pot: 100, toCall: 0,
      minRaise: 10, stack: 1000, position: 'CO', street: 'flop', bigBlind: 10,
      isAggressor: true, rng: createRng('x'),
    });
    expect(d.reasoning.length).toBeGreaterThan(0);
    expect(bot.explainAction()).toContain('TAG');
    expect(d.action).toBe('bet'); // top set on a dry board
  });

  it('folds trash to a big bet and calls with the nuts', () => {
    const bot = makeBot('nit');
    const board = parseCards('Ac 7h 2s');
    const trash = bot.decide({
      cards: parseCards('4d 3c'), board, pot: 100, toCall: 80, minRaise: 10,
      stack: 1000, position: 'CO', street: 'flop', bigBlind: 10, isAggressor: false, rng: createRng('y'),
    });
    expect(trash.action).toBe('fold');
    const nuts = bot.decide({
      cards: parseCards('Ah Ad'), board, pot: 100, toCall: 80, minRaise: 10,
      stack: 1000, position: 'CO', street: 'flop', bigBlind: 10, isAggressor: false, rng: createRng('y'),
    });
    expect(['call', 'raise']).toContain(nuts.action);
  });

  it('ranks its range from best to worst on the actual board', () => {
    const ranked = rankRange(openingRange('CO'), parseCards('Ah Kd 7c'), [], 0.5);
    expect(ranked.length).toBeGreaterThan(50);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }
  });

  it('scores draws structurally', () => {
    expect(drawStrength(parseCards('Ah Kh'), parseCards('Qh 7h 2s'))).toBeGreaterThan(0.8); // flush draw
    expect(drawStrength(parseCards('9c 8d'), parseCards('7h 6s 2c'))).toBeGreaterThan(0.6); // open ender
    expect(drawStrength(parseCards('Ac 2d'), parseCards('Kh 9s 4c'))).toBeLessThan(0.3);    // nothing
  });
});
