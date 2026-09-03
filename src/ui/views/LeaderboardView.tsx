import { useMemo, useState } from 'react';
import { SharedScore, decodeScore, scoreFromHash } from '../../coach/share';
import {
  COLUMNS, Entry, MAX_ENTRIES, RANKED_MIN_DRILLS, SortKey, StoredEntry,
  boardFromHash, boardUrl, buildBoard, decodeBoard, leakLabel, mergeEntry, mergeMany,
  removeEntry, updateEntry,
} from '../../coach/leaderboard';
import {
  FIELDS, Override, beatTheBoard, isOverridden, sanitiseField,
} from '../../coach/admin';
import {
  BIRTHDAY_COLUMN,
} from '../../coach/leaderboard';
import {
  Party, TITLES, describeWindow, isLive, isPending, localMs, makeParty, nextOccurrence,
  scheduleParty, startsInMs, titleForRank, toDateInput, withParty,
} from '../../coach/party';

const time = (ms: number) => (ms > 0 ? `${(ms / 1000).toFixed(1)}s` : '—');

export function LeaderboardView({
  roster, me, admin, override, party, onRoster, onOverride, onParty, onExit,
}: {
  roster: StoredEntry[];
  me: SharedScore;
  /** Owner mode: every row becomes editable. */
  admin: boolean;
  override: Override | null;
  party: Party | null;
  onRoster: (next: StoredEntry[]) => void;
  onOverride: (next: Override | null) => void;
  onParty: (p: Party | null) => void;
  onExit: () => void;
}) {
  const [sort, setSort] = useState<SortKey>('levels');
  const [editing, setEditing] = useState<string | null>(null);
  const [bdayName, setBdayName] = useState('');
  // Defaults to the next 5 March, midnight to 7pm — the window the owner asked
  // for. Every part of it is editable and the resolved date is spelled out.
  const [bdayDate, setBdayDate] = useState(() => toDateInput(nextOccurrence(3, 5).getTime()));
  const [bdayFrom, setBdayFrom] = useState('00:00');
  const [bdayTo, setBdayTo] = useState('19:00');
  const [phantom, setPhantom] = useState('');
  const [titleTarget, setTitleTarget] = useState('');
  const [titleText, setTitleText] = useState('');
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const partyOn = isLive(party);
  const anyPoints = partyOn || roster.some((e) => (e.s.b ?? 0) > 0) || (me.b ?? 0) > 0;
  const columns = anyPoints ? [...COLUMNS, BIRTHDAY_COLUMN] : COLUMNS;

  const board = useMemo(() => buildBoard(roster, me, sort), [roster, me, sort]);

  /** Who is winning the party, for the crown. */
  const bpRank = useMemo(() => {
    const order = [...board]
      .filter((e) => (e.score.b ?? 0) > 0)
      .sort((a, b) => (b.score.b ?? 0) - (a.score.b ?? 0));
    return new Map(order.map((e, i) => [e.score.n, i]));
  }, [board]);
  const url = useMemo(
    () => withParty(boardUrl(board.map((e) => e.score)), party),
    [board, party],
  );

  /** Accepts a full URL or a bare payload, of either kind. */
  const add = () => {
    const text = paste.trim();
    if (!text) return;
    const hash = text.includes('#') ? text.slice(text.indexOf('#')) : `#${text}`;

    const asBoard = boardFromHash(hash) ?? decodeBoard(text);
    if (asBoard) {
      onRoster(mergeMany(roster, asBoard.scores, asBoard.intact, Date.now()));
      setPaste('');
      setNote({
        ok: asBoard.intact,
        text: asBoard.intact
          ? `Added ${asBoard.scores.length} ${asBoard.scores.length === 1 ? 'player' : 'players'}.`
          : `Added ${asBoard.scores.length}, but the checksum failed — that board was edited.`,
      });
      return;
    }

    const asScore = scoreFromHash(hash) ?? decodeScore(text);
    if (asScore) {
      onRoster(mergeEntry(roster, asScore.score, asScore.intact, Date.now()));
      setPaste('');
      setNote({
        ok: asScore.intact,
        text: asScore.intact
          ? `Added ${asScore.score.n}.`
          : `Added ${asScore.score.n}, but the checksum failed — that link was edited.`,
      });
      return;
    }
    setNote({ ok: false, text: 'That is not a Poker Trainer link.' });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNote({ ok: false, text: 'Clipboard blocked — select the link below and copy it by hand.' });
    }
  };

  const ranked = board.filter((e) => !e.provisional);
  const myRank = ranked.findIndex((e) => e.isMe) + 1;

  const addPhantom = () => {
    const n = phantom.trim();
    if (!n) return;
    onRoster(mergeEntry(roster, {
      v: 1, n, d: 120 + Math.floor(Math.random() * 300), a: 60 + Math.floor(Math.random() * 35),
      l: Math.floor(Math.random() * 8), e: Math.round(Math.random() * 300) / 10,
      t: 1500 + Math.floor(Math.random() * 2500),
    }, true, Date.now()));
    setPhantom('');
  };

  const bestow = () => {
    if (!titleTarget || !titleText.trim()) return;
    if (titleTarget === me.n) onOverride({ ...(override ?? {}), g: titleText.trim() } as Override);
    else onRoster(updateEntry(roster, titleTarget, { g: titleText.trim() }));
    setTitleText('');
  };

  /** Write one edited field. Mine becomes an override; theirs rewrites the roster. */
  const editField = (entry: Entry, key: string, raw: string) => {
    const value = sanitiseField(key as never, raw);
    if (entry.isMe) onOverride({ ...(override ?? {}), [key]: value });
    else onRoster(updateEntry(roster, entry.score.n, { [key]: value }));
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <button onClick={onExit} className="mb-6 text-xs text-emerald-300/60 hover:text-emerald-200">
        ← All levels
      </button>
      <h1 className="text-3xl font-bold tracking-tight text-emerald-50">Leaderboard</h1>
      <p className="mt-1 text-emerald-200/60">
        {board.length === 1
          ? 'Just you so far. Paste a friend’s link below to put them on the board.'
          : myRank > 0
            ? `${board.length} players. You are ${ordinal(myRank)} of ${ranked.length} ranked, by ${columns.find((c) => c.key === sort)!.label.toLowerCase()}.`
            : `${board.length} players. Answer ${RANKED_MIN_DRILLS} drills to be ranked.`}
      </p>

      {admin && (
        <div className="panel mt-5 border-rose-500/40 bg-rose-950/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rose-300">
                admin
              </span>
              <span className="text-sm text-emerald-100">Every row is editable.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onOverride(beatTheBoard(board.filter((e) => !e.isMe).map((e) => e.score), me))}
                className="btn border-rose-400/50 bg-rose-500/15 px-3 py-1.5 text-xs text-rose-100 hover:bg-rose-500/25"
              >
                Make me #1
              </button>
              {isOverridden(override) && (
                <button onClick={() => onOverride(null)} className="btn-ghost px-3 py-1.5 text-xs">
                  Reset my score
                </button>
              )}
            </div>
          </div>

          {/* ---- The party desk -------------------------------------------- */}
          <div className="mt-3 rounded-xl border border-fuchsia-400/40 bg-gradient-to-r
                          from-fuchsia-900/40 via-indigo-900/30 to-rose-900/40 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[10rem] flex-1">
                <span className="mb-1 block text-[10px] uppercase tracking-widest text-fuchsia-200/70">
                  Whose birthday is it?
                </span>
                <input
                  value={bdayName}
                  onChange={(ev) => setBdayName(ev.target.value)}
                  placeholder="Everybody"
                  maxLength={24}
                  className="w-full rounded-md border border-fuchsia-400/30 bg-black/50 px-2 py-1.5
                             text-sm text-emerald-50 outline-none focus:border-fuchsia-300"
                />
              </label>
              <button
                onClick={() => onParty(makeParty(bdayName, me.n, 0.25))}
                className="btn animate-pulse border-fuchsia-300/60 bg-fuchsia-500/30 px-4 py-2
                           text-sm font-bold text-fuchsia-50 hover:bg-fuchsia-500/45"
              >
                🪩 TEST IT NOW
              </button>
              {party && (
                <button
                  onClick={() => onParty(null)}
                  className="btn border-white/25 bg-black/40 px-3 py-2 text-xs text-white/80 hover:bg-black/60"
                >
                  {partyOn ? 'End it' : 'Cancel'}
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-fuchsia-400/20 pt-3">
              <label>
                <span className="mb-1 block text-[10px] uppercase tracking-widest text-fuchsia-200/70">
                  Date
                </span>
                <input
                  type="date"
                  value={bdayDate}
                  onChange={(ev) => setBdayDate(ev.target.value)}
                  className="rounded-md border border-fuchsia-400/30 bg-black/50 px-2 py-1.5
                             text-sm text-emerald-50 outline-none focus:border-fuchsia-300"
                />
              </label>
              <label>
                <span className="mb-1 block text-[10px] uppercase tracking-widest text-fuchsia-200/70">
                  From
                </span>
                <input
                  type="time"
                  value={bdayFrom}
                  onChange={(ev) => setBdayFrom(ev.target.value)}
                  className="rounded-md border border-fuchsia-400/30 bg-black/50 px-2 py-1.5
                             text-sm text-emerald-50 outline-none focus:border-fuchsia-300"
                />
              </label>
              <label>
                <span className="mb-1 block text-[10px] uppercase tracking-widest text-fuchsia-200/70">
                  Until
                </span>
                <input
                  type="time"
                  value={bdayTo}
                  onChange={(ev) => setBdayTo(ev.target.value)}
                  className="rounded-md border border-fuchsia-400/30 bg-black/50 px-2 py-1.5
                             text-sm text-emerald-50 outline-none focus:border-fuchsia-300"
                />
              </label>
              <button
                onClick={() => {
                  const start = localMs(bdayDate, bdayFrom);
                  let end = localMs(bdayDate, bdayTo);
                  if (end <= start) end += 24 * 3600_000; // an overnight party
                  onParty(scheduleParty(bdayName, me.n, start, end));
                }}
                className="btn border-fuchsia-300/50 bg-fuchsia-500/20 px-3 py-2 text-xs
                           font-semibold text-fuchsia-50 hover:bg-fuchsia-500/35"
              >
                Schedule it
              </button>
              <div className="flex gap-1">
                <button
                  onClick={() => { setBdayFrom('00:00'); setBdayTo('19:00'); }}
                  className="btn-ghost px-2 py-1.5 text-[11px]"
                  title="Midnight to 7pm"
                >
                  12 AM–7 PM
                </button>
                <button
                  onClick={() => { setBdayFrom('12:00'); setBdayTo('19:00'); }}
                  className="btn-ghost px-2 py-1.5 text-[11px]"
                  title="Noon to 7pm"
                >
                  12 PM–7 PM
                </button>
              </div>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-fuchsia-100/60">
              {partyOn && party ? (
                <>
                  <b className="text-fuchsia-200">Live now</b> for {party.name} — {describeWindow(party)}.
                  Every link you share carries it.
                </>
              ) : isPending(party) && party ? (
                <>
                  <b className="text-fuchsia-200">Booked</b> for {party.name} — {describeWindow(party)}.
                  Starts on its own in {formatCountdown(startsInMs(party))}, no need to be here.
                  Links you send now already carry the invitation.
                </>
              ) : (
                <>
                  Test it now for 15 minutes, or book the window above. Whoever opens a link you share
                  drops into the disco; top birthday points takes {TITLES[0]!.emoji} {TITLES[0]!.label}.
                  Times are in your own timezone.
                </>
              )}
            </p>
          </div>

          {/* ---- The rest of the toybox ------------------------------------ */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-[10px] uppercase tracking-widest text-rose-200/60">
                  Invent a rival
                </span>
                <input
                  value={phantom}
                  onChange={(ev) => setPhantom(ev.target.value)}
                  placeholder="Name"
                  maxLength={24}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') addPhantom(); }}
                  className="w-full rounded-md border border-rose-500/30 bg-black/50 px-2 py-1.5
                             text-sm text-emerald-50 outline-none focus:border-rose-400"
                />
              </label>
              <button onClick={addPhantom} className="btn-ghost px-3 py-1.5 text-xs">Add</button>
            </div>

            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-[10px] uppercase tracking-widest text-rose-200/60">
                  Bestow a title
                </span>
                <div className="flex gap-1">
                  <select
                    value={titleTarget}
                    onChange={(ev) => setTitleTarget(ev.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-rose-500/30 bg-black/50 px-2 py-1.5
                               text-sm text-emerald-50 outline-none"
                  >
                    <option value="">Who…</option>
                    {board.map((e) => <option key={e.score.n} value={e.score.n}>{e.score.n}</option>)}
                  </select>
                  <input
                    value={titleText}
                    onChange={(ev) => setTitleText(ev.target.value)}
                    placeholder="Title"
                    maxLength={24}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') bestow(); }}
                    className="min-w-0 flex-1 rounded-md border border-rose-500/30 bg-black/50 px-2 py-1.5
                               text-sm text-emerald-50 outline-none focus:border-rose-400"
                  />
                </div>
              </label>
              <button onClick={bestow} className="btn-ghost px-3 py-1.5 text-xs">Give</button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => onRoster(roster.map((e) => ({
                ...e, s: { ...e.s, b: Math.floor(Math.random() * 400) + 50 },
              })))}
              className="btn-ghost px-3 py-1.5 text-xs"
              title="Sprinkle birthday points across everyone"
            >
              🎁 Sprinkle points
            </button>
            <button
              onClick={() => onRoster(roster.map((e) => ({
                ...e,
                s: {
                  ...e.s,
                  l: Math.floor(Math.random() * 10),
                  a: Math.floor(Math.random() * 101),
                  t: 800 + Math.floor(Math.random() * 4000),
                },
              })))}
              className="btn-ghost px-3 py-1.5 text-xs"
              title="Randomise everyone else's stats"
            >
              🎲 Shuffle the board
            </button>
            <button
              onClick={() => { if (confirm('Remove every other player from your board?')) onRoster([]); }}
              className="btn-ghost px-3 py-1.5 text-xs hover:text-rose-300"
            >
              💣 Clear the board
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-200/45">
            Nothing here leaves this browser until you share a link — then edited numbers travel like
            any others, with a valid checksum, because you generated them rather than tampering with
            someone else's. Recipients are still told a link is a boast, not a receipt.
            {isOverridden(override) && (
              <b className="ml-1 text-rose-200">Your score is currently overridden.</b>
            )}
          </p>
        </div>
      )}

      <div className="panel mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-emerald-900/60 text-[11px] uppercase tracking-widest text-emerald-200/45">
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Player</th>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 text-right font-medium">
                  <button
                    onClick={() => setSort(c.key)}
                    title={c.hint}
                    className={`transition hover:text-emerald-200 ${
                      sort === c.key ? 'text-emerald-300' : ''
                    }`}
                  >
                    {c.short}{sort === c.key ? ' ↓' : ''}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium">Worst leak</th>
              <th className={admin ? 'w-16' : 'w-8'} />
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-900/40">
            {board.map((e, i) => {
              // Key on the player, not the position: editing a field re-sorts
              // the table, and a positional key would slam the editor shut.
              const key = e.score.n;
              const open = editing === key;
              return [
                <Row
                  key={`${key}-${i}`}
                  entry={e}
                  rank={e.provisional ? null : board.filter((x) => !x.provisional).indexOf(e) + 1}
                  admin={admin}
                  showBp={anyPoints}
                  bpRank={bpRank.get(e.score.n)}
                  editing={open}
                  overridden={e.isMe && isOverridden(override)}
                  onEdit={() => setEditing(open ? null : key)}
                  onRemove={e.isMe ? undefined : () => onRoster(removeEntry(roster, e.score.n))}
                />,
                open ? (
                  <tr key={`${key}-${i}-edit`} className="bg-rose-950/25">
                    <td colSpan={anyPoints ? 10 : 9} className="px-3 py-3">
                      <div className="flex flex-wrap items-end gap-3">
                        {FIELDS.map((f) => (
                          <label key={f.key} className="block">
                            <span className="mb-1 block text-[10px] uppercase tracking-widest text-rose-200/60">
                              {f.label}{f.unit ? ` (${f.unit})` : ''}
                            </span>
                            <input
                              type="number"
                              min={f.min}
                              max={f.max}
                              step={f.step}
                              defaultValue={String(e.score[f.key as 'l'])}
                              onChange={(ev) => editField(e, f.key, ev.target.value)}
                              className="tnum w-24 rounded-md border border-rose-500/30 bg-black/50 px-2 py-1
                                         text-sm text-emerald-50 outline-none focus:border-rose-400"
                            />
                          </label>
                        ))}
                        <button onClick={() => setEditing(null)} className="btn-ghost px-3 py-1.5 text-xs">
                          Done
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-300/80">
            Add a player
          </h2>
          <div className="flex gap-2">
            <input
              value={paste}
              onChange={(e) => { setPaste(e.target.value); setNote(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
              placeholder="Paste a score or board link"
              className="min-w-0 flex-1 rounded-lg border border-emerald-700/50 bg-black/40 px-3 py-2
                         text-xs text-emerald-50 outline-none focus:border-emerald-400"
            />
            <button onClick={add} className="btn-primary shrink-0 text-xs">Add</button>
          </div>
          {note && (
            <p className={`mt-2 text-[11px] ${note.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
              {note.text}
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-200/40">
            Opening someone’s link adds them automatically. This box is for when you would rather
            paste it than follow it.
          </p>
        </div>

        <div className="panel p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-300/80">
            Share the board
          </h2>
          <button onClick={copy} className="btn-primary w-full text-xs">
            {copied ? 'Copied' : `Copy a link with all ${board.length}`}
          </button>
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded-lg border border-emerald-900 bg-black/50 px-2 py-1.5
                       font-mono text-[10px] text-emerald-200/60 outline-none"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-200/40">
            Everyone on your board travels inside that link. Send it round the group and you all end
            up with the same table.
          </p>
        </div>
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-emerald-200/40">
        There is no server behind this, so the board is a snapshot of the links you have been sent,
        not a live ranking — someone who has not shared since Tuesday still shows Tuesday. Entries
        under {RANKED_MIN_DRILLS} drills sit below the ranked ones, because a perfect three out of
        three is not a season. Links carry a checksum, so an edited one gets flagged, but nothing
        here is verified. Boards hold {MAX_ENTRIES} players; past that the lowest-ranked drop off.
      </p>
    </div>
  );
}

function Row({
  entry, rank, admin, showBp, bpRank, editing, overridden, onEdit, onRemove,
}: {
  entry: Entry;
  rank: number | null;
  admin: boolean;
  showBp: boolean;
  bpRank?: number;
  editing: boolean;
  overridden: boolean;
  onEdit: () => void;
  onRemove?: () => void;
}) {
  const s = entry.score;
  const medal = rank === 1 ? 'text-amber-300' : rank === 2 ? 'text-zinc-300' : rank === 3 ? 'text-orange-400' : '';
  const title = s.g ? { label: s.g, emoji: '🎖️' } : bpRank !== undefined ? titleForRank(bpRank) : null;
  return (
    <tr className={editing ? 'bg-rose-950/25' : entry.isMe ? 'bg-emerald-500/10' : ''}>
      <td className={`px-3 py-2.5 font-bold tnum ${medal || 'text-emerald-200/40'}`}>
        {rank ?? '–'}
      </td>
      <td className="px-3 py-2.5">
        <span className="font-medium text-emerald-50">{s.n}</span>
        {entry.isMe && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-emerald-400/70">you</span>}
        {s.p === 1 && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">Ω</span>}
        {!entry.intact && (
          <span
            title="This entry's checksum failed — the link was edited"
            className="ml-1.5 text-[10px] font-bold text-amber-400"
          >
            ⚠
          </span>
        )}
        {entry.provisional && (
          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-emerald-200/35">provisional</span>
        )}
        {title && (
          <span
            title={`${title.label}`}
            className="ml-1.5 whitespace-nowrap rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px]
                       font-bold uppercase tracking-wide text-fuchsia-200"
          >
            {title.emoji} {title.label}
          </span>
        )}
        {overridden && (
          <span
            title="Overridden in admin mode — this is not your real score"
            className="ml-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-400"
          >
            edited
          </span>
        )}
      </td>
      <td className="tnum px-3 py-2.5 text-right text-emerald-100">{s.l}<span className="text-emerald-200/30">/9</span></td>
      <td className="tnum px-3 py-2.5 text-right text-emerald-100">{s.a}%</td>
      <td className="tnum px-3 py-2.5 text-right text-rose-200/90">{entry.evPer100.toFixed(1)}</td>
      <td className="tnum px-3 py-2.5 text-right text-emerald-200/70">{s.d}</td>
      <td className="tnum px-3 py-2.5 text-right text-emerald-200/70">{time(s.t)}</td>
      {showBp && (
        <td className="tnum px-3 py-2.5 text-right font-bold text-fuchsia-300">
          {(s.b ?? 0).toLocaleString()}
        </td>
      )}
      <td className="max-w-[10rem] truncate px-3 py-2.5 text-xs text-rose-200/80">{leakLabel(s.k)}</td>
      <td className="whitespace-nowrap px-2 py-2.5 text-right">
        {admin && (
          <button
            onClick={onEdit}
            title="Edit this row"
            className={`mr-1 transition ${editing ? 'text-rose-300' : 'text-emerald-200/25 hover:text-rose-300'}`}
          >
            ✎
          </button>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            title="Remove from your board"
            className="text-emerald-200/25 transition hover:text-rose-300"
          >
            ✕
          </button>
        )}
      </td>
    </tr>
  );
}

function formatCountdown(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3600_000);
  const mins = Math.floor((ms % 3600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
