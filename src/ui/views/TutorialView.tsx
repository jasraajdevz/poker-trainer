import { useEffect, useMemo, useState } from 'react';
import { parseCards } from '../../engine/cards';
import { evaluate } from '../../engine/evaluator';
import { Mode } from '../../coach/profile';
import { CardRow } from '../components/PlayingCard';

/**
 * The two-minute tour, for someone who has never held a playing card.
 *
 * House rule applies even here: the hand names on the ladder page and the
 * winner on the showdown page are produced by the real evaluator, not typed in.
 * If the tutorial ever disagreed with the game, the game would be right —
 * so the tutorial asks the game.
 */

const LADDER: Array<{ cards: string; note: string }> = [
  { cards: 'As Ks Qs Js Ts', note: 'The best hand there is. You may never see one.' },
  { cards: '9c 9d 9h 9s 4c', note: 'Four of the same number.' },
  { cards: 'Kd Kh Ks 7c 7d', note: 'Three of one number and two of another.' },
  { cards: 'Ah Jh 8h 5h 2h', note: 'Five cards, one suit.' },
  { cards: '9c 8d 7h 6s 5c', note: 'Five numbers in a row.' },
  { cards: 'Qc Qd Qh 8s 3c', note: 'Three of the same number.' },
  { cards: 'Jd Jh 4c 4s Ac', note: 'Two pairs.' },
  { cards: 'Td Th Ac 7s 2h', note: 'One pair.' },
  { cards: 'Ah Qd 9c 6s 3h', note: 'No pattern at all — the biggest card speaks.' },
];

const DUEL = {
  a: 'Ah Kh',
  b: '8c 8d',
  board: 'Kd 8s 4h 2c 7s',
};

