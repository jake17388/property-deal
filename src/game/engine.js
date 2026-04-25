// ============================================================
// PROPERTY DEAL — Game Engine
// Pure functions only — no React, no UI, no side effects.
// ============================================================

import {
  FULL_DECK, shuffleDeck, getCardColor,
  COLOR, SET_SIZE, RENT_VALUES, BUILDING_BONUS,
  CARD_TYPE,
} from './cards.js';

// ============================================================
// CONSTANTS
// ============================================================
export const MAX_HAND_SIZE         = 7;
export const ACTIONS_PER_TURN      = 3;
export const CARDS_PER_DRAW        = 2;
export const EMPTY_HAND_DRAW       = 5;
export const SETS_TO_WIN           = 3;
export const BIRTHDAY_AMOUNT       = 2;
export const DEBT_COLLECTOR_AMOUNT = 5;

// ============================================================
// GAME INITIALIZATION
// ============================================================

export function createGame(playerIds) {
  if (playerIds.length < 2 || playerIds.length > 5) {
    throw new Error('Property Deal requires 2–5 players.');
  }

  const deck = shuffleDeck(FULL_DECK);
  const players = {};

  playerIds.forEach(id => {
    players[id] = {
      id,
      hand:       [],
      bank:       [],
      properties: {},
    };
  });

  const state = {
    players,
    playerOrder:   playerIds,
    currentPlayerIndex: 0,
    deck:          deck.slice(playerIds.length * 5),
    discard:       [],
    actionsUsed:   0,
    phase:         'playing',
    winner:        null,
    pendingAction: null,
    playerNames:   {},
    log:           [],
  };

  // Deal 5 cards to each player
  playerIds.forEach((id, i) => {
    state.players[id].hand = deck.slice(i * 5, i * 5 + 5);
  });

  // Default names — overwritten by server with real names
  playerIds.forEach((id, i) => {
    state.playerNames[id] = `Player ${i + 1}`;
  });

  addLog(state, `Game started with ${playerIds.length} players.`);
  return state;
}

// ============================================================
// TURN MANAGEMENT
// ============================================================

export function getCurrentPlayer(state) {
  return state.players[state.playerOrder[state.currentPlayerIndex]];
}

export function drawForTurn(state, playerId) {
  assertCurrentPlayer(state, playerId);
  const player = state.players[playerId];
  const amount = player.hand.length === 0 ? EMPTY_HAND_DRAW : CARDS_PER_DRAW;
  const drawn  = drawCards(state, amount);
  player.hand.push(...drawn);
  addLog(state, `${playerId} drew ${drawn.length} card(s).`);
  return { state, drawn };
}

export function endTurn(state, playerId, discardIds = []) {
  assertCurrentPlayer(state, playerId);
  const player = state.players[playerId];

  const excess = player.hand.length - MAX_HAND_SIZE;
  if (excess > 0) {
    if (discardIds.length !== excess) {
      throw new Error(`You must discard exactly ${excess} card(s).`);
    }
    discardIds.forEach(id => {
      const idx = player.hand.findIndex(c => c.id === id);
      if (idx === -1) throw new Error(`Card ${id} not in hand.`);
      const [card] = player.hand.splice(idx, 1);
      state.discard.push(card);
    });
  }

  state.actionsUsed = 0;
  state.currentPlayerIndex =
    (state.currentPlayerIndex + 1) % state.playerOrder.length;
  addLog(state, `${playerId} ended their turn.`);
  return state;
}

// ============================================================
// PLAYING CARDS
// ============================================================

export function playCard(state, playerId, cardId, destination, options = {}) {
  assertCurrentPlayer(state, playerId);
  assertActionsRemaining(state);

  const player  = state.players[playerId];
  const cardIdx = player.hand.findIndex(c => c.id === cardId);
  if (cardIdx === -1) throw new Error(`Card ${cardId} not found in hand.`);
  const card = player.hand[cardIdx];

  player.hand.splice(cardIdx, 1);

  if (destination === 'bank')     return playToBank(state, player, card);
  if (destination === 'property') return playToProperty(state, player, card, options);
  if (destination === 'action')   return playAsAction(state, player, card, options);

  throw new Error(`Unknown destination: ${destination}`);
}

function playToBank(state, player, card) {
  if (card.type === CARD_TYPE.PROPERTY || card.type === CARD_TYPE.WILDCARD) {
    throw new Error('Property cards cannot be banked.');
  }
  player.bank.push(card);
  state.actionsUsed += 1;
  addLog(state, `${player.id} banked ${getCardName(card)} for $${card.bankValue ?? card.value}M.`);
  checkWin(state);
  return state;
}

