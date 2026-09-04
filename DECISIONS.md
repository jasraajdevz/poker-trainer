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

## Leaderboard

39. **The board propagates rather than syncing.** A live leaderboard needs a
    server, and the brief says no backend. So opening a share link files that
    player into your roster, and a board link carries everyone you know about.
    Passing one around a group converges everybody on the same table without
    hosting anything.
40. **The UI says what it is.** It is a snapshot of links you have been sent, not
    a live ranking, and the view says so in plain words rather than implying a
    freshness it cannot deliver.
41. **Your own row is computed live, never restored from a link.** A stale copy
    of you that arrived inside someone else's board is discarded in favour of
    your real progress, so you can never be shown out of date to yourself.
42. **Entries under 20 drills are provisional and sink below the ranked.** Three
    correct answers at 100% should not top a table over someone with 400 drills
    at 84%. Volume is shown as its own column so the tradeoff is visible.
43. **Ranking is by a chosen column, not an invented composite.** Every column is
    a number the app already computes; a weighted "rating" would be a made-up
    figure, which is the one thing this project does not do. EV is normalised to
    bb/100 so a long session is not punished for being long.
44. **Board entries are tuples, not objects.** A twelve-player board has to
    survive being pasted into a chat window; tuple rows keep a full board inside
    roughly 700 characters.
45. **Board links are re-validated row by row.** Same treatment as share links:
    clamped numbers, unknown tags dropped, names stripped of hidden characters,
    non-array rows discarded rather than trusted.

## Admin mode

46. **Admin is gated on the same code as Omega, and dies with it.** Deactivating
    the code turns admin off and leaves the override behind unused, so the back
    door cannot outlive the key.
47. **It grants no new power, and the app already said so.** A score lives in the
    URL fragment in plain sight; anyone with a console can rewrite one. Because
    share links were labelled from day one as "a boast, not a receipt" and are
    never presented as verified, a comfortable editor does not make the app lie
    to anyone — it makes an existing capability pleasant.
48. **The checksum still validates on an admin-edited link, correctly.** The
    checksum has only ever meant "this arrived as it was sent", not "these
    numbers are true". An owner-generated link is genuinely intact, so flagging
    it would be the dishonest choice.
49. **Edits are local until shared, and the panel says it.** Nothing propagates
    without the owner pressing copy.
50. **"Make me #1" edges past the leader instead of maxing out.** One level and
    two accuracy points clear of whoever is top reads as a good week; nine levels
    at 100% with a 0.4s median reads as a cheat. Plausibility is the feature.
51. **The owner's own row carries an "edited" badge, visible only to them.** It
    is derived from local override state, so it never travels in a link. The
    point is that the owner does not lose track of which of their own numbers
    are real.
52. **Edited values go through the same clamps as everything else**, so a hand-
    edited localStorage entry cannot put the board into a state the UI cannot
    render.

## Birthday mode

53. **The party propagates like everything else.** No server means no broadcast,
    so a live party is appended to every link the host shares as a `#pty=`
    payload. Opening one starts the disco and pays the join bonus.
54. **The party travels; the code does not.** A friend who opens a party link
    gets the disco and the points but inherits neither Omega nor admin. Verified
    on a genuinely fresh browser rather than assumed.
55. **Parties expire.** Twenty-four hours by default, capped at a week, and the
    decoder refuses a start date in the future — otherwise a link found in a
    chat log next March would relaunch the confetti forever.
56. **The music is original.** A synthesised 130 BPM surf-rock instrumental in E
    Phrygian dominant, written in the style of the fast Mediterranean surf sound
    the user asked for rather than reproducing a copyrighted recording. Web Audio
    only, so there is no file to ship and nothing to license.
57. **The banner gets its own layout space.** A fixed strip with the app padded
    to match, so the rainbow can never land on top of something you need to read.
58. **The marquee is sized to its content, not to a percentage.** Two copies at
    `width: 200%` left a blank gap whenever the phrase was shorter than the
    viewport; six copies at `max-content` shifted by half is seamless at any
    width. Caught by watching the strip go empty mid-loop.
59. **Birthday points ignore the provisional rule.** Everywhere else a player
    under 20 drills sinks below the ranked, but on the party column turning up
    IS the qualification, so the sort is pure points.
60. **Persist from effects, never from inside a state updater.** Two real bugs
    came from this: the party failed to survive a reload, and the join bonus
    silently vanished because StrictMode's second invocation of the updater found
    the ledger already written and returned unchanged. Both now write from an
    effect keyed on the value.
61. **Everything animated respects `prefers-reduced-motion`.** Loud is a choice;
    motion sickness is not.

## Scheduling a party

62. **A scheduled party is just a party with a future start.** `isLive` already
    compared against a window, so booking ahead needed no new concept — only the
    relaxation of a clamp that had assumed every party begins now.
63. **The app wakes itself at the transition.** A timeout is armed for the exact
    moment the party starts or ends, re-armed at most every 60 seconds, so a
    booked party lights up and shuts down on an open tab with nobody present.
    Verified live: disco off at seven seconds before, on one second after.
64. **A booked party still travels in links.** Invitations go out weeks early;
    only a finished party stops being attached.
65. **The window is stated in full, never inferred.** "Fri, Mar 5, 2027, 12:00 PM
    to 7:00 PM · 7h" removes the 12 AM / 12 PM ambiguity that prompted this, and
    both readings are one preset button apart. The owner settled on noon, so that
    is the default; the midnight preset remains beside it.
