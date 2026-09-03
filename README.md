# Poker Trainer

No-Limit Hold'em, 6-max cash, 100bb. A coach, not a poker game.

```bash
npm install
npm run dev
```

No backend, no accounts, no API keys. Progress lives in `localStorage`.

```bash
npm test        # 233 tests
npm run build   # production bundle
```

## The rule

Every piece of feedback comes from a computation. If the app says calling is
correct, it ran the equity, compared the EV of each action, and shows you the
numbers. The only hardcoded poker knowledge is the Appendix A preflop chart in
`src/engine/preflopChart.ts`, and it is labelled as a simplified baseline
everywhere it is used.

The chart's quoted percentages do not match its own notation — up to 6.5 points
out. The app shows what the notation actually counts.

## Levels

| | | |
|---|---|---|
| **L0** | Hand rankings | Timed showdown reading, difficulty classified by how the evaluator separated the hands |
| **L1** | Outs and odds | Real outs vs dirty outs, both counted by dealing every unseen card |
| **L2** | Pot odds | The price against your equity versus a stated range |
| **L3** | Position | The same hand from six seats, with the EV of each |
| **L4** | Preflop ranges | Graded on the 13×13 grid, with a heat map of your leaks |
| **L5** | Board texture | Wet/dry measured by coverage; favour decided by range-vs-range equity |
| **L6** | Bet sizing | EV of every size against the opponent's real response function |
| **L7** | Value or bluff | Would a worse hand call? Both tests counted from their partitioned range |
| **L8** | Full hands | Six-max against the bots, coach mode then scored, full replay |

80% unlocks the next. Replays deal fresh drills.

## The Mistake Dojo

Every wrong answer is tagged. The Dojo ranks your leaks by the EV you actually
gave up, projects it to bb/100, and generates **new** spots that test the same
skill. Spaced repetition brings a mistake back after 1, 3, 10 and 30 drills; it
only leaves the queue after a clean answer at every interval.

## Upgraded mode

The gold button, top right. Without the code everything above still works and
every number is still real. With it: 250k-sample equity and exact enumeration up
to 3M leaves, the full leak leaderboard, Boss Fights, the Nemesis opponent that
reads your logged leaks, and the Lab.

## Keyboard

`F` fold · `C` check/call · `R` raise then `1`–`4` for sizing · `H` hint ·
`1`/`2`/`3` pick a choice · `Enter` submit · `Space` next · `Esc` back

## Layout

```
src/engine/     cards, evaluator, equity, ranges, odds, ev, bots, game
src/curriculum/ one file per level, drill generators and grading
src/coach/      grading support, error taxonomy, spaced repetition, dojo, progress, tier
src/ui/         views and components
```

`DECISIONS.md` records every judgement call made while building it.
