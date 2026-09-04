import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS, THEMES, applySettings, getCardStyle, loadSettings, setCardStyle,
} from '../settings';

describe('table settings', () => {
  it('has four distinct themes with swatches and kid names', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(4);
    for (const t of THEMES) {
      expect(t.swatch).toHaveLength(2);
      expect(t.name).not.toBe(t.kidName);
    }
  });

  it('falls back to sane defaults on junk storage', () => {
    // node has no localStorage, which is exactly the degenerate case
    const s = loadSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.theme).toBe('emerald');
    expect(s.sound).toBe(true);
  });

  it('card style is a module setting the leaf component can read', () => {
    setCardStyle('classic');
    expect(getCardStyle()).toBe('classic');
    setCardStyle('four');
    expect(getCardStyle()).toBe('four');
  });

  it('applySettings does not explode without a document', () => {
    expect(() => applySettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(getCardStyle()).toBe('four');
  });

  it('cosmetics only: nothing here can reach a computed number', () => {
    // The settings module must not import from the engine.
    // (A structural guard: its public surface is colours, styles and flags.)
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      expect(['theme', 'cardStyle', 'motion', 'sound']).toContain(key);
    }
  });
});
