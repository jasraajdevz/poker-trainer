import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { discoBeat } from '../../audio/discoBeat';
import {
  Party, TAP_CAP, TAP_COOLDOWN_MS, TAP_POINTS, remainingMs,
} from '../../coach/party';

/**
 * Birthday mode.
 *
 * The banner lives in its own fixed strip and the app is padded to match, so
 * the rainbow never lands on top of anything you need to read. Everything else
 * is pointer-events-none and sits behind the interface.
 */

export const BANNER_HEIGHT = 64;

const CONFETTI_COLOURS = [
  '#ff3b5c', '#ff9f1c', '#ffe14d', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6',
];

interface Piece { left: number; delay: number; dur: number; size: number; colour: string; rot: number; }

export function DiscoOverlay({ pulse }: { pulse: number }) {
  const pieces = useMemo<Piece[]>(
    () => Array.from({ length: 70 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 6,
      dur: 4 + Math.random() * 5,
      size: 6 + Math.random() * 10,
      colour: CONFETTI_COLOURS[Math.floor(Math.random() * CONFETTI_COLOURS.length)]!,
      rot: Math.random() * 360,
    })),
    [],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* Hue wash, cycling continuously */}
      <div className="disco-wash absolute inset-0" />
      {/* Beat strobe: brightens on the kick */}
      <div
        className="absolute inset-0 bg-white transition-opacity duration-100"
        style={{ opacity: pulse * 0.055 }}
      />
      {/* Sweeping spotlights */}
      <div className="disco-beam absolute -top-1/2 left-1/4 h-[200%] w-40 opacity-20" />
      <div className="disco-beam-2 absolute -top-1/2 right-1/4 h-[200%] w-32 opacity-15" />
      {pieces.map((p, i) => (
        <span
          key={i}
          className="disco-confetti absolute top-0 block rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.5,
            background: p.colour,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/** The rainbow strip. Own layout space, so nothing ever collides with it. */
export function DiscoBanner({ party, pulse }: { party: Party; pulse: number }) {
  const phrase = `HAPPY BIRTHDAY ${party.name.toUpperCase()}`;
  // Six copies at max-content width. The loop shifts by exactly half the strip,
  // so copies 4-6 land where 1-3 were and the seam never shows. Two copies with
  // a percentage width leaves a blank gap whenever the phrase is short.
  const copies = [0, 1, 2, 3, 4, 5];
  return (
    <div
      className="fixed inset-x-0 top-0 z-40 overflow-hidden border-b border-white/10
                 bg-gradient-to-r from-fuchsia-900/70 via-indigo-900/70 to-rose-900/70 backdrop-blur"
      style={{ height: BANNER_HEIGHT }}
    >
      <div className="disco-marquee flex h-full items-center whitespace-nowrap">
        {copies.map((c) => (
          <span key={c} className="flex items-center px-6">
            {[...phrase].map((ch, i) => (
              <span
                key={`${c}-${i}`}
                className="disco-letter inline-block text-3xl font-black tracking-tight sm:text-4xl"
                style={{
                  animationDelay: `${i * 0.055}s`,
                  transform: `scale(${1 + pulse * 0.07})`,
                }}
              >
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
            <span className="px-4 text-3xl sm:text-4xl">🪩</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function DiscoBar({
  party, points, onPoints, onEnd, canEnd,
}: {
  party: Party;
  points: number;
  onPoints: (delta: number) => void;
  onEnd?: () => void;
  canEnd: boolean;
}) {
  const [music, setMusic] = useState(false);
  const [tapped, setTapped] = useState(0);
  const [left, setLeft] = useState(() => remainingMs(party));
  const lastTap = useRef(0);
  const gained = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setLeft(remainingMs(party)), 30_000);
    return () => clearInterval(t);
  }, [party]);

  const toggleMusic = useCallback(async () => {
    if (music) { discoBeat.stop(); setMusic(false); return; }
    const ok = await discoBeat.start(0.45);
    setMusic(ok);
  }, [music]);

  const tap = () => {
    const now = performance.now();
    if (now - lastTap.current < TAP_COOLDOWN_MS) return;
    lastTap.current = now;
    if (gained.current >= TAP_CAP) return;
    gained.current += TAP_POINTS;
    onPoints(TAP_POINTS);
    setTapped((n) => n + 1);
  };

  const hours = Math.floor(left / 3600_000);
  const mins = Math.floor((left % 3600_000) / 60_000);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-2xl border border-white/20
                    bg-black/70 px-3 py-2 shadow-2xl backdrop-blur">
      <button
        onClick={tap}
        title={`Tap for +${TAP_POINTS} birthday points`}
        className="disco-ball text-3xl transition active:scale-90"
        style={{ transform: `scale(${1 + (tapped % 2) * 0.08})` }}
      >
        🪩
      </button>
      <div className="leading-tight">
        <div className="tnum text-lg font-black text-amber-300">{points.toLocaleString()}</div>
        <div className="text-[10px] uppercase tracking-widest text-white/50">birthday pts</div>
      </div>
      <button
        onClick={toggleMusic}
        title={music ? 'Stop the music' : 'Start the music'}
        className={`rounded-lg border px-2.5 py-1.5 text-sm transition ${
          music
            ? 'border-fuchsia-400/60 bg-fuchsia-500/25 text-fuchsia-100'
            : 'border-white/25 bg-white/5 text-white/70 hover:bg-white/15'
        }`}
      >
        {music ? '🔊' : '🔈'}
      </button>
      <div className="hidden text-[10px] uppercase tracking-widest text-white/40 sm:block">
        {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`} left
      </div>
      {canEnd && onEnd && (
        <button
          onClick={onEnd}
          title="End the party for you"
          className="rounded-lg border border-white/20 px-2 py-1.5 text-[10px] uppercase
                     tracking-widest text-white/50 hover:text-rose-300"
        >
          end
        </button>
      )}
    </div>
  );
}

/** Wires the beat to a pulse value the visuals can read. */
export function useDiscoPulse(): number {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    discoBeat.onBeat = (e) => {
      if (e.kick) setPulse(1);
      else if (e.snare) setPulse(0.6);
      else if (e.step % 4 === 0) setPulse(0.25);
    };
    const decay = setInterval(() => setPulse((p) => (p > 0.02 ? p * 0.55 : 0)), 70);
    return () => {
      discoBeat.onBeat = null;
      clearInterval(decay);
    };
  }, []);
  return pulse;
}
