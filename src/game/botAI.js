import { CARD_TYPE, COLOR, SET_SIZE, RENT_VALUES, BUILDING_BONUS } from './cards.js';
import { ACTIONS_PER_TURN, MAX_HAND_SIZE } from './engine.js';

export const BOT_NAMES = ['Elon', 'Jeff', 'Warren', 'Bill'];

// Returns the next card play for the bot, or null to signal end-of-turn.
export function getBotMove(state, botId) {
  const bot = state.players[botId];
  if (!bot) return null;
  if (state.actionsUsed >= ACTIONS_PER_TURN) return null;

  const hand = bot.hand;
  const opponents = state.playerOrder.filter(id => id !== botId);

  // 1. Standard property cards — always play them
  const propCard = hand.find(c => c.type === CARD_TYPE.PROPERTY);
  if (propCard) {
    return { cardId: propCard.id, destination: 'property', options: {} };
  }

  // 2. Wildcard property cards — pick most useful color
  const wildCard = hand.find(c => c.type === CARD_TYPE.WILDCARD);
  if (wildCard) {
    const targetColor = pickWildcardColor(wildCard, bot);
    if (targetColor) return { cardId: wildCard.id, destination: 'property', options: { targetColor } };
  }

  // 3. Pass Go early — draw more cards when hand is thin
  if (hand.length <= 4) {
    const passGo = hand.find(c => c.action === 'passGo');
    if (passGo) return { cardId: passGo.id, destination: 'action', options: {} };
  }

  // 4. Deal Breaker — steal a complete set if one exists
  const dealBreaker = hand.find(c => c.action === 'dealBreaker');
  if (dealBreaker) {
    const target = findDealBreakerTarget(state, botId);
    if (target) return { cardId: dealBreaker.id, destination: 'action', options: target };
  }

  // 5. Rent cards — charge rent for our best property group
  const rentCard = hand.find(c => c.type === CARD_TYPE.RENT);
  if (rentCard) {
    const rentOpts = buildRentOptions(state, botId, rentCard, hand);
    if (rentOpts) return { cardId: rentCard.id, destination: 'action', options: rentOpts };
  }

  // 6. Sly Deal — steal a property we need (or anything from any opponent)
  const slyDeal = hand.find(c => c.action === 'slyDeal');
  if (slyDeal) {
    const target = findSlyDealTarget(state, botId);
    if (target) return { cardId: slyDeal.id, destination: 'action', options: target };
  }

  // 7. Debt Collector — hit the richest opponent
  const debtCollector = hand.find(c => c.action === 'debtCollector');
  if (debtCollector) {
    const richest = richestOpponent(state, botId);
    if (richest) return { cardId: debtCollector.id, destination: 'action', options: { targetPlayerId: richest } };
  }

  // 8. It's My Birthday — always worth playing when opponents exist
  const birthday = hand.find(c => c.action === 'birthday');
  if (birthday && opponents.length > 0 && anyOpponentCanPay(state, botId)) {
    return { cardId: birthday.id, destination: 'action', options: {} };
  }

  // 9. House — add to a complete set that lacks one
  const house = hand.find(c => c.action === 'house');
  if (house) {
    const color = colorForHouse(state, botId);
    if (color) return { cardId: house.id, destination: 'action', options: { targetColor: color } };
  }

  // 10. Hotel — add to a complete set that already has a house
  const hotel = hand.find(c => c.action === 'hotel');
  if (hotel) {
    const color = colorForHotel(state, botId);
    if (color) return { cardId: hotel.id, destination: 'action', options: { targetColor: color } };
  }

  // 11. Pass Go (late) — draw if there's room in hand
  const passGo = hand.find(c => c.action === 'passGo');
  if (passGo && hand.length < MAX_HAND_SIZE) {
    return { cardId: passGo.id, destination: 'action', options: {} };
  }

  // 12. Bank money cards (highest value first — build a bank)
  const moneyCards = hand.filter(c => c.type === CARD_TYPE.MONEY);
  if (moneyCards.length > 0) {
    moneyCards.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return { cardId: moneyCards[0].id, destination: 'bank', options: {} };
  }

  // 13. Bank low-value action cards we can't use (hold JSN and deal breakers,
  //     and hold rent cards that match a property we own — they are only
  //     unplayable right now because no opponent has anything to pay with)
  const bankable = hand.find(c =>
    (c.type === CARD_TYPE.ACTION || c.type === CARD_TYPE.RENT) &&
    c.action !== 'justSayNo' &&
    c.action !== 'dealBreaker' &&
    !(c.type === CARD_TYPE.RENT && rentCardIsUsableLater(c, bot))
  );
  if (bankable) return { cardId: bankable.id, destination: 'bank', options: {} };

  return null; // Nothing left to do — end turn
}

