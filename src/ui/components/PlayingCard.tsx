import { Card, RANK_CHARS, rankOf, suitOf } from '../../engine/cards';

/**
 * Four-colour deck. Two black suits at a glance is the single most common
 * misread, and this app is graded on reading speed.
 */
const SUITS = [
  { symbol: '♣', text: 'text-emerald-700' }, // clubs
  { symbol: '♦', text: 'text-sky-600' },     // diamonds
  { symbol: '♥', text: 'text-rose-600' },    // hearts
  { symbol: '♠', text: 'text-zinc-900' },    // spades
];

const SIZES = {
  sm: { box: 'h-12 w-9 rounded', rank: 'text-base', pip: 'text-base', pad: 'p-0.5' },
  md: { box: 'h-20 w-14 rounded-md', rank: 'text-2xl', pip: 'text-2xl', pad: 'p-1' },
  lg: { box: 'h-28 w-20 rounded-lg', rank: 'text-4xl', pip: 'text-4xl', pad: 'p-1.5' },
};

export function PlayingCard({
  card, size = 'md', dim = false, ring = false,
}: {
  card: Card;
  size?: keyof typeof SIZES;
  dim?: boolean;
  ring?: boolean;
}) {
  const s = SIZES[size];
  const suit = SUITS[suitOf(card)]!;
  const rank = RANK_CHARS[rankOf(card) - 2]!;
  return (
    <div
      className={[
        s.box, s.pad,
        'relative flex flex-col justify-between bg-zinc-50 shadow-lg shadow-black/40',
        'select-none leading-none',
        ring ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-emerald-950' : '',
        dim ? 'opacity-35 saturate-50' : '',
      ].join(' ')}
      aria-label={`${rank}${suit.symbol}`}
    >
      <span className={`font-bold ${s.rank} ${suit.text}`}>{rank}</span>
      <span className={`self-end ${s.pip} ${suit.text}`}>{suit.symbol}</span>
    </div>
  );
}

export function CardRow({
  cards, size = 'md', highlight, className = '',
}: {
  cards: Card[];
  size?: keyof typeof SIZES;
  /** Cards to ring; anything not listed is dimmed. Omit to show all equally. */
  highlight?: Card[];
  className?: string;
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
        />
      ))}
    </div>
  );
}

export function CardBack({ size = 'md' }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <div
      className={`${s.box} border border-emerald-700/50 bg-gradient-to-br from-emerald-900 to-emerald-950 shadow-lg shadow-black/40`}
    />
  );
}
