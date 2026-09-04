/**
 * settings.ts — how the table looks and sounds, chosen by the player.
 *
 * Themes are CSS custom properties stamped on <html> as data attributes, so
 * the whole app recolours without a re-render. Everything here is cosmetic:
 * nothing in this file may change a computed number.
 */

export type ThemeId = 'emerald' | 'midnight' | 'crimson' | 'royal';
export type CardStyle = 'four' | 'classic';
export type MotionLevel = 'full' | 'calm';

export interface Settings {
  theme: ThemeId;
  cardStyle: CardStyle;
  motion: MotionLevel;
  sound: boolean;
  /**
   * Show the clock during drills. OFF by default: speed is recorded quietly
   * for the trend and the Lightning badge, but it is information, never a
   * score — nothing in the app ever fails you for being slow.
   */
  timer: boolean;
}

export interface ThemeDef {
  id: ThemeId;
  name: string;
  kidName: string;
  /** Swatch colours for the picker. */
  swatch: [string, string];
}

export const THEMES: ThemeDef[] = [
  { id: 'emerald', name: 'Emerald Club', kidName: 'Forest', swatch: ['#0e4531', '#04140f'] },
  { id: 'midnight', name: 'Midnight Blue', kidName: 'Ocean', swatch: ['#14406b', '#050d1a'] },
  { id: 'crimson', name: 'Crimson Room', kidName: 'Volcano', swatch: ['#5c1420', '#160507'] },
  { id: 'royal', name: 'Royal Purple', kidName: 'Galaxy', swatch: ['#3b1a63', '#0e0618'] },
];

export const DEFAULT_SETTINGS: Settings = {
  theme: 'emerald',
  cardStyle: 'four',
  motion: 'full',
  sound: true,
  timer: false,
};

const KEY = 'poker-trainer:settings';

export function loadSettings(): Settings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      theme: THEMES.some((t) => t.id === p.theme) ? (p.theme as ThemeId) : DEFAULT_SETTINGS.theme,
      cardStyle: p.cardStyle === 'classic' ? 'classic' : 'four',
      motion: p.motion === 'calm' ? 'calm' : 'full',
      sound: p.sound !== false,
      timer: p.timer === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/**
 * Card colouring is read inside a leaf component rendered hundreds of times,
 * so like the mode it is a module-level setting rather than threaded props.
 */
let activeCardStyle: CardStyle = 'four';
export const getCardStyle = (): CardStyle => activeCardStyle;
export const setCardStyle = (c: CardStyle): void => { activeCardStyle = c; };

/** Stamp the cosmetic state onto <html> so CSS picks it up everywhere. */
export function applySettings(s: Settings): void {
  setCardStyle(s.cardStyle);
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.dataset.motion = s.motion;
}
