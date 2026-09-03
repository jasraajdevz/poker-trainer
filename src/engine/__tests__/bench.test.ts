import { it, expect } from 'vitest';
import { makeDeck, shuffle, createRng } from '../cards';
import { evaluate } from '../evaluator';

it('evaluates fast enough for Monte Carlo', () => {
  const rng = createRng('bench');
  const deck = shuffle(makeDeck(), rng);
  const hands: number[][] = [];
  for (let i = 0; i < 1000; i++) { shuffle(deck, rng); hands.push(deck.slice(0, 7)); }
  const t0 = performance.now();
  const N = 500_000;
  let acc = 0;
  for (let i = 0; i < N; i++) acc += evaluate(hands[i % 1000]!).value;
  const ms = performance.now() - t0;
  console.log(`\n  evaluator: ${(N / ms / 1000).toFixed(2)}M hands/sec  (${ms.toFixed(0)}ms for ${N})`);
  expect(acc).toBeGreaterThan(0);
  expect(N / ms).toBeGreaterThan(500); // >500k/sec floor
});
