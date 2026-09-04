import { useEffect, useState } from 'react';
import { parseCards } from '../../engine/cards';
import { Mode } from '../../coach/profile';
import { PlayingCard } from '../components/PlayingCard';

/**
 * The first thirty seconds. A royal flush fans out of the deck, the title
 * catches the light, two doors tilt toward you, and real engine facts tick
 * underneath — because "every number is computed" is the actual sales pitch.
 *
 * Whichever door they pick, the very next screen deals them a live hand.
 */

const FAN = parseCards('Ts Js Qs Ks As');

const FACTS = [
  'The hand evaluator reads 2 million showdowns a second.',
  'Equity comes from real simulations — up to 250,000 deals per answer.',
  'It was tested against 100,000 random hands before you ever saw it.',
  'Every "correct" has the maths to prove it, shown right there.',
  'The bots explain their own thinking after every hand.',
  'Your mistakes are remembered and come back until you beat them.',
];

export function Onboarding({ onPick }: { onPick: (m: Mode) => void }) {
  const [fact, setFact] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setFact((f) => (f + 1) % FACTS.length), 3400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center overflow-x-clip px-6 py-10">
      {/* The fan. Ten through ace of spades, dealt one by one. */}
      <div className="pointer-events-none mx-auto flex h-36 items-end justify-center" aria-hidden>
        {FAN.map((c, i) => (
          <span
            key={c}
            className="fan-card -mx-3 inline-block"
            style={{
              ['--fan-rot' as never]: `${(i - 2) * 11}deg`,
              animationDelay: `${200 + i * 130}ms`,
              zIndex: i,
            }}
          >
            <PlayingCard card={c} size="lg" float delayMs={i * 400} />
          </span>
        ))}
      </div>

      <h1 className="title-shine mt-6 text-center text-5xl font-black tracking-tight sm:text-6xl">
        Who&apos;s playing?
      </h1>
      <p className="mt-2 text-center text-emerald-200/60">
        Pick a door. You can swap any time.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Door
          onClick={() => onPick('kid')}
          emoji="⭐"
          title="Kids"
          sub="Ages 8 and up"
          tone="kid"
          points={[
            'Stars instead of real money — nothing to lose',
            'Kind marking, hints on, no clock',
            'Badges, ranks and a lot of cheering',
          ]}
          cta="Play with stars →"
        />
        <Door
          onClick={() => onPick('adult')}
          emoji="♠"
          title="Adults"
          sub="Proper poker"
          tone="adult"
          points={[
            "No-Limit Hold'em, 6-max, 100bb",
            'Chips, pots, EV in big blinds',
            'Strict marking and timed reads',
          ]}
          cta="Take a seat →"
        />
      </div>

      {/* Engine facts, one at a time. The honest kind of flash. */}
      <div className="mt-8 flex h-12 items-center justify-center overflow-hidden text-center sm:h-6" aria-live="polite">
        <p key={fact} className="rise text-sm text-emerald-200/50">
          {FACTS[fact]}
        </p>
      </div>
    </div>
  );
}

function Door({
  onClick, emoji, title, sub, points, tone, cta,
}: {
  onClick: () => void;
  emoji: string;
  title: string;
  sub: string;
  points: string[];
  tone: Mode;
  cta: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`door panel group flex flex-col items-start gap-3 p-6 text-left ${
        tone === 'kid'
          ? 'border-amber-400/40 hover:border-amber-300/80'
          : 'border-emerald-500/40 hover:border-emerald-300/80'
      }`}
    >
      <span
        className="text-5xl transition group-hover:scale-110"
        style={{ filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.5))' }}
      >
        {emoji}
      </span>
      <span>
        <span className="block text-2xl font-black text-emerald-50">{title}</span>
        <span className="block text-sm text-emerald-200/55">{sub}</span>
      </span>
      <ul className="mt-1 space-y-1">
        {points.map((p) => (
          <li key={p} className="flex gap-2 text-sm text-emerald-100/75">
            <span className={tone === 'kid' ? 'text-amber-300' : 'text-emerald-400'}>·</span>
            {p}
          </li>
        ))}
      </ul>
      <span
        className={`mt-2 inline-block rounded-lg border px-3 py-1.5 text-xs font-bold ${
          tone === 'kid'
            ? 'border-amber-400/50 bg-amber-400/15 text-amber-100'
            : 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
        }`}
      >
        {cta}
      </span>
    </button>
  );
}
