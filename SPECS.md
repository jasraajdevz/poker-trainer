# Poker Trainer — Full Specification

Live: **https://jasraajdevz.github.io/poker-trainer/** · Repo: `jasraajdevz/poker-trainer`
Stack: Vite + React 18 + TypeScript (strict) + Tailwind 3 · Tests: Vitest, 338 passing
No backend. No accounts. No API keys. Everything runs in the browser.

---

## 1. The one rule

**Every piece of feedback is a real computation.** If the app says "calling is
correct", it ran the equity simulation, priced the pot, computed the EV of each
action, and shows those numbers beside the verdict. The single exception is the
preflop opening chart (Appendix A in the brief), hardcoded in
`src/engine/preflopChart.ts` and labelled in the UI as a simplified learning
baseline — never as solver output.

## 2. Single player — yes, fully

The entire app is single-player. Every opponent is a bot with a real strategy
object (see §5), and every bot can explain each decision it made. Nothing ever
requires another human: friends are strictly optional, via share links and the
propagating leaderboard (§9). No matchmaking, no waiting, no server.

## 3. Platforms — use it everywhere

- **Any browser** at the URL above.
- **Installable app**: on a phone, "Add to Home Screen" installs it standalone
  (own icon, no browser chrome, fixed app-like screen). A service worker makes
  it **work fully offline** after the first visit; new deploys land the moment
  you are back online (shell is network-first, hashed assets cache-first).
- **Mobile-solid**: the felt is painted on a truly fixed layer (no iOS
  `background-attachment` smear), no horizontal scroll anywhere, no
  pull-to-refresh rubber-banding, no zoom-jump when focusing inputs, keyboard
  hints hidden on touch, safe-area insets respected, hover styles only on
  devices that can hover.
- **No time bounds.** Nothing in the app is ever timed against you. Speed is
  recorded silently (for the improvement trend and one badge) and a visible
  clock exists only as an opt-in setting, default off.

## 4. The engine (`src/engine/`)

| Module | What it does | Verified how |
|---|---|---|
| `cards.ts` | Cards as ints 0–51, parsing ("As"), seedable mulberry32 RNG, Fisher–Yates | round-trip + permutation tests |
| `evaluator.ts` | 5–7 card evaluator → packed 24-bit comparable value, category, tiebreakers, name, exact `best5` | 100k-hand differential vs an independent brute-force oracle; transitivity over 100k triples; 31 authored tricky cases (wheel, steel wheel, counterfeits, board-plays) |
| `equity.ts` | Hand vs hand / range / combos, multiway. Exact enumeration when ≤200k leaves (3M in Omega), else seeded Monte Carlo with reported ±95% margin | brute-force oracle agreement; MC within 4σ of exact; published matchups (AA v KK ≈ 82%) |
| `ranges.ts` | 169-class grid, PokerStove notation parser, combo counting with card removal, `rangeToPercent()` | round-trips 300 random ranges through canonical notation |
| `odds.ts` | Pot odds, MDF, exact hypergeometric outs→equity, rule of 2/4 + its error, implied odds, `analyzeOuts` (deals every unseen card; dirty outs fall out of arithmetic) | cross-checked against the equity engine on the turn |
| `ev.ts` | EV of fold/check/call/bet vs a villain response model; breakeven equity and fold frequency; `evLost` | algebraic identities tested |
| `bots.ts` | Archetypes as threshold profiles over real range-ranking; `respondTo()` partitions a range into fold/call/raise for a size and measures hero equity vs the callers | ordering + partition-sums tests |
| `game.ts` | Full 6-max hand state machine: blinds, streets, betting, all-ins, **side pots** (only where a live player is all-in short) | chip-conservation over random games |

Throughput: ~2M hand evaluations/sec, so 20k-iteration equity ≈ 20 ms — all
numbers are computed live, never precomputed.

## 5. The opponents

- **The Nit** — 12% range everywhere, bets only strong, folds to pressure, never bluffs.
- **The Station** — calls far too much, almost never raises, ignores pot odds by design.
- **The TAG** — positional ranges, c-bets good textures, bluffs ~28%, folds when beaten.
- **The Nemesis** (Omega) — reads your logged leak counts and shifts its own
  thresholds to attack them: more bluffs against a folder, bigger value bets
  against a caller.

