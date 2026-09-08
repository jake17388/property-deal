// ============================================================
// AMERICAN MAHJONG — Tile Definitions
// 160 tiles total:
//   3 suits x 9 numbers x 4  = 108
//   3 dragons x 4            =  12
//   4 winds x 4              =  16
//   flowers                  =  10
//   jokers                   =  10
//   blanks                   =   4
// ============================================================

export const SUIT = {
  GREEN: 'green',   // "Suit A"
  RED:   'red',     // "Suit B"
  BLACK: 'black',   // "Suit C"
};

export const SUITS = [SUIT.GREEN, SUIT.RED, SUIT.BLACK];

// Each suit owns a dragon. Matching the physical set: green suit ↔ green
// dragon, red suit ↔ red dragon, black suit ↔ the black "Soap" dragon.
export const SUIT_DRAGON = {
  [SUIT.GREEN]: 'green',
  [SUIT.RED]:   'red',
  [SUIT.BLACK]: 'soap',
};

export const DRAGON_SUIT = Object.fromEntries(
  Object.entries(SUIT_DRAGON).map(([s, d]) => [d, s])
);

export const WINDS = ['N', 'E', 'S', 'W'];

export const TILE_KIND = {
  NUMBER: 'number',
  DRAGON: 'dragon',
  WIND:   'wind',
  FLOWER: 'flower',
  JOKER:  'joker',
  BLANK:  'blank',
};

export const SUIT_STYLE = {
  [SUIT.GREEN]: { bg: '#16a34a', light: '#f0fdf4', label: 'Green' },
  [SUIT.RED]:   { bg: '#dc2626', light: '#fef2f2', label: 'Red' },
  [SUIT.BLACK]: { bg: '#111827', light: '#f9fafb', label: 'Black' },
};

export const DRAGON_STYLE = {
  green: { bg: '#16a34a', light: '#f0fdf4', label: 'Green Dragon', glyph: 'D' },
  red:   { bg: '#dc2626', light: '#fef2f2', label: 'Red Dragon',   glyph: 'D' },
  soap:  { bg: '#111827', light: '#f9fafb', label: 'Soap',         glyph: '0' },
};

export const WIND_LABEL = { N: 'North', E: 'East', S: 'South', W: 'West' };

// ── Tile identity ────────────────────────────────────────────
// `key` is what the matcher compares: two tiles with the same key are
// interchangeable. `id` is unique per physical tile.

export function tileKey(tile) {
  switch (tile.kind) {
    case TILE_KIND.NUMBER: return `n:${tile.suit}:${tile.num}`;
    case TILE_KIND.DRAGON: return `d:${tile.dragon}`;
    case TILE_KIND.WIND:   return `w:${tile.wind}`;
    case TILE_KIND.FLOWER: return 'f';
    case TILE_KIND.JOKER:  return 'j';
    case TILE_KIND.BLANK:  return 'b';
    default:               return '?';
  }
}

export function numberKey(suit, num) { return `n:${suit}:${num}`; }
export function dragonKey(dragon)    { return `d:${dragon}`; }
export function windKey(wind)        { return `w:${wind}`; }
export const FLOWER_KEY = 'f';
export const JOKER_KEY  = 'j';
export const BLANK_KEY  = 'b';

// How many of each key physically exist — the matcher uses this to throw out
// win conditions that would need more copies than the set contains.
export function keySupply(key) {
  if (key === FLOWER_KEY) return 10;
  if (key === JOKER_KEY)  return 10;
  if (key === BLANK_KEY)  return 4;
  return 4;
}

export function tileFromKey(key) {
  if (key === FLOWER_KEY) return { kind: TILE_KIND.FLOWER };
  if (key === JOKER_KEY)  return { kind: TILE_KIND.JOKER };
  if (key === BLANK_KEY)  return { kind: TILE_KIND.BLANK };
  const [k, a, b] = key.split(':');
  if (k === 'n') return { kind: TILE_KIND.NUMBER, suit: a, num: Number(b) };
  if (k === 'd') return { kind: TILE_KIND.DRAGON, dragon: a };
  if (k === 'w') return { kind: TILE_KIND.WIND,   wind: a };
  return { kind: TILE_KIND.BLANK };
}

export function tileLabel(tile) {
  switch (tile.kind) {
    case TILE_KIND.NUMBER: return `${tile.num} ${SUIT_STYLE[tile.suit].label}`;
    case TILE_KIND.DRAGON: return DRAGON_STYLE[tile.dragon].label;
    case TILE_KIND.WIND:   return WIND_LABEL[tile.wind];
    case TILE_KIND.FLOWER: return 'Flower';
    case TILE_KIND.JOKER:  return 'Joker';
    case TILE_KIND.BLANK:  return 'Blank';
    default:               return 'Tile';
  }
}

export function keyLabel(key) { return tileLabel(tileFromKey(key)); }

// ── Deck ─────────────────────────────────────────────────────

export function buildDeck() {
  const tiles = [];
  let n = 0;
  const push = t => tiles.push({ ...t, id: `t${n++}`, key: tileKey(t) });

  for (const suit of SUITS) {
    for (let num = 1; num <= 9; num++) {
      for (let i = 0; i < 4; i++) push({ kind: TILE_KIND.NUMBER, suit, num });
    }
  }
  for (const dragon of ['green', 'red', 'soap']) {
    for (let i = 0; i < 4; i++) push({ kind: TILE_KIND.DRAGON, dragon });
  }
  for (const wind of WINDS) {
    for (let i = 0; i < 4; i++) push({ kind: TILE_KIND.WIND, wind });
  }
  for (let i = 0; i < 10; i++) push({ kind: TILE_KIND.FLOWER });
  for (let i = 0; i < 10; i++) push({ kind: TILE_KIND.JOKER });
  for (let i = 0; i < 4;  i++) push({ kind: TILE_KIND.BLANK });

  return tiles;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Stable display order so a player's rack doesn't jump around between renders.
const KIND_ORDER = {
  [TILE_KIND.NUMBER]: 0,
  [TILE_KIND.DRAGON]: 1,
  [TILE_KIND.WIND]:   2,
  [TILE_KIND.FLOWER]: 3,
  [TILE_KIND.JOKER]:  4,
  [TILE_KIND.BLANK]:  5,
};
const SUIT_ORDER   = { [SUIT.GREEN]: 0, [SUIT.RED]: 1, [SUIT.BLACK]: 2 };
const DRAGON_ORDER = { green: 0, red: 1, soap: 2 };
const WIND_ORDER   = { N: 0, E: 1, S: 2, W: 3 };

export function sortTiles(tiles) {
  return [...tiles].sort((a, b) => {
    const ka = KIND_ORDER[a.kind] ?? 9, kb = KIND_ORDER[b.kind] ?? 9;
    if (ka !== kb) return ka - kb;
    if (a.kind === TILE_KIND.NUMBER) {
      const sa = SUIT_ORDER[a.suit], sb = SUIT_ORDER[b.suit];
      if (sa !== sb) return sa - sb;
      return a.num - b.num;
    }
    if (a.kind === TILE_KIND.DRAGON) return DRAGON_ORDER[a.dragon] - DRAGON_ORDER[b.dragon];
    if (a.kind === TILE_KIND.WIND)   return WIND_ORDER[a.wind]     - WIND_ORDER[b.wind];
    return 0;
  });
}
