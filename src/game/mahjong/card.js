// ============================================================
// AMERICAN MAHJONG — "Timeless Play, Modern Spirit" win-condition card
//
// Transcribed from the printed card. On the card a colour marks a suit
// *slot*, not a specific suit: two groups printed in the same colour must be
// the same suit, two groups in different colours must be different suits.
// Slots are numbered 1..3 here (card colours black / gold / pink).
//
// `groupSets` is what the matcher reads; `display` is what the card viewer
// draws, segment by segment, in slot colours.
//
// In the PALINDROME hands the printed card mirrors a group in its own colour,
// which would ask for six copies of a tile that only exists four times. The
// mirrored half is a different suit here, so every hand is reachable without
// leaning on jokers.
// ============================================================

// ── Group builders ───────────────────────────────────────────
// Numbers
const N   = (s, lit, c = 1) => ({ t: 'n', s, lit, c });            // fixed number, suit slot s
const NV  = (s, off, c = 1) => ({ t: 'n', s, off, c });            // variable number (base + off)
const NF  = (lit, c = 1)    => ({ t: 'n', free: true, lit, c });   // fixed number, any suit
// Dragons
const D   = (s, c = 1)      => ({ t: 'd', s, c });                 // dragon belonging to suit slot s
const DL  = (lit, c = 1)    => ({ t: 'd', lit, c });               // a named dragon
const SOAP = (c = 1)        => ({ t: 'd', lit: 'soap', c });       // the "0" in year hands
// Honours
const W   = (w, c = 1)      => ({ t: 'w', w, c });                 // wind (literal, or a variable when winds:'var')
const F   = (c = 1)         => ({ t: 'f', c });                    // flower

// Display segment: text plus the suit slot whose colour it is printed in.
const seg = (text, s = 0) => ({ text, s });

// "2026" spelled out in suit slot s — the 0 is the Soap dragon.
const year2026 = s => [N(s, 2, 2), SOAP(1), N(s, 6, 1)];

// nums:  'lit'      numbers are exactly as printed
//        'consec'   printed numbers are a template; base slides (off = distance)
//        'like'     every printed number is one and the same arbitrary number
//        'likeEven' as 'like', but restricted to 2/4/6/8
//        'anyNum'   as 'like' (single arbitrary number), spelled differently on the card
// winds: 'lit'      N/E/S/W mean north/east/south/west
//        'var'      the letters are placeholders: same letter = same wind,
//                   different letters = different winds

