// ============================================================
// AMERICAN MAHJONG — win-condition matcher
//
// A card hand is a template with holes in it: which real suit each colour
// slot stands for, which number a sliding run starts on, which wind a
// placeholder letter means. `handVariants()` expands a template into every
// concrete 14-tile requirement it could stand for; everything else here is
// bookkeeping on top of that expansion.
// ============================================================

import {
  SUITS, SUIT_DRAGON, WINDS,
  numberKey, dragonKey, windKey, keySupply,
  FLOWER_KEY, JOKER_KEY, BLANK_KEY, TILE_KIND,
} from './tiles.js';
import { ALL_HANDS, HANDS_BY_ID } from './card.js';

// ── Small combinatorial helpers ──────────────────────────────

function permutations(items, k) {
  if (k === 0) return [[]];
  const out = [];
  items.forEach((item, i) => {
    const rest = items.filter((_, j) => j !== i);
    for (const tail of permutations(rest, k - 1)) out.push([item, ...tail]);
  });
  return out;
}

function numberBases(hand) {
  const maxOff = Math.max(
    0,
    ...hand.groupSets.flat().filter(g => g.off != null).map(g => g.off)
  );
  switch (hand.nums) {
    case 'consec':
    case 'like':
    case 'anyNum': {
      const bases = [];
      for (let b = 1; b + maxOff <= 9; b++) bases.push(b);
      return bases;
    }
    case 'likeEven':
      return [2, 4, 6, 8].filter(b => b + maxOff <= 9);
    default:
      return [null];
  }
}

// ── Variant expansion ────────────────────────────────────────

function buildVariant(groups, suitBySlot, base, windByLetter) {
  const byKey = new Map();   // key -> { key, count, jokersOk }
  const free  = new Map();   // number -> { num, count, jokersOk }

  const add = (map, id, patch, count, printedCount) => {
    const cur = map.get(id) ?? { ...patch, count: 0, jokersOk: true };
    cur.count += count;
    // A merged requirement only takes jokers if every printed group that fed
    // it was a group of three or more — jokers can't stand in for a pair.
    cur.jokersOk = cur.jokersOk && printedCount >= 3;
    map.set(id, cur);
  };

  for (const g of groups) {
    const c = g.c ?? 1;
    if (g.t === 'n') {
      if (g.free) { add(free, g.lit, { num: g.lit }, c, c); continue; }
      const suit = suitBySlot[g.s];
      if (!suit) return null;
      const num = g.lit != null ? g.lit : base + (g.off ?? 0);
      if (num < 1 || num > 9) return null;
      add(byKey, numberKey(suit, num), { key: numberKey(suit, num) }, c, c);
    } else if (g.t === 'd') {
      const dragon = g.lit ?? SUIT_DRAGON[suitBySlot[g.s]];
      if (!dragon) return null;
      add(byKey, dragonKey(dragon), { key: dragonKey(dragon) }, c, c);
    } else if (g.t === 'w') {
      const wind = windByLetter[g.w] ?? g.w;
      add(byKey, windKey(wind), { key: windKey(wind) }, c, c);
    } else if (g.t === 'f') {
      add(byKey, FLOWER_KEY, { key: FLOWER_KEY }, c, c);
    }
  }

  // Throw out expansions the physical set can't supply.
  for (const req of byKey.values()) {
    if (req.count > keySupply(req.key) && !req.jokersOk) return null;
  }
  return { reqs: [...byKey.values()], free: [...free.values()], suitBySlot, base, windByLetter };
}

const variantCache = new Map();

export function handVariants(hand) {
  const cached = variantCache.get(hand.id);
  if (cached) return cached;

  const groupsAll = hand.groupSets.flat();
  const slots     = [...new Set(groupsAll.filter(g => g.s != null && !g.free).map(g => g.s))];
  const suitPerms = permutations(SUITS, slots.length);

  const letters   = hand.winds === 'var'
    ? [...new Set(groupsAll.filter(g => g.t === 'w').map(g => g.w))]
    : [];
  const windPerms = hand.winds === 'var' ? permutations(WINDS, letters.length) : [[]];

  const bases     = numberBases(hand);
  const variants  = [];

  for (const groups of hand.groupSets) {
    for (const perm of suitPerms) {
      const suitBySlot = {};
      slots.forEach((slot, i) => { suitBySlot[slot] = perm[i]; });
      for (const base of bases) {
        for (const wperm of windPerms) {
          const windByLetter = {};
          letters.forEach((l, i) => { windByLetter[l] = wperm[i]; });
          const v = buildVariant(groups, suitBySlot, base, windByLetter);
          if (v) variants.push(v);
        }
      }
    }
  }

  variantCache.set(hand.id, variants);
  return variants;
}

// ── Tile bookkeeping ─────────────────────────────────────────

export function countTiles(tiles) {
  const counts = new Map();
  let jokers = 0, blanks = 0;
  for (const t of tiles) {
    if (t.key === JOKER_KEY || t.kind === TILE_KIND.JOKER) { jokers++; continue; }
    if (t.key === BLANK_KEY || t.kind === TILE_KIND.BLANK) { blanks++; continue; }
    counts.set(t.key, (counts.get(t.key) ?? 0) + 1);
  }
  return { counts, jokers, blanks, total: tiles.length };
}

