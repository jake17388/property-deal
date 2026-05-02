// ============================================================
// PROPERTY DEAL — Complete Card Definitions
// 106 playable cards (excludes 4 Quick Start Rule cards)
// ============================================================

// Color constants — used throughout the game engine
export const COLOR = {
  BROWN:      'brown',
  LIGHT_BLUE: 'lightBlue',
  PINK:       'pink',
  ORANGE:     'orange',
  RED:        'red',
  YELLOW:     'yellow',
  GREEN:      'green',
  DARK_BLUE:  'darkBlue',
  RAILROAD:   'railroad',
  UTILITY:    'utility',
};

// How many cards are needed to complete each color set
export const SET_SIZE = {
  [COLOR.BROWN]:      2,
  [COLOR.LIGHT_BLUE]: 3,
  [COLOR.PINK]:       3,
  [COLOR.ORANGE]:     3,
  [COLOR.RED]:        3,
  [COLOR.YELLOW]:     3,
  [COLOR.GREEN]:      3,
  [COLOR.DARK_BLUE]:  2,
  [COLOR.RAILROAD]:   4,
  [COLOR.UTILITY]:    2,
};

// Rent chart: index = number of cards in set (1, 2, 3, 4)
export const RENT_VALUES = {
  [COLOR.BROWN]:      [1, 2],
  [COLOR.LIGHT_BLUE]: [1, 2, 3],
  [COLOR.PINK]:       [1, 2, 4],
  [COLOR.ORANGE]:     [1, 3, 5],
  [COLOR.RED]:        [2, 3, 6],
  [COLOR.YELLOW]:     [2, 4, 6],
  [COLOR.GREEN]:      [2, 4, 7],
  [COLOR.DARK_BLUE]:  [3, 8],
  [COLOR.RAILROAD]:   [1, 2, 3, 4],
  [COLOR.UTILITY]:    [1, 2],
};

// House/Hotel rent bonuses (added on top of full-set rent)
export const BUILDING_BONUS = {
  house: 3,
  hotel: 4,
};

// Card type constants
export const CARD_TYPE = {
  MONEY:    'money',
  ACTION:   'action',
  RENT:     'rent',
  PROPERTY: 'property',
  WILDCARD: 'wildcard',
};

// ============================================================
// MONEY CARDS — 20 total
// ============================================================
const moneyCards = [
  ...Array(6).fill(null).map((_, i) => ({ id: `money_1_${i}`,  type: CARD_TYPE.MONEY, value: 1  })),
  ...Array(5).fill(null).map((_, i) => ({ id: `money_2_${i}`,  type: CARD_TYPE.MONEY, value: 2  })),
  ...Array(3).fill(null).map((_, i) => ({ id: `money_3_${i}`,  type: CARD_TYPE.MONEY, value: 3  })),
  ...Array(3).fill(null).map((_, i) => ({ id: `money_4_${i}`,  type: CARD_TYPE.MONEY, value: 4  })),
  ...Array(2).fill(null).map((_, i) => ({ id: `money_5_${i}`,  type: CARD_TYPE.MONEY, value: 5  })),
  ...Array(1).fill(null).map((_, i) => ({ id: `money_10_${i}`, type: CARD_TYPE.MONEY, value: 10 })),
];

