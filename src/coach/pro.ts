/**
 * pro.ts — the upgraded tier.
 *
 * The unlock code is not stored in the source. Only an FNV-1a hash of the
 * normalised code is, and the entered text is hashed and compared. That keeps
 * the code out of the bundle for anyone reading the JavaScript casually; it is
 * obfuscation, not cryptography, and a determined reader of client-side code
 * can always work around it. There is no server to check against by design.
 *
 * What the tier changes is REAL: more Monte Carlo samples, wider exact
 * enumeration, extra computed panels, an adapting opponent, and the Lab. It
 * does not unlock different opinions — the maths is the same maths.
 */

const KEY = 'poker-trainer:tier';
const CODE_HASH = 2599198427;

function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const normalise = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function codeIsValid(input: string): boolean {
  return fnv1a(normalise(input)) === CODE_HASH;
}

export function readTier(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try { return localStorage.getItem(KEY) === String(CODE_HASH); } catch { return false; }
}

export function activate(input: string): boolean {
  if (!codeIsValid(input)) return false;
  try { localStorage.setItem(KEY, String(CODE_HASH)); } catch { /* private mode */ }
  return true;
}

export function deactivate(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Simulation budget. The upgraded tier simply buys more certainty. */
export function budget(pro: boolean): { iterations: number; exactThreshold: number } {
  return pro
    ? { iterations: 250_000, exactThreshold: 3_000_000 }
    : { iterations: 25_000, exactThreshold: 200_000 };
}

export interface FeatureRow { name: string; free: string; pro: string; }

export const FEATURES: FeatureRow[] = [
  { name: 'Levels L0–L8', free: 'All nine, full feedback', pro: 'All nine' },
  { name: 'Equity precision', free: '25k samples, ±0.6 pts', pro: '250k samples + exact enumeration, ±0.2 pts' },
  { name: 'Mistake Dojo', free: 'Top 3 leaks, spaced repetition', pro: 'Full leaderboard, bb/100 projection, Boss Fights' },
  { name: 'Opponents', free: 'Nit, Station, TAG', pro: '+ Nemesis: reads your logged leaks and attacks them' },
  { name: 'Hand review', free: 'EV lost per decision, bot reasoning', pro: '+ EV of every alternative sizing at every node' },
  { name: 'The Lab', free: '—', pro: 'Any hand, any range, any board — equity and EV on demand' },
  { name: 'Export', free: '—', pro: 'Full history as JSON' },
];

export const OWNER_NOTE = [
  'Hi. This is the owner.',
  "I didn't want any competition, so I kept the good version for myself — but I was kind enough to give you this one, and this one is genuinely good. Every number in it is computed, nothing is faked, and it will make you better.",
  'The code stays hidden.',
];