// Fills `variant` from the tile pool. Returns tiles matched, or -1 if the
// pool contradicts the variant outright.
function fillVariant(variant, pool) {
  const rem = new Map(pool.counts);
  let jokersLeft = pool.jokers;
  let matched    = 0;

  const consume = (key, want) => {
    const have = rem.get(key) ?? 0;
    const use  = Math.min(have, want);
    if (use) rem.set(key, have - use);
    return use;
  };

  for (const req of variant.reqs) {
    const got   = consume(req.key, req.count);
    matched    += got;
    const short = req.count - got;
    if (short > 0 && req.jokersOk) {
      const useJ = Math.min(short, jokersLeft);
      jokersLeft -= useJ;
      matched    += useJ;
    }
  }
  for (const req of variant.free) {
    let need = req.count;
    for (const suit of SUITS) {
      const got = consume(numberKey(suit, req.num), need);
      need    -= got;
      matched += got;
    }
    if (need > 0 && req.jokersOk) {
      const useJ = Math.min(need, jokersLeft);
      jokersLeft -= useJ;
      matched    += useJ;
    }
  }
  return matched;
}

// ── Public queries ───────────────────────────────────────────

// Best number of the 14 tiles a hand could account for (0..14).
export function handProgress(hand, tiles) {
  const pool = countTiles(tiles);
  let best = 0;
  for (const v of handVariants(hand)) {
    const m = fillVariant(v, pool);
    if (m > best) best = m;
    if (best === 14) break;
  }
  return best;
}

// True when these exact 14 tiles complete the hand.
export function isHandComplete(hand, tiles) {
  if (tiles.length !== 14) return false;
  const pool = countTiles(tiles);
  if (pool.blanks > 0) return false;   // a blank must be traded away before winning
  return handProgress(hand, tiles) === 14;
}

// Every card hand these 14 tiles complete.
export function winningHandIds(tiles) {
  if (tiles.length !== 14) return [];
  return ALL_HANDS.filter(h => isHandComplete(h, tiles)).map(h => h.id);
}

// Exposure sizes (3+) that some hand asks for as a group of this tile.
export function allowedExposureSizes(tileKeyStr, handIds = null) {
  const pool  = handIds?.length ? handIds.map(id => HANDS_BY_ID[id]).filter(Boolean) : ALL_HANDS;
  const sizes = new Set();
  for (const hand of pool) {
    for (const v of handVariants(hand)) {
      for (const req of v.reqs) {
        if (req.key === tileKeyStr && req.count >= 3 && req.jokersOk) sizes.add(req.count);
      }
    }
  }
  return [...sizes].sort((a, b) => a - b);
}

// ── NEWS ─────────────────────────────────────────────────────
// The card prints NEWS as one section — a single North, East, West and South
// standing together — so it is a group you can claim a discard into, even
// though unlike a pung its four tiles are all different. Jokers never stand in
// for a single tile, so the other three winds have to be in hand.

// Does this hand ask for a NEWS group? Four wind groups of one tile each with
// four different letters can only be the four winds, whatever the letters are
// placeholders for.
export function handHasNewsGroup(hand) {
  return hand.groupSets.some(groups => {
    const singles = new Set(
      groups.filter(g => g.t === 'w' && (g.c ?? 1) === 1).map(g => g.w)
    );
    return singles.size === WINDS.length;
  });
}

export function newsExposureAllowed(handIds = null) {
  const pool = handIds?.length ? handIds.map(id => HANDS_BY_ID[id]).filter(Boolean) : ALL_HANDS;
  return pool.some(handHasNewsGroup);
}

function newsClaimOption(discardTile, handTiles, markedHandIds) {
  if (discardTile.kind !== TILE_KIND.WIND) return null;
  if (!newsExposureAllowed(markedHandIds)) return null;

  const needed = WINDS.filter(w => w !== discardTile.wind).map(windKey);
  const held   = new Set(handTiles.map(t => t.key));
  if (needed.some(key => !held.has(key))) return null;

  return {
    id:   'news',
    type: 'news',
    keys: needed,
    size: WINDS.length,
    fromHand:   needed.length,
    jokersUsed: 0,
  };
}

// What the player could actually lay down with the discard: groups that a card
// hand asks for AND that their rack can cover (matching tiles, jokers filling
// the rest). Never uses a joker for the claimed tile itself.
export function claimOptions(discardTile, handTiles, markedHandIds = []) {
  if (!discardTile) return [];
  if (discardTile.kind === TILE_KIND.JOKER || discardTile.kind === TILE_KIND.BLANK) return [];

  const matching = handTiles.filter(t => t.key === discardTile.key).length;
  const jokers   = handTiles.filter(t => t.kind === TILE_KIND.JOKER).length;
  const ceiling  = 1 + matching + jokers;

  const options = allowedExposureSizes(discardTile.key, markedHandIds)
    .filter(size => size <= ceiling)
    .map(size => ({
      id:   `group:${size}`,
      type: 'group',
      size,
      fromHand:   Math.min(matching, size - 1),
      jokersUsed: Math.max(0, size - 1 - matching),
    }));

  const news = newsClaimOption(discardTile, handTiles, markedHandIds);
  if (news) options.push(news);

  return options;
}
