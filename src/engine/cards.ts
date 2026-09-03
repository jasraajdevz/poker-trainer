/**
 * cards.ts — card representation, parsing, deck construction, seedable RNG.
 *
 * A Card is a plain integer 0..51 so that hot loops (equity Monte Carlo) never
 * allocate. Encoding: card = (rank - 2) * 4 + suit
 *   rank: 2..14 (14 = Ace)
 *   suit: 0=clubs 1=diamonds 2=hearts 3=spades
 */

export type Card = number;
export type Rank = number; // 2..14
export type Suit = 0 | 1 | 2 | 3;

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs';

export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠']; // ♣ ♦ ♥ ♠
export const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];

export const RANK_NAMES: Record<number, string> = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight',
  9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};

export const RANK_PLURALS: Record<number, string> = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens',
  8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings',
  14: 'Aces',
};

export const rankOf = (c: Card): Rank => (c >> 2) + 2;
export const suitOf = (c: Card): Suit => (c & 3) as Suit;
export const makeCard = (rank: Rank, suit: Suit): Card => (rank - 2) * 4 + suit;

export function rankName(r: Rank): string {
  const n = RANK_NAMES[r];
  if (!n) throw new Error(`bad rank ${r}`);
  return n;
}

export function rankPlural(r: Rank): string {
  const n = RANK_PLURALS[r];
  if (!n) throw new Error(`bad rank ${r}`);
  return n;
}

/** "As" -> Card. Rank char is case-insensitive, suit char must be c/d/h/s (or CDHS). */
export function parseCard(s: string): Card {
  if (s.length !== 2) throw new Error(`bad card "${s}"`);
  const ri = RANK_CHARS.indexOf(s[0]!.toUpperCase());
  const si = SUIT_CHARS.indexOf(s[1]!.toLowerCase());
  if (ri < 0) throw new Error(`bad rank in card "${s}"`);
  if (si < 0) throw new Error(`bad suit in card "${s}"`);
  return makeCard(ri + 2, si as Suit);
}

/** "AsKd" / "As Kd" / "As,Kd" / "As Kd Qh" -> Card[] */
export function parseCards(s: string): Card[] {
  const cleaned = s.replace(/[\s,]+/g, '');
  if (cleaned.length % 2 !== 0) throw new Error(`bad card list "${s}"`);
  const out: Card[] = [];
  for (let i = 0; i < cleaned.length; i += 2) out.push(parseCard(cleaned.slice(i, i + 2)));
  return out;
}

export function cardToString(c: Card): string {
  return RANK_CHARS[rankOf(c) - 2]! + SUIT_CHARS[suitOf(c)]!;
}

export function cardsToString(cards: Card[]): string {
  return cards.map(cardToString).join(' ');
}

export function makeDeck(): Card[] {
  const d: Card[] = [];
  for (let i = 0; i < 52; i++) d.push(i);
  return d;
}

// ---------------------------------------------------------------------------
// Seedable RNG (mulberry32). Deterministic across runs so drills reproduce.
// ---------------------------------------------------------------------------

export interface Rng {
  /** float in [0,1) */
  next(): number;
  /** integer in [0, n) */
  int(n: number): number;
  /** uniform pick */
  pick<T>(arr: readonly T[]): T;
}

export function createRng(seed: number | string): Rng {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('pick from empty array');
      return arr[Math.floor(next() * arr.length)]!;
    },
  };
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** In-place Fisher-Yates. Returns the same array for convenience. */
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** Deck with the given cards removed (dead cards). */
export function deckWithout(dead: readonly Card[]): Card[] {
  const used = new Uint8Array(52);
  for (const c of dead) {
    if (c < 0 || c > 51) throw new Error(`card out of range: ${c}`);
    if (used[c]) throw new Error(`duplicate card: ${cardToString(c)}`);
    used[c] = 1;
  }
  const out: Card[] = [];
  for (let i = 0; i < 52; i++) if (!used[i]) out.push(i);
  return out;
}

export function assertNoDuplicates(cards: readonly Card[]): void {
  const seen = new Uint8Array(52);
  for (const c of cards) {
    if (seen[c]) throw new Error(`duplicate card: ${cardToString(c)}`);
    seen[c] = 1;
  }
}
