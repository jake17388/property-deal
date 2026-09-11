// ============================================================
// PROPERTY DEAL — optimistic play
//
// The server owns the game. But a card you drop shouldn't sit in your hand
// waiting for the round trip: it should land where you dropped it on the frame
// you let go. So the client mirrors the moves it can be sure about onto the
// last state the server sent, and keeps mirroring them until the server's own
// copy of that move comes back.
//
// Only moves whose outcome is fully determined by what the client can already
// see are mirrored — no deck, no hidden hands, no payments. Anything else is
// left alone and simply waits for the server, and every mirrored move is
// dropped the moment the real state lands (or the server rejects it), so a
// wrong guess can never outlive one round trip.
// ============================================================

import { CARD_TYPE, COLOR, SET_SIZE } from './cards.js';

// Action cards that resolve on the spot, against your own board only.
const SELF_CONTAINED = new Set(['house', 'hotel']);

// How long a move may go unconfirmed before the client stops pretending.
const MAX_AGE_MS = 5000;

export function isStale(move, now = Date.now()) {
  return now - move.at > MAX_AGE_MS;
}

// Has the server's state caught up with this move? Keeping a move alive past
// its confirmation would double it up; dropping it early would flash the card
// back into your hand.
export function isConfirmed(move, state, playerId) {
  const me = state?.players?.[playerId];
  if (!me) return true;

  if (move.kind === 'play') {
    return !me.hand?.some(c => c.id === move.cardId);
  }
  if (move.kind === 'moveWildcard') {
    const group = me.properties?.[move.newColor];
    return !!group?.cards.some(c => c.id === move.cardId);
  }
  return true;
}

// Folds the moves the server hasn't confirmed yet onto its state. Returns the
// state untouched when there is nothing to mirror, so React sees the same
// object and nothing re-renders.
export function applyLocalMoves(state, playerId, moves) {
  if (!state || !playerId || !moves?.length) return state;
  if (state.gameType === 'mahjong') return state;

  let next = state;
  for (const move of moves) {
    const applied = move.kind === 'play'
      ? applyPlay(next, playerId, move)
      : applyMoveWildcard(next, playerId, move);
    if (applied) next = applied;
  }
  return next;
}

// ── Mirroring one move ────────────────────────────────────────

function applyPlay(state, playerId, { cardId, destination, options = {} }) {
  if (!canActNow(state, playerId)) return null;

  const me      = state.players[playerId];
  const cardIdx = me.hand?.findIndex(c => c.id === cardId) ?? -1;
  if (cardIdx === -1) return null;
  const card = me.hand[cardIdx];

  const next   = cloneForPlayer(state, playerId);
  const player = next.players[playerId];
  player.hand.splice(cardIdx, 1);
  next.actionsUsed += 1;

  if (destination === 'bank') {
    if (card.type === CARD_TYPE.PROPERTY || card.type === CARD_TYPE.WILDCARD) return null;
    player.bank = [...player.bank, card];
    return next;
  }

  if (destination === 'property') {
    const color = card.type === CARD_TYPE.PROPERTY
      ? card.color
      : options.targetColor ?? (card.colors?.length === 1 ? card.colors[0] : null);
    if (!color) return null;
    if (card.type === CARD_TYPE.WILDCARD && !card.colors?.includes(color)) return null;

    const group = cloneGroup(player, color);
    // A set that would overflow hands the turn to the wildcard-moving flow.
    // That's the server's call to make, so let the card wait for it.
    if (group.cards.length + 1 > (SET_SIZE[color] ?? 0)) return null;

    group.cards = [...group.cards, card.type === CARD_TYPE.WILDCARD ? { ...card, currentColor: color } : card];
    return next;
  }

  if (destination === 'action') {
    if (SELF_CONTAINED.has(card.action)) {
      const color = options.targetColor;
      const group = color ? cloneGroup(player, color) : null;
      if (!group || color === COLOR.RAILROAD || color === COLOR.UTILITY) return null;
      if (card.action === 'house') {
        if (group.hasHouse) return null;
        group.hasHouse = true;
      } else {
        if (!group.hasHouse || group.hasHotel) return null;
        group.hasHotel = true;
      }
      return next;
    }

    // Everything else — rent, the cards you play at people, Pass Go — leaves
    // your hand for certain, and that is all the client can say. What it does
    // next (who owes what, which cards you drew) is the server's to decide, so
    // the board is held as it is until that answer arrives.
    next.awaitingServer = true;
    return next;
  }

  return null;
}

function applyMoveWildcard(state, playerId, { cardId, newColor }) {
  if (state.playerOrder[state.currentPlayerIndex] !== playerId) return null;
  if (state.phase !== 'playing' && state.phase !== 'movingWildcard') return null;

  const me = state.players[playerId];
  const oldColor = Object.keys(me.properties ?? {})
    .find(color => me.properties[color].cards.some(c => c.id === cardId));
  if (!oldColor || oldColor === newColor) return null;

  const card = me.properties[oldColor].cards.find(c => c.id === cardId);
  if (card.type !== CARD_TYPE.WILDCARD || !card.colors?.includes(newColor)) return null;

  const next   = cloneForPlayer(state, playerId);
  const player = next.players[playerId];

  const from = cloneGroup(player, oldColor);
  from.cards = from.cards.filter(c => c.id !== cardId);
  if (from.cards.length === 0) delete player.properties[oldColor];

  const to = cloneGroup(player, newColor);
  to.cards = [...to.cards, { ...card, currentColor: newColor }];

  // Moving the wildcard out of an overfull set is what the game was waiting for.
  if (next.phase === 'movingWildcard' && next.pendingAction?.type === 'wildcardOverflow') {
    const overflow = player.properties[next.pendingAction.color];
    if (!overflow || overflow.cards.length <= (SET_SIZE[next.pendingAction.color] ?? 0)) {
      next.pendingAction = null;
      next.phase = 'playing';
    }
  }
  return next;
}

// ── Helpers ───────────────────────────────────────────────────

function canActNow(state, playerId) {
  return state.phase === 'playing'
    && !state.pendingAction
    && !state.awaitingServer
    && state.playerOrder[state.currentPlayerIndex] === playerId;
}

// Copies just the parts of the state a local move touches. Everything else
// stays shared with the server's object, so the render cost is one player.
function cloneForPlayer(state, playerId) {
  const me = state.players[playerId];
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...me,
        hand:       [...(me.hand ?? [])],
        bank:       [...(me.bank ?? [])],
        properties: { ...(me.properties ?? {}) },
      },
    },
    optimistic: true,
  };
}

function cloneGroup(player, color) {
  const existing = player.properties[color];
  const group = existing
    ? { ...existing, cards: [...existing.cards] }
    : { cards: [], hasHouse: false, hasHotel: false };
  player.properties[color] = group;
  return group;
}
