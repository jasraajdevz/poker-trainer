import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, cardsToString } from '../../engine/cards';
import { evaluate } from '../../engine/evaluator';
import { HoleSpec, asCards, asCombos, asRange, computeEquity } from '../../engine/equity';
import { ArchetypeId, Bot, makeBot, rankRange } from '../../engine/bots';
import { Position } from '../../engine/preflopChart';
import { evCall, evCheck, evBet } from '../../engine/ev';
import { potOdds } from '../../engine/odds';
import {
  ActionRecord, HandState, PlayerAction, applyAction, legalActions, netResult, newHand, pot, runBots,
} from '../../engine/game';
import { L8_COACHED_HANDS } from '../../curriculum/l8-fullhands';
import { sizingLines } from '../../curriculum/l6-sizing';
import { budget } from '../../coach/pro';
import { CardRow } from '../components/PlayingCard';

interface HeroNode {
  street: string;
  board: Card[];
  cards: Card[];
  pot: number;
  toCall: number;
  oppBot: ArchetypeId;
  oppSeat: Position;
  action: PlayerAction;
  amount: number;
}

interface Analysed extends HeroNode { best: string; chosen: string; evLost: number; equity: number; }

/**
 * What the opponent can still hold. Preflop that is their whole opening range;
 * once there is a board, a player who keeps putting money in is not showing up
 * with the bottom of it, so we narrow to the strongest 60% on this exact board.
 * Ranked by the evaluator, not by a table of "hands they continue with".
 */
function oppSpec(bot: Bot, seat: Position, board: Card[], dead: Card[]): HoleSpec {
  const range = bot.openingRange(seat);
  if (board.length < 3) return asRange(range);
  const ranked = rankRange(range, board, dead, 0.5);
  const keep = Math.max(4, Math.round(ranked.length * 0.6));
  return asCombos(ranked.slice(0, keep).map((r) => r.combo));
}

const HANDS = 10;
const HERO_SEATS: Position[] = ['BTN', 'CO', 'SB', 'HJ', 'BB', 'UTG', 'BTN', 'CO', 'BB', 'BTN'];
const CAST: ArchetypeId[] = ['tag', 'station', 'nit', 'tag', 'station'];

