# Poker Trainer

No-Limit Hold'em, 6-max cash, 100bb. A coach, not a poker game.

**Play it: https://jasraajdevz.github.io/poker-trainer/**

```bash
npm install
npm run dev
```

No backend, no accounts, no API keys. Progress lives in `localStorage`.

```bash
npm test        # 282 tests
npm run build   # production bundle
npm run deploy  # publish to GitHub Pages
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

## Share links

**Share score** on the home screen, or **Share this run** on any level summary.
The whole score is packed into the URL fragment — name, accuracy, levels passed,
EV given up, median read time, worst leak — so it works with no account, no
server, and no data leaving the browser. Links come out around 150 characters.

Open someone's link and you get a head-to-head: their card beside yours, a
line-by-line comparison, and their worst leak named.

A checksum rides along and the app warns you when a link has been edited. That
catches mangling in transit and casual fiddling — it is **not** proof. A share
link is a boast, not a receipt.

## Leaderboard

There is no server, so the board propagates instead of syncing. Opening
someone's share link files their score into your roster. **Copy a link with all
N** hands over everyone you know about in one URL. Pass that around a group and
everybody converges on the same table.

Sortable by levels passed, accuracy, bb/100, drills answered or median read
time. Your own row is always live from your real progress, never a stale
snapshot that arrived inside someone else's link.

Be clear about what it is: a snapshot of the links you have been sent, not a
live ranking. Someone who has not shared since Tuesday still shows Tuesday.
Entries under 20 drills sit below the ranked ones — a perfect three out of three
is not a season. Edited links get flagged, but nothing here is verified.

## Upgraded mode

The gold button, top right. The code is not in this repository — the test that
asserts it lives in a gitignored file, so the source shows the mechanism without
handing over the key. It is an FNV-1a hash comparison, which is obfuscation
rather than security: a short code is brute-forceable by anyone determined.

Without the code everything above still works and every number is still real. With it: 250k-sample equity and exact enumeration up
to 3M leaves, the full leak leaderboard, Boss Fights, the Nemesis opponent that
reads your logged leaks, and the Lab.

### Admin mode

Toggle inside the Omega panel. Every leaderboard row becomes editable, plus a
**Make me #1** button that edges past whoever is currently leading on each
measure rather than maxing out, because 7/9 and 86% is far more convincing than
a flawless run.

Your own edit is stored as an override and rides along in every link you share
afterwards. Your row shows an **edited** badge — locally, to you only, so you
remember which numbers are real. Turning off the code turns off admin with it.

This is not a new power. A score has always lived in the URL fragment in plain
sight and anyone with a console can rewrite one, which is exactly why the app
has always told recipients that a link is a boast, not a receipt. Admin mode is
the comfortable version of a thing the format never protected against.

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
