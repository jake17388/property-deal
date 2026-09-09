// ============================================================
// AMERICAN MAHJONG — game engine
//
// Pure state transitions: every exported function takes a state and returns
// the next state (mutating a structuredClone of it), or throws with a message
// that is safe to show the player.
// ============================================================

import { buildDeck, shuffle, sortTiles, TILE_KIND } from './tiles.js';
import { winningHandIds, claimOptions } from './match.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

const HAND_SIZE = 13;
const PASS_SIZE = 3;

function clone(state) { return structuredClone(state); }

function log(state, message) {
  state.log.push({ time: Date.now(), message });
  if (state.log.length > 300) state.log.shift();
}

function nameOf(state, pid) { return state.playerNames[pid] ?? 'Player'; }

// Total tiles a player is holding, rack plus anything laid down.
export function tileCount(player) {
  return player.hand.length + player.exposures.reduce((n, e) => n + e.tiles.length, 0);
}

export function allTilesOf(player) {
  return [...player.hand, ...player.exposures.flatMap(e => e.tiles)];
}

// ── Charleston passing pattern ───────────────────────────────
// Round r (0-based) shifts every player's tiles r+1 seats clockwise, and there
// are n-1 rounds. For n = 4 that is A→B, then A→C, then A→D — so by the end
// everyone has passed three tiles to each of the others, exactly as asked.
export function charlestonRounds(n) { return n - 1; }

export function passTargetIndex(fromIndex, round, n) {
  return (fromIndex + round + 1) % n;
}

// ── Setup ────────────────────────────────────────────────────

export function createGame(playerIds) {
  if (playerIds.length < MIN_PLAYERS) throw new Error('Need at least 2 players.');
  if (playerIds.length > MAX_PLAYERS) throw new Error('Mah Jong supports up to 4 players.');

  const order  = shuffle(playerIds);
  const wall   = shuffle(buildDeck());
  const dealer = order[Math.floor(Math.random() * order.length)];

  const players = {};
  for (const id of order) {
    players[id] = {
      hand:        sortTiles(wall.splice(0, HAND_SIZE)),
      exposures:   [],
      markedHands: [],
      passSelection: [],
      passReady:   false,
      // Tiles that just arrived, so the rack can point them out — sorting drops
      // a new tile into the middle of the rack where it's impossible to spot.
      justReceived:     [],
      justReceivedFrom: null,   // 'wall' | 'pile' | 'pass'
    };
  }
  // The dealer opens the game, so they take the extra 14th tile.
  players[dealer].hand = sortTiles([...players[dealer].hand, wall.shift()]);
  // From here on the hand array *is* the player's arrangement: tiles are
  // appended where they can be seen rather than sorted back into the middle,
  // and only the player moves them.

  const state = {
    gameType:          'mahjong',
    playerOrder:       order,
    playerNames:       Object.fromEntries(order.map(id => [id, id])),
    players,
    wall,
    discards:          [],
    claimable:         null,
    phase:             'charleston',
    charleston:        { round: 0, totalRounds: charlestonRounds(order.length) },
    dealerId:          dealer,
    currentPlayerIndex: order.indexOf(dealer),
    turnStage:         'discard',
    winner:            null,
    winningHands:      [],
    endReason:         null,
    revealed:          false,
    log:               [],
  };

  log(state, `Tiles dealt. ${order.length} players. Charleston: ${state.charleston.totalRounds} pass${state.charleston.totalRounds !== 1 ? 'es' : ''}.`);
  return state;
}

// ── Charleston ───────────────────────────────────────────────

export function setPassSelection(prev, playerId, tileIds) {
  const state = clone(prev);
  if (state.phase !== 'charleston') throw new Error('The Charleston is over.');
  const p = state.players[playerId];
  if (!p) throw new Error('Player not found.');
  if (p.passReady) throw new Error('You already locked in your pass.');

  const ids = [...new Set(tileIds)];
  if (ids.length > PASS_SIZE) throw new Error(`Pick exactly ${PASS_SIZE} tiles.`);
  if (ids.some(id => !p.hand.some(t => t.id === id))) throw new Error('That tile is not in your hand.');

  p.passSelection = ids;
  return state;
}