export function TutorialView({
  mode, onPlay, onLearn, onExit,
}: {
  mode: Mode;
  onPlay: () => void;
  onLearn: () => void;
  onExit: () => void;
}) {
  const kid = mode === 'kid';
  const [page, setPage] = useState(0);
  const money = kid ? 'stars' : 'chips';
  const pile = kid ? 'star pile' : 'pot';

  const duel = useMemo(() => {
    const board = parseCards(DUEL.board);
    const a = evaluate([...parseCards(DUEL.a), ...board]);
    const b = evaluate([...parseCards(DUEL.b), ...board]);
    return { board, a, b, winner: a.value > b.value ? 'A' : b.value > a.value ? 'B' : 'chop' };
  }, []);

  const pages = [
    // 0 — the goal
    <Page key={0} title={kid ? 'The whole game in one line' : 'The goal'}>
      <p>
        Everyone at the table puts {money} into a {pile} in the middle.
        There are exactly two ways to win it:
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li><b>Have the best hand</b> when all the cards are out.</li>
        <li><b>Be the last one still in</b> — if everyone else {kid ? 'sits out' : 'folds'}, the {pile} is yours and nobody even sees your cards.</li>
      </ol>
      <p className="mt-3">
        That second way is why the game is about people, not just luck.
      </p>
    </Page>,

    // 1 — the cards
    <Page key={1} title="Your cards, and everyone's cards">
      <p>You get <b>two secret cards</b>. Only you ever see them:</p>
      <div className="mt-2"><CardRow cards={parseCards('Ah Kh')} size="md" deal /></div>
      <p className="mt-4">
        Then <b>five shared cards</b> land face-up in the middle, for everyone, in three steps —
        first three, then one, then one:
      </p>
      <div className="mt-2 flex items-end gap-1.5">
        <CardRow cards={parseCards('Kd 8s 4h')} size="sm" deal />
        <span className="pb-3 text-emerald-200/40">then</span>
        <CardRow cards={parseCards('2c')} size="sm" deal />
        <span className="pb-3 text-emerald-200/40">then</span>
        <CardRow cards={parseCards('7s')} size="sm" deal />
      </div>
      <p className="mt-4">
        Your hand is the <b>best five</b> you can pick from your two plus the shared five.
        Your other cards simply do not count.
      </p>
    </Page>,

    // 2 — the turns
    <Page key={2} title="What you can do on your turn">
      <ul className="space-y-2.5">
        <Li k="Check">Stay in for free, when nobody has added {money} this round.</Li>
        <Li k={kid ? 'Stay in' : 'Call'}>Match what someone else added, to keep going.</Li>
        <Li k={kid ? 'Add stars' : 'Bet / Raise'}>
          Put more {money} in. Others must match you or drop out.
        </Li>
        <Li k={kid ? 'Sit out' : 'Fold'}>
          Drop out of this hand. It costs nothing more, and it is often the smart move.
        </Li>
      </ul>
      <p className="mt-4">
        Between each batch of shared cards there is a round of these turns.
        Cards → turns → cards → turns, until the five are out or one player is left.
      </p>
    </Page>,

    // 3 — the ladder
    <Page key={3} title="The hand ladder" wide>
      <p className="mb-3">
        Nine shapes, best to worst. Every name below was read by the game&apos;s own
        evaluator, not typed in:
      </p>
      <div className="space-y-1.5">
        {LADDER.map((row) => {
          const cards = parseCards(row.cards);
          const v = evaluate(cards);
          return (
            <div key={row.cards} className="flex items-center gap-3 rounded-lg bg-black/25 px-2 py-1.5">
              <CardRow cards={cards} size="sm" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-emerald-50">{v.name}</div>
                <div className="truncate text-[11px] text-emerald-200/50">{row.note}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Page>,

    // 4 — a real showdown
    <Page key={4} title="Who wins this one?">
      <p>Two players turn their cards over. The shared five:</p>
      <div className="mt-2"><CardRow cards={duel.board} size="md" /></div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={`rounded-xl border p-2.5 ${duel.winner === 'A' ? 'border-amber-400/60 bg-amber-400/10' : 'border-emerald-900/60'}`}>
          <CardRow cards={parseCards(DUEL.a)} size="sm" />
          <div className="mt-1.5 text-xs font-semibold text-emerald-100">{duel.a.name}</div>
        </div>
        <div className={`rounded-xl border p-2.5 ${duel.winner === 'B' ? 'border-amber-400/60 bg-amber-400/10' : 'border-emerald-900/60'}`}>
          <CardRow cards={parseCards(DUEL.b)} size="sm" />
          <div className="mt-1.5 text-xs font-semibold text-emerald-100">{duel.b.name}</div>
        </div>
      </div>
      <p className="mt-4">
        {duel.winner === 'B'
          ? <>The second player wins — <b>{duel.b.name.toLowerCase()}</b> beats <b>{duel.a.name.toLowerCase()}</b>. A pair of kings LOOKS strong, and this is the first lesson: what matters is the ladder, not the look.</>
          : <>The first player wins with <b>{duel.a.name.toLowerCase()}</b>.</>}
      </p>
    </Page>,

    // 5 — playing smart
    <Page key={5} title="The clever part">
      <p>
        Good players do two small sums, over and over:
      </p>
      <ul className="mt-3 space-y-2.5">
        <Li k="Chances">How likely is my hand to end up best?</Li>
        <Li k="Price">Is what I must pay small enough for those chances?</Li>
      </ul>
      <p className="mt-4">
        Chances better than the price — stay in. Worse — {kid ? 'sit out' : 'fold'}, happily.
        That one comparison is most of the game, and the levels here teach it with real
        numbers until it is second nature.
      </p>
      <p className="mt-3 text-emerald-200/60">
        There is no clock on any of it. Take all the time you like.
      </p>
    </Page>,

    // 6 — ready
    <Page key={6} title={kid ? 'You know enough. Go play!' : 'You know enough'}>
      <p>
        Really — this is how everyone starts. The table has a hint button, the coach shows its
        working after every answer, and nothing is ever scored until you want it to be.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button onClick={onPlay} className="btn-primary">
          🎴 Deal me in
        </button>
        <button onClick={onLearn} className="btn-ghost">
          Start with the first lesson
        </button>
      </div>
    </Page>,
  ];

  const last = pages.length - 1;

  // Arrow keys page through; Escape leaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && page < last) setPage(page + 1);
      else if (e.key === 'ArrowLeft' && page > 0) setPage(page - 1);
      else if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, last, onExit]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col px-6 py-8">
      <header className="mb-4 flex items-center justify-between">
        <button onClick={onExit} className="text-xs text-emerald-300/60 hover:text-emerald-200">
          ← {kid ? 'Back' : 'Skip the tour'}
        </button>
        <span className="tnum text-xs text-emerald-200/40">{page + 1} / {pages.length}</span>
      </header>

      <div key={page} className="rise flex-1">{pages[page]}</div>

      <footer className="mt-6">
        <div className="mb-3 flex justify-center gap-1.5">
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              aria-label={`Page ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === page ? 'w-6 bg-emerald-400' : 'w-2 bg-emerald-900'
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="btn-ghost disabled:opacity-30"
          >
            ← Back
          </button>
          {page < last ? (
            <button onClick={() => setPage(page + 1)} className="btn-primary">
              Next →
            </button>
          ) : (
            <button onClick={onPlay} className="btn-primary">Play →</button>
          )}
        </div>
      </footer>
    </div>
  );
}

function Page({ title, children, wide = false }: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? '' : 'mx-auto max-w-md'}>
      <h1 className="mb-4 text-2xl font-black tracking-tight text-emerald-50">{title}</h1>
      <div className="text-[15px] leading-relaxed text-emerald-100/85">{children}</div>
    </div>
  );
}

function Li({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-100">
        {k}
      </span>
      <span>{children}</span>
    </li>
  );
}
