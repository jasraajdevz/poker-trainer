import { evaluate } from '../../engine/evaluator';
import { Scene } from '../../curriculum/types';
import { CardRow, ChipStack } from './PlayingCard';
import { getMode, terms } from '../../coach/profile';

const STREET_LABEL: Record<string, string> = {
  preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River',
};

function Seat({
  label, cards, hint, reveal, board, tone,
}: {
  label: string;
  cards: number[];
  hint?: string;
  reveal: boolean;
  board: number[];
  tone?: 'hero' | 'villain' | 'neutral';
}) {
  const read = reveal && board.length >= 3 ? evaluate([...cards, ...board]) : null;
  const border =
    tone === 'hero' ? 'border-emerald-500/40'
      : tone === 'villain' ? 'border-rose-500/30'
        : 'border-emerald-900/60';
  return (
    <div className={`panel border ${border} px-3 py-2.5`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-200/60">{label}</span>
        {hint && <span className="text-[11px] text-emerald-200/40">{hint}</span>}
      </div>
      <CardRow cards={cards} size="md" highlight={read ? read.best5 : undefined} />
      {read && (
        <div className="mt-2 text-xs font-medium text-emerald-100/85">{read.name}</div>
      )}
    </div>
  );
}

export function PokerTable({ scene, reveal }: { scene: Scene; reveal: boolean }) {
  const t = terms(getMode());
  const board = scene.board ?? [];
  const heroRead = scene.heroCards && board.length >= 3 ? evaluate([...scene.heroCards, ...board]) : null;

  return (
    <div className="space-y-4">
      {scene.caption && (
        <p className="text-sm leading-relaxed text-emerald-100/70">{scene.caption}</p>
      )}

      {/* Board */}
      <div className="panel px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-200/60">
            {STREET_LABEL[scene.street ?? 'flop'] ?? 'Board'}
          </span>
          {scene.potChips !== undefined && (
            <span className="tnum flex items-center gap-2 text-sm text-emerald-100">
              <ChipStack small />
              <span>
                {getMode() === 'kid' ? 'Star pile' : 'Pot'}{' '}
                <b className="text-amber-300">{scene.potChips}</b>
              </span>
              {scene.bigBlind && getMode() !== 'kid' && (
                <span className="text-emerald-200/45"> · {(scene.potChips / scene.bigBlind).toFixed(0)}bb</span>
              )}
            </span>
          )}
        </div>
        <CardRow cards={board} size="lg" deal />
      </div>

      {/* Hands */}
      {scene.hands && (
        <div className="grid gap-3 sm:grid-cols-2">
          {scene.hands.map((h) => (
            <Seat key={h.label} label={h.label} cards={h.cards} hint={h.hint} reveal={reveal} board={board} />
          ))}
        </div>
      )}

      {(scene.heroCards || scene.villainCards) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {scene.heroCards && (
            <div className="panel border border-emerald-500/40 px-3 py-2.5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-200/60">
                You
              </div>
              <CardRow cards={scene.heroCards} size="md" deal highlight={reveal && heroRead ? heroRead.best5 : undefined} />
              {heroRead && <div className="mt-2 text-xs font-medium text-emerald-100/85">{heroRead.name}</div>}
            </div>
          )}
          {scene.villainCards && (
            <Seat
              label={
                getMode() === 'kid'
                  ? (scene.villainLabel ?? 'Villain').replace('Villain', 'The other player')
                  : (scene.villainLabel ?? 'Villain')
              }
              cards={scene.villainCards}
              reveal={board.length >= 3}
              board={board}
              tone="villain"
            />
          )}
          {!scene.villainCards && scene.villainRangeText && (
            <div className="panel border border-rose-500/30 px-3 py-2.5">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-200/60">
                {t.opponent === 'villain' ? 'Villain' : 'The other player'}{scene.villainPosition ? ` · ${scene.villainPosition}` : ''}
              </div>
              <div className="text-sm text-emerald-100/85">{scene.villainRangeText}</div>
              <div className="mt-2 text-[11px] leading-snug text-emerald-200/40">
                A model of what they are betting, built by ranking their opening range on this
                board. Your equity is computed against every combo in it.
              </div>
              {scene.betChips !== undefined && (
                <div className="tnum mt-2 text-sm text-rose-200">
                  {getMode() === 'kid' ? 'Adds' : 'Bets'} <b>{scene.betChips}</b>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