export const CATEGORIES = [
  {
    name: 'HONOR THE LEGACY',
    subtitle: 'historic elements',
    hands: [
      {
        id: 'HL1', points: 25, note: 'any winds', nums: 'lit', winds: 'var',
        groupSets: [[D(1, 4), D(2, 4), D(3, 4), W('N', 2)]],
        display: [seg('DDDD', 1), seg('DDDD', 2), seg('DDDD', 3), seg('NN', 1)],
      },
      {
        id: 'HL2', points: 25, note: 'any winds', nums: 'lit', winds: 'var',
        groupSets: [[W('E', 3), N(2, 2, 4), N(1, 8, 4), D(3, 3)]],
        display: [seg('EEE', 1), seg('2222', 2), seg('8888', 1), seg('DDD', 3)],
      },
      {
        id: 'HL3', points: 25, note: 'any winds', nums: 'lit', winds: 'var',
        groupSets: [[D(1, 3), D(3, 3), D(2, 3), W('N', 3), W('S', 2)]],
        display: [seg('DDD', 1), seg('DDD', 3), seg('DDD', 2), seg('NNN', 1), seg('SS', 2)],
      },
      {
        id: 'HL4', points: 35, note: 'any like #', nums: 'like', winds: 'lit',
        groupSets: [[NV(2, 0, 3), NV(3, 0, 3), NV(1, 0, 3), D(1, 3), D(3, 2)]],
        display: [seg('111', 2), seg('111', 3), seg('111 DDD', 1), seg('DD', 3)],
      },
      {
        id: 'HL5', points: 35, note: 'any dragons', nums: 'lit', winds: 'lit',
        groupSets: [[W('N', 3), W('E', 3), W('W', 3), W('S', 3), D(1, 2)]],
        display: [seg('NNN EEE WWW SSS DD', 1)],
      },
      {
        id: 'HL6', points: 40, note: 'these #s only', nums: 'lit', winds: 'lit',
        groupSets: [[...year2026(1), ...year2026(3), ...year2026(2), D(1, 2)]],
        display: [seg('2026', 1), seg('2026', 3), seg('2026', 2), seg('DD', 1)],
      },
      {
        id: 'HL7', points: 45, note: 'these #s only', nums: 'lit', winds: 'lit',
        groupSets: [[F(2), N(1, 1, 3), N(1, 9, 3), N(2, 1, 3), N(2, 9, 3)]],
        display: [seg('FF 111 999', 1), seg('111 999', 2)],
      },
      {
        id: 'HL8', points: 45, note: '#s any suit, red dragons, East wind',
        nums: 'lit', winds: 'lit',
        groupSets: [[NF(1), NF(2), NF(3), NF(4), NF(5), NF(6), NF(7), NF(8), NF(9),
                     DL('red', 3), W('E', 2)]],
        display: [seg('123 456 789', 1), seg('DDD', 3), seg('EE', 1)],
      },
    ],
  },
  {
    name: 'PALINDROME',
    hands: [
      {
        id: 'PA1', points: 25, note: 'these #s only', nums: 'lit', winds: 'lit',
        groupSets: [[N(1, 2, 3), N(2, 4, 3), D(3, 2), N(3, 4, 3), N(2, 2, 3)]],
        display: [seg('222', 1), seg('444', 2), seg('DD', 3), seg('444', 3), seg('222', 2)],
      },
      {
        id: 'PA2', points: 30, note: 'any consec #s', nums: 'consec', winds: 'lit',
        groupSets: [[D(1, 2), NV(1, 0, 3), NV(2, 1, 4), NV(3, 0, 3), D(3, 2)]],
        display: [seg('DD 111', 1), seg('2222', 2), seg('111 DD', 3)],
      },
      {
        id: 'PA3', points: 30, note: 'any winds, any like #', nums: 'like', winds: 'var',
        groupSets: [[W('N', 2), NV(2, 0, 3), F(4), NV(3, 0, 3), W('N', 2)]],
        display: [seg('NN', 1), seg('111', 2), seg('FFFF', 1), seg('111', 3), seg('NN', 1)],
      },
      {
        id: 'PA4', points: 30, note: 'any consec #s', nums: 'consec', winds: 'lit',
        groupSets: [[NV(1, 0, 3), NV(1, 1, 3), NV(1, 2, 2), NV(2, 1, 3), NV(2, 0, 3)]],
        display: [seg('111 222 33', 1), seg('222 111', 2)],
      },
      {
        id: 'PA5', points: 35, note: 'any like #', nums: 'like', winds: 'lit',
        groupSets: [[F(2), D(1, 2), NV(1, 0, 3), NV(3, 0, 3), D(3, 2), F(2)]],
        display: [seg('FF DD 111', 1), seg('111 DD', 3), seg('FF', 1)],
      },
      {
        id: 'PA6', points: 40, note: 'any consec #s', nums: 'consec', winds: 'lit',
        groupSets: [[NV(1, 0, 2), NV(1, 1, 3), NV(1, 2, 4), NV(3, 1, 3), NV(2, 0, 2)]],
        display: [seg('11 222 3333', 1), seg('222', 3), seg('11', 2)],
      },
      {
        id: 'PA7', points: 40, note: 'these #s only, any dragons & winds',
        nums: 'lit', winds: 'var',
        groupSets: [[N(1, 3, 2), N(2, 5, 2), N(3, 7, 2), N(3, 5, 2), N(2, 3, 2), D(1, 2), W('N', 2)]],
        display: [seg('33', 1), seg('55', 2), seg('77', 3), seg('55', 3), seg('33', 2), seg('DD NN', 1)],
      },
      {
        id: 'PA8', points: 50, note: 'these #s only', nums: 'lit', winds: 'lit',
        groupSets: [[N(2, 3), N(2, 4), N(2, 5), N(3, 6), N(3, 7), N(3, 8), D(1, 2),
                     N(3, 8), N(3, 7), N(3, 6), N(2, 5), N(2, 4), N(2, 3)]],
        display: [seg('345', 2), seg('678', 3), seg('DD', 1), seg('876', 3), seg('543', 2)],
      },
      {
        id: 'PA9', points: 50, note: 'any #', nums: 'anyNum', winds: 'lit',
        groupSets: [[W('N'), W('E'), W('W'), W('S'), D(1, 1), NV(3, 0, 4), D(2, 1),
                     W('N'), W('E'), W('W'), W('S')]],
        display: [seg('NEWS D', 1), seg('1111', 3), seg('D', 2), seg('NEWS', 1)],
      },
    ],
  },
  {
    name: 'A LITTLE ODD',
    subtitle: 'these #s only',
    hands: [
      {
        id: 'LO1', points: 25, note: 'any winds', nums: 'lit', winds: 'var',
        groupSets: [[F(3), N(2, 3, 3), N(3, 5, 3), N(1, 7, 2), W('N', 3)]],
        display: [seg('FFF', 1), seg('333', 2), seg('555', 3), seg('77 NNN', 1)],
      },
      {
        id: 'LO2', points: 25, nums: 'lit', winds: 'lit',
        groupSets: [
          [N(1, 1, 3), N(1, 3, 3), N(1, 5, 3), N(1, 7, 3), N(1, 9, 2)],
          [N(1, 1, 3), N(1, 3, 3), N(3, 5, 3), N(3, 7, 3), N(3, 9, 2)],
        ],
        display: [seg('111 333 555 777 99', 1), seg('  or  ', 0), seg('111 333', 1), seg('555 777 99', 3)],
      },
      {
        id: 'LO3', points: 25, note: 'any winds', nums: 'lit', winds: 'var',
        groupSets: [[N(1, 3, 3), N(1, 5, 3), N(1, 7, 3), N(1, 9, 3), W('N', 2)]],
        display: [seg('333 555 777 999 NN', 1)],
      },
      {
        id: 'LO4', points: 30, nums: 'lit', winds: 'lit',
        groupSets: [[F(2), N(1, 1, 3), N(1, 3, 2), N(1, 5, 2), N(1, 7, 2), N(1, 9, 3)]],
        display: [seg('FF 111 33 55 77 999', 1)],
      },
      {
        id: 'LO5', points: 30, nums: 'lit', winds: 'lit',
        groupSets: [[N(1, 1, 4), N(1, 3, 3), N(3, 5, 4), D(3, 3)]],
        display: [seg('1111 333', 1), seg('5555 DDD', 3)],
      },
      {
        id: 'LO6', points: 35, nums: 'lit', winds: 'lit',
        groupSets: [[N(1, 1, 3), N(2, 3, 3), N(3, 5, 3), N(1, 7, 3), N(3, 9, 2)]],
        display: [seg('111', 1), seg('333', 2), seg('555', 3), seg('777', 1), seg('99', 3)],
      },
      {
        id: 'LO7', points: 35, nums: 'lit', winds: 'lit',
        groupSets: [[N(1, 7, 4), N(3, 7, 4), N(2, 7, 4), D(1, 2)]],
        display: [seg('7777', 1), seg('7777', 3), seg('7777', 2), seg('DD', 1)],
      },
    ],
  },
  {
    name: 'EVENS',
    hands: [
      {
        id: 'EV1', points: 25, note: 'these #s only', nums: 'lit', winds: 'lit',
        groupSets: [[N(2, 2, 3), N(1, 4, 3), N(3, 6, 3), D(1, 3), N(1, 8, 2)]],
        display: [seg('222', 2), seg('444', 1), seg('666', 3), seg('DDD 88', 1)],
      },
      {
        id: 'EV2', points: 25, note: 'these #s only', nums: 'lit', winds: 'lit',
        groupSets: [[F(2), N(2, 2, 3), N(3, 4, 3), N(1, 6, 3), N(1, 8, 3)]],
        display: [seg('FF', 1), seg('222', 2), seg('444', 3), seg('666 888', 1)],
      },
      {
        id: 'EV3', points: 25, note: 'these #s', nums: 'lit', winds: 'lit',
        groupSets: [
          [N(1, 2, 3), N(1, 4, 3), N(1, 6, 3), N(1, 8, 3), N(1, 2, 2)],
          [N(1, 2, 3), N(1, 4, 3), N(3, 6, 3), N(3, 8, 3), N(3, 2, 2)],
        ],
        display: [seg('222 444 666 888 22', 1), seg('  or  ', 0), seg('222 444', 1), seg('666 888 22', 3)],
      },
      {
        id: 'EV4', points: 35, note: 'these #s only', nums: 'lit', winds: 'lit',
        groupSets: [[F(4), N(1, 2, 4), N(2, 4, 4), D(2, 2)]],
        display: [seg('FFFF 2222', 1), seg('4444 DD', 2)],
      },
      {
        id: 'EV5', points: 35, note: 'this # only', nums: 'lit', winds: 'lit',
        groupSets: [[F(2), N(1, 4, 4), N(2, 4, 4), N(3, 4, 4)]],
        display: [seg('FF 4444', 1), seg('4444', 2), seg('4444', 3)],
      },
      {
        id: 'EV6', points: 40, note: 'any like even #', nums: 'likeEven', winds: 'lit',
        groupSets: [[NV(1, 0, 3), NV(2, 0, 3), NV(3, 0, 4), W('N'), W('E'), W('W'), W('S')]],
        display: [seg('222', 1), seg('222', 2), seg('2222', 3), seg('NEWS', 1)],
      },
      {
        id: 'EV7', points: 45, note: 'these #s only', nums: 'lit', winds: 'lit',
        groupSets: [[F(4), N(1, 2, 2), N(1, 4, 2), N(1, 6, 2), N(1, 8, 4)]],
        display: [seg('FFFF 22 44 66 8888', 1)],
      },
    ],
  },
  {
    name: 'PRIME NUMBERS',
    subtitle: 'these #s only',
    hands: [
      {
        id: 'PR1', points: 25, note: 'any winds', nums: 'lit', winds: 'var',
        groupSets: [[N(1, 2, 3), N(2, 3, 3), N(3, 5, 3), N(1, 7, 2), W('N', 3)]],
        display: [seg('222', 1), seg('333', 2), seg('555', 3), seg('77 NNN', 1)],
      },
      {
        id: 'PR2', points: 30, nums: 'lit', winds: 'lit',
        groupSets: [[N(1, 2, 3), N(1, 3, 3), N(1, 5, 2), N(1, 7, 2), D(3, 4)]],
        display: [seg('222 333 55 77', 1), seg('DDDD', 3)],
      },
      {
        id: 'PR3', points: 40, nums: 'lit', winds: 'lit',
        groupSets: [[N(1, 2, 3), N(2, 3, 3), N(3, 5, 3), N(1, 7, 3), N(3, 2, 2)]],
        display: [seg('222', 1), seg('333', 2), seg('555', 3), seg('777', 1), seg('22', 3)],
      },
    ],
  },
  {
    name: 'LINEAR LOGIC',
    hands: [
      {
        id: 'LL1', points: 25, note: 'any consec #s, any winds', nums: 'consec', winds: 'var',
        groupSets: [[NV(1, 0, 3), NV(2, 1, 4), NV(3, 2, 5), W('N', 2)]],
        display: [seg('111', 1), seg('2222', 2), seg('33333', 3), seg('NN', 1)],
      },
      {
        id: 'LL2', points: 30, note: 'any consec #s', nums: 'consec', winds: 'lit',
        groupSets: [[F(2), NV(1, 0, 3), NV(1, 1, 2), NV(1, 2, 4), NV(1, 3, 3)]],
        display: [seg('FF 111 22 3333 444', 1)],
      },
      {
        id: 'LL3', points: 30, note: 'any consec #s', nums: 'consec', winds: 'lit',
        groupSets: [[NV(1, 0, 3), NV(1, 1, 3), NV(1, 2, 2), NV(1, 3, 3), NV(1, 4, 3)]],
        display: [seg('111 222 33 444 555', 1)],
      },
      {
        id: 'LL4', points: 35, note: 'any consec #s', nums: 'consec', winds: 'lit',
        groupSets: [[F(2), NV(1, 0, 3), NV(3, 1, 4), NV(2, 2, 3), D(1, 2)]],
        display: [seg('FF 111', 1), seg('2222', 3), seg('333', 2), seg('DD', 1)],
      },
      {
        id: 'LL5', points: 40, note: 'any consec #s', nums: 'consec', winds: 'lit',
        groupSets: [[F(2), NV(1, 0, 2), NV(1, 1, 4), NV(1, 2, 4), NV(1, 3, 2)]],
        display: [seg('FF 11 2222 3333 44', 1)],
      },
      {
        id: 'LL6', points: 45, note: 'any consec #s', nums: 'consec', winds: 'lit',
        groupSets: [[F(1), NV(1, 0, 1), NV(1, 1, 3), NV(1, 2, 4), NV(1, 3, 5)]],
        display: [seg('F 1 222 3333 44444', 1)],
      },
    ],
  },
  {
    name: 'REPEATING',
    hands: [
      {
        id: 'RP1', points: 25, note: 'any like #', nums: 'like', winds: 'lit',
        groupSets: [[F(2), NV(1, 0, 3), NV(2, 0, 3), NV(3, 0, 3), D(1, 3)]],
        display: [seg('FF 111', 1), seg('111', 2), seg('111', 3), seg('DDD', 1)],
      },
      {
        id: 'RP2', points: 25, note: 'any like #s, any winds', nums: 'like', winds: 'var',
        groupSets: [[F(3), NV(1, 0, 3), NV(3, 0, 3), D(1, 3), W('N', 2)]],
        display: [seg('FFF 111', 1), seg('111', 3), seg('DDD NN', 1)],
      },
      {
        id: 'RP3', points: 30, note: 'any like #', nums: 'like', winds: 'lit',
        groupSets: [[F(3), NV(1, 0, 4), NV(3, 0, 3), NV(2, 0, 2), D(1, 2)]],
        display: [seg('FFF 1111', 1), seg('111', 3), seg('11', 2), seg('DD', 1)],
      },
      {
        id: 'RP4', points: 35, note: 'any consec #s, any winds', nums: 'consec', winds: 'var',
        groupSets: [[NV(1, 0, 3), NV(1, 1, 3), W('N', 2), NV(2, 0, 3), NV(2, 1, 3)]],
        display: [seg('111 222 NN', 1), seg('111 222', 2)],
      },
      {
        id: 'RP5', points: 40, note: 'these #s only', nums: 'lit', winds: 'lit',
        groupSets: [[F(2), N(1, 1), N(1, 2), N(1, 3), N(1, 7), N(1, 8), N(1, 9),
                     N(3, 1), N(3, 2), N(3, 3), N(3, 7), N(3, 8), N(3, 9)]],
        display: [seg('FF 123 789', 1), seg('123 789', 3)],
      },
      {
        id: 'RP6', points: 50, note: 'any like #, any winds', nums: 'like', winds: 'var',
        groupSets: [[NV(1, 0, 2), NV(2, 0, 2), NV(3, 0, 2), D(3, 2), W('N', 2),
                     NV(2, 0, 2), NV(1, 0, 2)]],
        display: [seg('11', 1), seg('11', 2), seg('11 DD', 3), seg('NN', 1), seg('11', 2), seg('11', 1)],
      },
    ],
  },
  {
    name: 'POP CULTURE',
    hands: [
      {
        id: 'PC1', points: 45, note: 'these #s only', nums: 'lit', winds: 'lit',
        groupSets: [[N(1, 1), N(1, 3), N(3, 1), N(3, 3), N(2, 1), N(2, 3),
                     N(1, 8), N(1, 7), W('N'), W('E'), W('W'), W('S'), D(1, 2)]],
        display: [seg('TS Eras: 13', 1), seg('13', 3), seg('13', 2), seg('87 NEWS DD', 1)],
      },
      {
        id: 'PC2', points: 45, note: 'any wind, these #s only', nums: 'lit', winds: 'var',
        groupSets: [[W('N', 4), F(4), N(1, 1), N(1, 2), N(1, 3), N(1, 4), N(1, 2, 2)]],
        display: [seg('Queen Bey: NNNN FFFF 1234 22', 1)],
      },
      {
        id: 'PC3', points: 45, note: 'these #s only', nums: 'lit', winds: 'lit',
        groupSets: [[N(1, 6, 4), N(1, 7, 4), N(2, 6, 1), N(3, 7, 1),
                     W('N'), W('E'), W('W'), W('S')]],
        display: [seg('Slang: 6666 7777', 1), seg('6', 2), seg('7', 3), seg('NEWS', 1)],
      },
    ],
  },
];

export const ALL_HANDS = CATEGORIES.flatMap(cat =>
  cat.hands.map(h => ({ ...h, category: cat.name, categorySubtitle: cat.subtitle ?? null }))
);

export const HANDS_BY_ID = Object.fromEntries(ALL_HANDS.map(h => [h.id, h]));

// Slot colours used by the card viewer — deliberately the printed card's own
// palette, not the tile colours, since a slot is a placeholder for a suit.
export const SLOT_COLOR = { 0: '#4b5563', 1: '#111827', 2: '#b07000', 3: '#c2185b' };