// ============================================================
// ACTION CARDS — 34 total
// All action cards have a bankValue (can be banked instead of played)
// ============================================================
const actionCards = [
  // Pass Go ×10 — draw 2 extra cards
  ...Array(10).fill(null).map((_, i) => ({
    id: `passgo_${i}`,
    type: CARD_TYPE.ACTION,
    action: 'passGo',
    name: 'Pass Go',
    description: 'Draw 2 extra cards from the deck.',
    bankValue: 1,
  })),

  // Deal Breaker ×2 — steal a complete set
  ...Array(2).fill(null).map((_, i) => ({
    id: `dealbreaker_${i}`,
    type: CARD_TYPE.ACTION,
    action: 'dealBreaker',
    name: 'Deal Breaker',
    description: 'Steal a complete property set from any player.',
    bankValue: 5,
  })),

  // Just Say No ×3 — cancel any action targeting you
  ...Array(3).fill(null).map((_, i) => ({
    id: `justsayno_${i}`,
    type: CARD_TYPE.ACTION,
    action: 'justSayNo',
    name: 'Just Say No',
    description: 'Cancel any action card played against you.',
    bankValue: 4,
  })),

  // Sly Deal ×3 — steal 1 property (not from a complete set)
  ...Array(3).fill(null).map((_, i) => ({
    id: `slydeal_${i}`,
    type: CARD_TYPE.ACTION,
    action: 'slyDeal',
    name: 'Sly Deal',
    description: 'Steal one property card (not from a complete set).',
    bankValue: 3,
  })),

  // Force Deal ×4 — swap one of your properties with one of theirs
  ...Array(4).fill(null).map((_, i) => ({
    id: `forcedeal_${i}`,
    type: CARD_TYPE.ACTION,
    action: 'forceDeal',
    name: 'Force Deal',
    description: 'Swap any one of your properties with any one of an opponent\'s (not from a complete set).',
    bankValue: 3,
  })),

  // Debt Collector ×3 — demand $5M from one player
  ...Array(3).fill(null).map((_, i) => ({
    id: `debtcollector_${i}`,
    type: CARD_TYPE.ACTION,
    action: 'debtCollector',
    name: 'Debt Collector',
    description: 'Demand $5M from one player of your choice.',
    bankValue: 3,
  })),

  // It's My Birthday ×3 — all players pay you $2M
  ...Array(3).fill(null).map((_, i) => ({
    id: `birthday_${i}`,
    type: CARD_TYPE.ACTION,
    action: 'birthday',
    name: "It's My Birthday",
    description: 'Every other player must pay you $2M.',
    bankValue: 2,
  })),

  // House ×3 — add to a complete set to boost rent
  ...Array(3).fill(null).map((_, i) => ({
    id: `house_${i}`,
    type: CARD_TYPE.ACTION,
    action: 'house',
    name: 'House',
    description: 'Add to a complete property set to increase rent by $3M.',
    bankValue: 3,
  })),

  // Hotel ×3 — add to a complete set that already has a house
  ...Array(3).fill(null).map((_, i) => ({
    id: `hotel_${i}`,
    type: CARD_TYPE.ACTION,
    action: 'hotel',
    name: 'Hotel',
    description: 'Add to a complete set (with a house) to increase rent by a further $4M.',
    bankValue: 4,
  })),

  // Double the Rent ×2 — doubles rent when played with a rent card
  ...Array(2).fill(null).map((_, i) => ({
    id: `doublerent_${i}`,
    type: CARD_TYPE.ACTION,
    action: 'doubleRent',
    name: 'Double the Rent',
    description: 'Play with a rent card to double the rent owed. Costs 2 actions total.',
    bankValue: 1,
  })),
];

// ============================================================
// RENT CARDS — 13 total
// colors: which color groups this card can charge rent for
// allPlayers: true = everyone pays, false = one target only
// ============================================================
const rentCards = [
  // Wild Rent ×3 — any color, one player
  ...Array(3).fill(null).map((_, i) => ({
    id: `rent_wild_${i}`,
    type: CARD_TYPE.RENT,
    name: 'Wild Rent',
    colors: Object.values(COLOR),
    allPlayers: false,
    bankValue: 3,
  })),

  // Color-pair rent cards ×2 each — all players pay
  ...Array(2).fill(null).map((_, i) => ({
    id: `rent_brown_lblue_${i}`,
    type: CARD_TYPE.RENT,
    name: 'Brown & Light Blue Rent',
    colors: [COLOR.BROWN, COLOR.LIGHT_BLUE],
    allPlayers: true,
    bankValue: 1,
  })),
  ...Array(2).fill(null).map((_, i) => ({
    id: `rent_pink_orange_${i}`,
    type: CARD_TYPE.RENT,
    name: 'Pink & Orange Rent',
    colors: [COLOR.PINK, COLOR.ORANGE],
    allPlayers: true,
    bankValue: 1,
  })),
  ...Array(2).fill(null).map((_, i) => ({
    id: `rent_red_yellow_${i}`,
    type: CARD_TYPE.RENT,
    name: 'Red & Yellow Rent',
    colors: [COLOR.RED, COLOR.YELLOW],
    allPlayers: true,
    bankValue: 1,
  })),
  ...Array(2).fill(null).map((_, i) => ({
    id: `rent_green_dblue_${i}`,
    type: CARD_TYPE.RENT,
    name: 'Green & Dark Blue Rent',
    colors: [COLOR.GREEN, COLOR.DARK_BLUE],
    allPlayers: true,
    bankValue: 1,
  })),
  ...Array(2).fill(null).map((_, i) => ({
    id: `rent_railroad_utility_${i}`,
    type: CARD_TYPE.RENT,
    name: 'Railroad & Utility Rent',
    colors: [COLOR.RAILROAD, COLOR.UTILITY],
    allPlayers: true,
    bankValue: 1,
  })),
];

