import { Card, RANK_CHARS, rankOf, suitOf } from '../../engine/cards';
import { getCardStyle } from '../../coach/settings';
import { getMode } from '../../coach/profile';

/**
 * Cards are drawn entirely in CSS — gradient faces, twin corner indices, a
 * centre pip, patterned backs. No images anywhere, so nothing to license and
 * nothing that is not family friendly by construction.
 *
 * Two decks:
 *   four    — clubs green, diamonds blue, hearts red, spades near-black.
 *             Removes the single most common misread at a glance.
 *   classic — the casino two-colour deck, for people who grew up on it.
 */
const FOUR = [
  { symbol: '♣', text: 'text-emerald-700' },
  { symbol: '♦', text: 'text-sky-600' },
  { symbol: '♥', text: 'text-rose-600' },
  { symbol: '♠', text: 'text-zinc-900' },
];
const CLASSIC = [
  { symbol: '♣', text: 'text-zinc-900' },
  { symbol: '♦', text: 'text-rose-600' },
  { symbol: '♥', text: 'text-rose-600' },
  { symbol: '♠', text: 'text-zinc-900' },
];

const SIZES = {
  sm: { box: 'h-12 w-9 rounded-md', idx: 'text-[11px]', idxPip: 'text-[9px]', pip: 'text-lg', pad: 'p-[3px]' },
  md: { box: 'h-20 w-14 rounded-lg', idx: 'text-base', idxPip: 'text-[11px]', pip: 'text-3xl', pad: 'p-1' },
  lg: { box: 'h-28 w-20 rounded-xl', idx: 'text-xl', idxPip: 'text-sm', pip: 'text-5xl', pad: 'p-1.5' },
};

const FACE = new Set([11, 12, 13]);

export function PlayingCard({
  card, size = 'md', dim = false, ring = false, deal = false, delayMs = 0, float = false,
}: {
  card: Card;
  size?: keyof typeof SIZES;
  dim?: boolean;
  ring?: boolean;
  /** Animate in as if dealt from the deck. */
  deal?: boolean;
  delayMs?: number;
  float?: boolean;
}) {
  const s = SIZES[size];
  const deck = getCardStyle() === 'classic' ? CLASSIC : FOUR;
  const suit = deck[suitOf(card)]!;
  const r = rankOf(card);
  const rank = RANK_CHARS[r - 2]!;
  const isFace = FACE.has(r);
  const isAceOfSpades = r === 14 && suitOf(card) === 3;

  return (
    <div
      className={[
        s.box, s.pad, 'card-face relative flex select-none flex-col justify-between leading-none',
        ring ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-black/60' : '',
        dim ? 'opacity-35 saturate-50' : '',
        deal ? 'deal' : '',
        float ? 'card-float' : '',
      ].join(' ')}
      style={deal || float ? { animationDelay: `${delayMs}ms` } : undefined}
      aria-label={`${rank}${suit.symbol}`}
    >
      {/* top-left index */}
      <span className={`flex flex-col items-center self-start font-bold ${suit.text}`} style={{ width: '1.1em' }}>
        <span className={s.idx}>{rank}</span>
        <span className={`${s.idxPip} -mt-0.5`}>{suit.symbol}</span>
      </span>

      {/* centre */}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {isFace ? (
          <span className={`flex flex-col items-center ${suit.text}`}>
            <span
              className={`${s.pip} font-serif font-black`}
              style={{ textShadow: '0 1px 0 rgba(0,0,0,0.12)' }}
            >
              {rank}
            </span>
            <span className={`${s.idxPip} -mt-1`}>{suit.symbol}</span>
          </span>
        ) : (
          <span
            className={`${s.pip} ${suit.text} ${isAceOfSpades ? 'scale-125' : ''}`}
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.15)' }}
          >
            {suit.symbol}
          </span>
        )}
      </span>

      {/* bottom-right index, rotated the traditional way */}
      <span
        className={`flex rotate-180 flex-col items-center self-end font-bold ${suit.text}`}
        style={{ width: '1.1em' }}
      >
        <span className={s.idx}>{rank}</span>
        <span className={`${s.idxPip} -mt-0.5`}>{suit.symbol}</span>
      </span>
    </div>
  );
}

export function CardRow({
  cards, size = 'md', highlight, className = '', deal = false, float = false,
}: {
  cards: Card[];
  size?: keyof typeof SIZES;
  /** Cards to ring; anything not listed is dimmed. Omit to show all equally. */
  highlight?: Card[];
  className?: string;
  deal?: boolean;
  float?: boolean;
}) {
  const hl = highlight ? new Set(highlight) : null;
  return (
    <div className={`flex gap-1.5 ${className}`}>
      {cards.map((c, i) => (
        <PlayingCard
          key={`${c}-${i}`}
          card={c}
          size={size}
          ring={hl ? hl.has(c) : false}
          dim={hl ? !hl.has(c) : false}
          deal={deal}
          delayMs={i * 90}
          float={float}
        />
      ))}
    </div>
  );
}

export function CardBack({ size = 'md', deal = false, delayMs = 0 }: {
  size?: keyof typeof SIZES;
  deal?: boolean;
  delayMs?: number;
}) {
  const s = SIZES[size];
  return (
    <div
      className={`${s.box} card-back ${deal ? 'deal' : ''}`}
      style={deal ? { animationDelay: `${delayMs}ms` } : undefined}
    />
  );
}

/**
 * The table money, drawn to match the mode's promise: kids were told "stars
 * instead of real money", so kids get stars, adults get CSS casino chips.
 */
export function ChipStack({ small = false }: { small?: boolean }) {
  if (getMode() === 'kid') {
    return (
      <span className={`inline-flex items-center ${small ? 'text-xs' : 'text-base'}`} aria-hidden>
        <span>⭐</span>
        <span className="-ml-1">⭐</span>
        <span className="-ml-1">⭐</span>
      </span>
    );
  }
  const d = small ? 'h-3.5 w-3.5' : 'h-5 w-5';
  return (
    <span className="inline-flex items-center" aria-hidden>
      <span className={`chip ${d} rounded-full`} />
      <span className={`chip chip-b ${d} -ml-2 rounded-full`} />
      <span className={`chip chip-c ${d} -ml-2 rounded-full`} />
    </span>
  );
}
