import { LEVELS } from '../../curriculum/registry';
import { LevelId } from '../../curriculum/types';
import { Progress, isUnlocked, levelProgress } from '../../coach/progress';
import { activeLeaks } from '../../coach/dojo';
import { tagLabel } from '../../coach/mistakes';
import { Mode, cfg, levelLabel, rankFor, terms } from '../../coach/profile';
import { openingPercent, openingRange, QUOTED_PERCENT } from '../../engine/preflopChart';
import { CellMark, GridLegend, RangeGrid } from '../components/RangeGrid';
import { UpgradeButton } from '../components/Upgrade';
import { ShareButton } from '../components/Share';
import { BadgeShelf, RankBar } from '../components/Celebrate';

export function Home({
  progress, pro, mode, xp, badges, boardCount,
  onPick, onPlay, onTutorial, onDojo, onLab, onUpgrade, onShare, onBoard, onMode, onReset,
}: {
  progress: Progress;
  pro: boolean;
  mode: Mode;
  xp: number;
  badges: string[];
  boardCount: number;
  onPick: (id: LevelId) => void;
  onPlay: () => void;
  onTutorial: () => void;
  onDojo: () => void;
  onLab: () => void;
  onUpgrade: () => void;
  onShare: () => void;
  onBoard: () => void;
  onMode: () => void;
  onReset: () => void;
}) {
  const kid = mode === 'kid';
  const t = terms(mode);
  const leaks = activeLeaks(progress);
  const answered = progress.history.length;
  const right = progress.history.filter((r) => r.correct).length;
  const evLost = progress.history.reduce((s, r) => s + r.evLostBB, 0);
  const rank = rankFor(xp);
  const passMark = Math.round(cfg().passMark * 100);

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
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-4xl font-black tracking-tight text-emerald-50">
            {kid ? 'Card Club' : 'Poker Trainer'}
            {pro && <span className="ml-2 align-super text-sm font-bold text-amber-300">OMEGA</span>}
          </h1>
          <p className="mt-1 text-emerald-200/60">{t.tagline}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            onClick={onMode}
            className="btn-ghost text-xs"
            title="Settings — mode, felt, deck, sounds"
          >
            ⚙ {kid ? 'Kids' : 'Adults'}
          </button>
          {answered > 0 && <ShareButton onClick={onShare} label="Share" />}
          <UpgradeButton pro={pro} onClick={onUpgrade} />
        </div>
      </header>

      <RankBar state={rank} xp={xp} mode={mode} />

      {/* The front door: play something before you are asked to study anything. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        <button
          onClick={onPlay}
          className="panel group relative overflow-hidden border-emerald-400/50 bg-gradient-to-br
                     from-emerald-500/20 to-emerald-500/5 p-6 text-left transition
                     hover:-translate-y-0.5 hover:border-emerald-300/80"
        >
          <div className="text-4xl transition group-hover:scale-110">🎴</div>
          <div className="mt-2 text-2xl font-black text-emerald-50">
            {kid ? 'Play a hand' : 'Quick play'}
          </div>
          <p className="mt-1 text-sm text-emerald-100/70">
            {kid
              ? 'Jump straight in against three computer players. Hints are always on and nothing is scored.'
              : 'Six-max against the bots with the coach on. Nothing scored, no unlock needed.'}
          </p>
          <span className="mt-3 inline-block rounded-lg border border-emerald-400/50 bg-emerald-500/20
                           px-3 py-1.5 text-xs font-semibold text-emerald-100">
            Deal me in →
          </span>
        </button>

        <div className="grid gap-3">
          <button
            onClick={onDojo}
            disabled={leaks.length === 0}
            className="panel border-rose-500/30 px-4 py-3 text-left transition hover:border-rose-400/60
                       hover:bg-rose-500/5 disabled:opacity-35"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-emerald-50">
                {kid ? 'Practice Zone' : 'The Mistake Dojo'}
              </span>
              <span className="tnum text-sm text-rose-300">{leaks.length || '—'}</span>
            </div>
            <span className="mt-0.5 block text-xs text-emerald-200/55">
              {leaks.length
                ? `${tagLabel(leaks[0]!.tag, kid)}${kid ? '' : ` · ${leaks[0]!.bbPer100.toFixed(1)} bb/100`}`
                : kid ? 'Play a bit and this fills up' : 'Answer some drills and your leaks show up here'}
            </span>
          </button>

          <button
            onClick={onBoard}
            className="panel border-amber-400/25 px-4 py-3 text-left transition
                       hover:border-amber-300/60 hover:bg-amber-400/5"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-emerald-50">Leaderboard</span>
              <span className="tnum text-sm text-amber-300">{boardCount}</span>
            </div>
            <span className="mt-0.5 block text-xs text-emerald-200/55">
              {boardCount > 1
                ? `You and ${boardCount - 1} ${boardCount === 2 ? 'friend' : 'friends'}`
                : 'Add friends by opening their links'}
            </span>
          </button>
        </div>
      </div>

      <button
        onClick={onTutorial}
        className={`panel mt-3 flex w-full items-center gap-3 px-4 py-3 text-left transition
                    hover:border-emerald-400/60 hover:bg-emerald-500/5 ${
          answered === 0 ? 'border-emerald-400/50' : ''
        }`}
      >
        <span className="text-2xl">🎓</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-emerald-50">
            {answered === 0
              ? (kid ? 'Never played? Start here' : 'Never played poker? Start here')
              : (kid ? 'How the game works' : 'How poker works')}
          </span>
          <span className="block text-xs text-emerald-200/55">
            The whole game in a two-minute tour — no clock, no score
          </span>
        </span>
        <span className="text-emerald-300/50">→</span>
      </button>

      {answered > 0 && (
        <div className="panel mt-4 grid grid-cols-2 gap-px overflow-hidden bg-emerald-900/40 sm:grid-cols-4">
          <Stat label={kid ? 'Questions' : 'Drills answered'} value={String(answered)} />
          <Stat label={kid ? 'Got right' : 'Accuracy'} value={`${((right / answered) * 100).toFixed(0)}%`} />
          <Stat label="Badges" value={`${badges.length} / 12`} />
          {kid
            ? <Stat label="Levels passed" value={`${LEVELS.filter((l) => levelProgress(progress, l.id).completed).length} / 9`} />
            : <Stat label="EV given up" value={`${evLost.toFixed(1)} bb`} tone={evLost > 0 ? 'bad' : undefined} />}
        </div>
      )}

      <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-widest text-emerald-300/70">
        {kid ? 'Learn it step by step' : 'The curriculum'}
      </h2>
      <div className="space-y-2">
        {LEVELS.map((l) => {
          const lp = levelProgress(progress, l.id);
          const unlocked = isUnlocked(progress, l.id);
          const label = levelLabel(l.id, l.title, l.subtitle, mode);
          return (
            <button
              key={l.id}
              disabled={!unlocked}
              onClick={() => onPick(l.id)}
              className={`panel flex w-full items-center gap-4 px-4 py-3.5 text-left transition
                ${unlocked ? 'hover:border-emerald-500/60 hover:bg-emerald-500/5' : 'opacity-35'}`}
            >
              <span className="w-8 shrink-0 font-mono text-sm text-emerald-300/70">
                {unlocked ? l.id : '🔒'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-emerald-50">{label.title}</span>
                <span className="block text-sm text-emerald-200/55">{label.subtitle}</span>
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
                      {lp.completed ? '✓ passed' : `need ${passMark}%`}
                    </span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-300/70">
          {kid ? 'Your trophy shelf' : 'Badges'}
        </h2>
        <BadgeShelf earned={badges} mode={mode} />
      </section>

      {pro && (
        <button
          onClick={onLab}
          className="panel mt-4 w-full border-amber-400/40 px-4 py-3 text-left transition
                     hover:border-amber-300/70 hover:bg-amber-400/5"
        >
          <span className="font-semibold text-emerald-50">The Lab</span>
          <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-amber-300">Omega</span>
          <span className="mt-0.5 block text-sm text-emerald-200/55">
            Any hand, any range, any board — equity and EV on demand
          </span>
        </button>
      )}

      {marks.size > 0 && (
        <section className="panel mt-8 p-4">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-300/80">
            {kid ? 'Your hand map' : 'Your preflop grid'}
          </h2>
          <p className="mb-3 text-xs text-emerald-200/45">
            {kid
              ? 'Green is what the chart plays. Orange means you played one it folds; blue means you folded one it plays.'
              : 'Button baseline underneath, your L4 answers on top. The colour tells you the shape of the leak.'}
          </p>
          <div className="overflow-x-auto">
            <RangeGrid range={openingRange('BTN')} marks={marks} />
          </div>
          <GridLegend />
        </section>
      )}

      {!kid && (
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
      )}

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
