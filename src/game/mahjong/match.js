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
  SUITS, SUIT_DRAGON, WINDS, SUIT_STYLE,
  numberKey, dragonKey, windKey, keySupply, keyLabel, tileFromKey,
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

// ── Claiming a discard ───────────────────────────────────────
//
// House rules at this table:
//   · a group of three or more can be claimed whether it is a *set* of the
//     same tile or a *run* of consecutive numbers in one suit;
//   · the hands the card prints as concealed are played like any other, so
//     they can expose too.
// What has not changed: the group has to be one a hand actually asks for, a
// pair or a lone single can never be claimed, and a joker still cannot stand
// in for a single tile — so a run is built out of real tiles only.

const MIN_GROUP = 3;

// The hands a claim is measured against: the ones you have marked, or the
// whole card when you have marked nothing.
function claimHands(handIds) {
  return handIds?.length ? handIds.map(id => HANDS_BY_ID[id]).filter(Boolean) : ALL_HANDS;
}

// Set sizes (3+) that some hand asks for as a group of this tile.
export function allowedExposureSizes(tileKeyStr, handIds = null) {
  const sizes = new Set();
  for (const hand of claimHands(handIds)) {
    for (const v of handVariants(hand)) {
      for (const req of v.reqs) {
        if (req.key === tileKeyStr && req.count >= MIN_GROUP && req.jokersOk) sizes.add(req.count);
      }
    }
  }
  return [...sizes].sort((a, b) => a - b);
}

// Runs (3+ consecutive numbers in one suit) through this tile that some hand
// asks for, every number of them. A hand that wants a number in *any* suit
// counts too — laying the run down in one suit still satisfies it.
export function allowedRuns(tileKeyStr, handIds = null) {
  const tile = tileFromKey(tileKeyStr);
  if (tile.kind !== TILE_KIND.NUMBER) return [];

  const seen = new Set();
  const runs = [];

  for (const hand of claimHands(handIds)) {
    for (const v of handVariants(hand)) {
      const keys     = new Set(v.reqs.map(r => r.key));
      const freeNums = new Set(v.free.map(r => r.num));
      const wants    = n => keys.has(numberKey(tile.suit, n)) || freeNums.has(n);
      if (!wants(tile.num)) continue;   // the discard itself has to be wanted

      for (let start = 1; start + MIN_GROUP - 1 <= 9; start++) {
        for (let end = start + MIN_GROUP - 1; end <= 9; end++) {
          if (tile.num < start || tile.num > end) continue;
          const size = end - start + 1;
          const id   = `${tile.suit}:${start}:${size}`;
          if (seen.has(id)) continue;
          let ok = true;
          for (let n = start; n <= end && ok; n++) ok = wants(n);
          if (ok) { seen.add(id); runs.push({ suit: tile.suit, start, size }); }
        }
      }
    }
  }

  return runs.sort((a, b) => a.size - b.size || a.start - b.start);
}

function runNums(run) {
  return Array.from({ length: run.size }, (_, i) => run.start + i);
}

// What the player could actually lay down with the discard: groups a card hand
// asks for AND that their rack can cover. Each option carries the keys it is
// made of, so the engine can pull the exact tiles back out of the rack.
// Never uses a joker for the claimed tile itself.
export function claimOptions(discardTile, handTiles, markedHandIds = []) {
  if (!discardTile) return [];
  if (discardTile.kind === TILE_KIND.JOKER || discardTile.kind === TILE_KIND.BLANK) return [];

  const matching = handTiles.filter(t => t.key === discardTile.key).length;
  const jokers   = handTiles.filter(t => t.kind === TILE_KIND.JOKER).length;
  const ceiling  = 1 + matching + jokers;

  const sets = allowedExposureSizes(discardTile.key, markedHandIds)
    .filter(size => size <= ceiling)
    .map(size => {
      const fromHand = Math.min(matching, size - 1);
      return {
        id:         `set:${size}`,
        kind:       'set',
        size,
        keys:       Array(size).fill(discardTile.key),
        jokersUsed: size - 1 - fromHand,
        label:      `${size}× ${keyLabel(discardTile.key)}`,
      };
    });

  // A run needs one real tile of every other number in it — no jokers, and a
  // second copy of the discard is no help either.
  const have = new Set(handTiles.filter(t => t.kind !== TILE_KIND.JOKER).map(t => t.key));
  const runs = allowedRuns(discardTile.key, markedHandIds)
    .filter(run => runNums(run).every(n => n === discardTile.num || have.has(numberKey(run.suit, n))))
    .map(run => ({
      id:         `run:${run.suit}:${run.start}:${run.size}`,
      kind:       'run',
      size:       run.size,
      keys:       runNums(run).map(n => numberKey(run.suit, n)),
      jokersUsed: 0,
      label:      `${runNums(run).join('')} ${SUIT_STYLE[run.suit].label}`,
    }));

  return [...sets, ...runs];
}
