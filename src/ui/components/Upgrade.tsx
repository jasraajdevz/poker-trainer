import { useState } from 'react';
import { FEATURES, OWNER_NOTE, activate } from '../../coach/pro';

export function UpgradeButton({ pro, onClick }: { pro: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-lg border px-3.5 py-1.5 text-xs font-bold uppercase
        tracking-widest transition ${
        pro
          ? 'border-amber-300/70 bg-gradient-to-b from-amber-200/30 to-amber-500/20 text-amber-100 shadow-[0_0_20px_-4px_rgba(251,191,36,0.6)]'
          : 'border-amber-400/50 bg-gradient-to-b from-amber-300/15 to-amber-600/10 text-amber-200/90 hover:border-amber-300/80 hover:text-amber-100'
      }`}
    >
      <span
        className="pointer-events-none absolute inset-y-0 -left-full w-1/2 skew-x-12 bg-white/20
                   transition-all duration-700 group-hover:left-[150%]"
      />
      {pro ? '★ Omega active' : 'Upgraded mode'}
    </button>
  );
}

export function UpgradeModal({
  pro, onClose, onActivate, onDeactivate,
}: {
  pro: boolean;
  onClose: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const tryCode = () => {
    if (activate(code)) { setError(false); onActivate(); }
    else { setError(true); setCode(''); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="rise w-full max-w-xl overflow-hidden rounded-2xl border border-amber-400/40
                   bg-gradient-to-b from-[#12100a] to-[#07120e] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-amber-400/20 bg-amber-400/5 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-amber-100">
              {pro ? 'Omega mode is active' : 'Upgraded mode'}
            </h2>
            <button onClick={onClose} className="text-amber-200/40 hover:text-amber-100">✕</button>
          </div>
        </header>

        {!pro && (
          <div className="space-y-2 border-b border-amber-400/15 bg-black/30 px-6 py-5">
            {OWNER_NOTE.map((line, i) => (
              <p
                key={i}
                className={i === 0
                  ? 'text-sm font-semibold text-amber-200'
                  : i === OWNER_NOTE.length - 1
                    ? 'pt-1 font-mono text-xs uppercase tracking-widest text-amber-400/70'
                    : 'text-sm leading-relaxed text-emerald-100/80'}
              >
                {line}
              </p>
            ))}
          </div>
        )}

        <div className="max-h-[45vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0b1210] text-[11px] uppercase tracking-widest text-emerald-200/40">
              <tr>
                <th className="px-6 py-2 text-left font-medium"> </th>
                <th className="px-3 py-2 text-left font-medium">This version</th>
                <th className="px-6 py-2 text-left font-medium text-amber-300/70">Omega</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/40">
              {FEATURES.map((f) => (
                <tr key={f.name}>
                  <td className="px-6 py-2.5 font-medium text-emerald-100">{f.name}</td>
                  <td className="px-3 py-2.5 text-emerald-200/55">{f.free}</td>
                  <td className="px-6 py-2.5 text-amber-200/90">{f.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="border-t border-amber-400/20 bg-black/40 px-6 py-4">
          {pro ? (
            <div className="flex items-center justify-between">
              <p className="text-xs text-emerald-200/50">
                Every panel is running at full precision. Nemesis and the Lab are unlocked.
              </p>
              <button onClick={onDeactivate} className="btn-ghost text-xs">Deactivate</button>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-amber-200/50">
                Owner code
              </label>
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); tryCode(); }}
              >
                <input
                  value={code}
                  autoFocus
                  onChange={(e) => { setCode(e.target.value); setError(false); }}
                  placeholder="————————"
                  className={`flex-1 rounded-lg border bg-black/50 px-3 py-2 font-mono text-sm tracking-[0.3em]
                    text-amber-100 outline-none placeholder:tracking-widest placeholder:text-amber-200/20
                    ${error ? 'border-rose-500/70' : 'border-amber-400/30 focus:border-amber-300/70'}`}
                />
                <button type="submit" className="btn border-amber-400/50 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25">
                  Unlock
                </button>
              </form>
              <p className={`mt-2 text-xs ${error ? 'text-rose-300' : 'text-emerald-200/40'}`}>
                {error
                  ? 'Not the code.'
                  : 'Without it everything above on the left still works, and every number is still real.'}
              </p>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