// Returns how the bot responds to a pending action targeting it.
export function getBotResponse(state, _botId) {
  const pending = state.pendingAction;
  if (!pending) return { response: 'accept', options: {} };

  // When a JSN is in play, the bot always accepts it (bots don't counter-JSN)
  if (pending.justSayNoBy) {
    return { response: 'acceptJustSayNo', options: {} };
  }

  // For all other actions (payment, sly deal, deal breaker, force deal):
  // accept and let the engine auto-select which cards to pay with
  return { response: 'accept', options: { selectedCardIds: [] } };
}

// Returns { cardId, newColor } to resolve a wildcardOverflow pending action, or null.
export function getBotWildcardOverflowMove(state, botId) {
  const pending = state.pendingAction;
  if (pending?.type !== 'wildcardOverflow' || pending.playerId !== botId) return null;

  const { color: overflowColor } = pending;
  const bot = state.players[botId];
  const group = bot.properties[overflowColor];
  if (!group) return null;

  // The engine names the card when it is the one that has to move — a wildcard a
  // stolen set displaced. Otherwise any wildcard in the group will do.
  const wild = (pending.cardId && group.cards.find(c => c.id === pending.cardId))
    ?? group.cards.find(c => c.type === CARD_TYPE.WILDCARD);
  if (!wild) return null;

  // Pick the alternate color where the bot has the most cards (closest to
  // completing), preferring ones with room over sets that are already full.
  const altColors = wild.colors.filter(c => c !== overflowColor);
  if (altColors.length === 0) return null;

  let bestColor = altColors[0];
  let bestScore = -Infinity;
  for (const c of altColors) {
    const have  = bot.properties[c]?.cards.length ?? 0;
    const need  = SET_SIZE[c] ?? 3;
    const score = have / need + (have > 0 ? 0.1 : 0) - (have >= need ? 10 : 0);
    if (score > bestScore) { bestScore = score; bestColor = c; }
  }

  return { cardId: wild.id, newColor: bestColor };
}

// Returns card IDs the bot should discard to reach MAX_HAND_SIZE.
export function getBotDiscards(state, botId) {
  const bot = state.players[botId];
  const excess = bot.hand.length - MAX_HAND_SIZE;
  if (excess <= 0) return [];

  // Discard lowest-value cards first
  const sorted = [...bot.hand].sort((a, b) => {
    const va = a.value ?? a.bankValue ?? 0;
    const vb = b.value ?? b.bankValue ?? 0;
    return va - vb;
  });

  return sorted.slice(0, excess).map(c => c.id);
}

// ── Decision helpers ─────────────────────────────────────────────────────────

function pickWildcardColor(card, bot) {
  if (card.colors.length === 1) return card.colors[0];

  let best = null;
  let bestScore = -1;

  for (const color of card.colors) {
    const group = bot.properties[color];
    const have  = group ? group.cards.length : 0;
    const need  = SET_SIZE[color] ?? 3;
    // Higher score = closer to completing this color's set
    const score = have / need + (have > 0 ? 0.1 : 0);
    if (score > bestScore) { bestScore = score; best = color; }
  }

  return best ?? card.colors[0];
}

function findDealBreakerTarget(state, botId) {
  // Prefer complete sets with the highest full-set rent (most threatening)
  let best = null;
  let bestRent = -1;

  for (const opId of state.playerOrder) {
    if (opId === botId) continue;
    const op = state.players[opId];
    for (const [color, group] of Object.entries(op.properties)) {
      if (group.cards.length < SET_SIZE[color]) continue;
      const rentTable = RENT_VALUES[color];
      const rent = rentTable[rentTable.length - 1] ?? 0;
      if (rent > bestRent) { bestRent = rent; best = { targetPlayerId: opId, targetColor: color }; }
    }
  }

  return best;
}