Every bot exposes `explainAction()`; the post-hand review prints its actual
reasoning ("Pair of Nines is 35th percentile of my range here, under the 62nd
percentile this price demands. I fold.").

## 6. Modes: Kids and Adults

First screen asks who's playing; switchable any time in Settings. **Identical
engine and maths in both.** What changes:

| | Kids (8+) | Adults |
|---|---|---|
| Money words | none — stars, star pile, "add stars", "sit out" (test-enforced: no money/gambling/scolding vocabulary anywhere kid-visible, including all 24 mistake-tag names) | chips, pot, bet, fold, EV in bb |
| Pass mark | 60% | 80% |
| Marking | outs ±1, equity ±10 pts, price ±5 pts | exact outs, ±5, ±2 |
| Hints | on by default | off |
| Celebration | big — star bursts, loud praise | calm |
| Chip graphic | ⭐⭐⭐ | CSS casino chips |
| Level names | "Who wins?", "Counting cards", "Is it worth it?"… | L0–L8 titles |

## 7. Learning path

**Tutorial from zero** ("How poker works", also front-and-centre for brand-new
players): 7 short pages — the goal, the deal flow, the four actions, the hand
ladder, a real showdown, chances-vs-price — where even the example hand names
are produced by the live evaluator, not typed in.

**Quick play**: one tap from Home deals a real 6-max hand vs the bots, hints on,
nothing scored, endless.

**Nine levels** (replayable, fresh drills every run; each drill returns verdict
→ correct action → the proving numbers → one principle → the counterfactual
"you'd need X"):

| | Teaches | Graded against |
|---|---|---|
| L0 | Reading showdowns | the evaluator; difficulty tiers found by rejection-sampling, not scripted |
| L1 | Outs & equity | `analyzeOuts` + exact/MC equity; dirty outs named card by card |
| L2 | Pot odds | price vs equity against a visible, stated villain-range model |
| L3 | Position | walk-through EV of the same hand from all six seats |
| L4 | Preflop ranges | Appendix A chart + a personal heat-map grid of your leaks |
| L5 | Board texture | measured coverage of all 1326 hands + real range-vs-range equity split |
| L6 | Bet sizing | EV of 33/66/100/150% vs the bot's actual response partition |
| L7 | Value vs bluff | "would worse call / would better fold", counted from the partitioned range |
| L8 | Full hands | coached then scored 6-max sessions with full replay and EV-lost per decision |

**Mistake Dojo** ("Practice Zone" for kids): every wrong answer is tagged (24
tags), ranked by measured bb/100 cost (times-missed for kids), drilled with
*new* spots, spaced repetition at 1/3/10/30 drills, and Boss Fights (Omega)
that retire a leak for good.

**Progression**: XP (streak bonus capped), 7 ranks per mode (Card Cub→Card
Myth / Novice→Nemesis), 12 badges — all derived from real history, never
hand-granted.

## 8. Social (all optional, all serverless)

- **Share links**: your whole score packed into the URL fragment (~150 chars),
  checksum flags tampering, everything decoded is clamped/sanitised as hostile
  input. Opening one shows a head-to-head. Honestly labelled "a boast, not a receipt".
- **Leaderboard**: propagates — opening links files players into your roster; a
  board link carries everyone (≤12) so a group converges. Provisional under 20
  drills. Sortable by levels/accuracy/bb-100/volume/speed/birthday points.
- **Birthday mode**: admin-only party button; disco visuals, an original
  synthesised 130 BPM surf-rock instrumental (Web Audio, no files), birthday
  points, Disco Monarch titles; parties schedule to a window and start/end by
  themselves; the party rides in links, the owner code never does.

## 9. Owner tier (code `OMEGA-777`, stored only as a hash; not in the repo)

Omega: 10× simulation precision + exact enumeration to 3M leaves, full leak
board + Boss Fights + JSON export, the Nemesis bot, the Lab (any hand/range/
board on demand), per-node alternative sizings in reviews, **Admin mode**
(edit any leaderboard row, Make me #1 that stays plausible, invent rivals,
bestow titles, party controls). Deactivating the code kills admin with it.

## 10. Settings (the ⚙, everywhere)

Kids/Adults · name · table felt ×4 (recolours everything live, stamped on
`<html>` pre-paint — no flash) · four-colour or classic deck · Full sparkle /
Calm (Calm = same features, zero movement; mirrors `prefers-reduced-motion`) ·
Timer shown/hidden (default hidden) · Sounds · full reset (wipes progress, XP,
streak, badges, points — exactly what it promises).

## 11. Media inventory

**Zero raster images, zero audio/video files.** Cards, felt, light, chips,
confetti: CSS + typography. Music and sounds: synthesised Web Audio. The only
binary-ish asset is one hand-written `icon.svg` for the home-screen install.
Full emoji list lives in README. Family-friendly by construction, enforced by
tests where it matters (kid vocabulary, kid praise, kid tag names).

## 12. Storage (all local, all wipeable)

`poker-trainer:` progress:v1 · xp · streak · badges · name · mode · settings ·
tier · admin · override · roster · party · bp · party-seen · sfx.

## 13. Honesty guarantees

- Sampled numbers show their ±95% margin; exact ones say "exact, N runouts".
- Models are stated on screen (villain ranges, BB≈BTN stand-in, one-decision EV).
- The chart's quoted percentages disagree with its own notation; the app shows
  the computed truth alongside the quote.
- Share/board links can be forged; the UI says so instead of pretending.
- The tutorial asks the evaluator for its own examples.