export function HandPlayView({ pro, onExit }: { pro: boolean; onExit: () => void }) {
  const [handNo, setHandNo] = useState(0);
  const [seed] = useState(() => `h${Date.now()}`);
  const [state, setState] = useState<HandState | null>(null);
  const [nodes, setNodes] = useState<HeroNode[]>([]);
  const [hint, setHint] = useState<{ equity: number; need: number; margin: number } | null>(null);
  const [review, setReview] = useState<Analysed[] | null>(null);
  const [scores, setScores] = useState<Array<{ net: number; evLost: number; coached: boolean }>>([]);
  const [raiseOpen, setRaiseOpen] = useState(false);

  const coached = handNo < L8_COACHED_HANDS;
  const heroSeat = HERO_SEATS[handNo % HERO_SEATS.length]!;
  const heroId = useMemo(
    () => ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'].indexOf(heroSeat),
    [heroSeat],
  );

  const deal = useCallback(() => {
    let s = newHand({ heroPosition: heroSeat, bots: pro ? [...CAST, 'nemesis'] : CAST, seed: `${seed}:${handNo}` });
    s = runBots(s, heroId);
    setState({ ...s });
    setNodes([]);
    setHint(null);
    setReview(null);
    setRaiseOpen(false);
  }, [heroSeat, heroId, seed, handNo, pro]);

  useEffect(() => { if (handNo < HANDS) deal(); }, [deal, handNo]);

  const oppInfo = useCallback((s: HandState) => {
    const opp = s.seats.find((x) => !x.isHero && !x.folded) ?? s.seats.find((x) => !x.isHero)!;
    return { bot: opp.botId ?? 'tag', seat: opp.position };
  }, []);

  const act = useCallback((action: PlayerAction) => {
    if (!state || state.complete) return;
    const legal = legalActions(state);
    const info = oppInfo(state);
    const hero = state.seats[heroId]!;
    // Build this eagerly: applyAction mutates the board array in place, so a
    // lazy updater would read the state AFTER the action instead of before it.
    const node: HeroNode = {
      street: state.street, board: [...state.board], cards: [...hero.cards],
      pot: pot(state), toCall: legal.callAmount, oppBot: info.bot as ArchetypeId,
      oppSeat: info.seat, action,
      amount: action.type === 'bet' || action.type === 'raise' ? action.to : legal.callAmount,
    };
    setNodes((n) => [...n, node]);
    let s = { ...state };
    s = runBots(applyAction(s, action), heroId);
    setState({ ...s });
    setHint(null);
    setRaiseOpen(false);
  }, [state, heroId, oppInfo]);

  const showHint = useCallback(() => {
    if (!state) return;
    const hero = state.seats[heroId]!;
    const info = oppInfo(state);
    const bot = makeBot(info.bot as ArchetypeId);
    const b = budget(pro);
    const r = computeEquity([asCards(hero.cards), oppSpec(bot, info.seat, state.board, hero.cards)], state.board, {
      iterations: Math.min(b.iterations, 60_000), seed: `hint:${handNo}:${state.history.length}`,
      forceMonteCarlo: true,
    });
    const legal = legalActions(state);
    setHint({
      equity: r.equity[0]! * 100,
      need: legal.callAmount > 0 ? potOdds(pot(state), legal.callAmount).requiredEquity * 100 : 0,
      margin: r.margin95[0]!,
    });
  }, [state, heroId, oppInfo, pro, handNo]);

  const finishHand = useCallback(() => {
    if (!state) return;
    const b = budget(pro);
    const analysed: Analysed[] = nodes.map((n) => {
      const bot = makeBot(n.oppBot);
      const range = bot.openingRange(n.oppSeat);
      const eq = computeEquity([asCards(n.cards), oppSpec(bot, n.oppSeat, n.board, n.cards)], n.board, {
        iterations: Math.min(b.iterations, 40_000), seed: `rev:${n.street}:${n.pot}`, forceMonteCarlo: true,
      }).equity[0]!;
      const opts: Array<{ label: string; ev: number; key: string }> = [];
      if (n.toCall > 0) {
        opts.push({ label: 'Fold', ev: 0, key: 'fold' });
        opts.push({ label: `Call ${n.toCall}`, ev: evCall(n.pot, n.toCall, eq), key: 'call' });
      } else {
        opts.push({ label: 'Check', ev: evCheck(n.pot, eq), key: 'check' });
      }
      if (n.board.length >= 3) {
        // Omega prices every size at this node; the free tier prices one.
        if (pro) {
          for (const l of sizingLines(bot, n.cards, n.board, n.pot, n.oppSeat, `rev:${n.pot}`)) {
            opts.push({ label: `${n.toCall > 0 ? 'Raise' : 'Bet'} ${l.bet}`, ev: l.ev, key: 'aggr' });
          }
        } else {
          const size = Math.max(10, Math.round(n.pot * 0.66));
          const r = bot.respondTo(n.cards, n.board, n.pot, size, range, `rev:${n.pot}`);
          opts.push({ label: `${n.toCall > 0 ? 'Raise' : 'Bet'} ${size}`, ev: evBet(n.pot, size, r), key: 'aggr' });
        }
      }
      opts.sort((x, y) => y.ev - x.ev);
      const chosenKey = n.action.type === 'fold' ? 'fold'
        : n.action.type === 'call' ? 'call'
          : n.action.type === 'check' ? 'check' : 'aggr';
      const mine = opts.find((o) => o.key === chosenKey) ?? opts[opts.length - 1]!;
      return {
        ...n, equity: eq * 100, best: opts[0]!.label, chosen: mine.label,
        evLost: Math.max(0, opts[0]!.ev - mine.ev) / state.bigBlind,
      };
    });
    setReview(analysed);
    setScores((s) => [...s, {
      net: netResult(state, heroId) / state.bigBlind,
      evLost: analysed.reduce((n, a) => n + a.evLost, 0),
      coached,
    }]);
  }, [state, nodes, pro, heroId, coached]);

  useEffect(() => {
    if (state?.complete && !review) finishHand();
  }, [state?.complete, review, finishHand, state]);

  // Keyboard: F / C / R, digits pick a size, space advances.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onExit(); return; }
      if (!state) return;
      if (state.complete) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setHandNo((h) => h + 1); }
        return;
      }
      if (state.toAct !== heroId) return;
      const legal = legalActions(state);
      const k = e.key.toLowerCase();
      if (k === 'f' && legal.canFold) act({ type: 'fold' });
      else if (k === 'c') act(legal.canCheck ? { type: 'check' } : { type: 'call' });
      else if (k === 'r' && legal.canRaise) setRaiseOpen(true);
      else if (k === 'h' && coached) showHint();
      else if (raiseOpen && '1234'.includes(k)) {
        const fr = [0.33, 0.66, 1, 2][Number(k) - 1]!;
        const to = Math.min(legal.maxTo, Math.max(legal.minRaiseTo, Math.round(pot(state) * fr)));
        act({ type: legal.canCheck ? 'bet' : 'raise', to });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, heroId, act, raiseOpen, coached, showHint, onExit]);

  if (handNo >= HANDS) {
    const scored = scores.filter((s) => !s.coached);
    const net = scored.reduce((n, s) => n + s.net, 0);
    const lost = scored.reduce((n, s) => n + s.evLost, 0);
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-bold text-emerald-50">Session complete</h1>
        <div className="panel mt-6 grid grid-cols-3 gap-px overflow-hidden bg-emerald-900/40">
          <Box label="Scored hands" value={String(scored.length)} />
          <Box label="Net result" value={`${net >= 0 ? '+' : ''}${net.toFixed(1)} bb`} tone={net >= 0 ? 'good' : 'bad'} />
          <Box label="EV given up" value={`${lost.toFixed(2)} bb`} tone="bad" />
        </div>
        <p className="mt-4 text-sm text-emerald-200/60">
          Net result is mostly luck over ten hands. EV given up is not — that number is yours.
        </p>
        <button onClick={onExit} className="btn-primary mt-6">Back to levels</button>
      </div>
    );
  }

  if (!state) return null;
  const hero = state.seats[heroId]!;
  const legal = legalActions(state);
  const heroTurn = state.toAct === heroId && !state.complete;

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <header className="mb-4 flex items-center justify-between">
        <button onClick={onExit} className="text-xs text-emerald-300/60 hover:text-emerald-200">← Exit</button>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-emerald-200/50">Hand {handNo + 1} / {HANDS}</span>
          <span className={coached ? 'text-emerald-300' : 'text-amber-300'}>
            {coached ? 'Coach mode ON' : 'Scored — coach off'}
          </span>
          <span className="text-emerald-200/50">You are {heroSeat}</span>
        </div>
      </header>

      <div className="panel mb-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-widest text-emerald-200/50">{state.street}</span>
          <span className="tnum text-sm">Pot <b className="text-amber-300">{pot(state)}</b></span>
        </div>
        <CardRow cards={state.board} size="lg" />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {state.seats.map((s) => (
          <div
            key={s.id}
            className={`panel px-3 py-2 text-xs ${
              s.folded ? 'opacity-30' : s.id === state.toAct ? 'border-amber-400/60' : ''
            } ${s.isHero ? 'border-emerald-500/50' : ''}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-emerald-100">{s.isHero ? `You (${s.position})` : s.name}</span>
              <span className="tnum text-emerald-200/60">{s.stack}</span>
            </div>
            {(s.isHero || state.complete) && (
              <div className="mt-1.5"><CardRow cards={s.cards} size="sm" /></div>
            )}
            {s.streetCommitted > 0 && (
              <div className="tnum mt-1 text-[11px] text-amber-300/80">in {s.streetCommitted}</div>
            )}
          </div>
        ))}
      </div>

      {heroTurn && (
        <div className="panel p-4">
          <div className="mb-3 text-sm text-emerald-100">
            {legal.callAmount > 0 ? `${legal.callAmount} to call` : 'Checked to you'}
            {hero.cards.length > 0 && state.board.length >= 3 && (
              <span className="ml-3 text-emerald-200/50">
                You have {evaluate([...hero.cards, ...state.board]).name}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {legal.canFold && <Btn hotkey="f" label="Fold" onClick={() => act({ type: 'fold' })} />}
            <Btn
              hotkey="c"
              label={legal.canCheck ? 'Check' : `Call ${legal.callAmount}`}
              onClick={() => act(legal.canCheck ? { type: 'check' } : { type: 'call' })}
            />
            {legal.canRaise && <Btn hotkey="r" label={legal.canCheck ? 'Bet' : 'Raise'} onClick={() => setRaiseOpen(!raiseOpen)} />}
            {coached && <Btn hotkey="h" label="Hint" onClick={showHint} tone="amber" />}
          </div>
          {raiseOpen && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[['1', 0.33, '33%'], ['2', 0.66, '66%'], ['3', 1, 'Pot'], ['4', 2, 'All in']].map(([k, fr, lab]) => (
                <Btn
                  key={k as string}
                  hotkey={k as string}
                  label={lab as string}
                  onClick={() => act({
                    type: legal.canCheck ? 'bet' : 'raise',
                    to: Math.min(legal.maxTo, Math.max(legal.minRaiseTo, Math.round(pot(state) * (fr as number)))),
                  })}
                />
              ))}
            </div>
          )}
          {hint && (
            <div className="rise mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
              <span className="tnum">
                Equity <b className="text-emerald-300">{hint.equity.toFixed(1)}%</b>
                <span className="text-emerald-200/40"> ±{hint.margin.toFixed(2)}</span>
                {hint.need > 0 && (
                  <> · you need <b className="text-amber-300">{hint.need.toFixed(1)}%</b> to call</>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {state.complete && review && (
        <Review state={state} review={review} heroId={heroId} onNext={() => setHandNo(handNo + 1)} />
      )}
    </div>
  );
}

function Review({
  state, review, heroId, onNext,
}: {
  state: HandState; review: Analysed[]; heroId: number; onNext: () => void;
}) {
  const net = netResult(state, heroId) / state.bigBlind;
  const lost = review.reduce((n, a) => n + a.evLost, 0);
  const botLines = state.history.filter((h: ActionRecord) => h.reasoning?.length);
  return (
    <div className="rise panel mt-4 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-emerald-100">Hand review</h2>
        <span className="tnum text-sm">
          <span className={net >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
            {net >= 0 ? '+' : ''}{net.toFixed(1)} bb
          </span>
          <span className="ml-3 text-rose-300/80">−{lost.toFixed(2)} bb EV</span>
        </span>
      </div>

      {review.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {review.map((r, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-emerald-200/55">
                {r.street}{r.board.length ? ` · ${cardsToString(r.board)}` : ''} · pot {r.pot}
              </span>
              <span className="tnum shrink-0">
                <span className={r.evLost < 0.05 ? 'text-emerald-300' : 'text-rose-300'}>{r.chosen}</span>
                {r.evLost >= 0.05 && <span className="ml-2 text-emerald-200">best: {r.best}</span>}
                <span className="ml-2 text-emerald-200/40">eq {r.equity.toFixed(0)}%</span>
                {r.evLost >= 0.05 && <span className="ml-2 text-rose-300/80">−{r.evLost.toFixed(2)}bb</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {botLines.length > 0 && (
        <div className="mb-3 space-y-1 border-t border-emerald-900/50 pt-3">
          <div className="text-[11px] uppercase tracking-widest text-emerald-200/40">What they were thinking</div>
          {botLines.slice(-4).map((h, i) => (
            <p key={i} className="text-xs leading-relaxed text-emerald-200/60">
              <b className="text-emerald-100/80">{h.name}</b> {h.action}
              {h.amount ? ` ${h.amount}` : ''} — {h.reasoning!.join(' ')}
            </p>
          ))}
        </div>
      )}

      <div className="border-t border-emerald-900/50 pt-3">
        {state.awards.map((a, i) => (
          <div key={i} className="tnum text-xs text-emerald-200/60">
            {a.label} {a.amount} → {a.winners.map((w) => state.seats[w]!.name).join(', ')}
          </div>
        ))}
      </div>

      <button className="btn-primary mt-4" onClick={onNext}>
        Next hand <span className="kbd ml-2">space</span>
      </button>
    </div>
  );
}

function Btn({ hotkey, label, onClick, tone }: { hotkey: string; label: string; onClick: () => void; tone?: 'amber' }) {
  return (
    <button
      onClick={onClick}
      className={`btn flex items-center gap-2 ${
        tone === 'amber'
          ? 'border-amber-400/50 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20'
          : 'btn-primary'
      }`}
    >
      <span className="kbd">{hotkey}</span>{label}
    </button>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="bg-black/30 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-emerald-200/50">{label}</div>
      <div className={`tnum mt-0.5 text-xl font-bold ${
        tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-emerald-50'}`}>
        {value}
      </div>
    </div>
  );
}
