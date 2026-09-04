import { useEffect, useMemo, useState } from 'react';
import {
  BADGES, BadgeDef, Mode, RankState, badgeName, rankName,
} from '../../coach/profile';

/** A burst of stars behind a correct answer. Kid mode gets a lot more of them. */
export function StarBurst({ n, seed }: { n: number; seed: number }) {
  const bits = useMemo(
    () => Array.from({ length: n }, (_, i) => {
      const a = ((i * 137 + seed * 31) % 360) * (Math.PI / 180);
      const dist = 40 + ((i * 53 + seed) % 70);
      return {
        x: Math.cos(a) * dist,
        y: Math.sin(a) * dist - 20,
        delay: (i % 5) * 0.03,
        scale: 0.6 + ((i * 17) % 8) / 10,
        ch: ['⭐', '✨', '🌟', '💫'][i % 4]!,
      };
    }),
    [n, seed],
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className="burst absolute text-xl"
          style={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...( { '--bx': `${b.x}px`, '--by': `${b.y}px` } as any),
            animationDelay: `${b.delay}s`,
            fontSize: `${b.scale}rem`,
          }}
        >
          {b.ch}
        </span>
      ))}
    </div>
  );
}

/** The headline over the feedback: the thing you read before the numbers. */
export function Verdict({
  correct, text, mode, streak, xp,
}: {
  correct: boolean;
  text: string;
  mode: Mode;
  streak: number;
  xp: number;
}) {
  const big = mode === 'kid';
  return (
    <div
      className={`rise relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border px-4 ${
        big ? 'py-4' : 'py-2.5'
      } ${
        correct
          ? 'border-emerald-400/50 bg-gradient-to-r from-emerald-500/25 to-emerald-500/5'
          : 'border-amber-400/40 bg-gradient-to-r from-amber-500/20 to-amber-500/5'
      }`}
    >
      {correct && big && <StarBurst n={14} seed={streak + xp} />}
      <div className="relative z-10 min-w-0">
        <div
          className={`font-black tracking-tight ${big ? 'text-2xl' : 'text-base'} ${
            correct ? 'text-emerald-200' : 'text-amber-200'
          }`}
        >
          {correct ? (big ? '🎉 ' : '') : big ? '🤔 ' : ''}
          {text}
        </div>
        {correct && xp > 0 && (
          <div className="tnum mt-0.5 text-xs font-semibold text-emerald-300/80">+{xp} XP</div>
        )}
      </div>
      {streak >= 2 && (
        <div className="relative z-10 shrink-0 text-right">
          <div className={`tnum font-black ${big ? 'text-2xl' : 'text-lg'} text-orange-300`}>
            🔥 {streak}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-orange-200/50">in a row</div>
        </div>
      )}
    </div>
  );
}

/** Rank, XP bar and progress to the next one. */
export function RankBar({
  state, xp, mode, compact = false,
}: {
  state: RankState;
  xp: number;
  mode: Mode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? '' : 'panel p-4'}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className={compact ? 'text-xl' : 'text-2xl'}>{state.rank.emoji}</span>
          <span className={`font-bold text-emerald-50 ${compact ? 'text-sm' : 'text-lg'}`}>
            {rankName(state.rank, mode)}
          </span>
        </span>
        <span className="tnum text-xs text-emerald-200/60">
          {xp.toLocaleString()} XP
          {state.next && (
            <span className="text-emerald-200/35"> · {state.toNext} to {rankName(state.next, mode)}</span>
          )}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-950">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-300 transition-all duration-500"
          style={{ width: `${Math.max(3, state.progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** The shelf. Locked badges stay visible so there is something to want. */
export function BadgeShelf({ earned, mode }: { earned: string[]; mode: Mode }) {
  const has = new Set(earned);
  return (
    <div className="flex flex-wrap gap-2">
      {BADGES.map((b) => {
        const got = has.has(b.id);
        return (
          <div
            key={b.id}
            title={`${badgeName(b, mode)} — ${b.how}`}
            className={`flex min-w-[4.5rem] flex-col items-center gap-1 rounded-xl border px-2 py-2 transition ${
              got
                ? 'border-amber-400/50 bg-amber-400/10'
                : 'border-emerald-900/60 bg-black/20 opacity-35'
            }`}
          >
            <span className={`text-xl ${got ? '' : 'grayscale'}`}>{b.emoji}</span>
            <span className="text-center text-[10px] font-semibold leading-tight text-emerald-100/80">
              {badgeName(b, mode)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Slides in when a badge unlocks, then leaves on its own. */
export function BadgeToast({
  badge, mode, onDone,
}: {
  badge: BadgeDef;
  mode: Mode;
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const a = window.setTimeout(() => setLeaving(true), 3200);
    const b = window.setTimeout(onDone, 3700);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [onDone]);
  return (
    <div
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-amber-300/60
                  bg-gradient-to-r from-amber-500/25 to-fuchsia-500/20 px-5 py-3 shadow-2xl backdrop-blur
                  transition-all duration-500 ${leaving ? 'translate-y-6 opacity-0' : 'opacity-100'}`}
      role="status"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">{badge.emoji}</span>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber-200/70">Badge unlocked</div>
          <div className="text-lg font-black text-amber-100">{badgeName(badge, mode)}</div>
          <div className="text-xs text-emerald-100/70">{badge.how}</div>
        </div>
      </div>
    </div>
  );
}

/** Full-width moment when a rank is reached. */
export function RankUpToast({
  state, mode, onDone,
}: {
  state: RankState;
  mode: Mode;
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const a = window.setTimeout(() => setLeaving(true), 3400);
    const b = window.setTimeout(onDone, 3900);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [onDone]);
  return (
    <div
      className={`fixed inset-x-0 top-6 z-50 mx-auto w-fit rounded-2xl border border-emerald-300/60
                  bg-gradient-to-r from-emerald-500/30 to-amber-400/20 px-6 py-4 text-center shadow-2xl
                  backdrop-blur transition-all duration-500 ${leaving ? '-translate-y-6 opacity-0' : ''}`}
      role="status"
    >
      <div className="relative">
        <StarBurst n={16} seed={state.index * 7} />
        <div className="relative z-10">
          <div className="text-[10px] uppercase tracking-widest text-emerald-200/70">New rank</div>
          <div className="text-3xl font-black text-emerald-50">
            {state.rank.emoji} {rankName(state.rank, mode)}
          </div>
        </div>
      </div>
    </div>
  );
}