66. **Times are local, and the instant is absolute.** The owner picks hours in
    their own zone; everyone joins the same moment, seen in theirs.
67. **A crafted link still cannot sleep for a decade.** Booking ahead is bounded
    to 400 days, so relaxing the clamp did not reopen the dormant-confetti hole.
68. **The minimum party is one minute, not one hour.** `makeParty` clamped hours
    to a floor of 1, which would have made the fifteen-minute test button run for
    an hour. Caught by a test asserting the test party expires.

## Kid and adult modes, and making it fun

69. **The honest diagnosis first.** The engine was strong and the app around it
    felt like homework: a list of locked levels, a timed quiz as the first
    experience, feedback delivered as a wall of numbers, and the one thing people
    actually want — playing hands — locked behind eight levels. Kid mode was the
    right lever because building it forces the fun layer adults needed too.
70. **Kid mode changes language, generosity and celebration — never the maths.**
    Same evaluator, same Monte Carlo, same drills. Chips become stars, marking
    softens, the clock comes off. Dumbing the poker down would have made it a
    worse teacher, not a friendlier one.
71. **No money anywhere in kid mode**, enforced by a test that scans the kid
    vocabulary for money and gambling words rather than trusting a careful edit.
72. **Kid feedback never scolds**, also enforced by a test: the miss messages are
    checked against a list of harsh words.
73. **Play is the front door.** Quick play deals a real hand against the bots
    with no unlock and no score. Someone who has never opened the app can be
    playing poker in one click.
74. **Mode is a module-level setting, not a parameter.** Threading it through
    nine level modules would have touched every signature; the app has exactly
    one player at a time. Tests set it explicitly.
75. **The pass mark is passed in, not imported.** `progress.ts` takes it as an
    argument so it needs no import from `profile.ts`, which imports from it.
76. **Badges are derived, never stored as truth.** They are predicates over the
    real history, recomputed each render; storage only remembers which ones have
    already been celebrated so the toast fires once.
77. **The streak bonus is capped.** Otherwise a long lucky run inflates XP past
    anything the ranks were spaced for.
78. **"Wrong" is a soft low thud.** A buzzer on every miss trains people to stop
    playing, which is the opposite of what a trainer is for.

## The graphics pass

79. **No media files, ever.** Cards, felt, light, celebration and music are all
    code. Nothing to license, nothing unvetted on screen, and the whole app
    stays a few hundred KB.
80. **The first thirty seconds now deals cards.** The intro fans a royal flush
    out of the deck, the title catches the light, and whichever door you pick
    drops you straight into a live dealt hand with a two-line welcome — play
    before study, within ten seconds.
81. **Themes are CSS custom properties on <html>.** Four felts recolour the
    entire app — panels, ambient light, card backs — without a re-render, and
    the settings module is structurally unable to touch a computed number.
82. **Calm mode is a first-class setting, not just a media query.** It mirrors
    prefers-reduced-motion exactly, so the loud version and the still version
    are the same app.
83. **The deck preview in settings is painted by hand** with each deck's exact
    colour classes, because the real card component reads the live module
    setting and a preview must show the option you have not chosen.

84. **A 21-agent review ran before this shipped, and 17 findings survived
    adversarial verification.** The worst: the reset dialog promised to wipe XP
    and badges but only wiped progress; the new settings gear sat exactly on top
    of every view's Exit button on phones; a saved non-emerald theme flashed
    green on every boot; the card backs were accidentally 14% transparent via a
    color-mix normalisation rule; and five separate surfaces leaked adult poker
    vocabulary into kid mode. All fixed, and the kid-vocabulary guard now covers
    the 24 mistake-tag labels and fixes as a test, not an intention.
85. **The gear lives top-right under the Omega pill**, because every view's exit
    control owns the top-left corner, and both hide during a party so the
    birthday banner is never painted over.

## Mobile, tutorial, PWA, and the end of the clock

86. **The "weird scrolly" glitch was `background-attachment: fixed`.** iOS
    Safari fakes it and the felt smears while scrolling. The gradient now lives
    on a genuinely fixed layer inside Ambient, and body is a solid colour.
87. **Installable and offline.** Manifest + hand-written service worker:
    network-first shell (new deploys always win online), cache-first hashed
    assets, install-time precache so one visit is enough to play offline.
88. **The service worker must never touch caches outside its own prefix.**
    Cache Storage is origin-scoped and github.io user pages share one origin
    across every project site — an unscoped cleanup would have deleted sibling
    apps' caches. Caught by the review workflow before it ever deployed.
89. **The clock is opt-in for everyone, default off.** Times are still recorded
    silently for the trend and the Lightning badge, but nothing is ever timed
    against the player. The dead `timed` mode flag was deleted rather than left
    to mislead.
90. **The tutorial asks the evaluator for its own examples.** The hand-ladder
    names and the showdown winner on the tour pages are computed live, so the
    tutorial cannot drift out of agreement with the game.
91. **A second review workflow (12 agents) ran on this change set; all 10
    confirmed findings were fixed** — four service-worker defects, the inert
    iOS anti-zoom rule, three kid-vocabulary leaks the tutorial itself exposed,
    a stale onboarding promise, and the tutorial re-arming the one-shot
    greeting.
