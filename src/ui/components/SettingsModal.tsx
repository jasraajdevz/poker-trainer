import { useState } from 'react';
import { Mode } from '../../coach/profile';
import {
  CardStyle, MotionLevel, Settings, THEMES, ThemeId, applySettings, saveSettings,
} from '../../coach/settings';
import { setSfx } from '../../audio/sfx';
import { saveName } from '../../coach/share';

export function SettingsModal({
  settings, mode, name, onSettings, onMode, onName, onReset, onClose,
}: {
  settings: Settings;
  mode: Mode;
  name: string;
  onSettings: (s: Settings) => void;
  onMode: (m: Mode) => void;
  onName: (n: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const kid = mode === 'kid';
  const [confirming, setConfirming] = useState(false);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    applySettings(next);
    saveSettings(next);
    if (patch.sound !== undefined) setSfx(patch.sound);
    onSettings(next);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="rise max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[#0a0f0d] shadow-2xl"
        style={{ borderColor: 'var(--line)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="sticky top-0 flex items-center justify-between border-b bg-[#0a0f0d] px-5 py-3"
          style={{ borderColor: 'var(--line)' }}
        >
          <h2 className="font-bold tracking-tight text-emerald-50">Settings</h2>
          <button onClick={onClose} className="text-emerald-200/40 hover:text-emerald-100">✕</button>
        </header>

        <div className="space-y-5 px-5 py-4">
          <Row label="Who's playing">
            <Segmented
              value={mode}
              options={[
                { key: 'kid', label: '⭐ Kids' },
                { key: 'adult', label: '♠ Adults' },
              ]}
              onPick={(k) => onMode(k as Mode)}
            />
          </Row>

          <Row label="Your name">
            <input
              value={name}
              onChange={(e) => { onName(e.target.value); saveName(e.target.value); }}
              placeholder="Anonymous"
              maxLength={24}
              className="w-full rounded-lg border border-emerald-700/50 bg-black/40 px-3 py-2 text-sm
                         text-emerald-50 outline-none focus:border-emerald-400"
            />
          </Row>

          <Row label={kid ? 'Table colour' : 'Table felt'}>
            <div className="grid grid-cols-4 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => update({ theme: t.id as ThemeId })}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 transition ${
                    settings.theme === t.id
                      ? 'border-amber-300/70 bg-amber-400/10'
                      : 'border-transparent hover:border-emerald-700'
                  }`}
                >
                  <span
                    className="h-9 w-full rounded-lg shadow-inner"
                    style={{ background: `radial-gradient(80% 80% at 50% 20%, ${t.swatch[0]}, ${t.swatch[1]})` }}
                  />
                  <span className="text-[11px] text-emerald-100/75">{kid ? t.kidName : t.name}</span>
                </button>
              ))}
            </div>
          </Row>

          <Row label="Deck">
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'four', label: 'Four colours', note: 'faster to read' },
                { key: 'classic', label: 'Classic', note: 'red and black' },
              ] as const).map((d) => (
                <button
                  key={d.key}
                  onClick={() => update({ cardStyle: d.key as CardStyle })}
                  className={`flex items-center gap-3 rounded-xl border p-2.5 transition ${
                    settings.cardStyle === d.key
                      ? 'border-amber-300/70 bg-amber-400/10'
                      : 'border-emerald-900/60 hover:border-emerald-700'
                  }`}
                >
                  {/* Live preview: the component itself, at the chosen style. */}
                  <DeckPreview style={d.key} />
                  <span className="text-left">
                    <span className="block text-sm font-semibold text-emerald-50">{d.label}</span>
                    <span className="block text-[11px] text-emerald-200/50">{d.note}</span>
                  </span>
                </button>
              ))}
            </div>
          </Row>

          <Row label="Effects">
            <Segmented
              value={settings.motion}
              options={[
                { key: 'full', label: kid ? '✨ Full sparkle' : 'Full' },
                { key: 'calm', label: kid ? '🌙 Calm' : 'Calm' },
              ]}
              onPick={(k) => update({ motion: k as MotionLevel })}
            />
            <p className="mt-1.5 text-[11px] text-emerald-200/45">
              Calm keeps every feature and removes the movement.
            </p>
          </Row>

          <Row label="Timer">
            <Segmented
              value={settings.timer ? 'show' : 'hide'}
              options={[
                { key: 'hide', label: 'Hidden' },
                { key: 'show', label: 'Shown' },
              ]}
              onPick={(k) => update({ timer: k === 'show' })}
            />
            <p className="mt-1.5 text-[11px] text-emerald-200/45">
              Nothing is ever timed against you. The clock is information for people who want it.
            </p>
          </Row>

          <Row label="Sounds">
            <Segmented
              value={settings.sound ? 'on' : 'off'}
              options={[
                { key: 'on', label: '🔊 On' },
                { key: 'off', label: '🔇 Off' },
              ]}
              onPick={(k) => update({ sound: k === 'on' })}
            />
          </Row>

          <div className="border-t pt-4" style={{ borderColor: 'var(--line)' }}>
            {confirming ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-rose-200">
                  Wipe all progress, badges and XP? This cannot be undone.
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    onClick={() => { onReset(); setConfirming(false); onClose(); }}
                    className="btn border-rose-400/60 bg-rose-500/20 px-3 py-1.5 text-xs text-rose-100"
                  >
                    Wipe it
                  </button>
                  <button onClick={() => setConfirming(false)} className="btn-ghost px-3 py-1.5 text-xs">
                    Keep it
                  </button>
                </span>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="text-xs text-emerald-200/35 hover:text-rose-300"
              >
                Reset all progress
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Two mini cards painted with the exact colour classes each deck uses. Painted
 * by hand because the real component reads the CURRENT module setting, and a
 * preview must show the other option too.
 */
function DeckPreview({ style }: { style: CardStyle }) {
  const heartCls = 'text-rose-600';
  const clubCls = style === 'four' ? 'text-emerald-700' : 'text-zinc-900';
  return (
    <span className="flex shrink-0" aria-hidden>
      <span className="card-face flex h-10 w-7 items-center justify-center rounded-md">
        <span className={`text-base ${heartCls}`}>♥</span>
      </span>
      <span className="card-face -ml-2 flex h-10 w-7 items-center justify-center rounded-md">
        <span className={`text-base ${clubCls}`}>♣</span>
      </span>
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-emerald-300/70">
        {label}
      </div>
      {children}
    </div>
  );
}

function Segmented({
  value, options, onPick,
}: {
  value: string;
  options: Array<{ key: string; label: string }>;
  onPick: (k: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-black/40 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onPick(o.key)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            value === o.key
              ? 'bg-emerald-500/25 text-emerald-100 shadow'
              : 'text-emerald-200/50 hover:text-emerald-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
