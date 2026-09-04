/**
 * help.ts — the ask-me-anything guide.
 *
 * A curated knowledge base behind the floating "?" — a row of questions you
 * tap, each with a real answer, in the vocabulary of the current mode. It is
 * a guide written by hand, not an AI, and it never pretends otherwise.
 *
 * Kid answers follow the same house rules as everything kid-visible: no money
 * or gambling words, no scolding. Enforced by test, not by good intentions.
 */

import { Mode } from './profile';

export interface HelpEntry {
  id: string;
  q: { kid: string; adult: string };
  a: { kid: string[]; adult: string[] };
}

export const HELP: HelpEntry[] = [
  {
    id: 'how-to-play',
    q: { kid: 'How do I play?', adult: 'How do I play?' },
    a: {
      kid: [
        'Everyone puts stars into a pile in the middle. You win the pile by having the best hand when all the cards are out — or by being the last player still in, if everyone else sits out.',
        'You get two secret cards. Five shared cards land face-up in the middle for everybody. Your hand is the best five you can pick from your two plus the shared five.',
        'The fastest way to learn is the 2-minute tour — the button is right above this answer. Then hit Play a hand: hints are on, nothing is scored, and you cannot break anything.',
      ],
      adult: [
        "It is No-Limit Texas Hold'em, 6-max, 100 big blinds. Two hole cards, five community cards in three streets, best five of seven plays.",
        'Win the pot at showdown with the best hand, or before it by making everyone fold. Between each street there is a betting round: check, call, bet, raise, or fold.',
        'Take the 2-minute tour above for the full walkthrough, then Quick play deals you in against the bots with the coach on and nothing scored.',
      ],
    },
  },
  {
    id: 'buttons',
    q: { kid: 'What do the buttons do?', adult: 'What do the action buttons do?' },
    a: {
      kid: [
        'Check — stay in for free, when nobody has added stars this round.',
        'Stay in — match what someone else added, so you keep playing the hand.',
        'Add stars / Add more — put more stars in. The others must match you or sit out.',
        'Sit out — drop out of this hand only. It costs nothing more, you keep all your other stars, and a new hand starts right after. Sitting out at the right time is a skill, not a defeat.',
        'H — the hint button. It shows your real chances and the price, computed live.',
      ],
      adult: [
        'Check — pass the action without committing chips, available when nothing is in front of you.',
        'Call — match the current bet and continue. Fold — surrender the hand; it costs nothing further.',
        'Bet / Raise — put chips in; R opens the sizing row (33%, 66%, pot, all-in).',
        'H — the hint button in coached play: your live equity against a stated range model, and the price you are being offered.',
      ],
    },
  },
  {
    id: 'what-beats-what',
    q: { kid: 'What beats what?', adult: 'What beats what?' },
    a: {
      kid: [
        'From best to worst: five in a row all one suit · four of the same number · three of one number plus two of another · five of one suit · five numbers in a row · three of a kind · two pairs · one pair · biggest card.',
        'When two players have the same shape, the higher numbers inside it win — a pair of kings beats a pair of nines.',
        'The tour has the full ladder with real cards on page 4, and the first level ("Who wins?") drills it until reading a winner is instant.',
      ],
      adult: [
        'Straight flush · quads · full house · flush · straight · trips · two pair · one pair · high card.',
        'Same category compares the defining ranks first (the pair, the trips, the top of the run), then kickers in order. Identical five-card hands chop.',
        'Two classics that catch people: a flush beats a straight, and the wheel (A-2-3-4-5) is five-high, not ace-high. L0 drills all of it, including boards that play.',
      ],
    },
  },
  {
    id: 'shared-cards',
    q: { kid: 'Whose cards are the middle ones?', adult: 'How do the community cards work?' },
    a: {
      kid: [
        'The five middle cards belong to everyone at once. They arrive in three steps: first three together, then one more, then one last.',
        'Your final hand is the best five cards you can choose from your two secret ones plus those five shared ones. Sometimes the middle cards alone are the best five — then everyone still in shares the pile.',
      ],
      adult: [
        'The board is dealt flop (three), turn (one), river (one), with a betting round before and after each street.',
        'Your hand is the best five of your two plus the board — you can use both hole cards, one, or none. When the board itself is the best five for everyone, the pot chops.',
      ],
    },
  },
  {
    id: 'chances',
    q: { kid: 'What are my chances?', adult: 'What is equity, and what are outs?' },
    a: {
      kid: [
        'Your chances are how often your hand would win if the rest of the cards were dealt out a thousand times. The app really deals them out — tens of thousands of times — to get the number.',
        'A saving card (an "out") is a card that turns your hand into the winner. Counting them is the second level, and the shortcut is sweet: outs × 4 with two cards to come, outs × 2 with one.',
        'Press H at the table any time to see your real chances, computed live.',
      ],
      adult: [
        'Equity is your share of the pot over all runouts — the app computes it by exact enumeration when the space is small enough, Monte Carlo otherwise, and shows the ±95% margin when it sampled.',
        'An out is a card that wins you the hand — not one that merely improves you. L1 counts them by dealing every unseen card and re-evaluating both hands, which is how dirty outs get caught.',
        'Rule of thumb: outs × 4 on the flop, × 2 on the turn — and the app shows you exactly where that shortcut drifts.',
      ],
    },
  },
  {
    id: 'price',
    q: { kid: 'When is it worth staying in?', adult: 'What are pot odds?' },
    a: {
      kid: [
        'Every time you must pay to stay in, do the deal test: compare the price with your chances.',
        'The price is what you must pay, divided by how big the pile will be after you pay. Pay 50 into a pile that becomes 200 and the price is 25% — so you need better than a 1-in-4 chance for it to be a good deal.',
        'Chances better than the price: stay in. Worse: sit out, happily. That one comparison is most of the game, and level three ("Is it worth it?") makes it automatic.',
      ],
      adult: [
        'Required equity = call / (pot after your call). Facing 50 into 150 means 50/200 = 25%.',
        'Compare that to your actual equity against their range — the number the app computes and shows. Above the price, call; below it, fold unless implied odds cover the gap.',
        'L2 drills the comparison until it is reflexive, and every verdict shows the EV of both options in chips and big blinds.',
      ],
    },
  },
  {
    id: 'quitting',
    q: { kid: 'Is it okay to sit out?', adult: 'When should I fold?' },
    a: {
      kid: [
        'Completely — sitting out at the right moment is one of the strongest moves in the game. It costs you nothing more and saves your stars for a better hand.',
        'The best players sit out of most hands they are dealt. Playing every hand is how stars disappear.',
      ],
      adult: [
        'Fold whenever the price exceeds your equity and implied odds cannot close the gap. It is the only action with a guaranteed EV of exactly zero from that point on.',
        'Strong players fold the large majority of starting hands, and the app will show you the chips a bad call surrenders — folding well is where most of your first winrate comes from.',
      ],
    },
  },
  {
    id: 'position',
    q: { kid: 'Does my seat matter?', adult: 'Why does position matter?' },
    a: {
      kid: [
        'A lot! Going last is a superpower: you see what everyone else does before you decide anything.',
        'From the last seat you can play many more starting hands; from the first seat, only the strong ones. Level four ("Where you sit") shows the same hand from every seat with the real numbers.',
      ],
      adult: [
        'Acting last means acting on more information, every street. Concretely: the chance everyone folds to your open roughly triples from UTG to the button.',
        'L3 plays the same hand from all six seats and prints the walk-through EV of each, so position stops being a slogan and becomes a number.',
      ],
    },
  },
  {
    id: 'hints',
    q: { kid: 'Where do I get help during a hand?', adult: 'How do hints and the coach work?' },
    a: {
      kid: [
        'Press H (or tap Hint) at the table — it shows your real chances and the price, worked out fresh for that exact moment.',
        'In the levels, the coach panel is always beside the question. The moment you answer, it fills in with the numbers that prove the right answer, plus one sentence on the idea and what would have made the other choice right.',
      ],
      adult: [
        'H in coached play shows live equity versus a stated range model, with the price you are facing. Post-hand review reveals all hole cards, prices every decision in EV lost, and prints each bot’s own reasoning.',
        'In drills the coach panel is permanent — facts before you answer, full computed proof after. Nothing is hidden behind a click.',
      ],
    },
  },
  {
    id: 'levels',
    q: { kid: 'How do I unlock the next level?', adult: 'How does level unlocking work?' },
    a: {
      kid: [
        'Get 6 out of 10 right (60%) and the next level opens. Miss it? Just play again — you get brand-new questions every time, never repeats.',
        'There is no clock and no lives. Take as long as you like on every single question.',
      ],
      adult: [
        '80% on a run unlocks the next level; every replay generates fresh drills from new seeds. Nothing is timed unless you switch the clock on in Settings, and even then it is informational.',
        'The order is deliberate: showdowns → outs → price → position → ranges → texture → sizing → value/bluff → full hands.',
      ],
    },
  },
  {
    id: 'practice',
    q: { kid: 'What is the Practice Zone?', adult: 'What is the Mistake Dojo?' },
    a: {
      kid: [
        'Every miss gets remembered — not to tell you off, but so the app can build brand-new questions that practise exactly that thing.',
        'Beat a mistake a few times over the following days and it leaves the list for good. The list is on the home screen once you have played a bit.',
      ],
      adult: [
        'Every error is tagged, ranked by measured bb/100 actually surrendered, and drilled with fresh spots — never replays. Spaced repetition brings each tag back after 1, 3, 10 and 30 drills; clean answers at every interval retire it.',
        'Omega adds Boss Fights: ten spots built from one leak, eight-of-ten clears the tag permanently.',
      ],
    },
  },
  {
    id: 'single-player',
    q: { kid: 'Can I play alone?', adult: 'Is it single player?' },
    a: {
      kid: [
        'Yes — the whole game is built for playing alone. The other players are friendly robots, each with its own style, and after every hand they tell you what they were thinking.',
        'Friends are extra, never required: you can swap score links and share a leaderboard, but nothing ever waits for another person.',
      ],
      adult: [
        'Fully. Every opponent is a bot with a real strategy object — the Nit, the Station, the TAG (and the adaptive Nemesis in Omega) — and each explains its decisions in the post-hand review.',
        'No accounts, no server, no matchmaking. Share links and the propagating leaderboard are the only multiplayer, and both are optional.',
      ],
    },
  },
  {
    id: 'scores',
    q: { kid: 'How do I show a friend my score?', adult: 'How do share links and the leaderboard work?' },
    a: {
      kid: [
        'Tap Share on the home screen — your whole score gets packed into one link you can send in any chat. When your friend opens it, they see your card next to theirs.',
        'The leaderboard fills up by itself as you open each other’s links, and one board link can carry the whole group.',
      ],
      adult: [
        'The entire score travels in the URL fragment (~150 chars) with a checksum — tamped links get flagged, and the UI is honest that a link is a boast, not a receipt.',
        'The leaderboard propagates instead of syncing: opening links files players into your roster, and a board link carries everyone so a group converges without a server.',
      ],
    },
  },
  {
    id: 'progress',
    q: { kid: 'What are XP and badges?', adult: 'How do XP, ranks and badges work?' },
    a: {
      kid: [
        'Right answers earn XP, streaks earn extra, and XP climbs you through seven ranks — Card Cub all the way to Card Myth.',
        'The twelve badges are real achievements the app checks against what you actually did: eight showdowns read in a row, a perfect round, a hundred questions answered. The locked ones stay visible so you know what to chase.',
      ],
      adult: [
        'XP per correct answer with a capped streak bonus; seven ranks (Novice to Nemesis). Badges are predicates over your real history — recomputed, never hand-granted — covering speed, streaks, volume, comebacks and Boss Fights.',
      ],
    },
  },
];

/** Questions in the current mode's words, in display order. */
export const helpQuestions = (mode: Mode): Array<{ id: string; q: string }> =>
  HELP.map((e) => ({ id: e.id, q: e.q[mode] }));

export const helpEntry = (id: string): HelpEntry | undefined =>
  HELP.find((e) => e.id === id);

/**
 * Keyword search over questions and answers. Ranked by hits, question matches
 * weighted above answer matches. Empty query or no hits returns [].
 */
export function searchHelp(query: string, mode: Mode): Array<{ id: string; q: string }> {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  if (terms.length === 0) return [];
  const scored = HELP.map((e) => {
    const q = e.q[mode].toLowerCase();
    const a = e.a[mode].join(' ').toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (q.includes(t)) score += 3;
      if (a.includes(t)) score += 1;
    }
    return { id: e.id, q: e.q[mode], score };
  }).filter((x) => x.score > 0);
  return scored.sort((x, y) => y.score - x.score).map(({ id, q }) => ({ id, q }));
}