function playToProperty(state, player, card, { targetColor } = {}) {
  if (card.type !== CARD_TYPE.PROPERTY && card.type !== CARD_TYPE.WILDCARD) {
    throw new Error('Only property and wildcard cards can be played to the property area.');
  }

  const color = resolvePropertyColor(card, targetColor);
  if (!color) throw new Error('A color must be specified for this card.');

  if (card.type === CARD_TYPE.WILDCARD && !card.colors.includes(color)) {
    throw new Error(`This wildcard cannot be placed in the ${color} group.`);
  }
  if (card.type === CARD_TYPE.PROPERTY && card.color !== color) {
    throw new Error(`This property belongs to the ${card.color} group.`);
  }

  if (!player.properties[color]) {
    player.properties[color] = { cards: [], hasHouse: false, hasHotel: false };
  }

  if (card.type === CARD_TYPE.WILDCARD) card.currentColor = color;

  player.properties[color].cards.push(card);
  state.actionsUsed += 1;
  addLog(state, `${player.id} played ${getCardName(card)} to ${color}.`);
  checkWin(state);
  return state;
}

function playAsAction(state, player, card, options) {
  if (card.type === CARD_TYPE.MONEY) {
    throw new Error('Money cards cannot be played as actions — bank them instead.');
  }

  state.discard.push(card);
  state.actionsUsed += 1;

  switch (card.action ?? card.type) {
    case 'passGo':       return resolvePassGo(state, player);
    case 'debtCollector': return initiateDebtCollector(state, player, options);
    case 'birthday':     return initiateBirthday(state, player);
    case 'slyDeal':      return initiateSlyDeal(state, player, options);
    case 'forceDeal':    return initiateForceDeal(state, player, options);
    case 'dealBreaker':  return initiateDealBreaker(state, player, options);
    case 'house':        return resolveHouse(state, player, options);
    case 'hotel':        return resolveHotel(state, player, options);
    case 'doubleRent':   throw new Error('Double the Rent must be played alongside a rent card.');
    case CARD_TYPE.RENT: return initiateRent(state, player, card, options);
    default: throw new Error(`Unknown action: ${card.action}`);
  }
}

// ============================================================
// ACTION RESOLVERS
// ============================================================

function resolvePassGo(state, player) {
  const drawn = drawCards(state, 2);
  player.hand.push(...drawn);
  addLog(state, `${player.id} played Pass Go and drew ${drawn.length} card(s).`);
  return state;
}

function initiateDebtCollector(state, player, { targetPlayerId } = {}) {
  assertTargetPlayer(state, targetPlayerId, player.id);
  state.pendingAction = {
    type:       'payment',
    fromId:     targetPlayerId,
    toId:       player.id,
    amount:     DEBT_COLLECTOR_AMOUNT,
    canCounter: true,
  };
  addLog(state, `${player.id} used Debt Collector on ${targetPlayerId} for $${DEBT_COLLECTOR_AMOUNT}M.`);
  state.phase = 'responding';
  return state;
}

function initiateBirthday(state, player) {
  const targets = state.playerOrder.filter(id => id !== player.id);
  state.pendingAction = {
    type:       'birthdayPayment',
    fromIds:    targets,
    toId:       player.id,
    amount:     BIRTHDAY_AMOUNT,
    remaining:  [...targets],
    canCounter: true,
  };
  addLog(state, `${player.id} played It's My Birthday! Everyone pays $${BIRTHDAY_AMOUNT}M.`);
  state.phase = 'responding';
  return state;
}

function initiateSlyDeal(state, player, { targetPlayerId, targetCardId } = {}) {
  assertTargetPlayer(state, targetPlayerId, player.id);
  const targetCard = findPropertyCard(state, targetPlayerId, targetCardId, { allowComplete: false });
  state.pendingAction = {
    type:        'slyDeal',
    fromId:      targetPlayerId,
    toId:        player.id,
    targetCardId,
    canCounter:  true,
  };
  addLog(state, `${player.id} used Sly Deal to steal ${targetCard.name} from ${targetPlayerId}.`);
  state.phase = 'responding';
  return state;
}

function initiateForceDeal(state, player, { targetPlayerId, targetCardId, offeredCardId } = {}) {
  assertTargetPlayer(state, targetPlayerId, player.id);
  findPropertyCard(state, targetPlayerId, targetCardId, { allowComplete: false });
  findPropertyCard(state, player.id, offeredCardId, { allowComplete: true });
  state.pendingAction = {
    type:         'forceDeal',
    initiatorId:  player.id,
    targetId:     targetPlayerId,
    targetCardId,
    offeredCardId,
    canCounter:   true,
  };
  addLog(state, `${player.id} used Force Deal with ${targetPlayerId}.`);
  state.phase = 'responding';
  return state;
}

