// ============================================================
// PROPERTY DEAL — drag-and-drop rules
//
// One place that answers two questions for every drop zone on the board:
// may this card be dropped here, and what would that do? The board uses the
// answers to light up the zones that will accept the card under your finger,
// and GameBoard uses them again on release to decide what to play.
//
// The rules deliberately mirror the engine's own checks: a drop that the
// engine would reject never becomes a legal-looking target.
// ============================================================

import { BUILDING_BONUS, CARD_TYPE, RENT_VALUES, SET_SIZE } from './cards.js';

// Railroad and Utility sets can't take buildings.
const NO_BUILDINGS = new Set(['railroad', 'utility']);

export function isPropertyCard(card) {
  return card.type === CARD_TYPE.PROPERTY || card.type === CARD_TYPE.WILDCARD;
}

// The colours a property or wildcard can be placed in.
export function placementColors(card) {
  if (card.type === CARD_TYPE.WILDCARD) return card.colors ?? [];
  if (card.type === CARD_TYPE.PROPERTY) return [card.color];
  return [];
}

export function isSetComplete(color, group) {
  return (group?.cards?.length ?? 0) >= (SET_SIZE[color] ?? 99);
}

// A property can join a group that still has room, or a full one that holds a
// wildcard — the engine then asks for that wildcard to be moved out.
export function hasRoomFor(color, group) {
  if (!group) return true;
  if (group.cards.length < (SET_SIZE[color] ?? 99)) return true;
  return group.cards.some(c => c.type === CARD_TYPE.WILDCARD);
}

// Mirrors calculateRent() in the engine so the rent popup shows real numbers.
export function rentFor(color, group) {
  if (!group || group.cards.length === 0) return 0;
  const table = RENT_VALUES[color] ?? [];
  const base  = table[Math.min(group.cards.length, table.length) - 1] ?? 0;
  const bonus = group.hasHotel
    ? BUILDING_BONUS.house + BUILDING_BONUS.hotel
    : group.hasHouse ? BUILDING_BONUS.house : 0;
  return base + bonus;
}

// Colours this rent card could charge, given what you actually own.
export function chargeableColors(card, properties) {
  return (card.colors ?? []).filter(c => (properties[c]?.cards?.length ?? 0) > 0);
}

export function houseColors(properties) {
  return Object.entries(properties)
    .filter(([c, g]) => !NO_BUILDINGS.has(c) && isSetComplete(c, g) && !g.hasHouse)
    .map(([c]) => c);
}

export function hotelColors(properties) {
  return Object.entries(properties)
    .filter(([c, g]) => !NO_BUILDINGS.has(c) && g.hasHouse && !g.hasHotel)
    .map(([c]) => c);
}

export function completeColors(properties) {
  return Object.entries(properties ?? {})
    .filter(([c, g]) => isSetComplete(c, g))
    .map(([c]) => c);
}

export function bankValueOf(card) {
  return card.value ?? card.bankValue ?? 0;
}

// ── Moving a wildcard already on your board ───────────────────

function canDropMove(card, spec, ctx, source) {
  if (!ctx.canMove) return false;
  if (card.type !== CARD_TYPE.WILDCARD) return false;
  const others = (card.colors ?? []).filter(c => c !== source.color);
  if (spec.kind === 'mySet') {
    return spec.color !== source.color &&
      others.includes(spec.color) &&
      !isSetComplete(spec.color, ctx.myProperties[spec.color]);
  }
  // Dropping it on open board space asks which group it should join.
  if (spec.kind === 'myBoard') {
    return others.some(c => !isSetComplete(c, ctx.myProperties[c]));
  }
  return false;
}

// ── May this card be dropped here? ────────────────────────────
//
// ctx: { canPlay, canMove, myProperties, myPropertyCount }
// spec: the zone — { kind, playerId, color?, cardId?, complete?, completeCount? }
// source: where the card is being dragged from — { from: 'hand' | 'board', color? }

