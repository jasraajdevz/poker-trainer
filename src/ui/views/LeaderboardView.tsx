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

const time = (ms: number) => (ms > 0 ? `${(ms / 1000).toFixed(1)}s` : '—');

export function LeaderboardView({
  roster, me, admin, override, onRoster, onOverride, onExit,
}: {
  roster: StoredEntry[];
  me: SharedScore;
  /** Owner mode: every row becomes editable. */
  admin: boolean;
  override: Override | null;
  onRoster: (next: StoredEntry[]) => void;
  onOverride: (next: Override | null) => void;
  onExit: () => void;
}) {
  const [sort, setSort] = useState<SortKey>('levels');
  const [editing, setEditing] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const board = useMemo(() => buildBoard(roster, me, sort), [roster, me, sort]);
  const url = useMemo(() => boardUrl(board.map((e) => e.score)), [board]);

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
            ? `${board.length} players. You are ${ordinal(myRank)} of ${ranked.length} ranked, by ${COLUMNS.find((c) => c.key === sort)!.label.toLowerCase()}.`
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
              {COLUMNS.map((c) => (
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
                  editing={open}
                  overridden={e.isMe && isOverridden(override)}
                  onEdit={() => setEditing(open ? null : key)}
                  onRemove={e.isMe ? undefined : () => onRoster(removeEntry(roster, e.score.n))}
                />,
                open ? (
                  <tr key={`${key}-${i}-edit`} className="bg-rose-950/25">
                    <td colSpan={9} className="px-3 py-3">
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
  entry, rank, admin, editing, overridden, onEdit, onRemove,
}: {
  entry: Entry;
  rank: number | null;
  admin: boolean;
  editing: boolean;
  overridden: boolean;
  onEdit: () => void;
  onRemove?: () => void;
}) {
  const s = entry.score;
  const medal = rank === 1 ? 'text-amber-300' : rank === 2 ? 'text-zinc-300' : rank === 3 ? 'text-orange-400' : '';
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

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
