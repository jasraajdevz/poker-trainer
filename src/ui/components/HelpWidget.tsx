import { useMemo, useState } from 'react';
import { Mode } from '../../coach/profile';
import { helpEntry, helpQuestions, searchHelp } from '../../coach/help';

/**
 * The floating "?" — tap it anywhere and you get a row of questions to ask.
 * Tap a question, get the whole answer in your mode's words; type instead and
 * it finds the matching questions. The tour is always the first thing offered.
 *
 * This is a hand-written guide, and it says so — no pretend AI.
 */
export function HelpWidget({
  mode, onTutorial,
}: {
  mode: Mode;
  onTutorial: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const kid = mode === 'kid';

  const questions = useMemo(() => helpQuestions(mode), [mode]);
  const matches = useMemo(
    () => (query.trim() ? searchHelp(query, mode) : null),
    [query, mode],
  );
  const entry = entryId ? helpEntry(entryId) : null;

  const close = () => { setOpen(false); setEntryId(null); setQuery(''); };

  return (
    <>
      <button
        onClick={() => (open ? close() : setOpen(true))}
        title={kid ? 'Stuck? Ask me!' : 'Help — ask a question'}
        aria-expanded={open}
        className={`fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full
                    border text-xl font-black shadow-2xl backdrop-blur transition
                    ${open
                      ? 'border-emerald-300/70 bg-emerald-500/30 text-emerald-50'
                      : 'border-emerald-400/50 bg-black/60 text-emerald-200 hover:bg-emerald-500/20'}`}
      >
        {open ? '✕' : '?'}
      </button>

      {open && (
        <div
          className="rise fixed bottom-20 left-4 z-40 flex max-h-[70dvh] w-[calc(100vw-2rem)] max-w-sm
                     flex-col overflow-hidden rounded-2xl border bg-[#0a0f0d]/95 shadow-2xl backdrop-blur"
          style={{ borderColor: 'var(--line)' }}
          role="dialog"
          aria-label="Help"
        >
          <header className="border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
            <div className="text-sm font-bold text-emerald-50">
              {kid ? 'Stuck? Ask me anything!' : 'Ask a question'}
            </div>
            <div className="text-[11px] text-emerald-200/45">
              A hand-written guide — tap a question or type one
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {entry ? (
              <div className="rise">
                <button
                  onClick={() => setEntryId(null)}
                  className="mb-2 text-xs text-emerald-300/70 hover:text-emerald-200"
                >
                  ← All questions
                </button>
                <h3 className="mb-2 text-base font-bold text-emerald-50">{entry.q[mode]}</h3>
                <div className="space-y-2.5">
                  {entry.a[mode].map((p, i) => (
                    <p key={i} className="text-sm leading-relaxed text-emerald-100/85">{p}</p>
                  ))}
                </div>
                {entry.id === 'how-to-play' && (
                  <button
                    onClick={() => { close(); onTutorial(); }}
                    className="btn-primary mt-3 w-full text-sm"
                  >
                    🎓 {kid ? 'Show me, step by step' : 'Take the 2-minute tour'}
                  </button>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={() => { close(); onTutorial(); }}
                  className="mb-3 flex w-full items-center gap-3 rounded-xl border border-emerald-400/50
                             bg-emerald-500/15 px-3 py-2.5 text-left transition hover:bg-emerald-500/25"
                >
                  <span className="text-2xl">🎓</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-emerald-50">
                      {kid ? 'Teach me how to play!' : 'The 2-minute tour'}
                    </span>
                    <span className="block text-[11px] text-emerald-200/55">
                      The whole game, step by step, with real cards
                    </span>
                  </span>
                </button>

                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={kid ? 'Type your question…' : 'Search the guide…'}
                  className="mb-3 w-full rounded-lg border border-emerald-700/50 bg-black/40 px-3 py-2
                             text-sm text-emerald-50 outline-none focus:border-emerald-400"
                />

                {matches && matches.length === 0 && (
                  <p className="mb-2 text-xs text-emerald-200/50">
                    Nothing matched that — {kid ? 'try one of these:' : 'the closest topics are below.'}
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {(matches && matches.length > 0 ? matches : questions).map((q) => (
                    <button
                      key={q.id}
                      onClick={() => setEntryId(q.id)}
                      className="rounded-full border border-emerald-700/60 bg-emerald-950/40 px-3 py-1.5
                                 text-left text-xs text-emerald-100/85 transition
                                 hover:border-emerald-400/70 hover:bg-emerald-500/15"
                    >
                      {q.q}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
