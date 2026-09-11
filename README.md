# Game Night

Real-time multiplayer table games. Built as a PWA with React + Vite on the frontend and a Node.js + Socket.IO game server on the backend.

Enter your name, pick a game, then create a room or join one with a code:

| Game | Players | Bots |
|---|---|---|
| **Property Deal** — inspired by Monopoly Deal | 2–5 | yes |
| **Mah Jong** — American mahjong | 2–4 | yes |

## Running locally

```bash
npm install
npm run dev
```

This starts both the game server (port 3001) and the Vite dev server (port 5173) concurrently. Open `http://localhost:5173` in your browser.

To run them separately:

```bash
npm run dev:server   # game server on :3001
npm run dev:client   # vite frontend on :5173
```

## Environment variables

Copy `.env.example` to `.env` and adjust as needed.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the game server listens on |
| `CORS_ORIGINS` | localhost + Vercel URL | Comma-separated list of allowed frontend origins |
| `VITE_SERVER_URL` | `http://localhost:3001` | Backend URL used by the frontend (set at build time) |

## Deploying

The frontend can be deployed to **Vercel** (set `VITE_SERVER_URL` to your backend URL as a build env var).

The backend (`server.js`) needs a persistent Node.js host — **Render**, **Railway**, or **Fly.io** all have free tiers that work. Set `PORT` and `CORS_ORIGINS` as environment variables on the host.

The `Procfile` (`web: node server.js`) is compatible with Heroku-style platforms.

## How to play — Property Deal

- Your name is remembered between visits, so reopening the app drops you
  straight on the game picker — "← Change name" on that screen changes it
- Create a room, share the room code with friends
- The host starts the game once everyone has joined
- Each turn: draw 2 cards, play up to 3 cards, end your turn
- First player to collect **3 complete property sets** wins

**Playing a card.** Drag it out of your hand and drop it where you want it —
the places that will take the card light up as you move, and a label under the
card says what dropping it there would do. Tap a card instead to read what it
does.

Your hand is fanned rather than scrolled, so every card is within reach without
a swipe that would fight the drag: cards overlap as the hand grows, and you
pick one up by the sliver of it you can see.

| Card | Where you drop it |
|---|---|
| Money, or anything you'd rather bank | your bank pile |
| Property | your board, or straight onto the matching set |
| Wildcard | onto a set, or on open board space to pick a colour |
| Rent | your board — a popup asks which colour to charge, who pays, and whether to double it |
| House / Hotel | the complete set it goes on |
| Pass Go, It's My Birthday | your board |
| Debt Collector | the player who owes you |
| Sly Deal, Force Deal | the opponent's property card you want |
| Deal Breaker | the complete set you're stealing |

**Double the Rent** isn't dragged out on its own: drop a rent card and, as long
as you have two actions left, the rent popup offers a **×2** option that plays
your Double the Rent card alongside it.

**Just Say No** still works as a prompt — when someone plays an action against
you, the banner at the top offers it (and a counter, if they counter back).

Everything each player has banked is stacked into a single pile on their board;
the pile's total sits beside that player's name in their board header, where the
stacked cards can't cover it, and tapping a pile shows what's in it. A wildcard already on your board carries a ⇄
badge and can be dragged into another of your sets. If a set fills up underneath
one — you Deal Breaker the matching set off someone else — the wildcard switches
to its other colour on its own; an all-colour wild has no other colour to fall
back on, so you're asked which one it should become.

## How to play — Mah Jong

**The set** (160 tiles): three suits — green, red and black — with four of each number
1–9; four each of the green, red and black "Soap" dragons; four each of the N/E/S/W
winds; ten flowers; ten jokers; four blanks. Each suit owns a dragon (green suit ↔
green dragon, red ↔ red, black ↔ Soap), which is how the card's colour-coded `D`
groups resolve.

**The deal.** Everyone gets 13 tiles; one player is picked at random for the extra
14th tile and opens the game.

**The Charleston.** Before play, everyone picks 3 tiles to pass. With *n* players
there are *n − 1* passes, each one seat further round the table, so by the end
everyone has passed three tiles to each of the others:

| Players | Passes |
|---|---|
| 2 | A↔B |
| 3 | A→B, B→C, C→A · then A→C, B→A, C→B |
| 4 | A→B, B→C, C→D, D→A · then A→C, B→D, C→A, D→B · then A→D, B→A, C→B, D→C |

Tiles you receive land in your rack before the next pass, so you can keep them or
send them on.

**Play.** The player with 14 tiles discards first, then play goes round. On your
turn you either draw from the wall or take the last discard — but only if it lets
you lay down **three or more tiles** of a group in a win condition. A tile a win
condition only wants as a *pair* can't be claimed, and jokers can't stand in for
pairs or singles (they can fill out a group of three or more).

**The card.** The `🀄 Card` button (where Property Deal has "End Turn") opens the
win-condition card at any time. Tap hands to mark them; marked hands stay on screen
under your rack with live progress. On the card, colour marks a *suit slot* rather
than a specific suit: same colour means same suit, different colours mean different
suits, so a hand can be built in whichever suits you're actually collecting.

**Blanks.** A blank can be traded for any tile on the discard pile: the blank goes
onto the pile, the tile comes straight into your hand. Play then resumes with the
player *after* whoever used the blank. Because it hands the turn on, a blank can be
spent by any player between turns — while nobody is mid-turn holding a drawn tile
they still have to discard.

**Winning.** The moment your 14 tiles complete a win condition it lights up — on the
card, and in the marked strip under your rack — and a **Mah Jong** button appears.
Declaring reveals every hand and offers the usual rematch. If the wall runs out
first the hand is a draw.

## Tech stack

- **Frontend**: React 19, Vite, Tailwind CSS, Socket.IO client
- **Backend**: Node.js, Express 5, Socket.IO
- **Game logic**: pure JS, no framework dependencies
  - Property Deal — `src/game/engine.js`, `src/game/cards.js`
  - Mah Jong — `src/game/mahjong/`: `tiles.js` (the set), `card.js` (the 49 win
    conditions, transcribed from the printed card), `match.js` (expands a card
    hand's suit/number/wind placeholders into concrete tile requirements and
    matches a rack against them), `engine.js` (deal, Charleston, turns, claims,
    blanks, winning), `botAI.js` (the bots)
