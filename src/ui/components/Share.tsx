import { useEffect, useMemo, useRef, useState } from 'react';
import { TAGS } from '../../coach/mistakes';
import { SharedScore, cleanName, runPassed, saveName, shareUrl } from '../../coach/share';
import { Party, withParty } from '../../coach/party';

const fmt = {
  time: (ms: number) => (ms > 0 ? `${(ms / 1000).toFixed(1)}s` : '—'),
  ev: (bb: number) => `${bb.toFixed(1)} bb`,
};

/** The card both the sender and the receiver see, so the link looks familiar. */
export function ScoreCard({
  score, tone = 'them', caption,
}: {
  score: SharedScore;
  tone?: 'them' | 'you';
  /** "Them" / "You", so a head-to-head is readable when both names match. */
  caption?: string;
}) {
  const isRun = score.c !== undefined && score.o !== undefined;
  const accent = tone === 'you' ? 'text-emerald-300' : 'text-amber-300';
  return (
    <div className={`panel p-4 ${tone === 'you' ? 'border-emerald-500/40' : 'border-amber-400/40'}`}>
      {caption && (
        <div className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${
          tone === 'you' ? 'text-emerald-400/70' : 'text-amber-400/70'}`}>
          {caption}
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-semibold text-emerald-50">{score.n}</span>
        {score.p === 1 && (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-amber-300">
            Omega
          </span>
        )}
      </div>

      {isRun ? (
        <>
          <div className="mt-2 text-[11px] uppercase tracking-widest text-emerald-200/50">{score.s}</div>
          <div className={`tnum mt-0.5 text-4xl font-bold ${accent}`}>
            {score.c}
            <span className="text-xl text-emerald-200/40"> / {score.o}</span>
          </div>
          <div className={`mt-0.5 text-xs ${runPassed(score) ? 'text-emerald-300' : 'text-amber-300'}`}>
            {runPassed(score) ? 'Passed' : 'Did not pass'}
          </div>
        </>
      ) : (
        <>
          <div className="mt-2 text-[11px] uppercase tracking-widest text-emerald-200/50">
            Overall accuracy
          </div>
          <div className={`tnum mt-0.5 text-4xl font-bold ${accent}`}>{score.a}%</div>
        </>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Row k="Levels passed" v={`${score.l} / 9`} />
        <Row k="Drills answered" v={String(score.d)} />
        <Row k="EV given up" v={fmt.ev(score.e)} />
        <Row k="Median read" v={fmt.time(score.t)} />
      </dl>

      {score.k && (
        <div className="mt-3 border-t border-emerald-900/50 pt-2">
          <span className="text-[11px] uppercase tracking-wide text-emerald-200/45">Worst leak</span>
          <div className="text-xs font-medium text-rose-200">{TAGS[score.k].label}</div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-emerald-200/50">{k}</dt>
      <dd className="tnum text-right font-semibold text-emerald-100">{v}</dd>
    </>
  );
}

export function ShareButton({ onClick, label = 'Share' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="btn-ghost text-xs">
      {label}
    </button>
  );
}

export function ShareModal({
  score, name, party, onName, onClose,
}: {
  score: SharedScore;
  name: string;
  /** A live party rides along, so opening the link starts the disco. */
  party: Party | null;
  onName: (n: string) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const named = useMemo(() => ({ ...score, n: cleanName(name) || 'Anonymous' }), [score, name]);
  const url = useMemo(() => withParty(shareUrl(named), party), [named, party]);

  useEffect(() => { setCopied(false); }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      inputRef.current?.select(); // clipboard blocked: let them copy by hand
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="rise w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/30 bg-[#07120e] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-emerald-900/60 px-5 py-3">
          <h2 className="font-bold tracking-tight text-emerald-50">Share your score</h2>
          <button onClick={onClose} className="text-emerald-200/40 hover:text-emerald-100">✕</button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-widest text-emerald-200/50">
              Your name
            </span>
            <input
              value={name}
              onChange={(e) => { onName(e.target.value); saveName(e.target.value); }}
              placeholder="Anonymous"
              maxLength={24}
              className="w-full rounded-lg border border-emerald-700/50 bg-black/40 px-3 py-2 text-sm
                         text-emerald-50 outline-none focus:border-emerald-400"
            />
          </label>

          <ScoreCard score={named} />

          <div className="flex gap-2">
            <input
              ref={inputRef}
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-emerald-900 bg-black/50 px-3 py-2
                         font-mono text-[11px] text-emerald-200/70 outline-none"
            />
            <button onClick={copy} className="btn-primary shrink-0 text-xs">
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-emerald-200/40">
            The whole score is inside the link, so it works with no account and no server. That also
            means it is a boast, not a receipt — anyone can edit a link. Your friend gets a nudge if
            one has been tampered with.
            {party && <b className="ml-1 text-fuchsia-300">This link also carries the party.</b>}
          </p>
        </div>
      </div>
    </div>
  );
}

/** What someone sees when they open a shared link. */
export function SharedScoreView({
  theirs, yours, intact, hasProgress, onStart, onDismiss,
}: {
  theirs: SharedScore;
  yours: SharedScore;
  intact: boolean;
  hasProgress: boolean;
  onStart: () => void;
  onDismiss: () => void;
}) {
  const isRun = theirs.c !== undefined && theirs.o !== undefined;
  const deltas = hasProgress
    ? [
        { k: 'Accuracy', you: yours.a, them: theirs.a, unit: '%', higherWins: true },
        { k: 'Levels passed', you: yours.l, them: theirs.l, unit: '', higherWins: true },
        { k: 'EV given up', you: yours.e, them: theirs.e, unit: ' bb', higherWins: false },
      ]
    : [];
  const wins = deltas.filter((d) => (d.higherWins ? d.you > d.them : d.you < d.them)).length;
  const losses = deltas.filter((d) => (d.higherWins ? d.you < d.them : d.you > d.them)).length;
  const verdict =
    wins > losses ? `You are ahead on ${wins} of 3. Send it back.`
      : losses > wins ? `They are ahead on ${losses} of 3. The Dojo knows why.`
        : wins === 0 ? 'Dead level on every measure. Someone has to break the tie.'
          : `Honours even, ${wins} apiece. Play another level.`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-widest text-amber-300/70">A challenge</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-emerald-50">
          <span className="text-amber-200">{theirs.n}</span> sent you {isRun ? 'a run' : 'their score'}
        </h1>
      </div>

      {!intact && (
        <p className="panel mb-4 border-amber-500/40 px-4 py-2.5 text-xs text-amber-200">
          This link's checksum does not match, so it was edited or mangled somewhere along the way.
          Treat the numbers as decoration.
        </p>
      )}

      <div className={`grid gap-3 ${hasProgress ? 'sm:grid-cols-2' : ''}`}>
        <ScoreCard score={theirs} caption={hasProgress ? 'Them' : undefined} />
        {hasProgress && <ScoreCard score={yours} tone="you" caption="You" />}
      </div>

      {hasProgress && (
        <div className="panel mt-4 divide-y divide-emerald-900/40">
          {deltas.map((d) => {
            const win = d.higherWins ? d.you > d.them : d.you < d.them;
            const tie = d.you === d.them;
            return (
              <div key={d.k} className="flex items-baseline justify-between px-4 py-2.5 text-sm">
                <span className="text-emerald-200/55">{d.k}</span>
                <span className="tnum">
                  <span className="text-amber-200">{d.them}{d.unit}</span>
                  <span className="mx-2 text-emerald-200/30">vs</span>
                  <span className={tie ? 'text-emerald-200/60' : win ? 'text-emerald-300' : 'text-rose-300'}>
                    {d.you}{d.unit}
                  </span>
                </span>
              </div>
            );
          })}
          <p className="px-4 py-2.5 text-xs text-emerald-200/55">{verdict}</p>
        </div>
      )}

      {theirs.k && (
        <p className="mt-4 text-sm text-emerald-200/60">
          Their worst leak is <b className="text-rose-200">{TAGS[theirs.k].label.toLowerCase()}</b> —{' '}
          {TAGS[theirs.k].fix}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={onStart} className="btn-primary">
          {hasProgress ? 'Beat it' : 'Start training'}
        </button>
        <button onClick={onDismiss} className="btn-ghost">Just look around</button>
      </div>
    </div>
  );
}