function initiateDealBreaker(state, player, { targetPlayerId, targetColor } = {}) {
  assertTargetPlayer(state, targetPlayerId, player.id);
  assertCompleteSet(state, targetPlayerId, targetColor);
  state.pendingAction = {
    type:       'dealBreaker',
    fromId:     targetPlayerId,
    toId:       player.id,
    targetColor,
    canCounter: true,
  };
  addLog(state, `${player.id} played Deal Breaker on ${targetPlayerId}'s ${targetColor} set!`);
  state.phase = 'responding';
  return state;
}

function initiateRent(state, player, card, { rentColor, targetPlayerId, doubleRent = false } = {}) {
  if (!card.colors.includes(rentColor)) {
    throw new Error(`This rent card cannot charge ${rentColor} rent.`);
  }

  const group = player.properties[rentColor];
  if (!group || group.cards.length === 0) {
    throw new Error(`You have no ${rentColor} properties to charge rent on.`);
  }

  let amount = calculateRent(rentColor, group);

  if (doubleRent) {
    const dtrIdx = player.hand.findIndex(c => c.action === 'doubleRent');
    if (dtrIdx === -1) throw new Error('No Double the Rent card in hand.');
    const dtr = player.hand.splice(dtrIdx, 1)[0];
    state.discard.push(dtr);
    state.actionsUsed += 1;
    amount *= 2;
  }

  const targets = card.allPlayers
    ? state.playerOrder.filter(id => id !== player.id)
    : [targetPlayerId];

  if (!card.allPlayers) assertTargetPlayer(state, targetPlayerId, player.id);

  state.pendingAction = {
    type:      'rentPayment',
    fromIds:   targets,
    toId:      player.id,
    amount,
    remaining: [...targets],
    canCounter: true,
  };
  addLog(state, `${player.id} charged $${amount}M ${rentColor} rent${doubleRent ? ' (doubled)' : ''}.`);
  state.phase = 'responding';
  return state;
}

function resolveHouse(state, player, { targetColor } = {}) {
  if (targetColor === COLOR.RAILROAD || targetColor === COLOR.UTILITY) {
    throw new Error('Houses cannot be built on Railroad or Utility sets.');
  }
  assertCompleteSet(state, player.id, targetColor);
  const group = player.properties[targetColor];
  if (group.hasHouse) throw new Error('This set already has a house.');
  group.hasHouse = true;
  addLog(state, `${player.id} added a House to ${targetColor}.`);
  checkWin(state);
  return state;
}

function resolveHotel(state, player, { targetColor } = {}) {
  if (targetColor === COLOR.RAILROAD || targetColor === COLOR.UTILITY) {
    throw new Error('Hotels cannot be built on Railroad or Utility sets.');
  }
  assertCompleteSet(state, player.id, targetColor);
  const group = player.properties[targetColor];
  if (!group.hasHouse) throw new Error('A house must be built before a hotel.');
  if (group.hasHotel)  throw new Error('This set already has a hotel.');
  group.hasHotel = true;
  addLog(state, `${player.id} added a Hotel to ${targetColor}.`);
  checkWin(state);
  return state;
}

// ============================================================
// RESPONDING TO ACTIONS
// ============================================================

export function respondToAction(state, responderId, response, options = {}) {
  if (state.phase !== 'responding') throw new Error('No action to respond to.');

  if (response === 'justSayNo') {
    return playJustSayNo(state, responderId, options.cardId);
  }

  if (response === 'accept') {
    return resolveAccept(state, responderId, options.selectedCardIds ?? []);
  }

  throw new Error(`Unknown response: ${response}`);
}

function playJustSayNo(state, responderId, cardId) {
  const player = state.players[responderId];
  const jsnIdx = player.hand.findIndex(c => c.id === cardId && c.action === 'justSayNo');
  if (jsnIdx === -1) throw new Error('No Just Say No card found.');

  const jsn = player.hand.splice(jsnIdx, 1)[0];
  state.discard.push(jsn);

  const pending = state.pendingAction;

  if (pending.justSayNoBy === responderId) {
    pending.justSayNoBy = null;
    addLog(state, `${responderId} countered the Just Say No! Action proceeds.`);
  } else {
    pending.justSayNoBy = responderId;
    addLog(state, `${responderId} played Just Say No!`);
  }
  return state;
}

