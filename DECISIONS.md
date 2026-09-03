# DECISIONS.md

Calls made without asking, so the build could keep moving. Each one is cheap to
reverse; say the word on any of them.

## Project

1. **Location: `~/Downloads/poker-trainer`.** Sibling to your other projects, not
   nested inside `kablock-source`.
2. **Tailwind v3, not v4.** v4 changes the config/PostCSS story; v3 is the boring
   choice and every snippet on the internet still applies.
3. **Vitest config lives in `vite.config.ts`** rather than a second config file.
4. **No router.** The app is a single page with view state in React. Nothing
   about a trainer needs URLs, and it keeps `localStorage` restore trivial.

## Engine

5. **`Card` is an integer 0..51**, encoded `(rank-2)*4 + suit`. Monte Carlo runs
   millions of evaluations; an object-per-card representation allocates in the
   hot loop. Human-facing strings are produced only at the edges.
6. **Hand strength is a single packed 24-bit integer**
   (`category<<20 | t1<<16 | ... | t5`). Comparison is one `<`. Equality means a
   real chop, which is what side-pot and equity code needs.
7. **Suits are ordered `c d h s`** and the UI uses a **four-colour deck**
   (clubs green, diamonds blue, hearts red, spades white). You asked for
   readability over prettiness, and four colours removes the single most common
   misread at a glance.
8. **`evaluate()` accepts 5, 6 or 7 cards.** Useful for showing "your hand right
   now" on the flop without padding the board.
9. **The evaluator returns `best5`** (the exact five cards that play). The UI
   highlights them, and it makes "the board plays" visible rather than asserted.
10. **The test oracle is a second, independent evaluator**
    (`__tests__/referenceEvaluator.ts`): brute force over all 21 five-card
    subsets, naive array logic, no shared helpers, no bitmasks. Differential
    testing against a copy of the same algorithm proves nothing, so it is
    deliberately written in a different style.
11. **RNG is mulberry32, seeded by string.** Every drill stores its seed, so a
    drill you failed can be reproduced exactly, and so the Dojo can re-deal a
    spot without storing all 7 cards.

## Equity, ranges, odds, EV (checkpoint 2)

