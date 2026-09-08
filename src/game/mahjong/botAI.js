// ============================================================
// AMERICAN MAHJONG — bots
//
// A bot plays toward whichever card hand its tiles already cover the most of.
// Everything it does follows from that one measure: it passes and discards
// the tiles that cost the least progress, and it only claims a discard when
// the group it would have to expose is one those hands actually ask for.
// ============================================================

import { TILE_KIND } from './tiles.js';
import { ALL_HANDS } from './card.js';
import { handProgress, claimOptions, allowedExposureSizes, winningHandIds } from './match.js';
import { completedHandsFor } from './engine.js';

export const BOT_NAMES = ['Sum', 'Ting', 'Wong'];

const PASS_SIZE = 3;

// How many runner-up hands count toward a rack's breadth (see rackScore).
const BREADTH_HANDS = 5;

// ── Reading the rack ─────────────────────────────────────────

// Every card hand, best covered first. Once a bot has exposed tiles the
// concealed hands are out of reach, so they stop counting.
function rankHands(tiles, hasExposures) {
  const hands = hasExposures ? ALL_HANDS.filter(h => !h.concealed) : ALL_HANDS;
  return hands
    .map(hand => ({ id: hand.id, progress: handProgress(hand, tiles) }))
    .sort((a, b) => b.progress - a.progress);
}

// One number for how promising a rack is. The hand it is closest to dominates;
// the runners-up break ties, so a tile that keeps several hands alive is worth
// more than one that only serves the leader.
function rackScore(tiles, hasExposures) {
  const ranked  = rankHands(tiles, hasExposures);
  const best    = ranked[0]?.progress ?? 0;
  const breadth = ranked.slice(0, BREADTH_HANDS).reduce((sum, h) => sum + h.progress, 0);
  return best * 100 + breadth;
}

// The tile the bot can most afford to lose: the one whose absence leaves the
// best rack behind. Jokers are never thrown away, and blanks always are — a
// blank has to be traded off before a hand can win at all.
function worstTile(player, hand = player.hand) {
  const blank = hand.find(t => t.kind === TILE_KIND.BLANK);
  if (blank) return blank;

  const exposed  = player.exposures.flatMap(e => e.tiles);
  const keepable = hand.filter(t => t.kind !== TILE_KIND.JOKER);
  const pool     = keepable.length > 0 ? keepable : hand;

  let best      = pool[0] ?? null;
  let bestScore = -Infinity;
  const seen    = new Set();

  for (const tile of pool) {
    if (seen.has(tile.key)) continue;   // interchangeable tiles cost the same
    seen.add(tile.key);
    const rest  = [...exposed, ...hand.filter(t => t.id !== tile.id)];
    const score = rackScore(rest, exposed.length > 0);
    if (score > bestScore) { bestScore = score; best = tile; }
  }

  return best;
}

// The exposure size to claim the discard with, or null to draw instead.
function chooseClaim(state, player) {
  const claim = state.claimable;
  if (!claim) return null;

  // Never spend a joker to fill out a group the bot is claiming into.
  const options = claimOptions(claim.tile, player.hand, player.markedHands)
    .filter(o => o.jokersUsed === 0);
  if (options.length === 0) return null;

  const exposed = player.exposures.flatMap(e => e.tiles);
  const withTile = [...exposed, ...player.hand, claim.tile];

  // A tile that finishes the hand is worth taking whatever it exposes.
  if (winningHandIds(withTile).length > 0) return Math.max(...options.map(o => o.size));

  const before = rankHands([...exposed, ...player.hand], true);
  const after  = rankHands(withTile, true);
  if ((after[0]?.progress ?? 0) <= (before[0]?.progress ?? 0)) return null;

  // Only lay down a group one of the best hands actually asks for.
  const targets = after.filter(h => h.progress === after[0].progress).map(h => h.id);
  const wanted  = new Set(allowedExposureSizes(claim.tile.key, targets));
  const sizes   = options.map(o => o.size).filter(size => wanted.has(size));

  return sizes.length > 0 ? Math.max(...sizes) : null;
}

// ── Moves ────────────────────────────────────────────────────
// Every bot decision comes back in this shape and is handed straight to the
// matching engine call:
//   { type: 'pass', tileIds } | { type: 'claim', size } | { type: 'draw' }
//   { type: 'discard', tileId } | { type: 'declare' }

// The three tiles the bot passes in a Charleston round.
export function getBotPassSelection(state, botId) {
  const player = state.players[botId];
  if (!player) return [];

  const picked = [];
  let hand = player.hand;

  while (picked.length < PASS_SIZE) {
    const tile = worstTile(player, hand);
    if (!tile) break;
    picked.push(tile.id);
    hand = hand.filter(t => t.id !== tile.id);
  }

  return picked;
}

export function getBotMove(state, botId) {
  const player = state.players[botId];
  if (!player) return null;

  if (state.phase === 'charleston') {
    if (player.passReady) return null;
    const tileIds = getBotPassSelection(state, botId);
    return tileIds.length === PASS_SIZE ? { type: 'pass', tileIds } : null;
  }

  if (state.phase !== 'playing') return null;
  if (state.playerOrder[state.currentPlayerIndex] !== botId) return null;

  if (state.turnStage === 'draw') {
    const size = chooseClaim(state, player);
    return size ? { type: 'claim', size } : { type: 'draw' };
  }

  if (completedHandsFor(player).length > 0) return { type: 'declare' };

  const tile = worstTile(player);
  return tile ? { type: 'discard', tileId: tile.id } : null;
}

// Something legal for every situation, so a bot that hits a state it can't
// read still keeps the table moving instead of stalling the hand.
export function getBotFallbackMove(state, botId) {
  const player = state.players[botId];
  if (!player) return null;

  if (state.phase === 'charleston') {
    const tileIds = player.hand
      .filter(t => t.kind !== TILE_KIND.JOKER)
      .slice(0, PASS_SIZE)
      .map(t => t.id);
    return tileIds.length === PASS_SIZE ? { type: 'pass', tileIds } : null;
  }

  if (state.phase !== 'playing') return null;
  if (state.turnStage === 'draw') return { type: 'draw' };

  const tile = player.hand.find(t => t.kind !== TILE_KIND.JOKER) ?? player.hand[0];
  return tile ? { type: 'discard', tileId: tile.id } : null;
}