function resolveAccept(state, responderId, selectedCardIds = []) {
  const pending = state.pendingAction;

  switch (pending.type) {
    case 'payment':
      return resolvePayment(state, responderId, pending.fromId, pending.toId, pending.amount, selectedCardIds);

    case 'birthdayPayment':
    case 'rentPayment': {
      resolvePayment(state, responderId, responderId, pending.toId, pending.amount, selectedCardIds);
      pending.remaining = pending.remaining.filter(id => id !== responderId);
      if (pending.remaining.length === 0) {
        state.pendingAction = null;
        state.phase = 'playing';
      }
      return state;
    }

    case 'slyDeal':
      return resolveSlyDeal(state, pending);

    case 'forceDeal':
      return resolveForceDeal(state, pending);

    case 'dealBreaker':
      return resolveDealBreaker(state, pending);

    default:
      throw new Error(`Cannot resolve pending action type: ${pending.type}`);
  }
}

// ============================================================
// PAYMENT RESOLUTION
// ============================================================

function resolvePayment(state, payerId, fromId, toId, amount, selectedCardIds = []) {
  const payer     = state.players[fromId];
  const recipient = state.players[toId];

  if (selectedCardIds.length > 0) {
    for (const cardId of selectedCardIds) {
      const bankIdx = payer.bank.findIndex(c => c.id === cardId);
      if (bankIdx !== -1) {
        const [card] = payer.bank.splice(bankIdx, 1);
        recipient.bank.push(card);
        continue;
      }
      transferProperty(state, fromId, toId, cardId);
    }
  } else {
    // Auto fallback
    let remaining = amount;
    payer.bank.sort((a, b) => (b.value ?? b.bankValue ?? 0) - (a.value ?? a.bankValue ?? 0));
    while (remaining > 0 && payer.bank.length > 0) {
      const card = payer.bank.pop();
      recipient.bank.push(card);
      remaining -= card.value ?? card.bankValue ?? 0;
    }
    if (remaining > 0) {
      const allProps = getAllPropertyCards(payer);
      for (const card of allProps) {
        if (remaining <= 0) break;
        transferProperty(state, fromId, toId, card.id);
        remaining -= card.value ?? 0;
      }
    }
  }

  state.pendingAction = null;
  state.phase = 'playing';
  addLog(state, `${fromId} paid ${toId} (owed $${amount}M).`);
  checkWin(state);
  return state;
}

function resolveSlyDeal(state, pending) {
  transferProperty(state, pending.fromId, pending.toId, pending.targetCardId);
  state.pendingAction = null;
  state.phase = 'playing';
  addLog(state, `Sly Deal resolved — card transferred.`);
  checkWin(state);
  return state;
}

function resolveForceDeal(state, pending) {
  transferProperty(state, pending.targetId,    pending.initiatorId, pending.targetCardId);
  transferProperty(state, pending.initiatorId, pending.targetId,    pending.offeredCardId);
  state.pendingAction = null;
  state.phase = 'playing';
  addLog(state, `Force Deal resolved — properties swapped.`);
  checkWin(state);
  return state;
}

function resolveDealBreaker(state, pending) {
  const { fromId, toId, targetColor } = pending;
  const group = state.players[fromId].properties[targetColor];

  if (!state.players[toId].properties[targetColor]) {
    state.players[toId].properties[targetColor] = { cards: [], hasHouse: false, hasHotel: false };
  }

  state.players[toId].properties[targetColor] = { ...group };
  delete state.players[fromId].properties[targetColor];

  state.pendingAction = null;
  state.phase = 'playing';
  addLog(state, `Deal Breaker! ${toId} stole ${fromId}'s complete ${targetColor} set.`);
  checkWin(state);
  return state;
}

// ============================================================
// WILDCARD MOVEMENT
// ============================================================

export function moveWildcard(state, playerId, cardId, newColor) {
  assertCurrentPlayer(state, playerId);

  const player = state.players[playerId];
  let foundCard = null;
  let oldColor  = null;

  for (const [color, group] of Object.entries(player.properties)) {
    const idx = group.cards.findIndex(c => c.id === cardId);
    if (idx !== -1) {
      foundCard = group.cards.splice(idx, 1)[0];
      oldColor  = color;
      if (group.cards.length === 0) delete player.properties[color];
      break;
    }
  }

  if (!foundCard) throw new Error('Wildcard not found in your properties.');
  if (foundCard.type !== CARD_TYPE.WILDCARD) throw new Error('Only wildcards can be moved.');
  if (!foundCard.colors.includes(newColor)) throw new Error(`This wildcard cannot join the ${newColor} group.`);

  foundCard.currentColor = newColor;
  if (!player.properties[newColor]) {
    player.properties[newColor] = { cards: [], hasHouse: false, hasHotel: false };
  }
  player.properties[newColor].cards.push(foundCard);
  addLog(state, `${playerId} moved a wildcard from ${oldColor} to ${newColor}.`);
  checkWin(state);
  return state;
}