12. **Ranges are unweighted sets of the 169 classes.** Weighted ranges ("call
    QQ 60% of the time") are the honest next step, but they complicate every
    downstream number and buy nothing at beginner level. Noted as a limit.
13. **Range notation uses kicker-increment `+` semantics** — `ATs+` is
    ATs/AJs/AQs/AKs, and `T9s+` is just T9s. This is what Appendix A's own
    notation requires: it spells out `JTs, T9s, 98s` separately rather than
    writing `98s+`, which only makes sense under these semantics.
14. **`rangeToPercent()` reports the computed figure, not the quoted one.**
    Appendix A's stated percentages are approximations and drift from the
    notation by up to 6.5 points (SB: quoted 38%, actually 31.5%). Since the
    stated purpose is to teach you what "opening 26%" *feels* like, showing the
    quoted number would be teaching a wrong feel. Both are kept in
    `preflopChart.ts` and the UI will show computed with quoted alongside.
15. **Exact enumeration whenever the search is <= 200k leaves**, Monte Carlo
    otherwise, chosen automatically. Flop and turn spots with known hands are
    always exact; preflop is always sampled.
16. **Sampled results carry a standard error and a 95% margin.** The UI shows
    "36.2% +/- 0.3" rather than implying more precision than 25k samples buy.
17. **An "out" is defined by outcome, not by appearance.** `analyzeOuts` deals
    every unseen card and re-evaluates both hands. Dirty outs fall out of the
    arithmetic instead of being asserted by a lookup table.
18. **"Improves your hand" means the category goes up.** Ranking A-K-Q-7-3 above
    A-K-Q-7-2 is technically a higher hand value, but no one counting outs means
    that. Caught by a test that expected 8 dirty outs and got 30.
19. **EV is measured forward from the decision; folding is exactly 0.** Money
    already in the pot is sunk and never appears in any EV number.
20. **Drill grading uses a one-decision showdown model**, with villain raises
    modelled explicitly. Multi-street trees come from `game.ts` + `bots.ts` in
    L8. The UI will label which model produced a number.
21. **`breakevenFoldFrequency` returns 0 when the bet already profits against a
    caller.** "You need no folds" is the true answer there, not a negative
    frequency.

## Curriculum, bots, dojo, upgrade tier (checkpoints 3–7)

22. **Difficulty is classified, not authored.** L0 deals random showdowns and
    sorts them by *how the evaluator separated the two hands* — category gap,
    then first tiebreaker, then a later one, then a chop. Drills are
    rejection-sampled until they hit the tier that index calls for, so kicker
    battles and boards that play are found rather than scripted.
23. **The coach panel is always on screen and never a modal.** Before you answer
    it holds the facts you are entitled to (pot, price, unseen cards); the
    computed proof fills in underneath the moment you answer. Showing equity
    before an equity question would just be the answer.
24. **Villain ranges are models, and they are printed on the table.** L2 narrows
    the seat's Appendix A range to the strongest slice on that exact board,
    ranked by the evaluator. It is a modelling choice, so it is stated in the UI
    rather than buried.
25. **L3 models the big blind with the button's range.** The chart gives BB no
    opening range because it never opens, but it defends widest of all seats. The
    substitution is labelled on screen.
26. **Wet and dry are measured.** L5 counts what share of all 1326 starting hands
    connect with a flop, and calls it wet if that is above the median of a fixed
    sample of random flops. The cut-off is computed once at first use, not
    chosen by taste.
27. **A bot is a profile plus shared machinery.** Each archetype is a set of
    thresholds; the machinery ranks the bot's own range on the real board and
    compares. `respondTo()` partitions the whole range into fold/call/raise for a
    given size and measures hero's equity against the calling part — that is
    what makes L6 and L7 EV grading real rather than assumed.
28. **Pot-odds-aware bots shift their continue threshold with bet size.** The
    Station does not, which is the entire point of the Station.
29. **A leak's cost is measured.** bb/100 comes from EV actually surrendered on
    the drills that earned the tag, divided by drills answered. Tags from levels
    without an EV model (L0, L5) report frequency only rather than a fabricated
    cost.
30. **The Dojo generates fresh spots, never replays.** A tag maps to the level
    that can test it; the session seed is new every time, so the cards are too.
31. **Side pots split only where a live player is all in for less.** Money from
    players who folded at different prices falls into the lowest pot it reaches
    instead of creating phantom side pots. Caught by playing a hand in the
    browser and seeing three "side pots" with nobody all in.
32. **The upgrade code is hashed, not stored.** `pro.ts` holds an FNV-1a hash and
    compares hashes. That keeps it out of the bundle for a casual reader; it is
    obfuscation, not security, and anyone determined can defeat client-side code.
    There is no server by design.
33. **The upgraded tier buys precision and surface area, never different
    opinions.** 250k samples instead of 25k, exact enumeration up to 3M leaves
    instead of 200k, plus the Lab, Boss Fights, the full leak board and the
    Nemesis. The maths is the same maths at both tiers.
34. **The Nemesis adapts from your logged leaks, mechanically.** It shifts its own
    thresholds — more bluffs against someone who folds too much, fewer and bigger
    value bets against someone who calls too much — using your recorded tag
    counts as the input.

## Share links

35. **The score travels in the URL fragment, not a query string.** A fragment is
    never sent to the server or written to an access log, which matters because
    the payload carries a name someone chose.
36. **A checksum, and an honest label for what it is.** FNV-1a over the canonical
    payload catches a link that got mangled or hand-edited, and the recipient
    sees a warning when it fails. It cannot stop forgery — there is no server to
    sign anything — so the UI calls a share link a boast rather than a receipt
    instead of implying it is verified.
37. **Everything decoded from a link is treated as hostile.** Numbers are clamped
    to sane ranges (an accuracy of 9999 becomes 100, 900 correct out of 3 becomes
    3), unknown error tags are dropped so the `TAGS` lookup cannot crash, and
    names are stripped of control characters, zero-width characters and bidi
    overrides before rendering. Tested against NaN, Infinity, wrong types and
    junk base64.
38. **A tie is reported as a tie.** The first version counted only strict wins,
    so two identical scores read as "they have you on every measure". Caught by
    opening my own link.