// ============================================================
// PROPERTY CARDS — 28 standard + 11 wildcards = 39 total
// ============================================================
const propertyCards = [
  // Brown ×2
  { id: 'prop_mediterranean', type: CARD_TYPE.PROPERTY, color: COLOR.BROWN,      name: 'Mediterranean Ave', value: 1 },
  { id: 'prop_baltic',        type: CARD_TYPE.PROPERTY, color: COLOR.BROWN,      name: 'Baltic Ave',        value: 1 },

  // Light Blue ×3
  { id: 'prop_oriental',      type: CARD_TYPE.PROPERTY, color: COLOR.LIGHT_BLUE, name: 'Oriental Ave',      value: 1 },
  { id: 'prop_vermont',       type: CARD_TYPE.PROPERTY, color: COLOR.LIGHT_BLUE, name: 'Vermont Ave',       value: 1 },
  { id: 'prop_connecticut',   type: CARD_TYPE.PROPERTY, color: COLOR.LIGHT_BLUE, name: 'Connecticut Ave',   value: 1 },

  // Pink ×3
  { id: 'prop_stcharles',     type: CARD_TYPE.PROPERTY, color: COLOR.PINK,       name: 'St. Charles Place', value: 2 },
  { id: 'prop_states',        type: CARD_TYPE.PROPERTY, color: COLOR.PINK,       name: 'States Ave',        value: 2 },
  { id: 'prop_virginia',      type: CARD_TYPE.PROPERTY, color: COLOR.PINK,       name: 'Virginia Ave',      value: 2 },

  // Orange ×3
  { id: 'prop_stjames',       type: CARD_TYPE.PROPERTY, color: COLOR.ORANGE,     name: 'St. James Place',   value: 2 },
  { id: 'prop_tennessee',     type: CARD_TYPE.PROPERTY, color: COLOR.ORANGE,     name: 'Tennessee Ave',     value: 2 },
  { id: 'prop_newyork',       type: CARD_TYPE.PROPERTY, color: COLOR.ORANGE,     name: 'New York Ave',      value: 2 },

  // Red ×3
  { id: 'prop_kentucky',      type: CARD_TYPE.PROPERTY, color: COLOR.RED,        name: 'Kentucky Ave',      value: 3 },
  { id: 'prop_indiana',       type: CARD_TYPE.PROPERTY, color: COLOR.RED,        name: 'Indiana Ave',       value: 3 },
  { id: 'prop_illinois',      type: CARD_TYPE.PROPERTY, color: COLOR.RED,        name: 'Illinois Ave',      value: 3 },

  // Yellow ×3
  { id: 'prop_atlantic',      type: CARD_TYPE.PROPERTY, color: COLOR.YELLOW,     name: 'Atlantic Ave',      value: 3 },
  { id: 'prop_ventnor',       type: CARD_TYPE.PROPERTY, color: COLOR.YELLOW,     name: 'Ventnor Ave',       value: 3 },
  { id: 'prop_marvin',        type: CARD_TYPE.PROPERTY, color: COLOR.YELLOW,     name: 'Marvin Gardens',    value: 3 },

  // Green ×3
  { id: 'prop_pacific',       type: CARD_TYPE.PROPERTY, color: COLOR.GREEN,      name: 'Pacific Ave',       value: 4 },
  { id: 'prop_northcarolina', type: CARD_TYPE.PROPERTY, color: COLOR.GREEN,      name: 'North Carolina Ave',value: 4 },
  { id: 'prop_pennsylvania',  type: CARD_TYPE.PROPERTY, color: COLOR.GREEN,      name: 'Pennsylvania Ave',  value: 4 },

  // Dark Blue ×2
  { id: 'prop_parkplace',     type: CARD_TYPE.PROPERTY, color: COLOR.DARK_BLUE,  name: 'Park Place',        value: 4 },
  { id: 'prop_boardwalk',     type: CARD_TYPE.PROPERTY, color: COLOR.DARK_BLUE,  name: 'Boardwalk',         value: 4 },

  // Railroads ×4
  { id: 'prop_reading',       type: CARD_TYPE.PROPERTY, color: COLOR.RAILROAD,   name: 'Reading Railroad',  value: 2 },
  { id: 'prop_penn_rr',       type: CARD_TYPE.PROPERTY, color: COLOR.RAILROAD,   name: 'Pennsylvania Railroad', value: 2 },
  { id: 'prop_bo',            type: CARD_TYPE.PROPERTY, color: COLOR.RAILROAD,   name: 'B&O Railroad',      value: 2 },
  { id: 'prop_shortline',     type: CARD_TYPE.PROPERTY, color: COLOR.RAILROAD,   name: 'Short Line Railroad',value: 2 },

  // Utilities ×2
  { id: 'prop_electric',      type: CARD_TYPE.PROPERTY, color: COLOR.UTILITY,    name: 'Electric Company',  value: 2 },
  { id: 'prop_waterworks',    type: CARD_TYPE.PROPERTY, color: COLOR.UTILITY,    name: 'Water Works',       value: 2 },
];

