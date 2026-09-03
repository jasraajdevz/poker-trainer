/**
 * L8 — full 6-max hands against the bots. Handled by its own view, since a hand
 * is not a drill with steps; the module exists so it appears in the curriculum.
 */

import { LevelModule } from './types';

export const L8: LevelModule = {
  id: 'L8', title: 'Full hands', subtitle: 'Six-max against the bots', drillCount: 10,
  lesson: {
    body: [
      'Everything you have drilled so far shows up here at once, in the order it actually happens.',
      'You sit at a six-handed table with 100 big blinds against the three archetypes: a nit who only bets strong hands, a station who never folds, and a tight-aggressive regular who c-bets good boards and gives up on bad ones.',
      'For the first few hands the coach is on. A hint button shows your equity and the price you are being offered, computed live. Use it.',
      'Then it turns off and the rest are scored. After every hand you get the full replay with all the cards face up, what each decision cost you in big blinds, and the reason the bot gives for its own play.',
    ],
    terms: [
      { term: 'C-bet', definition: 'A bet made by the player who raised before the flop.' },
      { term: 'Coach mode', definition: 'Live equity and pot odds while you decide, off for scored hands.' },
    ],
  },
  generate: () => { throw new Error('L8 uses the hand-play view'); },
};

export const L8_COACHED_HANDS = 4;
