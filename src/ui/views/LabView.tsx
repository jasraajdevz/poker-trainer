import { useState } from 'react';
import { parseCards } from '../../engine/cards';
import { evaluate } from '../../engine/evaluator';
import { asCards, asRange, computeEquity } from '../../engine/equity';
import { parseRange, rangeToPercent, comboCount } from '../../engine/ranges';
import { potOdds, impliedOddsNeeded } from '../../engine/odds';
import { evCall, breakevenFoldFrequency } from '../../engine/ev';
import { makeBot, ArchetypeId } from '../../engine/bots';
import { sizingLines } from '../../curriculum/l6-sizing';
import { budget } from '../../coach/pro';
import { CardRow } from '../components/PlayingCard';

/** Omega only: any hand, any range, any board — the full engine, unrestricted. */
export function LabView({ onExit }: { onExit: () => void }) {
  const [hand, setHand] = useState('AhKh');
  const [board, setBoard] = useState('Qh 7h 2s');
  const [range, setRange] = useState('22+, A2s+, KTs+, QTs+, JTs, AJo+, KQo');
  const [potSize, setPot] = useState('100');
  const [bet, setBet] = useState('66');
  const [opp, setOpp] = useState<ArchetypeId>('tag');
  const [out, setOut] = useState<null | Record<string, string>>(null);
  const [err, setErr] = useState('');

  const run = () => {
    try {
      setErr('');
      const h = parseCards(hand);
      const b = board.trim() ? parseCards(board) : [];
      const r = parseRange(range);
      const P = Number(potSize);
      const B = Number(bet);
      if (h.length !== 2) throw new Error('hand needs exactly two cards');
      const bud = budget(true);
      const eq = computeEquity([asCards(h), asRange(r)], b, {
        iterations: bud.iterations, exactThreshold: bud.exactThreshold, seed: 'lab',
      });
      const e = eq.equity[0]!;
      const price = potOdds(P + B, B);
      const bot = makeBot(opp);
      const lines = b.length >= 3 ? sizingLines(bot, h, b, P, 'CO', 'lab') : [];
      setOut({
        'Your hand': b.length >= 3 ? evaluate([...h, ...b]).name : 'preflop',
        'Range width': `${rangeToPercent(r).toFixed(1)}% · ${comboCount(r, [...h, ...b])} live combos`,
        'Equity': `${(e * 100).toFixed(2)}% ${eq.exact ? `(exact, ${eq.samples.toLocaleString()} runouts)` : `± ${eq.margin95[0]!.toFixed(3)} over ${eq.samples.toLocaleString()} samples`}`,
        'Equity needed to call': `${(price.requiredEquity * 100).toFixed(2)}% (${price.ratioText})`,
        'EV of calling': `${evCall(P + B, B, e).toFixed(2)} chips`,
        'Implied odds needed': impliedOddsNeeded(P + B, B, e) > 0
          ? `${impliedOddsNeeded(P + B, B, e).toFixed(0)} chips` : 'none — already profitable',
        'Bluff needs folds': `${(breakevenFoldFrequency(P, B, 0) * 100).toFixed(1)}%`,
        ...Object.fromEntries(lines.map((l) => [
          `EV ${l.label} (${l.bet}) vs ${bot.name}`,
          `${l.ev >= 0 ? '+' : ''}${l.ev.toFixed(1)} · folds ${(l.fold * 100).toFixed(0)}% calls ${(l.call * 100).toFixed(0)}% raises ${(l.raise * 100).toFixed(0)}%`,
        ])),
      });
    } catch (e) {
      setErr((e as Error).message);
      setOut(null);
    }
  };

  const field = (label: string, v: string, set: (s: string) => void, ph: string) => (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-widest text-amber-200/50">{label}</span>
      <input
        value={v} onChange={(e) => set(e.target.value)} placeholder={ph}
        onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
        className="w-full rounded-lg border border-amber-400/25 bg-black/40 px-3 py-2 font-mono text-sm
                   text-emerald-50 outline-none focus:border-amber-300/60"
      />
    </label>
  );

  let parsed: number[] = [];
  try { parsed = parseCards(hand); } catch { /* mid-typing */ }
  let parsedBoard: number[] = [];
  try { parsedBoard = board.trim() ? parseCards(board) : []; } catch { /* mid-typing */ }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <button onClick={onExit} className="mb-6 text-xs text-emerald-300/60 hover:text-emerald-200">
        ← All levels
      </button>
      <h1 className="text-3xl font-bold tracking-tight text-emerald-50">
        The Lab <span className="align-super text-xs font-bold text-amber-300">OMEGA</span>
      </h1>
      <p className="mt-1 text-emerald-200/60">
        The whole engine with the safety rails off. Full precision: {budget(true).iterations.toLocaleString()} samples.
      </p>

      <div className="panel mt-6 space-y-3 border-amber-400/25 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {field('Your hand', hand, setHand, 'AhKh')}
          {field('Board (blank for preflop)', board, setBoard, 'Qh 7h 2s')}
        </div>
        {field('Villain range', range, setRange, '22+, ATs+, AQo+')}
        <div className="grid gap-3 sm:grid-cols-3">
          {field('Pot', potSize, setPot, '100')}
          {field('Bet facing', bet, setBet, '66')}
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-widest text-amber-200/50">Opponent</span>
            <select
              value={opp} onChange={(e) => setOpp(e.target.value as ArchetypeId)}
              className="w-full rounded-lg border border-amber-400/25 bg-black/40 px-3 py-2 text-sm text-emerald-50 outline-none"
            >
              {(['nit', 'station', 'tag', 'nemesis'] as ArchetypeId[]).map((a) => (
                <option key={a} value={a}>{makeBot(a).name}</option>
              ))}
            </select>
          </label>
        </div>
        {(parsed.length > 0 || parsedBoard.length > 0) && (
          <div className="flex items-end gap-4 pt-1">
            {parsed.length > 0 && <CardRow cards={parsed} size="sm" />}
            {parsedBoard.length > 0 && <CardRow cards={parsedBoard} size="sm" />}
          </div>
        )}
        <button onClick={run} className="btn w-full border-amber-400/50 bg-amber-400/15 py-2.5 text-amber-100 hover:bg-amber-400/25">
          Compute
        </button>
        {err && <p className="text-xs text-rose-300">{err}</p>}
      </div>

      {out && (
        <div className="panel rise mt-4 divide-y divide-emerald-900/40">
          {Object.entries(out).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
              <span className="text-[11px] uppercase tracking-wide text-emerald-200/55">{k}</span>
              <span className="tnum text-right text-sm font-semibold text-emerald-50">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