export function confirmPass(prev, playerId) {
  let state = clone(prev);
  if (state.phase !== 'charleston') throw new Error('The Charleston is over.');
  const p = state.players[playerId];
  if (!p) throw new Error('Player not found.');
  if (p.passReady) throw new Error('You already locked in your pass.');
  if (p.passSelection.length !== PASS_SIZE) throw new Error(`Pick exactly ${PASS_SIZE} tiles to pass.`);

  p.passReady = true;
  log(state, `${nameOf(state, playerId)} is ready to pass.`);

  if (state.playerOrder.every(id => state.players[id].passReady)) {
    state = resolvePass(state);
  }
  return state;
}

function resolvePass(state) {
  const order = state.playerOrder;
  const n     = order.length;
  const round = state.charleston.round;

  // Lift every pass out first, then hand them on, so nobody passes a tile they
  // only just received this round.
  const outgoing = {};
  order.forEach(id => {
    const p = state.players[id];
    outgoing[id] = p.passSelection.map(tid => p.hand.find(t => t.id === tid)).filter(Boolean);
    const passing = new Set(p.passSelection);
    p.hand = p.hand.filter(t => !passing.has(t.id));
  });

  order.forEach((id, i) => {
    const toId = order[passTargetIndex(i, round, n)];
    const dest = state.players[toId];
    dest.hand  = [...dest.hand, ...outgoing[id]];
    dest.justReceived     = outgoing[id].map(t => t.id);
    dest.justReceivedFrom = 'pass';
  });

  order.forEach(id => {
    state.players[id].passSelection = [];
    state.players[id].passReady     = false;
  });

  const next = round + 1;
  if (next >= state.charleston.totalRounds) {
    state.phase      = 'playing';
    state.turnStage  = 'discard';
    state.currentPlayerIndex = order.indexOf(state.dealerId);
    log(state, `Charleston complete. ${nameOf(state, state.dealerId)} starts by discarding.`);
  } else {
    state.charleston.round = next;
    log(state, `Pass ${round + 1} complete. Pass ${next + 1} of ${state.charleston.totalRounds} begins.`);
  }
  return state;
}

// ── Arranging your rack ──────────────────────────────────────

export function reorderHand(prev, playerId, tileIds) {
  const state = clone(prev);
  const p = state.players[playerId];
  if (!p) throw new Error('Player not found.');

  const ids = [...new Set(tileIds)];
  if (ids.length !== p.hand.length) throw new Error('That is not your whole hand.');

  const byId = new Map(p.hand.map(t => [t.id, t]));
  const next = ids.map(id => byId.get(id));
  if (next.some(t => !t)) throw new Error('That tile is not in your hand.');

  p.hand = next;
  return state;
}

export function sortHand(prev, playerId) {
  const state = clone(prev);
  const p = state.players[playerId];
  if (!p) throw new Error('Player not found.');
  p.hand = sortTiles(p.hand);
  return state;
}

// ── Win conditions the player has marked on the card ─────────

export function setMarkedHands(prev, playerId, handIds) {
  const state = clone(prev);
  const p = state.players[playerId];
  if (!p) throw new Error('Player not found.');
  p.markedHands = [...new Set(handIds)].slice(0, 12);
  return state;
}

// ── Turn actions ─────────────────────────────────────────────

function requireTurn(state, playerId, stage) {
  if (state.phase !== 'playing') throw new Error('The game is not in play.');
  const currentId = state.playerOrder[state.currentPlayerIndex];
  if (currentId !== playerId) throw new Error('It is not your turn.');
  if (stage && state.turnStage !== stage) {
    throw new Error(stage === 'draw' ? 'You have already drawn.' : 'Draw or claim a tile first.');
  }
}

function endInWallGame(state) {
  state.phase     = 'gameover';
  state.endReason = 'wall';
  state.revealed  = true;
  log(state, 'The wall is empty — the hand is a draw.');
  return state;
}

export function drawFromWall(prev, playerId) {
  const state = clone(prev);
  requireTurn(state, playerId, 'draw');

  if (state.wall.length === 0) return endInWallGame(state);

  const tile = state.wall.shift();
  const p    = state.players[playerId];
  p.hand     = [...p.hand, tile];
  p.justReceived     = [tile.id];
  p.justReceivedFrom = 'wall';
  state.claimable = null;
  state.turnStage = 'discard';
  log(state, `${nameOf(state, playerId)} drew a tile.`);
  return state;
}

