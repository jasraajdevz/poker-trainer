import { LEVELS } from '../../curriculum/registry';
import { LevelId, PASS_MARK } from '../../curriculum/types';
import { Progress, isUnlocked, levelProgress } from '../../coach/progress';
import { activeLeaks } from '../../coach/dojo';
import { openingPercent, openingRange, QUOTED_PERCENT } from '../../engine/preflopChart';
import { CellMark, GridLegend, RangeGrid } from '../components/RangeGrid';
import { UpgradeButton } from '../components/Upgrade';

export function Home({
  progress, pro, onPick, onDojo, onLab, onUpgrade, onReset,
}: {
  progress: Progress;
  pro: boolean;
  onPick: (id: LevelId) => void;
  onDojo: () => void;
  onLab: () => void;
  onUpgrade: () => void;
  onReset: () => void;
}) {
  const leaks = activeLeaks(progress);
  const answered = progress.history.length;
  const right = progress.history.filter((r) => r.correct).length;
  const evLost = progress.history.reduce((s, r) => s + r.evLostBB, 0);

  const marks = new Map<number, CellMark>();
  for (const r of progress.history) {
    const hc = r.meta?.['handClassIndex'];
    if (typeof hc !== 'number') continue;
    const m = marks.get(hc) ?? { loose: 0, tight: 0, right: 0 };
    if (r.correct) m.right++;
    else if (r.meta?.['given'] === 'open') m.loose++;
    else m.tight++;
    marks.set(hc, m);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-emerald-50">
            Poker Trainer{pro && <span className="ml-2 align-super text-sm font-bold text-amber-300">OMEGA</span>}
          </h1>
          <p className="mt-1 text-emerald-200/60">
            No-Limit Hold'em · 6-max cash · 100bb. Every number it shows you, it computed.
          </p>
        </div>
        <UpgradeButton pro={pro} onClick={onUpgrade} />
      </header>

      {answered > 0 && (
        <div className="panel mb-6 grid grid-cols-2 gap-px overflow-hidden bg-emerald-900/40 sm:grid-cols-4">
          <Stat label="Drills answered" value={String(answered)} />
          <Stat label="Accuracy" value={`${((right / answered) * 100).toFixed(0)}%`} />
          <Stat label="Open leaks" value={String(leaks.length)} />
          <Stat label="EV given up" value={`${evLost.toFixed(1)} bb`} tone={evLost > 0 ? 'bad' : undefined} />
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <button
          onClick={onDojo}
          disabled={leaks.length === 0}
          className="panel border-rose-500/30 px-4 py-3.5 text-left transition hover:border-rose-400/60
                     hover:bg-rose-500/5 disabled:opacity-35 disabled:hover:border-rose-500/30"
        >
          <div className="flex items-baseline justify-between">
            <span className="font-semibold text-emerald-50">The Mistake Dojo</span>
            <span className="tnum text-sm text-rose-300">{leaks.length || '—'}</span>
          </div>
          <span className="mt-0.5 block text-sm text-emerald-200/55">
            {leaks.length
              ? `Top leak: ${leaks[0]!.label} · ${leaks[0]!.bbPer100.toFixed(1)} bb/100`
              : 'Answer some drills and your leaks show up here'}
          </span>
        </button>

        <button
          onClick={onLab}
          disabled={!pro}
          className={`panel px-4 py-3.5 text-left transition ${
            pro ? 'border-amber-400/40 hover:border-amber-300/70 hover:bg-amber-400/5' : 'opacity-35'
          }`}
        >
          <div className="flex items-baseline justify-between">
            <span className="font-semibold text-emerald-50">The Lab</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Omega</span>
          </div>
          <span className="mt-0.5 block text-sm text-emerald-200/55">
            Any hand, any range, any board — equity and EV on demand
          </span>
        </button>
      </div>

      <div className="space-y-2">
        {LEVELS.map((l) => {
          const lp = levelProgress(progress, l.id);
          const unlocked = isUnlocked(progress, l.id);
          return (
            <button
              key={l.id}
              disabled={!unlocked}
              onClick={() => onPick(l.id)}
              className={`panel flex w-full items-center gap-4 px-4 py-3.5 text-left transition
                ${unlocked ? 'hover:border-emerald-500/60 hover:bg-emerald-500/5' : 'opacity-35'}`}
            >
              <span className="w-8 shrink-0 font-mono text-sm text-emerald-300/70">{l.id}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-emerald-50">{l.title}</span>
                <span className="block text-sm text-emerald-200/55">{l.subtitle}</span>
              </span>
              <span className="tnum shrink-0 text-right text-sm">
                {lp.attempts.length === 0 ? (
                  <span className="text-emerald-200/40">{unlocked ? 'Start' : 'Locked'}</span>
                ) : (
                  <>
                    <span className={lp.completed ? 'text-emerald-300' : 'text-amber-300'}>
                      {(lp.bestAccuracy * 100).toFixed(0)}%
                    </span>
                    <span className="block text-[11px] text-emerald-200/40">
                      {lp.completed ? 'passed' : `need ${PASS_MARK * 100}%`}
                    </span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {marks.size > 0 && (
        <section className="panel mt-8 p-4">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-300/80">
            Your preflop grid
          </h2>
          <p className="mb-3 text-xs text-emerald-200/45">
            Button baseline underneath, your L4 answers on top. The colour tells you the shape of the leak.
          </p>
          <div className="overflow-x-auto">
            <RangeGrid range={openingRange('BTN')} marks={marks} />
          </div>
          <GridLegend />
        </section>
      )}

      <section className="panel mt-6 p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-300/80">
          The baseline chart, measured
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-emerald-200/50">
          The opening ranges are the one piece of hardcoded poker knowledge here — a simplified
          learning chart, not solver output. The percentages printed beside them do not match the
          ranges themselves, so this shows what the notation actually counts.
        </p>
        <div className="grid grid-cols-5 gap-px overflow-hidden rounded-lg bg-emerald-900/40 text-center">
          {(['UTG', 'HJ', 'CO', 'BTN', 'SB'] as const).map((p) => (
            <div key={p} className="bg-black/30 px-2 py-2.5">
              <div className="text-[11px] uppercase tracking-wide text-emerald-200/50">{p}</div>
              <div className="tnum text-lg font-bold text-emerald-100">{openingPercent(p).toFixed(1)}%</div>
              <div className="tnum text-[10px] text-emerald-200/35">chart says ~{QUOTED_PERCENT[p]}%</div>
            </div>
          ))}
        </div>
      </section>

      {answered > 0 && (
        <button onClick={onReset} className="mt-8 text-xs text-emerald-200/30 hover:text-rose-300">
          Reset all progress
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="bg-black/30 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-emerald-200/50">{label}</div>
      <div className={`tnum mt-0.5 text-xl font-bold ${tone === 'bad' ? 'text-rose-300' : 'text-emerald-50'}`}>
        {value}
      </div>
    </div>
  );
}