// ============================================================
// WIN CONDITION
// ============================================================

export function checkWin(state) {
  if (state.phase === 'gameover') return;
  for (const playerId of state.playerOrder) {
    if (countCompleteSets(state, playerId) >= SETS_TO_WIN) {
      state.phase  = 'gameover';
      state.winner = playerId;
      addLog(state, `🏆 ${playerId} wins with 3 complete sets!`);
      return;
    }
  }
}

export function countCompleteSets(state, playerId) {
  const player = state.players[playerId];
  let count = 0;
  for (const [color, group] of Object.entries(player.properties)) {
    if (group.cards.length >= SET_SIZE[color]) count++;
  }
  return count;
}

// ============================================================
// HELPERS
// ============================================================

function drawCards(state, n) {
  if (state.deck.length < n) {
    state.deck    = shuffleDeck(state.discard);
    state.discard = [];
  }
  return state.deck.splice(0, Math.min(n, state.deck.length));
}

function calculateRent(color, group) {
  const cardCount = group.cards.length;
  const rentTable = RENT_VALUES[color];
  const base  = rentTable[Math.min(cardCount, rentTable.length) - 1] ?? 0;
  const bonus =
    (group.hasHotel ? BUILDING_BONUS.house + BUILDING_BONUS.hotel : 0) +
    (group.hasHouse && !group.hasHotel ? BUILDING_BONUS.house : 0);
  return base + bonus;
}

function transferProperty(state, fromId, toId, cardId) {
  const from = state.players[fromId];
  const to   = state.players[toId];

  for (const [color, group] of Object.entries(from.properties)) {
    const idx = group.cards.findIndex(c => c.id === cardId);
    if (idx !== -1) {
      const [card] = group.cards.splice(idx, 1);
      if (group.cards.length === 0) delete from.properties[color];
      const targetColor = getCardColor(card) ?? color;
      if (!to.properties[targetColor]) {
        to.properties[targetColor] = { cards: [], hasHouse: false, hasHotel: false };
      }
      to.properties[targetColor].cards.push(card);
      return card;
    }
  }
  throw new Error(`Card ${cardId} not found in ${fromId}'s properties.`);
}

function getAllPropertyCards(player) {
  return Object.values(player.properties).flatMap(g => g.cards);
}

function findPropertyCard(state, playerId, cardId, { allowComplete }) {
  const player = state.players[playerId];
  for (const [color, group] of Object.entries(player.properties)) {
    const card = group.cards.find(c => c.id === cardId);
    if (card) {
      if (!allowComplete && isCompleteSet(group, color)) {
        throw new Error('Cannot target a card in a complete set.');
      }
      return card;
    }
  }
  throw new Error(`Card ${cardId} not found in ${playerId}'s properties.`);
}

function isCompleteSet(group, color) {
  return group.cards.length >= SET_SIZE[color];
}

function resolvePropertyColor(card, targetColor) {
  if (card.type === CARD_TYPE.PROPERTY) return card.color;
  if (targetColor) return targetColor;
  if (card.colors?.length === 1) return card.colors[0];
  return null;
}

// ============================================================
// ASSERTION HELPERS
// ============================================================

function assertCurrentPlayer(state, playerId) {
  const current = state.playerOrder[state.currentPlayerIndex];
  if (playerId !== current) throw new Error(`It is not ${playerId}'s turn.`);
}

function assertActionsRemaining(state) {
  if (state.actionsUsed >= ACTIONS_PER_TURN) {
    throw new Error('No actions remaining this turn.');
  }
}

function assertTargetPlayer(state, targetId, currentPlayerId) {
  if (!targetId) throw new Error('A target player must be specified.');
  if (targetId === currentPlayerId) throw new Error('Cannot target yourself.');
  if (!state.players[targetId]) throw new Error(`Player ${targetId} does not exist.`);
}

function assertCompleteSet(state, playerId, color) {
  const group = state.players[playerId].properties[color];
  if (!group || !isCompleteSet(group, color)) {
    throw new Error(`${playerId} does not have a complete ${color} set.`);
  }
}

function getCardName(card) {
  return card.name ?? `$${card.value}M`;
}

function addLog(state, message) {
  let readable = message;
  if (state.playerNames) {
    Object.entries(state.playerNames).forEach(([id, name]) => {
      readable = readable.replaceAll(id, name);
    });
  }
  state.log.push({ time: Date.now(), message: readable });
}