export function claimDiscard(prev, playerId, size) {
  const state = clone(prev);
  requireTurn(state, playerId, 'draw');

  const claim = state.claimable;
  if (!claim) throw new Error('There is no tile to claim.');

  const p       = state.players[playerId];
  const options = claimOptions(claim.tile, p.hand, p.markedHands);
  const picked  = options.find(o => o.size === size);
  if (!picked) throw new Error('You cannot lay down a group of that size with this tile.');

  // Take the tile off the pile.
  const idx = state.discards.findIndex(t => t.id === claim.tile.id);
  if (idx === -1) throw new Error('That tile is no longer on the pile.');
  const [tile] = state.discards.splice(idx, 1);

  // Matching tiles first, jokers only for what's left over.
  const exposed = [tile];
  const rest    = [];
  for (const t of p.hand) {
    if (exposed.length < 1 + picked.fromHand && t.key === tile.key) exposed.push(t);
    else rest.push(t);
  }
  let needJokers = picked.jokersUsed;
  const keep = [];
  for (const t of rest) {
    if (needJokers > 0 && t.kind === TILE_KIND.JOKER) { exposed.push(t); needJokers--; }
    else keep.push(t);
  }
  if (exposed.length !== size) throw new Error('Not enough tiles to lay that down.');

  p.hand      = keep;
  p.exposures = [...p.exposures, { key: tile.key, tiles: exposed }];

  state.claimable = null;
  state.turnStage = 'discard';
  log(state, `${nameOf(state, playerId)} claimed the discard and exposed ${size} tiles.`);
  return state;
}

export function discardTile(prev, playerId, tileId) {
  const state = clone(prev);
  requireTurn(state, playerId, 'discard');

  const p   = state.players[playerId];
  const idx = p.hand.findIndex(t => t.id === tileId);
  if (idx === -1) throw new Error('That tile is not in your hand.');

  const [tile] = p.hand.splice(idx, 1);
  p.justReceived     = [];
  p.justReceivedFrom = null;
  state.discards.push(tile);
  state.claimable = { tile, byId: playerId };

  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.playerOrder.length;
  state.turnStage = 'draw';
  log(state, `${nameOf(state, playerId)} discarded.`);

  if (state.wall.length === 0) return endInWallGame(state);
  return state;
}

// ── Blank tile ───────────────────────────────────────────────
// A blank can be traded for anything on the discard pile.
//
// Your own turn is yours to spend, so the trade goes at any point in it —
// before you draw, or with the drawn tile still in your hand, which is when the
// tile you need to finish is most likely to be sitting on the pile. Everyone
// else has to wait for the gap between turns: taking the turn from a player who
// still owes a discard would strand them holding fourteen tiles.

export function useBlank(prev, playerId, blankTileId, targetTileId) {
  const state = clone(prev);
  if (state.phase !== 'playing') throw new Error('The game is not in play.');

  const p = state.players[playerId];
  if (!p) throw new Error('Player not found.');

  const isCurrent = state.playerOrder[state.currentPlayerIndex] === playerId;
  if (!isCurrent && state.turnStage !== 'draw') {
    throw new Error('Wait until the current player has discarded.');
  }

  const bIdx = p.hand.findIndex(t => t.id === blankTileId && t.kind === TILE_KIND.BLANK);
  if (bIdx === -1) throw new Error('That is not a blank tile in your hand.');

  const dIdx = state.discards.findIndex(t => t.id === targetTileId);
  if (dIdx === -1) throw new Error('That tile is not on the discard pile.');
  if (state.discards[dIdx].kind === TILE_KIND.BLANK) throw new Error('You cannot swap a blank for a blank.');

  const [blank] = p.hand.splice(bIdx, 1);
  const taken   = state.discards[dIdx];
  state.discards[dIdx] = blank;            // the blank takes its place on the pile
  p.hand = [...p.hand, taken];
  p.justReceived     = [taken.id];
  p.justReceivedFrom = 'pile';

  // Trading a blank is not a turn. Spend it on your own and you still owe the
  // move you owed before — the draw, or the discard you had got to. Spend it on
  // someone else's and play resumes with whoever sits after you.
  if (!isCurrent) {
    const from = state.playerOrder.indexOf(playerId);
    state.currentPlayerIndex = (from + 1) % state.playerOrder.length;
    state.turnStage = 'draw';
  }

  if (state.turnStage === 'draw') {
    const top = state.discards[state.discards.length - 1];
    state.claimable = top && top.kind !== TILE_KIND.BLANK ? { tile: top, byId: null } : null;
  } else {
    state.claimable = null;   // mid-turn there is nothing on offer to claim
  }

  log(state, `${nameOf(state, playerId)} traded a blank for a tile from the discard pile.`);
  return state;
}

