import { DrillFeedback, ProofLine } from '../../curriculum/types';

function Line({ line }: { line: ProofLine }) {
  const tone =
    line.tone === 'good' ? 'text-emerald-300'
      : line.tone === 'bad' ? 'text-rose-300'
        : 'text-emerald-50';
  return (
    <div className={`px-3 py-2 ${line.key ? 'bg-emerald-500/10' : ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-wide text-emerald-200/55">{line.label}</span>
        <span className={`tnum text-right text-sm font-semibold ${tone}`}>{line.value}</span>
      </div>
      {line.note && (
        <div className="mt-0.5 text-right text-[11px] leading-snug text-emerald-200/45">{line.note}</div>
      )}
    </div>
  );
}

/**
 * Always on screen, never a modal. Before you answer it holds the facts you are
 * entitled to; the moment you answer, the computed proof fills in underneath.
 */
export function CoachPanel({
  facts, feedback,
}: {
  facts: ProofLine[];
  feedback: DrillFeedback | null;
}) {
  return (
    <aside className="panel flex w-full flex-col overflow-hidden lg:w-[22rem]">
      <header className="flex items-center justify-between border-b border-emerald-900/60 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-300/80">Coach</h2>
        <span className="text-[10px] uppercase tracking-wide text-emerald-200/40">
          {feedback ? 'computed' : 'known so far'}
        </span>
      </header>

      <div className="divide-y divide-emerald-900/40">
        {facts.map((f, i) => <Line key={`f${i}`} line={f} />)}
      </div>

      {!feedback && facts.length === 0 && (
        <p className="px-3 py-4 text-xs leading-relaxed text-emerald-200/40">
          Numbers appear here the instant you answer — equity, the price, and the EV of
          every option. Nothing is hidden behind a click.
        </p>
      )}

      {feedback && (
        <div className="rise flex min-h-0 flex-1 flex-col">
          <div
            className={`border-y px-3 py-2 ${
              feedback.correct
                ? 'border-emerald-500/30 bg-emerald-500/15'
                : 'border-rose-500/30 bg-rose-500/15'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-sm font-bold ${feedback.correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                {feedback.correct ? 'Correct' : 'Wrong'}
              </span>
              <span className="text-sm font-semibold text-emerald-50">{feedback.correctAction}</span>
            </div>
            {feedback.evLostBB > 0 && (
              <div className="tnum mt-1 text-right text-[11px] text-rose-300/80">
                −{feedback.evLostBB.toFixed(2)} bb of EV
              </div>
            )}
          </div>

          <div className="divide-y divide-emerald-900/40 overflow-y-auto">
            {feedback.proof.map((p, i) => <Line key={`p${i}`} line={p} />)}
          </div>

          <div className="space-y-2 border-t border-emerald-900/60 px-3 py-3">
            <p className="text-xs leading-relaxed text-emerald-100/90">{feedback.counterfactual}</p>
            <p className="border-l-2 border-emerald-500/50 pl-2 text-xs italic leading-relaxed text-emerald-300/80">
              {feedback.principle}
            </p>
            {feedback.errorTags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {feedback.errorTags.map((t) => (
                  <span key={t} className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[10px] text-rose-300/90">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