export function canDrop(card, spec, ctx, source) {
  if (!card || !spec) return false;
  if (source?.from === 'board') return canDropMove(card, spec, ctx, source);
  if (!ctx.canPlay) return false;

  const props = ctx.myProperties;

  switch (spec.kind) {
    case 'bank':
      // The engine refuses to bank properties and wildcards alike.
      return !isPropertyCard(card);

    case 'mySet': {
      const group = props[spec.color];
      if (isPropertyCard(card)) {
        return placementColors(card).includes(spec.color) && hasRoomFor(spec.color, group);
      }
      if (card.action === 'house') return houseColors(props).includes(spec.color);
      if (card.action === 'hotel') return hotelColors(props).includes(spec.color);
      if (card.type === CARD_TYPE.RENT) {
        return (card.colors ?? []).includes(spec.color) && (group?.cards?.length ?? 0) > 0;
      }
      return false;
    }

    case 'myBoard':
      if (card.type === CARD_TYPE.MONEY) return true;
      if (card.type === CARD_TYPE.PROPERTY) return hasRoomFor(card.color, props[card.color]);
      if (card.type === CARD_TYPE.WILDCARD) {
        return placementColors(card).some(c => hasRoomFor(c, props[c]));
      }
      if (card.type === CARD_TYPE.RENT) return true;   // the popup handles colour vs bank
      switch (card.action) {
        case 'passGo':
        case 'birthday':        return true;
        case 'debtCollector':   return ctx.opponentCount > 0;
        case 'house':           return houseColors(props).length > 0;
        case 'hotel':           return hotelColors(props).length > 0;
        default:                return false;
      }

    case 'opponent':
      if (card.type === CARD_TYPE.RENT) return chargeableColors(card, props).length > 0;
      if (card.action === 'debtCollector') return true;
      if (card.action === 'dealBreaker')   return (spec.completeCount ?? 0) > 0;
      return false;

    case 'oppCard':
      if (card.action === 'slyDeal')     return !spec.complete;
      if (card.action === 'forceDeal')   return !spec.complete && ctx.myPropertyCount > 0;
      if (card.action === 'dealBreaker') return !!spec.complete;
      return false;

    case 'oppSet':
      return card.action === 'dealBreaker' && !!spec.complete;

    default:
      return false;
  }
}

// ── What would dropping it here do? (chip under the dragged card) ──

export function dropLabel(card, spec, ctx, source) {
  if (source?.from === 'board') {
    return spec.kind === 'mySet' ? `Move to ${labelOf(spec.color)}` : 'Move wildcard…';
  }

  switch (spec.kind) {
    case 'bank':
      return `Bank $${bankValueOf(card)}M`;

    case 'mySet':
      if (isPropertyCard(card))         return `Add to ${labelOf(spec.color)}`;
      if (card.action === 'house')      return `🏠 House on ${labelOf(spec.color)}`;
      if (card.action === 'hotel')      return `🏨 Hotel on ${labelOf(spec.color)}`;
      if (card.type === CARD_TYPE.RENT) return `Charge ${labelOf(spec.color)} rent`;
      return 'Play';

    case 'myBoard':
      if (card.type === CARD_TYPE.MONEY)    return `Bank $${card.value}M`;
      if (card.type === CARD_TYPE.PROPERTY) return `Play to ${labelOf(card.color)}`;
      if (card.type === CARD_TYPE.WILDCARD) return 'Pick a colour…';
      if (card.type === CARD_TYPE.RENT)     return 'Charge rent…';
      if (card.action === 'passGo')         return 'Draw 2 cards';
      if (card.action === 'birthday')       return 'Everyone pays $2M';
      if (card.action === 'debtCollector')  return 'Collect $5M…';
      if (card.action === 'house')          return '🏠 Build a house…';
      if (card.action === 'hotel')          return '🏨 Build a hotel…';
      return 'Play';

    case 'opponent':
      if (card.type === CARD_TYPE.RENT)    return 'Charge rent…';
      if (card.action === 'debtCollector') return 'Collect $5M';
      if (card.action === 'dealBreaker')   return 'Steal a set…';
      return 'Play';

    case 'oppCard':
      if (card.action === 'slyDeal')     return `Steal ${spec.cardName ?? 'it'}`;
      if (card.action === 'forceDeal')   return `Swap for ${spec.cardName ?? 'it'}`;
      if (card.action === 'dealBreaker') return `Steal the ${labelOf(spec.color)} set`;
      return 'Play';

    case 'oppSet':
      return `Steal the ${labelOf(spec.color)} set`;

    default:
      return 'Play';
  }
}

const COLOR_LABELS = {
  brown: 'Brown', lightBlue: 'Light Blue', pink: 'Pink', orange: 'Orange',
  red: 'Red', yellow: 'Yellow', green: 'Green', darkBlue: 'Dark Blue',
  railroad: 'Railroad', utility: 'Utility',
};

export function labelOf(color) {
  return COLOR_LABELS[color] ?? color;
}

// Bundles a zone description with the two predicates the drag layer needs.
// Rebuilt on every render, so the closures always see current game state.
export function dropZone(spec, ctx) {
  return {
    ...spec,
    accepts: (card, source) => canDrop(card, spec, ctx, source),
    label:   (card, source) => dropLabel(card, spec, ctx, source),
  };
}