// ── Winning ──────────────────────────────────────────────────

// Card hands these tiles complete right now (empty unless holding 14).
// Pass the discard you are eyeing as `extraTile` to ask the same of the hand
// you would have with it.
export function completedHandsFor(player, extraTile = null) {
  const tiles = allTilesOf(player);
  return winningHandIds(extraTile ? [...tiles, extraTile] : tiles);
}

// The discard on the pile when it wins the game for this player, or null.
//
// Claiming for an exposure needs a group of three or more, so a hand built out
// of singles and pairs can never lay anything down — calling the tile that
// finishes it is the one way those hands ever take a tile off the pile. That
// call belongs to anyone at the table, in turn or out of it, because the hand
// ends the moment it is made and turn order stops mattering.
export function mahjongClaimFor(state, playerId) {
  if (!state || state.phase !== 'playing') return null;

  const claim = state.claimable;
  if (!claim || claim.byId === playerId) return null;   // never your own discard

  const p = state.players[playerId];
  if (!p) return null;

  const handIds = completedHandsFor(p, claim.tile);
  return handIds.length > 0 ? { tile: claim.tile, handIds } : null;
}

export function declareMahjong(prev, playerId) {
  const state = clone(prev);
  if (state.phase !== 'playing') throw new Error('The game is not in play.');

  const p = state.players[playerId];
  if (!p) throw new Error('Player not found.');

  let ids    = completedHandsFor(p);
  let called = null;

  // Nothing in hand yet? Then this is a call on the discard that finishes it.
  if (ids.length === 0) {
    const call = mahjongClaimFor(state, playerId);
    if (call) {
      const idx = state.discards.findIndex(t => t.id === call.tile.id);
      if (idx === -1) throw new Error('That tile is no longer on the pile.');
      [called] = state.discards.splice(idx, 1);
      p.hand   = [...p.hand, called];
      p.justReceived     = [called.id];
      p.justReceivedFrom = 'pile';
      state.claimable    = null;
      ids = call.handIds;
    }
  }
  if (ids.length === 0) throw new Error('Your tiles do not complete a hand on the card.');

  state.phase        = 'gameover';
  state.winner       = playerId;
  state.winningHands = ids;
  state.endReason    = 'mahjong';
  state.revealed     = true;
  log(state, called
    ? `${nameOf(state, playerId)} called the discard and declared Mah Jong!`
    : `${nameOf(state, playerId)} declared Mah Jong!`);
  return state;
}

// ── Leaving ──────────────────────────────────────────────────

export function resignGame(prev, playerId) {
  const state = clone(prev);
  if (state.phase === 'gameover') return state;
  if (!state.players[playerId]) throw new Error('Player not found.');

  const wasCurrent = state.playerOrder[state.currentPlayerIndex] === playerId;
  const idx        = state.playerOrder.indexOf(playerId);

  log(state, `${nameOf(state, playerId)} resigned.`);
  state.playerOrder = state.playerOrder.filter(id => id !== playerId);
  delete state.players[playerId];

  if (state.playerOrder.length < MIN_PLAYERS) {
    state.phase     = 'gameover';
    state.winner    = state.playerOrder[0] ?? null;
    state.endReason = 'resignation';
    state.revealed  = true;
    return state;
  }

  // A resignation mid-Charleston can't be unwound cleanly, so the hand ends.
  if (state.phase === 'charleston') {
    state.phase     = 'gameover';
    state.winner    = null;
    state.endReason = 'resignation';
    state.revealed  = true;
    return state;
  }

  state.currentPlayerIndex = idx % state.playerOrder.length;
  if (wasCurrent) state.turnStage = 'draw';
  else if (idx < state.currentPlayerIndex) state.currentPlayerIndex--;
  state.currentPlayerIndex = ((state.currentPlayerIndex % state.playerOrder.length) + state.playerOrder.length) % state.playerOrder.length;
  return state;
}