// ============================================================
// WILDCARD PROPERTIES — 11 total
// colors: the two groups this card can belong to
// canPayDebt: all-color wilds cannot be used to pay debts
// ============================================================
const wildcardCards = [
  // Two-color wildcards
  ...Array(2).fill(null).map((_, i) => ({
    id: `wild_pink_orange_${i}`,
    type: CARD_TYPE.WILDCARD,
    name: 'Pink/Orange Wild',
    colors: [COLOR.PINK, COLOR.ORANGE],
    currentColor: COLOR.PINK,
    value: 2,
    canPayDebt: true,
  })),
  {
    id: 'wild_lblue_brown',
    type: CARD_TYPE.WILDCARD,
    name: 'Light Blue/Brown Wild',
    colors: [COLOR.LIGHT_BLUE, COLOR.BROWN],
    currentColor: COLOR.LIGHT_BLUE,
    value: 1,
    canPayDebt: true,
  },
  {
    id: 'wild_lblue_railroad',
    type: CARD_TYPE.WILDCARD,
    name: 'Light Blue/Railroad Wild',
    colors: [COLOR.LIGHT_BLUE, COLOR.RAILROAD],
    currentColor: COLOR.LIGHT_BLUE,
    value: 4,
    canPayDebt: true,
  },
  {
    id: 'wild_green_dblue',
    type: CARD_TYPE.WILDCARD,
    name: 'Green/Dark Blue Wild',
    colors: [COLOR.GREEN, COLOR.DARK_BLUE],
    currentColor: COLOR.GREEN,
    value: 4,
    canPayDebt: true,
  },
  {
    id: 'wild_green_railroad',
    type: CARD_TYPE.WILDCARD,
    name: 'Green/Railroad Wild',
    colors: [COLOR.GREEN, COLOR.RAILROAD],
    currentColor: COLOR.GREEN,
    value: 4,
    canPayDebt: true,
  },
  {
    id: 'wild_utility_railroad',
    type: CARD_TYPE.WILDCARD,
    name: 'Utility/Railroad Wild',
    colors: [COLOR.UTILITY, COLOR.RAILROAD],
    currentColor: COLOR.UTILITY,
    value: 2,
    canPayDebt: true,
  },
  {
    id: 'wild_red_yellow',
    type: CARD_TYPE.WILDCARD,
    name: 'Red/Yellow Wild',
    colors: [COLOR.RED, COLOR.YELLOW],
    currentColor: COLOR.RED,
    value: 3,
    canPayDebt: true,
  },

  // All-color wildcards ×2 — no monetary value, cannot pay debts
  ...Array(2).fill(null).map((_, i) => ({
    id: `wild_allcolor_${i}`,
    type: CARD_TYPE.WILDCARD,
    name: 'All-Color Wild',
    colors: Object.values(COLOR),
    currentColor: null,
    value: 0,
    canPayDebt: false,
  })),
];

// ============================================================
// FULL DECK — 106 cards
// ============================================================
export const FULL_DECK = [
  ...moneyCards,
  ...actionCards,
  ...rentCards,
  ...propertyCards,
  ...wildcardCards,
];

// Shuffle utility using Fisher-Yates algorithm
export function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Helper: get the effective color of any property or wildcard
export function getCardColor(card) {
  return card.currentColor ?? card.color ?? null;
}