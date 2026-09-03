/**
 * admin.ts — the owner's back door.
 *
 * Gated behind the same code as Omega. It lets whoever holds the code edit any
 * row on their own leaderboard, including their own, and keep that edit as an
 * override so it travels in every link they share afterwards.
 *
 * Two things that are true and that the panel says out loud:
 *
 *  - This changes nothing for anyone else until you share a link. Everything
 *    here is local to this browser.
 *  - It is not a new power. A score lives in the URL fragment in plain sight;
 *    anyone with a console can already rewrite one. This is the comfortable
 *    version of a thing the format never protected against, which is why the
 *    app has always told recipients that a link is a boast, not a receipt.
 */

import { SharedScore, cleanName } from './share';

const ADMIN_KEY = 'poker-trainer:admin';
const OVERRIDE_KEY = 'poker-trainer:override';

/** Fields the owner is allowed to rewrite. */
export type EditableField = 'n' | 'd' | 'a' | 'l' | 'e' | 't';

export interface FieldSpec {
  key: EditableField;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Shown in the input, e.g. "%" or "bb". */
  unit?: string;
  /** Editing help, since some of these are stored oddly. */
  hint?: string;
}

export const FIELDS: FieldSpec[] = [
  { key: 'l', label: 'Levels passed', min: 0, max: 9, step: 1 },
  { key: 'a', label: 'Accuracy', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'd', label: 'Drills', min: 0, max: 100_000, step: 10 },
  { key: 'e', label: 'EV given up', min: 0, max: 100_000, step: 1, unit: 'bb', hint: 'total, not per 100' },
  { key: 't', label: 'Median read', min: 0, max: 600_000, step: 100, unit: 'ms' },
];

export type Override = Partial<Pick<SharedScore, EditableField | 'k'>>;

// ---------------------------------------------------------------------------
// Toggle and override storage
// ---------------------------------------------------------------------------

export function adminEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try { return localStorage.getItem(ADMIN_KEY) === '1'; } catch { return false; }
}

export function setAdmin(on: boolean): void {
  try {
    if (on) localStorage.setItem(ADMIN_KEY, '1');
    else localStorage.removeItem(ADMIN_KEY);
  } catch { /* private mode */ }
}

export function loadOverride(): Override | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Override) : null;
  } catch {
    return null;
  }
}

export function saveOverride(o: Override | null): void {
  try {
    if (o && Object.keys(o).length > 0) localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o));
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch { /* private mode */ }
}

/** Keep an edited value inside the range the rest of the app can render. */
export function sanitiseField(key: EditableField, value: string | number): string | number {
  if (key === 'n') return cleanName(String(value));
  const spec = FIELDS.find((f) => f.key === key)!;
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n)) return spec.min;
  const clamped = Math.min(spec.max, Math.max(spec.min, n));
  return key === 'e' ? Math.round(clamped * 10) / 10 : Math.round(clamped);
}

export function applyOverride(real: SharedScore, o: Override | null): SharedScore {
  if (!o) return real;
  const out: SharedScore = { ...real };
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    if (k === 'k') { out.k = v as SharedScore['k']; continue; }
    if (k === 'n') { out.n = cleanName(String(v)) || out.n; continue; }
    if (FIELDS.some((f) => f.key === k)) {
      (out as unknown as Record<string, unknown>)[k] = sanitiseField(k as EditableField, v as number);
    }
  }
  return out;
}

/** Has the owner actually changed anything, or is the override empty? */
export const isOverridden = (o: Override | null): boolean =>
  !!o && Object.keys(o).length > 0;

// ---------------------------------------------------------------------------
// The fun part
// ---------------------------------------------------------------------------

/**
 * Numbers that top the table without looking absurd. Beating the leader by a
 * hair is far more convincing than a flawless nine-level 100% run, so this
 * edges past whoever is currently ahead on each measure rather than maxing out.
 */
export function beatTheBoard(others: SharedScore[], me: SharedScore): Override {
  if (others.length === 0) {
    return { l: Math.min(9, me.l + 1), a: Math.min(100, Math.max(me.a, 85)) };
  }
  const bestLevels = Math.max(...others.map((s) => s.l));
  const bestAcc = Math.max(...others.map((s) => s.a));
  const mostDrills = Math.max(...others.map((s) => s.d));
  // Lower is better on these two; ignore anyone who has no time recorded.
  const timed = others.map((s) => s.t).filter((t) => t > 0);
  const bestTime = timed.length ? Math.min(...timed) : me.t;
  const bestEvPer100 = Math.min(
    ...others.map((s) => (s.d > 0 ? (s.e / s.d) * 100 : Number.MAX_SAFE_INTEGER)),
  );

  const drills = Math.max(me.d, Math.round(mostDrills * 1.05) + 10);
  const targetEvPer100 = Number.isFinite(bestEvPer100) ? Math.max(0, bestEvPer100 - 0.4) : 0;

  return {
    l: Math.min(9, Math.max(me.l, bestLevels + 1)),
    a: Math.min(99, Math.max(me.a, bestAcc + 2)),
    d: drills,
    e: Math.round((targetEvPer100 / 100) * drills * 10) / 10,
    t: Math.max(600, (bestTime > 0 ? bestTime : 2000) - 150),
  };
}

/** Undo everything and go back to the real numbers. */
export const clearOverride = (): Override | null => null;
