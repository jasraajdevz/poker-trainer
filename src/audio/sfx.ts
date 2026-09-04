/**
 * sfx.ts — small synthesised sounds. No files, same approach as the party beat.
 *
 * Kept deliberately short and soft. A trainer you use for twenty minutes should
 * never make you reach for the mute button, so "wrong" is a gentle low thud
 * rather than a buzzer — being told off repeatedly is how people quit.
 */

type Voice = 'correct' | 'wrong' | 'levelUp' | 'badge' | 'streak' | 'click';

let ctx: AudioContext | null = null;
let enabled = true;
const KEY = 'poker-trainer:sfx';

export function sfxEnabled(): boolean {
  if (typeof localStorage === 'undefined') return enabled;
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return enabled; }
}

export function setSfx(on: boolean): void {
  enabled = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = ctx ?? new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx.state === 'closed' ? null : ctx;
  } catch {
    return null;
  }
}

interface Note { f: number; at: number; dur: number; gain?: number; type?: OscillatorType; }

function play(notes: Note[]): void {
  if (!sfxEnabled()) return;
  const c = audio();
  if (!c) return;
  const now = c.currentTime + 0.005;
  for (const n of notes) {
    const osc = c.createOscillator();
    osc.type = n.type ?? 'triangle';
    osc.frequency.value = n.f;
    const g = c.createGain();
    const peak = n.gain ?? 0.14;
    g.gain.setValueAtTime(0, now + n.at);
    g.gain.linearRampToValueAtTime(peak, now + n.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, now + n.at + n.dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now + n.at);
    osc.stop(now + n.at + n.dur + 0.02);
  }
}

const E5 = 659.25, G5 = 783.99, B5 = 987.77, C6 = 1046.5, E6 = 1318.5;
const A3 = 220, D3 = 146.83;

const VOICES: Record<Voice, Note[]> = {
  // Two notes up: heard as "yes" without being cloying.
  correct: [
    { f: E5, at: 0, dur: 0.10 },
    { f: B5, at: 0.065, dur: 0.16 },
  ],
  // Soft and low. Not a buzzer.
  wrong: [
    { f: A3, at: 0, dur: 0.13, gain: 0.10, type: 'sine' },
    { f: D3, at: 0.07, dur: 0.20, gain: 0.09, type: 'sine' },
  ],
  levelUp: [
    { f: E5, at: 0, dur: 0.12 },
    { f: G5, at: 0.08, dur: 0.12 },
    { f: B5, at: 0.16, dur: 0.12 },
    { f: E6, at: 0.24, dur: 0.34, gain: 0.16 },
  ],
  badge: [
    { f: C6, at: 0, dur: 0.09, gain: 0.11 },
    { f: E6, at: 0.06, dur: 0.09, gain: 0.11 },
    { f: B5, at: 0.12, dur: 0.22, gain: 0.12 },
  ],
  // Rises with the streak; pitch is set at call time.
  streak: [{ f: B5, at: 0, dur: 0.12, gain: 0.10 }],
  click: [{ f: 520, at: 0, dur: 0.035, gain: 0.05, type: 'sine' }],
};

export const sfx = {
  correct: () => play(VOICES.correct),
  wrong: () => play(VOICES.wrong),
  levelUp: () => play(VOICES.levelUp),
  badge: () => play(VOICES.badge),
  click: () => play(VOICES.click),
  /** Climbs a semitone per step so a long run audibly builds. */
  streak: (n: number) => play([
    { f: B5 * 2 ** (Math.min(n, 12) / 12), at: 0, dur: 0.12, gain: 0.10 },
  ]),
};
