import { useMemo, useState } from 'react';
import { Drill, LevelModule } from '../../curriculum/types';
import { Progress } from '../../coach/progress';
import { BOSS_PASS, Leak, activeLeaks, bossFight, dojoSession, dueLeaks } from '../../coach/dojo';
import { ErrorTag, SR_INTERVALS, tagFix, tagLabel } from '../../coach/mistakes';

/** Wrap a fixed list of drills so the normal level runner can play them. */
export function makeDrillPack(id: string, title: string, subtitle: string, drills: Drill[]): LevelModule {
  return {
    id: 'L0', title, subtitle, drillCount: drills.length,
    lesson: { body: [subtitle] },
    generate: (i) => drills[i % drills.length]!,
    tracksTime: false,
    ...({ packId: id } as object),
  };
}

export function DojoView({
  progress, pro, kid = false, onRun, onExit,
}: {
  progress: Progress;
  pro: boolean;
  kid?: boolean;
  onRun: (level: LevelModule, boss?: ErrorTag) => void;
  onExit: () => void;
}) {
  const [seed] = useState(() => `d${Date.now()}`);
  const leaks = useMemo(() => activeLeaks(progress), [progress]);
  const due = useMemo(() => dueLeaks(progress), [progress]);
  const shown = pro ? leaks : leaks.slice(0, 3);
  const totalCost = leaks.reduce((s, l) => s + l.bbPer100, 0);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <button onClick={onExit} className="mb-6 text-xs text-emerald-300/60 hover:text-emerald-200">
        ← All levels
      </button>
      <h1 className="text-3xl font-bold tracking-tight text-emerald-50">
        {kid ? 'Practice Zone' : 'The Mistake Dojo'}
      </h1>
      <p className="mt-1 text-emerald-200/60">
        {kid
          ? 'The things to practise, biggest first. Beat them and they go away.'
          : 'Ranked by what each leak actually cost you, projected per 100 hands.'}
      </p>

      {leaks.length === 0 ? (
        <p className="panel mt-6 p-6 text-sm text-emerald-200/60">
          Nothing logged yet. Play a level and every wrong answer lands here with the reason it was wrong.
        </p>
      ) : (
        <>
          <div className="panel mt-6 grid grid-cols-3 gap-px overflow-hidden bg-emerald-900/40">
            <Cell label={kid ? 'To practise' : 'Open leaks'} value={String(leaks.length)} />
            {kid
              ? <Cell label="Times missed" value={String(leaks.reduce((n, l) => n + l.occurrences, 0))} tone="bad" />
              : <Cell label="Combined cost" value={`${totalCost.toFixed(1)} bb/100`} tone="bad" />}
            <Cell label={kid ? 'Ready to retry' : 'Due for review'} value={String(due.length)} />
          </div>

          <button
            onClick={() => onRun(makeDrillPack(
              'dojo', 'Dojo session', 'Fresh spots built from your top three leaks',
              dojoSession(progress, seed, 10),
            ))}
            className="btn-primary mt-4 w-full py-3"
          >
            Drill my top {Math.min(3, leaks.length)} leaks — 10 new spots
          </button>

          <div className="mt-6 space-y-2">
            {shown.map((l) => (
              <LeakRow
                key={l.tag}
                leak={l}
                kid={kid}
                pro={pro}
                onBoss={() => onRun(
                  makeDrillPack('boss', `Boss Fight — ${l.label}`,
                    `Ten spots built entirely from this leak. ${BOSS_PASS} of 10 clears it.`,
                    bossFight(l.tag, seed)),
                  l.tag,
                )}
              />
            ))}
          </div>

          {!pro && leaks.length > 3 && (
            <p className="mt-4 text-center text-xs text-amber-200/50">
              {leaks.length - 3} more leak{leaks.length - 3 === 1 ? '' : 's'} tracked. Boss Fights and the
              full leaderboard are in upgraded mode.
            </p>
          )}

          {pro && (
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `poker-trainer-history-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
              className="btn mt-4 w-full border-amber-400/40 bg-amber-400/10 py-2 text-xs text-amber-200 hover:bg-amber-400/20"
            >
              Export full history as JSON
            </button>
          )}

          <p className="mt-6 text-xs leading-relaxed text-emerald-200/40">
            Spaced repetition: a mistake comes back after {SR_INTERVALS.join(', then ')} drills. It only
            leaves the queue after a clean answer at every interval. Failing it again resets the ladder.
          </p>
        </>
      )}
    </div>
  );
}

function LeakRow({ leak, kid, pro, onBoss }: { leak: Leak; kid: boolean; pro: boolean; onBoss: () => void }) {
  return (
    <div className={`panel px-4 py-3 ${leak.due ? 'border-amber-500/40' : ''}`}>
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-rose-200">{tagLabel(leak.tag, kid)}</span>
            <span className="font-mono text-[10px] text-emerald-200/30">{leak.level}</span>
            {leak.due && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                due
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-emerald-200/55">{tagFix(leak.tag, kid)}</div>
          <div className="mt-1 text-[11px] text-emerald-200/35">{leak.stageLabel}</div>
        </div>
        <div className="tnum shrink-0 text-right">
          {kid ? (
            <>
              <div className="text-lg font-bold text-rose-300">{leak.occurrences}×</div>
              <div className="text-[10px] uppercase tracking-wide text-emerald-200/40">missed</div>
            </>
          ) : (
            <>
              <div className="text-lg font-bold text-rose-300">{leak.bbPer100.toFixed(1)}</div>
              <div className="text-[10px] uppercase tracking-wide text-emerald-200/40">bb / 100</div>
              <div className="mt-0.5 text-[11px] text-emerald-200/45">{leak.occurrences}x</div>
            </>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-emerald-950">
          <div
            className="h-full bg-amber-400"
            style={{ width: `${(leak.stage / SR_INTERVALS.length) * 100}%` }}
          />
        </div>
        <button
          onClick={onBoss}
          disabled={!pro}
          className={`shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
            pro
              ? 'border-amber-400/50 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20'
              : 'border-emerald-900 text-emerald-200/30'
          }`}
          title={pro ? 'Ten spots from this leak alone' : 'Boss Fights are in upgraded mode'}
        >
          Boss Fight {pro ? '' : '🔒'}
        </button>
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="bg-black/30 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-emerald-200/50">{label}</div>
      <div className={`tnum mt-0.5 text-xl font-bold ${tone === 'bad' ? 'text-rose-300' : 'text-emerald-50'}`}>
        {value}
      </div>
    </div>
  );
}
