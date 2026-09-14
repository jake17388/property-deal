import { CARD_TYPE, COLOR, SET_SIZE, RENT_VALUES, BUILDING_BONUS, getCardColor } from './cards.js';
import { ACTIONS_PER_TURN, MAX_HAND_SIZE, SETS_TO_WIN, selectAutoPayment } from './engine.js';

export const BOT_NAMES = ['Elon', 'Jeff', 'Warren', 'Bill'];

// A colour takes another card when its set is short, or when a wildcard in it
// can be moved on to make room.
function hasRoomFor(player, color) {
  const group = player.properties[color];
  if (!group) return true;
  if (group.cards.length < (SET_SIZE[color] ?? 0)) return true;
  return group.cards.some(c => c.type === CARD_TYPE.WILDCARD);
}

// Returns the next card play for the bot, or null to signal end-of-turn.
export function getBotMove(state, botId) {
  const bot = state.players[botId];
  if (!bot) return null;
  if (state.actionsUsed >= ACTIONS_PER_TURN) return null;

  const hand = bot.hand;
  const opponents = state.playerOrder.filter(id => id !== botId);

  // 1. Standard property cards — play them, unless that colour is already a
  // complete set with no wildcard to shuffle out, which the engine rejects.
  const propCard = hand.find(c =>
    c.type === CARD_TYPE.PROPERTY && hasRoomFor(bot, c.color));
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
export function getBotResponse(state, botId) {
  const pending = state.pendingAction;
  if (!pending) return { response: 'accept', options: {} };

  const jsn = state.players[botId]?.hand.find(c => c.action === 'justSayNo');

  // A Just Say No is already on the table: the bot either counters it with one
  // of its own or lets it stand.
  if (pending.justSayNoBy) {
    if (jsn && worthSayingNo(state, botId, pending, { countering: true })) {
      return { response: 'justSayNo', options: { cardId: jsn.id } };
    }
    return { response: 'acceptJustSayNo', options: {} };
  }

  if (jsn && worthSayingNo(state, botId, pending, { countering: false })) {
    return { response: 'justSayNo', options: { cardId: jsn.id } };
  }

  // Otherwise accept and let the engine auto-select which cards to pay with.
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

// ── Just Say No ──────────────────────────────────────────────────────────────
// There are only three Just Say No cards in the whole deck, so the one spent on
// a $2M birthday is the one missing when a Deal Breaker takes a finished set.
// The bot therefore prices every action aimed at it — what it stands to lose,
// or, when it is the one being said no to, what it stands to miss out on — and
// only answers when that price clears the bar.

// What an action has to be worth before a Just Say No is spent on it: a shade
// more than a Debt Collector's $5M settled out of the bank.
const JSN_BAR = 7;

// Cash is worth less than board space — money comes round again, a property out
// of a set you are two thirds of the way through does not.
const MONEY_WEIGHT = 0.75;

// A complete set is a third of the game, worth far more than the cards in it.
const SET_PREMIUM = 10;

function worthSayingNo(state, botId, pending, { countering }) {
  const initiatorId = pending.toId ?? pending.initiatorId;

  // Countering as the initiator pushes the bot's own action back through, so
  // what is at stake there is the prize; as a target, it is the damage.
  const stake = botId === initiatorId
    ? prizeAtStake(state, botId, pending)
    : costOfBeingHit(state, botId, pending);

  if (stake === Infinity) return true; // the game itself is on this card

  // A spare card in hand buys a freer trigger finger; a counter spends a second
  // card on a fight already half lost, so it has to be worth more.
  const spare = state.players[botId].hand.filter(c => c.action === 'justSayNo').length > 1;
  const bar   = JSN_BAR - (spare ? 2 : 0) + (countering ? 3 : 0);

  return stake >= bar;
}

// What letting this action resolve would cost the bot it is aimed at.
function costOfBeingHit(state, botId, pending) {
  const bot         = state.players[botId];
  const initiatorId = pending.toId ?? pending.initiatorId;

  switch (pending.type) {
    case 'dealBreaker': {
      const group = bot.properties[pending.targetColor];
      if (!group) return 0;
      if (wouldWin(state, initiatorId, group.cards)) return Infinity;
      return setValue(bot, pending.targetColor);
    }

    case 'slyDeal':
      return stolenCardCost(state, bot, initiatorId, pending.targetCardId);

    case 'forceDeal': {
      // A swap hands something back, which is worth having when it lands in a
      // colour the bot is building.
      const offered = findBoardCard(state.players[initiatorId], pending.offeredCardId)?.card;
      return stolenCardCost(state, bot, initiatorId, pending.targetCardId) - incomingValue(bot, offered);
    }

    case 'payment':
    case 'rentPayment':
    case 'birthdayPayment': {
      const { cost, propertyCards } = paymentPreview(bot, pending.amount);
      if (propertyCards.length > 0 && wouldWin(state, initiatorId, propertyCards)) return Infinity;
      return cost;
    }

    default:
      return 0;
  }
}

// What the bot gives up by letting someone else's Just Say No stand on an
// action of its own.
function prizeAtStake(state, botId, pending) {
  const bot    = state.players[botId];
  const victim = state.players[pending.fromId ?? pending.targetId];

  switch (pending.type) {
    case 'dealBreaker': {
      const group = victim?.properties[pending.targetColor];
      if (!group) return 0;
      if (wouldWin(state, botId, group.cards)) return Infinity;
      return setValue(victim, pending.targetColor);
    }

    case 'slyDeal':
    case 'forceDeal': {
      const card = findBoardCard(victim, pending.targetCardId)?.card;
      if (!card) return 0;
      if (wouldWin(state, botId, [card])) return Infinity;
      const given = pending.type === 'forceDeal' ? propertyLossCost(bot, pending.offeredCardId) : 0;
      return incomingValue(bot, card) - given;
    }

    case 'payment':
      return MONEY_WEIGHT * (pending.amount ?? 0);

    // Countering here puts every payer still on the hook back on it.
    case 'rentPayment':
    case 'birthdayPayment':
      return MONEY_WEIGHT * (pending.amount ?? 0) * (pending.remaining?.length ?? 1);

    default:
      return 0;
  }
}

// Where a card sits on a player's board.
function findBoardCard(player, cardId) {
  for (const [color, group] of Object.entries(player?.properties ?? {})) {
    const card = group.cards.find(c => c.id === cardId);
    if (card) return { color, group, card };
  }
  return null;
}

// What losing one property card costs: its face value, the rent it was earning,
// and how far it sets the colour back.
function propertyLossCost(player, cardId) {
  const found = findBoardCard(player, cardId);
  if (!found) return 0;
  const { color, group, card } = found;

  const have      = group.cards.length;
  const rentAfter = have > 1 ? (RENT_VALUES[color]?.[have - 2] ?? 0) : 0;

  return (card.value ?? 0) + (computeRent(color, group) - rentAfter) + setbackCost(color, have);
}

// Losing a card off a nearly-finished set of a good colour hurts far more than
// losing one off a lone cheap property, so the setback is priced in the rent the
// finished set would have printed.
function setbackCost(color, have) {
  const need = SET_SIZE[color] ?? 3;
  const full = RENT_VALUES[color]?.[need - 1] ?? 0;
  if (have >= need - 1) return full;
  if (have >= need - 2) return full / 2;
  return 0;
}

// The same pricing read forwards: what a card coming the other way is worth to
// this player, which is most when it is the one that all but finishes a set.
function incomingValue(player, card) {
  if (!card) return 0;
  const color = getCardColor(card);
  if (!color) return card.value ?? 0;
  const have = player.properties[color]?.cards.length ?? 0;
  return (card.value ?? 0) + setbackCost(color, have + 1);
}

// A whole set: the cards, its buildings, the rent it prints, and the premium for
// being one of the three that win the game.
function setValue(player, color) {
  const group = player.properties[color];
  if (!group) return 0;
  const cards     = group.cards.reduce((sum, c) => sum + (c.value ?? 0), 0);
  const buildings = (group.hasHouse ? BUILDING_BONUS.house : 0) + (group.hasHotel ? BUILDING_BONUS.hotel : 0);
  return cards + buildings + computeRent(color, group) + SET_PREMIUM;
}

// A theft costs what the card was worth here, plus a share of what it is worth
// to the player walking off with it.
function stolenCardCost(state, bot, thiefId, cardId) {
  const found = findBoardCard(bot, cardId);
  if (!found) return 0;
  if (wouldWin(state, thiefId, [found.card])) return Infinity;
  return propertyLossCost(bot, cardId) + incomingValue(state.players[thiefId], found.card) / 2;
}

// What settling a demand would actually take out of the bot. The engine chooses
// the cards when a bot accepts, so this asks it rather than guessing. Several
// cards off one colour each carry that colour's setback, which overstates the
// damage a little — and only in the case where the bot is being stripped to the
// board, which is exactly when saying no is worth it.
function paymentPreview(player, amount) {
  const paying = new Set(selectAutoPayment(player, amount ?? 0));
  if (paying.size === 0) return { cost: 0, propertyCards: [] };

  const propertyCards = [];
  let cost = 0;

  for (const card of player.bank) {
    if (paying.has(card.id)) cost += MONEY_WEIGHT * (card.value ?? card.bankValue ?? 0);
  }

  for (const group of Object.values(player.properties)) {
    for (const card of group.cards) {
      if (!paying.has(card.id)) continue;
      propertyCards.push(card);
      cost += propertyLossCost(player, card.id);
    }
    if (group.houseCard && paying.has(group.houseCard.id)) cost += BUILDING_BONUS.house;
    if (group.hotelCard && paying.has(group.hotelCard.id)) cost += BUILDING_BONUS.hotel;
  }

  return { cost, propertyCards };
}

// Would these cards landing on that player's board win them the game? Nothing is
// worth a Just Say No more than stopping that.
function wouldWin(state, playerId, incoming) {
  const player = state.players[playerId];
  if (!player) return false;

  const counts = {};
  for (const [color, group] of Object.entries(player.properties)) counts[color] = group.cards.length;
  for (const card of incoming) {
    const color = getCardColor(card);
    if (color) counts[color] = (counts[color] ?? 0) + 1;
  }

  const sets = Object.entries(counts).filter(([color, n]) => n >= (SET_SIZE[color] ?? 3)).length;
  return sets >= SETS_TO_WIN;
}

// ── Decision helpers ─────────────────────────────────────────────────────────

function pickWildcardColor(card, bot) {
  // A set that is already full has nowhere to put this, so it is not a choice.
  const options = card.colors.filter(color => hasRoomFor(bot, color));
  if (options.length <= 1) return options[0] ?? null;

  let best = null;
  let bestScore = -1;

  for (const color of options) {
    const group = bot.properties[color];
    const have  = group ? group.cards.length : 0;
    const need  = SET_SIZE[color] ?? 3;
    // Higher score = closer to completing this color's set
    const score = have / need + (have > 0 ? 0.1 : 0);
    if (score > bestScore) { bestScore = score; best = color; }
  }

  return best ?? options[0];
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
