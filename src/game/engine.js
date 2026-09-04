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

  const playerOrder = shuffleDeck([...playerIds]);

  const state = {
    players,
    playerOrder,
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

// Debug variant — accepts explicit hand assignments; remaining cards shuffled into deck.
// manualHands: { [playerId]: Card[] }
export function createGameDebug(playerIds, manualHands) {
  if (playerIds.length < 2 || playerIds.length > 5) {
    throw new Error('Property Deal requires 2–5 players.');
  }

  const assignedIds = new Set(
    Object.values(manualHands).flat().map(c => c.id)
  );
  const remainingDeck = shuffleDeck(FULL_DECK.filter(c => !assignedIds.has(c.id)));

  const players = {};
  playerIds.forEach(id => {
    players[id] = {
      id,
      hand:       [...(manualHands[id] ?? [])],
      bank:       [],
      properties: {},
    };
  });

  const state = {
    players,
    playerOrder:        playerIds,
    currentPlayerIndex: 0,
    deck:               remainingDeck,
    discard:            [],
    actionsUsed:        0,
    phase:              'playing',
    winner:             null,
    pendingAction:      null,
    playerNames:        {},
    log:                [],
    debugMode:          true,
  };

  playerIds.forEach((id, i) => {
    state.playerNames[id] = `Player ${i + 1}`;
  });

  addLog(state, `[DEBUG] Game started with manual hand setup.`);
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
  assertNotMovingWildcard(state);
  const player = state.players[playerId];

  const excess = state.debugMode ? 0 : player.hand.length - MAX_HAND_SIZE;
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

export function resignGame(state, playerId) {
  const player = state.players[playerId];
  if (!player) throw new Error('Player not found.');

  // Return all cards to discard pile
  state.discard.push(...player.hand);
  state.discard.push(...player.bank);
  Object.values(player.properties).forEach(group => {
    state.discard.push(...group.cards);
  });

  // Remove player from game
  delete state.players[playerId];
  state.playerOrder = state.playerOrder.filter(id => id !== playerId);

  // Clear any pending action involving this player
  if (state.pendingAction) {
    const p = state.pendingAction;
    if (
      p.fromId === playerId || p.toId === playerId ||
      p.initiatorId === playerId || p.targetId === playerId ||
      p.fromIds?.includes(playerId)
    ) {
      state.pendingAction = null;
      state.phase = 'playing';
    }
    // Remove from remaining payers if birthday/rent
    if (p.remaining) {
      p.remaining = p.remaining.filter(id => id !== playerId);
      if (p.remaining.length === 0) {
        state.pendingAction = null;
        state.phase = 'playing';
      }
    }
  }

  // If it was this player's turn, advance to next
  if (state.playerOrder.length > 0) {
    state.currentPlayerIndex = state.currentPlayerIndex % state.playerOrder.length;
    // Auto draw for next player
  }

  addLog(state, `${playerId} resigned from the game.`);

  // Check if only one player remains
  if (state.playerOrder.length === 1) {
    state.phase  = 'gameover';
    state.winner = state.playerOrder[0];
    addLog(state, `🏆 ${state.playerOrder[0]} wins — last player standing!`);
  } else if (state.playerOrder.length === 0) {
    state.phase = 'gameover';
  }

  return state;
}

// ============================================================
// PLAYING CARDS
// ============================================================

export function playCard(state, playerId, cardId, destination, options = {}) {
  assertCurrentPlayer(state, playerId);
  assertNotMovingWildcard(state);
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

  // If the group is now overfull (played onto a full set that contained a wildcard),
  // require the player to move a wildcard out before continuing.
  const group = player.properties[color];
  if (group.cards.length > (SET_SIZE[color] ?? 0)) {
    const hasWild = group.cards.some(c => c.type === CARD_TYPE.WILDCARD);
    if (!hasWild) throw new Error(`The ${color} set is full and has no wildcard to move.`);
    state.phase = 'movingWildcard';
    state.pendingAction = { type: 'wildcardOverflow', playerId: player.id, color };
    addLog(state, `${player.id} must move a wildcard out of their overfull ${color} set.`);
  } else {
    checkWin(state);
  }
  return state;
}

function playAsAction(state, player, card, options) {
  if (card.type === CARD_TYPE.MONEY) {
    throw new Error('Money cards cannot be played as actions — bank them instead.');
  }

  // House/hotel cards are stored on the property group so they can be sold during payment
  if (card.action !== 'house' && card.action !== 'hotel') state.discard.push(card);
  state.actionsUsed += 1;

  switch (card.action ?? card.type) {
    case 'passGo':        return resolvePassGo(state, player);
    case 'debtCollector': return initiateDebtCollector(state, player, options);
    case 'birthday':      return initiateBirthday(state, player);
    case 'slyDeal':       return initiateSlyDeal(state, player, options);
    case 'forceDeal':     return initiateForceDeal(state, player, options);
    case 'dealBreaker':   return initiateDealBreaker(state, player, options);
    case 'house':         return resolveHouse(state, player, card, options);
    case 'hotel':         return resolveHotel(state, player, card, options);
    case 'doubleRent':    throw new Error('Double the Rent must be played alongside a rent card.');
    case CARD_TYPE.RENT:  return initiateRent(state, player, card, options);
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

function resolveHouse(state, player, card, { targetColor } = {}) {
  if (targetColor === COLOR.RAILROAD || targetColor === COLOR.UTILITY) {
    throw new Error('Houses cannot be built on Railroad or Utility sets.');
  }
  assertCompleteSet(state, player.id, targetColor);
  const group = player.properties[targetColor];
  if (group.hasHouse) throw new Error('This set already has a house.');
  group.hasHouse  = true;
  group.houseCard = card;
  addLog(state, `${player.id} added a House to ${targetColor}.`);
  checkWin(state);
  return state;
}

function resolveHotel(state, player, card, { targetColor } = {}) {
  if (targetColor === COLOR.RAILROAD || targetColor === COLOR.UTILITY) {
    throw new Error('Hotels cannot be built on Railroad or Utility sets.');
  }
  assertCompleteSet(state, player.id, targetColor);
  const group = player.properties[targetColor];
  if (!group.hasHouse) throw new Error('A house must be built before a hotel.');
  if (group.hasHotel)  throw new Error('This set already has a hotel.');
  group.hasHotel  = true;
  group.hotelCard = card;
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

  if (response === 'acceptJustSayNo') {
    if (!state.pendingAction?.justSayNoBy) throw new Error('No Just Say No is active.');
    const pending     = state.pendingAction;
    const initiatorId = pending.toId ?? pending.initiatorId;

    if (pending.justSayNoBy === initiatorId) {
      // Initiator counter-JSN'd successfully — target is accepting it, so the original action PROCEEDS.
      pending.justSayNoBy = null;
      return resolveAccept(state, responderId, []);
    } else {
      // Target's JSN succeeded — initiator accepted it, so the original action is CANCELLED.
      state.pendingAction = null;
      state.phase = 'playing';
      addLog(state, `Just Say No! The action was blocked.`);
      return state;
    }
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
      resolvePayment(state, responderId, responderId, pending.toId, pending.amount, selectedCardIds, true);
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

function validatePaymentSelection(payer, selectedCardIds) {
  const selectedSet = new Set(selectedCardIds);
  for (const [color, group] of Object.entries(payer.properties)) {
    const hotelMissing = group.hasHotel && group.hotelCard && !selectedSet.has(group.hotelCard.id);
    const houseMissing = group.hasHouse && group.houseCard && !selectedSet.has(group.houseCard.id);
    // Cannot sell house before hotel
    if (group.houseCard && selectedSet.has(group.houseCard.id) && hotelMissing) {
      throw new Error(`You must sell the hotel on your ${color} set before the house.`);
    }
    // Cannot sell individual properties before their buildings are cleared
    for (const card of group.cards) {
      if (!selectedSet.has(card.id)) continue;
      if (hotelMissing) throw new Error(`You must sell the hotel on your ${color} set before selling its properties.`);
      if (houseMissing) throw new Error(`You must sell the house on your ${color} set before selling its properties.`);
    }
  }
}

// Value a card contributes when handed over as payment.
function cardValue(card) {
  return card.value ?? card.bankValue ?? 0;
}

function sumValues(cards) {
  return cards.reduce((sum, c) => sum + cardValue(c), 0);
}

// Cheapest subset of `cards` totalling at least `amount`, or null when the
// cards cannot cover it. Ties on total are broken toward handing over fewer
// cards, so a single $5M is preferred over five $1M.
function minOverpaySubset(cards, amount) {
  if (amount <= 0) return [];
  const total = sumValues(cards);
  if (total < amount) return null;

  // best[sum] = indices of the smallest set of cards adding up to exactly `sum`
  const best = new Map([[0, []]]);
  for (let i = 0; i < cards.length; i++) {
    const value = cardValue(cards[i]);
    if (value <= 0) continue;
    for (const [sum, picks] of [...best]) {
      const next = sum + value;
      if (next > total) continue;
      const current = best.get(next);
      if (!current || picks.length + 1 < current.length) best.set(next, [...picks, i]);
    }
  }

  let bestSum = null;
  for (const sum of best.keys()) {
    if (sum >= amount && (bestSum === null || sum < bestSum)) bestSum = sum;
  }
  if (bestSum === null) return null;

  return best.get(bestSum).map(i => cards[i].id);
}

// Groups a player can sell from, ordered by how much losing them hurts:
// incomplete sets first, then complete ones. Buildings only ever sit on
// complete sets, so incomplete groups never carry a sale prerequisite.
function sellableGroups(payer) {
  return Object.entries(payer.properties)
    .map(([color, group]) => ({
      group,
      complete: group.cards.length >= (SET_SIZE[color] ?? 3),
      // The rules require a group's hotel to be sold before its house, and
      // both before any of its property cards.
      queue: [
        ...(group.hasHotel && group.hotelCard ? [group.hotelCard] : []),
        ...(group.hasHouse && group.houseCard ? [group.houseCard] : []),
      ],
    }))
    .sort((a, b) => Number(a.complete) - Number(b.complete));
}

// Picks the cards a player hands over when they accept without choosing any —
// every bot payment, and humans who accept the auto-selection. Covers the debt
// while paying as little over it as possible, spending bank money first.
function selectAutoPayment(payer, amount) {
  if (amount <= 0) return [];

  const fromBank = minOverpaySubset(payer.bank, amount);
  if (fromBank) return fromBank;

  // The bank alone cannot settle the debt, so it all goes, and the rest is
  // covered by selling off the board.
  const selected = payer.bank.map(c => c.id);
  let remaining  = amount - sumValues(payer.bank);

  const groups = sellableGroups(payer);
  const taken  = new Set();

  while (remaining > 0) {
    // A group offers its next mandatory building sale, or — once its buildings
    // are gone — any of its remaining property cards.
    const options = [];
    for (const entry of groups) {
      const nextBuilding = entry.queue.find(c => !taken.has(c.id));
      if (nextBuilding) { options.push({ card: nextBuilding, complete: entry.complete }); continue; }
      for (const card of entry.group.cards) {
        if (!taken.has(card.id)) options.push({ card, complete: entry.complete });
      }
    }
    if (options.length === 0) break; // Everything is gone — the debt is paid in full with what there was

    // Settle outright with the cheapest single asset that covers what is left,
    // rather than dribbling out several and overshooting on the last one.
    const settles = options
      .filter(o => cardValue(o.card) >= remaining)
      .sort((a, b) => cardValue(a.card) - cardValue(b.card));
    const pick = settles[0] ?? options.sort((a, b) =>
      Number(a.complete) - Number(b.complete) || cardValue(b.card) - cardValue(a.card)
    )[0];

    taken.add(pick.card.id);
    selected.push(pick.card.id);
    remaining -= cardValue(pick.card);
  }

  return selected;
}

function resolvePayment(state, payerId, fromId, toId, amount, selectedCardIds = [], skipCleanup = false) {
  const payer     = state.players[fromId];
  const recipient = state.players[toId];

  const paymentIds = selectedCardIds.length > 0 ? selectedCardIds : selectAutoPayment(payer, amount);

  if (paymentIds.length > 0) {
    validatePaymentSelection(payer, paymentIds);
    for (const cardId of paymentIds) {
      // Check bank first
      const bankIdx = payer.bank.findIndex(c => c.id === cardId);
      if (bankIdx !== -1) {
        const [card] = payer.bank.splice(bankIdx, 1);
        recipient.bank.push(card);
        continue;
      }
      // Check building cards on property groups
      let foundBuilding = false;
      for (const group of Object.values(payer.properties)) {
        if (group.hotelCard?.id === cardId) {
          recipient.bank.push(group.hotelCard);
          group.hotelCard = null;
          group.hasHotel  = false;
          foundBuilding = true;
          break;
        }
        if (group.houseCard?.id === cardId) {
          recipient.bank.push(group.houseCard);
          group.houseCard = null;
          group.hasHouse  = false;
          // Hotel can't exist without a house — discard it
          if (group.hotelCard) {
            state.discard.push(group.hotelCard);
            group.hotelCard = null;
            group.hasHotel  = false;
          }
          foundBuilding = true;
          break;
        }
      }
      if (foundBuilding) continue;
      transferProperty(state, fromId, toId, cardId);
    }
  }

  if (!skipCleanup) {
    state.pendingAction = null;
    state.phase = 'playing';
  }
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

  // Resolve wildcardOverflow if the overfull group is now back to capacity
  if (state.phase === 'movingWildcard' && state.pendingAction?.type === 'wildcardOverflow') {
    const { color: overflowColor } = state.pendingAction;
    const overflowGroup = player.properties[overflowColor];
    if (!overflowGroup || overflowGroup.cards.length <= (SET_SIZE[overflowColor] ?? 0)) {
      state.pendingAction = null;
      state.phase = 'playing';
    }
  }

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

function assertNotMovingWildcard(state) {
  if (state.phase === 'movingWildcard') {
    throw new Error('Move a wildcard out of your overfull set before continuing.');
  }
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