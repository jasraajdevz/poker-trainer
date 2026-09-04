import { Mode, TERMS } from '../../coach/profile';

/**
 * The first thing anyone sees. Two doors, no small print.
 *
 * Kid mode is not a watered-down version: the engine, the maths and the levels
 * are identical. What changes is the language (stars, never money), how
 * forgiving the marking is, and how loudly it cheers.
 */
export function Onboarding({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      <h1 className="text-center text-4xl font-black tracking-tight text-emerald-50 sm:text-5xl">
        Who's playing?
      </h1>
      <p className="mt-2 text-center text-emerald-200/60">
        You can change this whenever you like.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Door
          onClick={() => onPick('kid')}
          emoji="⭐"
          title="Kids"
          sub="Ages 8 and up"
          tone="kid"
          points={[
            'Stars instead of chips — no money anywhere',
            'Kinder marking and hints switched on',
            'Badges, streaks and a lot of cheering',
            'No clock unless you want one',
          ]}
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
            'Everything the engine computes, shown',
          ]}
        />
      </div>

      <p className="mt-8 text-center text-xs leading-relaxed text-emerald-200/40">
        Same engine either way — the same evaluator, the same equity simulations, the same honest
        numbers. {TERMS.kid.tagline}
      </p>
    </div>
  );
}

function Door({
  onClick, emoji, title, sub, points, tone,
}: {
  onClick: () => void;
  emoji: string;
  title: string;
  sub: string;
  points: string[];
  tone: Mode;
}) {
  return (
    <button
      onClick={onClick}
      className={`panel group flex flex-col items-start gap-3 p-6 text-left transition
        hover:-translate-y-0.5 ${
        tone === 'kid'
          ? 'border-amber-400/40 hover:border-amber-300/80 hover:bg-amber-400/5'
          : 'border-emerald-600/40 hover:border-emerald-400/80 hover:bg-emerald-500/5'
      }`}
    >
      <span className="text-5xl transition group-hover:scale-110">{emoji}</span>
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
    </button>
  );
}
