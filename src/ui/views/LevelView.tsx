import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DrillAnswers, DrillFeedback, LevelModule } from '../../curriculum/types';
import { DrillResult, median } from '../../coach/progress';
import { tagFix, tagLabel } from '../../coach/mistakes';
import { CoachPanel } from '../components/CoachPanel';
import { PokerTable } from '../components/Table';
import { ShareButton } from '../components/Share';
import { Verdict } from '../components/Celebrate';
import { Mode, cfg, levelLabel, praise, xpForDrill } from '../../coach/profile';
import { sfx } from '../../audio/sfx';

interface Props {
  level: LevelModule;
  timeTrend: number[];
  pro: boolean;
  mode: Mode;
  /** Show the clock. Timing is still recorded quietly either way. */
  showTimer: boolean;
  /** Report XP earned and the streak it landed on. */
  onScored: (xp: number, streak: number) => void;
  /** Extra copy shown on the summary, e.g. a Boss Fight verdict. */
  bossLabel?: string;
  onResult: (r: DrillResult) => void;
  onFinish: (correct: number, total: number) => void;
  onShare: (correct: number, total: number, medianMs: number) => void;
  onExit: () => void;
}

export function LevelView({
  level, timeTrend, pro, mode, showTimer, bossLabel, onScored, onResult, onFinish, onShare, onExit,
}: Props) {
  const PASS = cfg().passMark;
  const label = levelLabel(level.id, level.title, level.subtitle, mode);
  // Times are always recorded for the trend and the Lightning badge; the
  // clock is only DRAWN when the player asked for it in settings.
  const showClock = !!level.tracksTime && showTimer;
  const [streak, setStreak] = useState(0);
  const [gained, setGained] = useState(0);
  const [attemptSeed, setAttemptSeed] = useState(() => `a${Date.now()}`);
  const [phase, setPhase] = useState<'lesson' | 'running' | 'summary'>('lesson');
  const [index, setIndex] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<DrillAnswers>({});
  const [feedback, setFeedback] = useState<DrillFeedback | null>(null);
  const [results, setResults] = useState<DrillResult[]>([]);
  const [numInput, setNumInput] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const drill = useMemo(
    () => (phase === 'running' ? level.generate(index, attemptSeed, pro ? 120_000 : undefined) : null),
    [level, index, attemptSeed, phase, pro],
  );
  const step = drill && !feedback ? drill.steps[stepIdx] : undefined;

  // Reset the clock whenever a new drill appears.
  useEffect(() => {
    if (phase !== 'running') return;
    startRef.current = performance.now();
    setElapsed(0);
    setStepIdx(0);
    setAnswers({});
    setFeedback(null);
    setNumInput('');
  }, [index, phase, attemptSeed]);

  useEffect(() => {
    if (!showClock || phase !== 'running' || feedback) return;
    const t = setInterval(() => setElapsed(performance.now() - startRef.current), 100);
    return () => clearInterval(t);
  }, [showClock, phase, feedback, index]);

  useEffect(() => { if (step?.kind === 'number') inputRef.current?.focus(); }, [step, index]);

  const submit = useCallback((next: DrillAnswers) => {
    if (!drill) return;
    if (stepIdx + 1 < drill.steps.length) {
      setAnswers(next);
      setStepIdx(stepIdx + 1);
      setNumInput('');
      return;
    }
    const ms = performance.now() - startRef.current;
    const f = drill.grade(next);
    const run = f.correct ? streak + 1 : 0;
    const fast = !!level.tracksTime && f.correct && ms < 3000;
    const xp = xpForDrill(f.correct, run, fast);
    setStreak(run);
    setGained(xp);
    onScored(xp, run);
    if (f.correct) { if (run >= 3) sfx.streak(run); else sfx.correct(); } else sfx.wrong();
    setAnswers(next);
    setFeedback(f);
    setElapsed(ms);
    const r: DrillResult = {
      drillId: drill.id, levelId: level.id, index: drill.index, seed: drill.seed,
      correct: f.correct, elapsedMs: ms, tags: f.errorTags, evLostBB: f.evLostBB, at: Date.now(),
      meta: f.meta,
    };
    setResults((rs) => [...rs, r]);
    onResult(r);
  }, [drill, stepIdx, level.id, level.tracksTime, onResult, onScored, streak]);

  const advance = useCallback(() => {
    if (index + 1 >= level.drillCount) {
      setPhase('summary');
      const rs = [...results];
      onFinish(rs.filter((r) => r.correct).length, level.drillCount);
    }
    else setIndex(index + 1);
  }, [index, level.drillCount, onFinish, results]);

  // Keyboard: hotkeys for choices, Enter to submit a number, space to continue.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'lesson') {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPhase('running'); }
        if (e.key === 'Escape') onExit();
        return;
      }
      if (phase === 'summary') {
        if (e.key === 'Escape') onExit();
        return;
      }
      if (feedback) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advance(); }
        if (e.key === 'Escape') onExit();
        return;
      }
      if (!step) return;
      if (e.key === 'Escape') { onExit(); return; }
      if (step.kind === 'choice') {
        const opt = step.options.find((o) => o.hotkey.toLowerCase() === e.key.toLowerCase());
        if (opt) { e.preventDefault(); submit({ ...answers, [step.id]: opt.key }); }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const v = parseFloat(numInput);
        if (Number.isFinite(v)) submit({ ...answers, [step.id]: v });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, step, feedback, answers, numInput, submit, advance, onExit]);

  // ---- Lesson -------------------------------------------------------------
  if (phase === 'lesson') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <button onClick={onExit} className="mb-6 text-xs text-emerald-300/60 hover:text-emerald-200">
          ← All levels
        </button>
        <h1 className="text-3xl font-bold tracking-tight text-emerald-50">
          {mode === 'kid' ? label.title : `${level.id} · ${level.title}`}
        </h1>
        <p className="mt-1 text-emerald-200/60">{label.subtitle}</p>
        <div className="mt-6 space-y-3">
          {level.lesson.body.map((p, i) => (
            <p key={i} className="leading-relaxed text-emerald-50/85">{p}</p>
          ))}
        </div>
        {level.lesson.terms && (
          <dl className="panel mt-6 divide-y divide-emerald-900/50">
            {level.lesson.terms.map((t) => (
              <div key={t.term} className="px-4 py-2.5">
                <dt className="text-sm font-semibold text-emerald-200">{t.term}</dt>
                <dd className="text-sm text-emerald-100/70">{t.definition}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-8 flex items-center gap-3">
          <button className="btn-primary" onClick={() => setPhase('running')}>
            Start {level.drillCount} drills
          </button>
          <span className="text-xs text-emerald-200/45">
            or press <span className="kbd">enter</span> · {Math.round(PASS * 100)}% to unlock the next level
          </span>
        </div>
      </div>
    );
  }

  // ---- Summary ------------------------------------------------------------
  if (phase === 'summary') {
    const right = results.filter((r) => r.correct).length;
    const accuracy = right / level.drillCount;
    const passed = accuracy >= PASS;
    const med = median(results.map((r) => r.elapsedMs));
    const tally = new Map<string, number>();
    for (const r of results) for (const t of r.tags) tally.set(t, (tally.get(t) ?? 0) + 1);
    const trend = [...timeTrend, med];

    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className={`panel border-2 p-6 ${passed ? 'border-emerald-500/50' : 'border-amber-500/40'}`}>
          <div className="text-xs uppercase tracking-widest text-emerald-200/50">
            {mode === 'kid' ? `${label.title} complete` : `${level.id} complete`}
          </div>
          <div className="tnum mt-1 text-5xl font-bold text-emerald-50">
            {right}<span className="text-2xl text-emerald-200/40"> / {level.drillCount}</span>
          </div>
          <div className="tnum mt-1 text-lg text-emerald-200/70">{(accuracy * 100).toFixed(0)}% correct</div>
          {bossLabel && <p className="mt-2 text-sm font-semibold text-amber-200">{bossLabel}</p>}
          <p className={`mt-3 text-sm ${passed ? 'text-emerald-300' : 'text-amber-300'}`}>
            {passed
              ? mode === 'kid'
                ? 'Brilliant! The next level just unlocked. 🎉'
                : 'Passed. The next level is unlocked.'
              : mode === 'kid'
                ? `You need ${Math.round(PASS * 100)}% to open the next one. Have another go — you get brand new questions, not the same ones.`
                : `You need ${Math.round(PASS * 100)}% to unlock the next level. Run it again — you get fresh drills, not the same ones.`}
          </p>
        </div>

        {showClock && (
          <div className="panel mt-4 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-widest text-emerald-200/50">Median response time</span>
              <span className="tnum text-2xl font-bold text-emerald-50">{(med / 1000).toFixed(1)}s</span>
            </div>
            {trend.length > 1 && <Sparkline values={trend} />}
            <p className="mt-2 text-xs text-emerald-200/45">
              {trend.length > 1
                ? trend[trend.length - 1]! < trend[0]!
                  ? `Down from ${(trend[0]! / 1000).toFixed(1)}s on your first run. Automaticity is the goal.`
                  : `Your first run was ${(trend[0]! / 1000).toFixed(1)}s. Accuracy first, then speed.`
                : 'Run this level again to see the trend.'}
            </p>
          </div>
        )}

        {tally.size > 0 && (
          <div className="panel mt-4 divide-y divide-emerald-900/50">
            <div className="px-4 py-2 text-xs uppercase tracking-widest text-emerald-200/50">
              {mode === 'kid' ? 'Things to practise' : 'Leaks logged this run'}
            </div>
            {[...tally.entries()].sort((a, b) => b[1] - a[1]).map(([tag, n]) => (
              <div key={tag} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-rose-200">
                    {tagLabel(tag as never, mode === 'kid')}
                  </span>
                  <span className="tnum text-xs text-emerald-200/50">{n}x</span>
                </div>
                <div className="mt-0.5 text-xs text-emerald-200/55">
                  {tagFix(tag as never, mode === 'kid')}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            className="btn-primary"
            onClick={() => {
              setAttemptSeed(`a${Date.now()}`);
              setResults([]); setIndex(0); setStreak(0); setPhase('lesson');
            }}
          >
            Replay with new drills
          </button>
          <ShareButton onClick={() => onShare(right, level.drillCount, med)} label="Share this run" />
          <button className="btn-ghost" onClick={onExit}>Back to levels</button>
        </div>
      </div>
    );
  }

  // ---- Running ------------------------------------------------------------
  if (!drill) return null;
  const answeredSteps = drill.steps.slice(0, stepIdx);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="text-xs text-emerald-300/60 hover:text-emerald-200">←</button>
          <span className="text-sm font-semibold text-emerald-100">
            {mode === 'kid' ? label.title : `${level.id} · ${level.title}`}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {showClock && (
            <span className="tnum text-sm text-emerald-200/60">{(elapsed / 1000).toFixed(1)}s</span>
          )}
          <span className="tnum text-xs text-emerald-200/50">
            {index + 1} / {level.drillCount}
          </span>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-emerald-950">
            <div
              className="h-full bg-emerald-500 transition-all duration-150"
              style={{ width: `${((index + (feedback ? 1 : 0)) / level.drillCount) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-5 lg:flex-row">
        <main className="min-w-0 flex-1 space-y-5">
          <PokerTable scene={drill.scene} reveal={!!feedback} />

          <div className="panel p-4">
            {answeredSteps.map((s) => (
              <div key={s.id} className="mb-2 flex items-baseline justify-between text-xs text-emerald-200/45">
                <span>{s.question}</span>
                <span className="tnum font-semibold text-emerald-200/70">
                  {String(answers[s.id])}{s.kind === 'number' ? s.unit : ''}
                </span>
              </div>
            ))}

            {step && (
              <div className="rise">
                <p className="mb-3 text-sm font-medium text-emerald-50">{step.question}</p>
                {step.kind === 'choice' ? (
                  <div className="flex flex-wrap gap-2">
                    {step.options.map((o) => (
                      <button
                        key={o.key}
                        className="btn-primary flex items-center gap-2"
                        onClick={() => submit({ ...answers, [step.id]: o.key })}
                      >
                        <span className="kbd">{o.hotkey}</span>
                        <span>{o.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      value={numInput}
                      onChange={(e) => setNumInput(e.target.value.replace(/[^0-9.]/g, ''))}
                      inputMode="decimal"
                      placeholder="0"
                      className="tnum w-28 rounded-lg border border-emerald-700/60 bg-black/40 px-3 py-2
                                 text-lg font-semibold text-emerald-50 outline-none focus:border-emerald-400"
                    />
                    <span className="text-sm text-emerald-200/60">{step.unit}</span>
                    <button
                      className="btn-primary"
                      disabled={!Number.isFinite(parseFloat(numInput))}
                      onClick={() => submit({ ...answers, [step.id]: parseFloat(numInput) })}
                    >
                      Submit <span className="kbd ml-1">↵</span>
                    </button>
                  </div>
                )}
                {step.kind === 'number' && step.hint && (
                  <p className="mt-2 text-xs text-emerald-200/40">{step.hint}</p>
                )}
              </div>
            )}

            {feedback && (
              <div className="rise space-y-3">
                <Verdict
                  correct={feedback.correct}
                  text={feedback.correct ? praise(true, index, mode) : praise(false, index, mode)}
                  mode={mode}
                  streak={streak}
                  xp={gained}
                />
                <div className="space-y-1.5">
                  {feedback.verdicts.map((v) => {
                    const s = drill.steps.find((x) => x.id === v.stepId)!;
                    return (
                      <div key={v.stepId} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-emerald-200/55">{s.question}</span>
                        <span className="tnum shrink-0">
                          <span className={v.correct ? 'text-emerald-300' : 'text-rose-300 line-through'}>
                            {v.given}
                          </span>
                          {!v.correct && <span className="ml-2 font-semibold text-emerald-200">{v.expected}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {showClock && (
                  <div className="tnum text-xs text-emerald-200/45">
                    {(elapsed / 1000).toFixed(2)}s
                    {results.length > 1 &&
                      ` · median so far ${(median(results.map((r) => r.elapsedMs)) / 1000).toFixed(2)}s`}
                  </div>
                )}
                <button className="btn-primary" onClick={advance}>
                  {index + 1 >= level.drillCount ? 'See results' : 'Next drill'}
                  <span className="kbd ml-2">space</span>
                </button>
              </div>
            )}
          </div>
        </main>

        <CoachPanel facts={drill.facts} feedback={feedback} />
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 260;
  const h = 40;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(max - min, 1);
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? 0 : (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-10 w-full" preserveAspectRatio="none">
      <polyline points={pts.join(' ')} fill="none" stroke="rgb(52 211 153)" strokeWidth="2" />
      {pts.map((p, i) => {
        const [x, y] = p.split(',');
        return <circle key={i} cx={x} cy={y} r="2.5" fill="rgb(52 211 153)" />;
      })}
    </svg>
  );
}