function buildRentOptions(state, botId, rentCard, hand) {
  const bot = state.players[botId];
  let bestColor = null;
  let bestRent  = 0;

  for (const color of rentCard.colors) {
    const group = bot.properties[color];
    if (!group || group.cards.length === 0) continue;
    const rent = computeRent(color, group);
    if (rent > bestRent) { bestRent = rent; bestColor = color; }
  }

  if (!bestColor || bestRent === 0) return null;

  const opts = { rentColor: bestColor };

  // Charging someone who has nothing to pay with wastes the card and an action.
  let targetAssets;
  if (rentCard.allPlayers) {
    if (!anyOpponentCanPay(state, botId)) return null;
    targetAssets = Math.max(...state.playerOrder
      .filter(id => id !== botId)
      .map(id => payableAssets(state.players[id])));
  } else {
    const target = richestOpponent(state, botId);
    if (!target) return null;
    opts.targetPlayerId = target;
    targetAssets = payableAssets(state.players[target]);
  }

  // Use Double the Rent if available and there's enough actions remaining —
  // but only when the target can cover more than the undoubled rent.
  const actionsLeft = ACTIONS_PER_TURN - state.actionsUsed;
  if (actionsLeft >= 2 && targetAssets > bestRent) {
    const dtr = hand.find(c => c.action === 'doubleRent');
    if (dtr && bestRent >= 2) opts.doubleRent = true;
  }

  return opts;
}

// A rent card is worth holding if the bot owns property in one of its colors.
function rentCardIsUsableLater(rentCard, bot) {
  return (rentCard.colors ?? []).some(color => (bot.properties[color]?.cards.length ?? 0) > 0);
}

function findSlyDealTarget(state, botId) {
  const bot = state.players[botId];

  // First choice: steal a property in a color we already have (build toward a set)
  for (const opId of state.playerOrder) {
    if (opId === botId) continue;
    const op = state.players[opId];
    for (const [color, group] of Object.entries(op.properties)) {
      if (group.cards.length >= SET_SIZE[color]) continue; // Can't steal from complete sets
      if (bot.properties[color]?.cards.length > 0) {
        return { targetPlayerId: opId, targetCardId: group.cards[0].id };
      }
    }
  }

  // Fallback: steal the highest-value available property from any opponent
  let best = null;
  let bestVal = -1;

  for (const opId of state.playerOrder) {
    if (opId === botId) continue;
    const op = state.players[opId];
    for (const [color, group] of Object.entries(op.properties)) {
      if (group.cards.length >= SET_SIZE[color]) continue;
      for (const card of group.cards) {
        const val = card.value ?? 0;
        if (val > bestVal) { bestVal = val; best = { targetPlayerId: opId, targetCardId: card.id }; }
      }
    }
  }

  return best;
}

// Everything a player could hand over if they were charged: banked money plus
// anything on their board. A player with none of it cannot pay at all.
function payableAssets(player) {
  const bank = player.bank.reduce((sum, c) => sum + (c.value ?? c.bankValue ?? 0), 0);
  const board = Object.values(player.properties).reduce((sum, group) =>
    sum + group.cards.reduce((s, c) => s + (c.value ?? 0), 0)
      + (group.hasHouse ? (group.houseCard?.value ?? group.houseCard?.bankValue ?? 0) : 0)
      + (group.hasHotel ? (group.hotelCard?.value ?? group.hotelCard?.bankValue ?? 0) : 0), 0);
  return bank + board;
}

// The opponent with the most to lose, ignoring anyone who has nothing at all —
// charging a player with an empty bank and an empty board just burns the card.
function richestOpponent(state, botId) {
  let richestId = null;
  let maxVal    = 0;

  for (const opId of state.playerOrder) {
    if (opId === botId) continue;
    const val = payableAssets(state.players[opId]);
    if (val > maxVal) { maxVal = val; richestId = opId; }
  }

  return richestId;
}

// True when at least one opponent could actually pay something.
function anyOpponentCanPay(state, botId) {
  return state.playerOrder.some(id => id !== botId && payableAssets(state.players[id]) > 0);
}

function colorForHouse(state, botId) {
  const bot = state.players[botId];
  for (const [color, group] of Object.entries(bot.properties)) {
    if (
      color !== COLOR.RAILROAD && color !== COLOR.UTILITY &&
      group.cards.length >= SET_SIZE[color] && !group.hasHouse
    ) return color;
  }
  return null;
}

function colorForHotel(state, botId) {
  const bot = state.players[botId];
  for (const [color, group] of Object.entries(bot.properties)) {
    if (
      color !== COLOR.RAILROAD && color !== COLOR.UTILITY &&
      group.cards.length >= SET_SIZE[color] && group.hasHouse && !group.hasHotel
    ) return color;
  }
  return null;
}

function computeRent(color, group) {
  const rentTable = RENT_VALUES[color];
  const base = rentTable[Math.min(group.cards.length, rentTable.length) - 1] ?? 0;
  const bonus =
    (group.hasHotel ? BUILDING_BONUS.house + BUILDING_BONUS.hotel : 0) +
    (group.hasHouse && !group.hasHotel ? BUILDING_BONUS.house : 0);
  return base + bonus;
}
