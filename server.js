// ============================================================
// Socket.IO Game Server — Property Deal & Mah Jong
// Run with: node server.js
// ============================================================

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

import {
  createGame, createGameDebug, drawForTurn, playCard,
  respondToAction, moveWildcard, endTurn,
  resignGame, getCurrentPlayer, checkWin,
} from './src/game/engine.js';
import { FULL_DECK } from './src/game/cards.js';
import * as mj from './src/game/mahjong/engine.js';
import { BOT_NAMES, getBotMove, getBotResponse, getBotDiscards, getBotWildcardOverflowMove } from './src/game/botAI.js';
import {
  BOT_NAMES as MJ_BOT_NAMES,
  getBotMove as getMahjongBotMove,
  getBotFallbackMove as getMahjongBotFallbackMove,
} from './src/game/mahjong/botAI.js';

// ============================================================
// SERVER SETUP
// ============================================================

const app  = express();
const http = createServer(app);

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173', 'https://property-deal-chi.vercel.app'];

const io   = new Server(http, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;

// ============================================================
// IN-MEMORY GAME STORE
// ============================================================

const rooms    = {};
const CARD_MAP = Object.fromEntries(FULL_DECK.map(c => [c.id, c]));

// ============================================================
// HELPERS
// ============================================================

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// ── Game types ───────────────────────────────────────────────

const GAME_TYPES = {
  property: { label: 'Property Deal', min: 2, max: 5, bots: true, botNames: BOT_NAMES    },
  mahjong:  { label: 'Mah Jong',      min: 2, max: 4, bots: true, botNames: MJ_BOT_NAMES },
};

function gameTypeOf(room) {
  return GAME_TYPES[room.gameType] ? room.gameType : 'property';
}

function isMahjong(room) {
  return gameTypeOf(room) === 'mahjong';
}

// Mah Jong hands, marked win conditions and the wall are all private; strip
// everything the receiving player isn't entitled to see.
function sanitizeMahjong(state, viewerId) {
  return {
    ...state,
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [id, {
        ...p,
        hand: (id === viewerId || state.revealed)
          ? p.hand
          : p.hand.map((_, i) => ({ id: `hidden-${id}-${i}`, kind: 'hidden' })),
        markedHands:   id === viewerId ? p.markedHands   : [],
        passSelection: id === viewerId ? p.passSelection : [],
        justReceived:  id === viewerId ? p.justReceived  : [],
      }])
    ),
    wall: state.wall.length,
  };
}

// Runs a Mah Jong engine call for the socket's player and pushes the result.
function applyMahjong(socket, fn) {
  const room = getRoomBySocket(socket.id);
  if (!room?.gameState || !isMahjong(room)) return emitError(socket, 'No Mah Jong game in progress.');

  const player = getPlayerBySocket(room, socket.id);
  if (!player) return emitError(socket, 'Player not found.');

  try {
    const next = fn(room.gameState, player.id);
    if (next) room.gameState = next;
  } catch (err) {
    return emitError(socket, err.message);
  }

  broadcastGameState(room);
  emitMahjongGameOver(room);
  checkAndScheduleBotTurn(room);
}

function emitMahjongGameOver(room) {
  const state = room.gameState;
  if (state?.phase !== 'gameover' || room.gameOverSent) return;
  room.gameOverSent = true;
  const winner = room.players.find(p => p.id === state.winner);
  io.to(room.roomCode).emit('gameOver', {
    winnerId:   state.winner,
    winnerName: winner?.name ?? state.playerNames?.[state.winner] ?? null,
    reason:     state.endReason,
    winningHands: state.winningHands ?? [],
  });
}

function getRoomBySocket(socketId) {
  return Object.values(rooms).find(r =>
    r.players.some(p => p.socketId === socketId)
  );
}

function getPlayerBySocket(room, socketId) {
  return room?.players.find(p => p.socketId === socketId);
}

function broadcastGameState(room) {
  room.players.forEach(player => {
    const socket = io.sockets.sockets.get(player.socketId);
    if (!socket) return;

    const state = room.gameState;

    if (isMahjong(room)) {
      socket.emit('gameState', sanitizeMahjong(state, player.id));
      return;
    }

    const sanitized = {
      ...state,
      players: Object.fromEntries(
        Object.entries(state.players).map(([id, p]) => [
          id,
          {
            ...p,
            hand: id === player.id
              ? p.hand
              : p.hand.map(() => ({ id: 'hidden', type: 'hidden' })),
          },
        ])
      ),
      deck: state.deck.length,
    };

    socket.emit('gameState', sanitized);
  });
}

function emitError(socket, message) {
  socket.emit('error', { message });
}

function updateRematchHost(room) {
  if (!room.rematchVotes || room.rematchVotes.size === 0) {
    room.rematchHostId = null;
    return;
  }
  const votes    = [...room.rematchVotes];
  const botCount = room.players.filter(p => p.isBot).length;
  // Bots auto-join rematches, so count them toward the "enough players" threshold.
  const totalParticipants = votes.length + botCount;

  // Original host voted + at least one other player (human or bot) → host gets priority
  if (room.hostId && votes.includes(room.hostId) && totalParticipants >= 2) {
    room.rematchHostId = room.hostId;
    return;
  }
  // 2+ human non-host voters (or 1 non-host voter + bots) → assign one randomly
  const nonHostVotes = votes.filter(id => id !== room.hostId);
  if (nonHostVotes.length + botCount >= 2) {
    if (room.rematchHostId && nonHostVotes.includes(room.rematchHostId)) return;
    room.rematchHostId = nonHostVotes[Math.floor(Math.random() * nonHostVotes.length)];
    return;
  }
  room.rematchHostId = null;
}

function broadcastRematchStatus(room) {
  updateRematchHost(room);
  io.to(room.roomCode).emit('rematchStatus', {
    votes:         [...(room.rematchVotes ?? new Set())],
    rematchHostId: room.rematchHostId ?? null,
  });
}

function emitRoomUpdate(room) {
  io.to(room.roomCode).emit('roomUpdate', {
    roomCode:  room.roomCode,
    players:   room.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot ?? false })),
    hostId:    room.hostId,
    gameType:  gameTypeOf(room),
    maxPlayers: GAME_TYPES[gameTypeOf(room)].max,
    debugMode: room.debugMode ?? false,
    started:  room.started,
  });
}

// ============================================================
// BOT HELPERS
// ============================================================

const BOT_TURN_DELAY_MS     = 1400;
const BOT_RESPONSE_DELAY_MS = 1000;

function isBotPlayer(room, playerId) {
  return room.players.some(p => p.id === playerId && p.isBot);
}

// A table of nothing but bots has nobody to play for, so it stops there.
function hasHumanPlayer(room) {
  return room.players.some(p => !p.isBot);
}

// Returns the bot ID that should act next during a 'responding' phase, or null.
function getPendingBotResponder(room) {
  const state   = room.gameState;
  const pending = state.pendingAction;
  if (!pending || state.phase !== 'responding') return null;

  const botIds = new Set(room.players.filter(p => p.isBot).map(p => p.id));

  if (pending.justSayNoBy) {
    const initiatorId = pending.toId ?? pending.initiatorId;
    const lastJSNWasInitiator = pending.justSayNoBy === initiatorId;

    if (pending.type === 'payment' || pending.type === 'slyDeal' || pending.type === 'dealBreaker') {
      const otherSide = [pending.fromId, pending.toId].find(id => id && id !== pending.justSayNoBy);
      return otherSide && botIds.has(otherSide) ? otherSide : null;
    }
    if (pending.type === 'forceDeal') {
      const otherSide = [pending.initiatorId, pending.targetId].find(id => id && id !== pending.justSayNoBy);
      return otherSide && botIds.has(otherSide) ? otherSide : null;
    }
    if (pending.type === 'birthdayPayment' || pending.type === 'rentPayment') {
      if (lastJSNWasInitiator) {
        // Initiator counter-JSN'd — each remaining payer now needs to respond.
        return pending.remaining?.find(id => botIds.has(id)) ?? null;
      } else {
        // A payer JSN'd — the initiator needs to counter or concede.
        return botIds.has(initiatorId) ? initiatorId : null;
      }
    }
    return null;
  }

  if (pending.type === 'payment' || pending.type === 'slyDeal' || pending.type === 'dealBreaker') {
    return botIds.has(pending.fromId) ? pending.fromId : null;
  }
  if (pending.type === 'forceDeal') {
    return botIds.has(pending.targetId) ? pending.targetId : null;
  }
  if (pending.type === 'birthdayPayment' || pending.type === 'rentPayment') {
    return pending.remaining?.find(id => botIds.has(id)) ?? null;
  }

  return null;
}

// Schedule the next bot action after every game-state broadcast.
function checkAndScheduleBotTurn(room) {
  if (isMahjong(room)) return scheduleMahjongBot(room);

  if (room.botTimeout) { clearTimeout(room.botTimeout); room.botTimeout = null; }
  if (!room.gameState || room.gameState.phase === 'gameover') return;

  if (room.gameState.phase === 'responding') {
    const responder = getPendingBotResponder(room);
    if (responder) {
      room.botTimeout = setTimeout(() => executeBotResponse(room, responder), BOT_RESPONSE_DELAY_MS);
    }
    return;
  }

  if (room.gameState.phase === 'movingWildcard') {
    const pending = room.gameState.pendingAction;
    if (pending?.playerId && isBotPlayer(room, pending.playerId)) {
      room.botTimeout = setTimeout(() => executeBotWildcardOverflow(room, pending.playerId), BOT_RESPONSE_DELAY_MS);
    }
    return;
  }

  if (room.gameState.phase === 'playing') {
    const currentId = room.gameState.playerOrder[room.gameState.currentPlayerIndex];
    if (isBotPlayer(room, currentId)) {
      room.botTimeout = setTimeout(() => executeBotTurn(room, currentId), BOT_TURN_DELAY_MS);
    }
  }
}

function executeBotWildcardOverflow(room, botId) {
  const state = room.gameState;
  if (!state || state.phase !== 'movingWildcard') return;
  if (state.pendingAction?.playerId !== botId) return;

  const move = getBotWildcardOverflowMove(state, botId);
  if (!move) return;

  try {
    room.gameState = moveWildcard(state, botId, move.cardId, move.newColor);
    broadcastGameState(room);
    if (room.gameState.winner) {
      const winner = room.players.find(p => p.id === room.gameState.winner);
      io.to(room.roomCode).emit('gameOver', {
        winnerId:   room.gameState.winner,
        winnerName: winner?.name ?? room.gameState.playerNames?.[room.gameState.winner],
      });
    } else {
      checkAndScheduleBotTurn(room);
    }
  } catch (err) {
    console.error(`Bot ${botId} wildcard overflow error:`, err.message);
  }
}

function executeBotTurn(room, botId) {
  const state = room.gameState;
  if (!state || state.phase === 'gameover') return;

  const currentId = state.playerOrder[state.currentPlayerIndex];
  if (currentId !== botId) return; // Turn changed while timeout was pending

  const move = getBotMove(state, botId);

  if (!move) {
    // End the bot's turn
    try {
      const discardIds = getBotDiscards(state, botId);
      room.gameState = endTurn(state, botId, discardIds);
      const nextId = room.gameState.playerOrder[room.gameState.currentPlayerIndex];
      drawForTurn(room.gameState, nextId);
      broadcastGameState(room);
      checkAndScheduleBotTurn(room);
    } catch (err) {
      console.error(`Bot ${botId} end-turn error:`, err.message);
    }
    return;
  }

  try {
    room.gameState = playCard(state, botId, move.cardId, move.destination, move.options);
    broadcastGameState(room);

    if (room.gameState.winner) {
      const winner = room.players.find(p => p.id === room.gameState.winner);
      io.to(room.roomCode).emit('gameOver', {
        winnerId:   room.gameState.winner,
        winnerName: winner?.name ?? room.gameState.playerNames?.[room.gameState.winner],
      });
      return;
    }

    checkAndScheduleBotTurn(room);
  } catch (err) {
    console.error(`Bot ${botId} play error:`, err.message);
    // Fall back to ending the turn so the game doesn't freeze
    try {
      const discardIds = getBotDiscards(room.gameState, botId);
      room.gameState = endTurn(room.gameState, botId, discardIds);
      const nextId = room.gameState.playerOrder[room.gameState.currentPlayerIndex];
      drawForTurn(room.gameState, nextId);
      broadcastGameState(room);
      checkAndScheduleBotTurn(room);
    } catch (e) {
      console.error(`Bot ${botId} fallback end-turn error:`, e.message);
    }
  }
}

function executeBotResponse(room, botId) {
  const state = room.gameState;
  if (!state || state.phase !== 'responding') return;

  const { response, options } = getBotResponse(state, botId);

  try {
    room.gameState = respondToAction(state, botId, response, options);
    broadcastGameState(room);

    if (room.gameState.winner) {
      const winner = room.players.find(p => p.id === room.gameState.winner);
      io.to(room.roomCode).emit('gameOver', {
        winnerId:   room.gameState.winner,
        winnerName: winner?.name ?? room.gameState.playerNames?.[room.gameState.winner],
      });
      return;
    }

    checkAndScheduleBotTurn(room);
  } catch (err) {
    console.error(`Bot ${botId} response error:`, err.message);
  }
}

// ── Mah Jong bots ────────────────────────────────────────────

const MJ_BOT_DELAY_MS = 1200;

// Returns the bot whose move the table is waiting on, or null. During the
// Charleston that is any bot that has not locked in a pass yet; in play it is
// only the bot whose turn it is.
function nextMahjongBot(room) {
  const state = room.gameState;
  if (!state) return null;

  const botIds = room.players.filter(p => p.isBot).map(p => p.id);

  if (state.phase === 'charleston') {
    return botIds.find(id => state.players[id] && !state.players[id].passReady) ?? null;
  }
  if (state.phase === 'playing') {
    const currentId = state.playerOrder[state.currentPlayerIndex];
    return botIds.includes(currentId) ? currentId : null;
  }
  return null;
}

function scheduleMahjongBot(room) {
  const waitingOn = room.gameState?.phase !== 'gameover' && hasHumanPlayer(room)
    ? nextMahjongBot(room)
    : null;

  // A move already on the clock for the same bot stays on it — sorting or
  // dragging tiles rebroadcasts the state, and that shouldn't keep pushing
  // the bot's turn back.
  if (waitingOn && room.botTimeout && room.botTimeoutFor === waitingOn) return;

  if (room.botTimeout) { clearTimeout(room.botTimeout); room.botTimeout = null; }
  room.botTimeoutFor = waitingOn;
  if (!waitingOn) return;

  room.botTimeout = setTimeout(() => executeMahjongBotMove(room, waitingOn), MJ_BOT_DELAY_MS);
}

function applyMahjongBotMove(state, botId, move) {
  switch (move?.type) {
    case 'pass':    return mj.confirmPass(mj.setPassSelection(state, botId, move.tileIds), botId);
    case 'claim':   return mj.claimDiscard(state, botId, move.option);
    case 'swapJoker': return mj.swapJoker(state, botId, move.jokerId, move.tileId);
    case 'draw':    return mj.drawFromWall(state, botId);
    case 'discard': return mj.discardTile(state, botId, move.tileId);
    case 'declare': return mj.declareMahjong(state, botId);
    default:        return null;
  }
}

function executeMahjongBotMove(room, botId) {
  room.botTimeout    = null;
  room.botTimeoutFor = null;

  const state = room.gameState;
  if (!state || state.phase === 'gameover') return;
  if (nextMahjongBot(room) !== botId) return;   // the table moved on while we waited

  let next = null;
  try {
    next = applyMahjongBotMove(state, botId, getMahjongBotMove(state, botId));
  } catch (err) {
    console.error(`Mah Jong bot ${botId} move error:`, err.message);
  }

  if (!next) {
    // Fall back to a move that is always legal so the hand doesn't stall.
    try {
      next = applyMahjongBotMove(state, botId, getMahjongBotFallbackMove(state, botId));
    } catch (err) {
      console.error(`Mah Jong bot ${botId} fallback error:`, err.message);
    }
  }
  if (!next) return;

  room.gameState = next;
  broadcastGameState(room);
  emitMahjongGameOver(room);
  checkAndScheduleBotTurn(room);
}

// ============================================================
// SOCKET.IO EVENTS
// ============================================================

io.on('connection', socket => {
  console.log(`Socket connected: ${socket.id}`);

  // ── Create Room ──────────────────────────────────────────
  socket.on('createRoom', ({ playerName, debug, gameType }) => {
    if (!playerName?.trim()) return emitError(socket, 'Player name is required.');

    const type = GAME_TYPES[gameType] ? gameType : 'property';
    const roomCode = generateRoomCode();
    const playerId = uuidv4();

    rooms[roomCode] = {
      roomCode,
      hostId:    playerId,
      started:   false,
      gameType:  type,
      // Debug card setup only exists for Property Deal.
      debugMode: !!debug && type === 'property',
      gameState: null,
      players: [{ id: playerId, name: playerName.trim(), socketId: socket.id }],
    };

    socket.join(roomCode);
    socket.emit('joinedRoom', { playerId, roomCode });
    emitRoomUpdate(rooms[roomCode]);
    console.log(`Room ${roomCode} (${type}) created by ${playerName}`);
  });

  // ── Join Room ────────────────────────────────────────────
  socket.on('joinRoom', ({ roomCode, playerName, gameType }) => {
    const code = roomCode?.toUpperCase().trim();
    if (!playerName?.trim()) return emitError(socket, 'Player name is required.');

    const room = rooms[code];
    if (!room)                return emitError(socket, `Room ${code} not found.`);
    if (room.started)         return emitError(socket, 'Game already in progress.');

    const type = gameTypeOf(room);
    const cfg  = GAME_TYPES[type];
    if (gameType && GAME_TYPES[gameType] && gameType !== type) {
      return emitError(socket, `Room ${code} is playing ${cfg.label}.`);
    }
    if (room.players.length >= cfg.max) {
      return emitError(socket, `Room is full (max ${cfg.max} players).`);
    }

    const playerId = uuidv4();
    room.players.push({ id: playerId, name: playerName.trim(), socketId: socket.id });

    socket.join(code);
    socket.emit('joinedRoom', { playerId, roomCode: code });
    emitRoomUpdate(room);
    console.log(`${playerName} joined room ${code}`);
  });

  // ── Start Game ───────────────────────────────────────────
  socket.on('startGame', () => {
    const room   = getRoomBySocket(socket.id);
    if (!room)   return emitError(socket, 'You are not in a room.');

    const player = getPlayerBySocket(room, socket.id);
    if (player.id !== room.hostId) return emitError(socket, 'Only the host can start the game.');
    if (room.started)               return emitError(socket, 'Game already started.');

    const cfg = GAME_TYPES[gameTypeOf(room)];
    if (room.players.length < cfg.min) return emitError(socket, `Need at least ${cfg.min} players to start.`);
    if (room.players.length > cfg.max) return emitError(socket, `${cfg.label} supports up to ${cfg.max} players.`);

    const playerIds = room.players.map(p => p.id);

    if (isMahjong(room)) {
      try {
        room.gameState = mj.createGame(playerIds);
      } catch (err) {
        return emitError(socket, err.message);
      }
      room.started      = true;
      room.gameOverSent = false;
      playerIds.forEach(id => {
        const p = room.players.find(pl => pl.id === id);
        if (p) room.gameState.playerNames[id] = p.name;
      });
      broadcastGameState(room);
      io.to(room.roomCode).emit('gameStarted');
      checkAndScheduleBotTurn(room);
      console.log(`Mah Jong started in room ${room.roomCode}`);
      return;
    }

    room.gameState   = createGame(playerIds);
    room.started     = true;

    // Store real player names so the game log uses them
    playerIds.forEach(id => {
      const p = room.players.find(p => p.id === id);
      if (p) room.gameState.playerNames[id] = p.name;
    });

    // Auto-draw for the first player (use shuffled order, not join order)
    drawForTurn(room.gameState, room.gameState.playerOrder[0]);

    broadcastGameState(room);
    io.to(room.roomCode).emit('gameStarted');
    checkAndScheduleBotTurn(room);
    console.log(`Game started in room ${room.roomCode}`);
  });

  // ── Debug Start Game (manual hand setup) ─────────────────
  socket.on('debugStartGame', ({ hands }) => {
    const room = getRoomBySocket(socket.id);
    if (!room)           return emitError(socket, 'You are not in a room.');
    if (!room.debugMode) return emitError(socket, 'Room is not in debug mode.');
    if (room.started)    return emitError(socket, 'Game already started.');

    const player = getPlayerBySocket(room, socket.id);
    if (player.id !== room.hostId) return emitError(socket, 'Only the host can start the game.');
    if (room.players.length < 2)   return emitError(socket, 'Need at least 2 players to start.');

    // Resolve card IDs → card objects from the master deck
    const manualHands = {};
    for (const [pid, cardIds] of Object.entries(hands)) {
      manualHands[pid] = (cardIds ?? []).map(id => CARD_MAP[id]).filter(Boolean);
    }

    const playerIds = room.players.map(p => p.id);
    room.gameState  = createGameDebug(playerIds, manualHands);
    room.started    = true;

    playerIds.forEach(id => {
      const p = room.players.find(p => p.id === id);
      if (p) room.gameState.playerNames[id] = p.name;
    });

    broadcastGameState(room);
    io.to(room.roomCode).emit('gameStarted');
    checkAndScheduleBotTurn(room);
    console.log(`[DEBUG] Game started in room ${room.roomCode} with manual hands`);
  });

  // ── Play Card ────────────────────────────────────────────
  socket.on('playCard', ({ cardId, destination, options = {} }) => {
    const room = getRoomBySocket(socket.id);
    if (!room?.gameState) return emitError(socket, 'No game in progress.');

    const player = getPlayerBySocket(room, socket.id);
    if (!player) return emitError(socket, 'Player not found.');

    try {
      room.gameState = playCard(room.gameState, player.id, cardId, destination, options);
      broadcastGameState(room);
      if (room.gameState.winner) {
        const winner = room.players.find(p => p.id === room.gameState.winner);
        io.to(room.roomCode).emit('gameOver', {
          winnerId:   room.gameState.winner,
          winnerName: winner?.name ?? room.gameState.playerNames?.[room.gameState.winner],
        });
      } else {
        checkAndScheduleBotTurn(room);
      }
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // ── Respond to Action ────────────────────────────────────
  socket.on('respondToAction', ({ response, cardId, options = {} }) => {
    const room = getRoomBySocket(socket.id);
    if (!room?.gameState) return emitError(socket, 'No game in progress.');

    const player = getPlayerBySocket(room, socket.id);
    if (!player) return emitError(socket, 'Player not found.');

    try {
      room.gameState = respondToAction(
        room.gameState,
        player.id,
        response,
        { cardId, selectedCardIds: options.selectedCardIds ?? [], ...options }
      );
      broadcastGameState(room);
      if (room.gameState.winner) {
        const winner = room.players.find(p => p.id === room.gameState.winner);
        io.to(room.roomCode).emit('gameOver', {
          winnerId:   room.gameState.winner,
          winnerName: winner?.name ?? room.gameState.playerNames?.[room.gameState.winner],
        });
      } else {
        checkAndScheduleBotTurn(room);
      }
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // ── Move Wildcard ────────────────────────────────────────
  socket.on('moveWildcard', ({ cardId, newColor }) => {
    const room = getRoomBySocket(socket.id);
    if (!room?.gameState) return emitError(socket, 'No game in progress.');

    const player = getPlayerBySocket(room, socket.id);
    if (!player) return emitError(socket, 'Player not found.');

    try {
      room.gameState = moveWildcard(room.gameState, player.id, cardId, newColor);
      broadcastGameState(room);
      if (room.gameState.winner) {
        const winner = room.players.find(p => p.id === room.gameState.winner);
        io.to(room.roomCode).emit('gameOver', {
          winnerId:   room.gameState.winner,
          winnerName: winner?.name ?? room.gameState.playerNames?.[room.gameState.winner],
        });
      } else {
        checkAndScheduleBotTurn(room);
      }
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // ── End Turn ─────────────────────────────────────────────
  socket.on('endTurn', ({ discardIds = [] } = {}) => {
    const room = getRoomBySocket(socket.id);
    if (!room?.gameState) return emitError(socket, 'No game in progress.');

    const player = getPlayerBySocket(room, socket.id);
    if (!player) return emitError(socket, 'Player not found.');

    try {
      room.gameState = endTurn(room.gameState, player.id, discardIds);
      const nextId = room.gameState.playerOrder[room.gameState.currentPlayerIndex];
      drawForTurn(room.gameState, nextId);
      broadcastGameState(room);
      checkAndScheduleBotTurn(room);
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // ── Resign Game ──────────────────────────────────────────
  socket.on('resignGame', () => {
    const room = getRoomBySocket(socket.id);
    if (!room?.gameState) return emitError(socket, 'No game in progress.');

    const player = getPlayerBySocket(room, socket.id);
    if (!player) return emitError(socket, 'Player not found.');

    if (isMahjong(room)) {
      try {
        room.gameState = mj.resignGame(room.gameState, player.id);
      } catch (err) {
        return emitError(socket, err.message);
      }
      broadcastGameState(room);
      if (room.gameState.phase === 'gameover') {
        emitMahjongGameOver(room);
      } else {
        io.to(room.roomCode).emit('playerResigned', { playerId: player.id, playerName: player.name });
        checkAndScheduleBotTurn(room);
      }
      return;
    }

    try {
      room.gameState = resignGame(room.gameState, player.id);

      if (room.gameState.phase !== 'gameover' && room.gameState.playerOrder.length > 0) {
        const currentId = room.gameState.playerOrder[room.gameState.currentPlayerIndex];
        try { drawForTurn(room.gameState, currentId); } catch(e) {}
      }

      broadcastGameState(room);

      if (room.gameState.phase !== 'gameover') checkAndScheduleBotTurn(room);

      if (room.gameState.winner) {
        const winner = room.players.find(p => p.id === room.gameState.winner);
        io.to(room.roomCode).emit('gameOver', {
          winnerId:   room.gameState.winner,
          winnerName: winner?.name ?? room.gameState.playerNames?.[room.gameState.winner] ?? 'Unknown',
          reason:     'resignation',
        });
      } else {
        io.to(room.roomCode).emit('playerResigned', {
          playerId:   player.id,
          playerName: player.name,
        });
      }
    } catch (err) {
      emitError(socket, err.message);
    }
  });

  // ── Mah Jong ─────────────────────────────────────────────

  socket.on('mj:confirmPass', ({ tileIds = [] } = {}) => {
    applyMahjong(socket, (state, pid) =>
      mj.confirmPass(mj.setPassSelection(state, pid, tileIds), pid));
  });

  socket.on('mj:draw', () => {
    applyMahjong(socket, (state, pid) => mj.drawFromWall(state, pid));
  });

  socket.on('mj:claim', ({ option, size }) => {
    applyMahjong(socket, (state, pid) => mj.claimDiscard(state, pid, option ?? size));
  });

  socket.on('mj:swapJoker', ({ jokerTileId, handTileId }) => {
    applyMahjong(socket, (state, pid) => mj.swapJoker(state, pid, jokerTileId, handTileId));
  });

  socket.on('mj:discard', ({ tileId }) => {
    applyMahjong(socket, (state, pid) => mj.discardTile(state, pid, tileId));
  });

  socket.on('mj:useBlank', ({ blankTileId, targetTileId }) => {
    applyMahjong(socket, (state, pid) => mj.useBlank(state, pid, blankTileId, targetTileId));
  });

  socket.on('mj:setMarked', ({ handIds = [] } = {}) => {
    applyMahjong(socket, (state, pid) => mj.setMarkedHands(state, pid, handIds));
  });

  socket.on('mj:declare', () => {
    applyMahjong(socket, (state, pid) => mj.declareMahjong(state, pid));
  });

  socket.on('mj:reorder', ({ tileIds = [] } = {}) => {
    applyMahjong(socket, (state, pid) => mj.reorderHand(state, pid, tileIds));
  });

  socket.on('mj:sort', () => {
    applyMahjong(socket, (state, pid) => mj.sortHand(state, pid));
  });

  // ── Vote Rematch ─────────────────────────────────────────
  socket.on('voteRematch', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const player = getPlayerBySocket(room, socket.id);
    if (!player) return;

    if (!room.rematchVotes) room.rematchVotes = new Set();
    room.rematchVotes.add(player.id);
    broadcastRematchStatus(room);
  });

  // ── Begin Rematch ─────────────────────────────────────────
  socket.on('beginRematch', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const player = getPlayerBySocket(room, socket.id);
    if (!player) return;

    updateRematchHost(room);
    if (player.id !== room.rematchHostId) return emitError(socket, 'Only the rematch host can begin.');

    const botIds          = room.players.filter(p => p.isBot).map(p => p.id);
    const rematchPlayerIds = [...new Set([...(room.rematchVotes ?? new Set()), ...botIds])];
    if (rematchPlayerIds.length < 2) return emitError(socket, 'Need at least 2 players to rematch.');

    // Keep only players who voted yes (bots are always included)
    room.players = room.players.filter(p => rematchPlayerIds.includes(p.id));
    room.hostId      = room.rematchHostId;
    room.started     = true;
    room.rematchVotes   = new Set();
    room.rematchHostId  = null;

    const playerIds  = room.players.map(p => p.id);
    room.gameOverSent = false;
    try {
      room.gameState = isMahjong(room) ? mj.createGame(playerIds) : createGame(playerIds);
    } catch (err) {
      return emitError(socket, err.message);
    }
    playerIds.forEach(id => {
      const p = room.players.find(pl => pl.id === id);
      if (p) room.gameState.playerNames[id] = p.name;
    });

    if (isMahjong(room)) {
      broadcastGameState(room);
      io.to(room.roomCode).emit('gameStarted');
      checkAndScheduleBotTurn(room);
      console.log(`Mah Jong rematch started in room ${room.roomCode} with ${playerIds.length} players.`);
      return;
    }

    drawForTurn(room.gameState, room.gameState.playerOrder[0]);
    broadcastGameState(room);
    io.to(room.roomCode).emit('gameStarted');
    checkAndScheduleBotTurn(room);
    console.log(`Rematch started in room ${room.roomCode} with ${playerIds.length} players.`);
  });

  // ── Add Bot ──────────────────────────────────────────────
  socket.on('addBot', ({ botName }) => {
    const room   = getRoomBySocket(socket.id);
    if (!room)   return emitError(socket, 'You are not in a room.');

    const player = getPlayerBySocket(room, socket.id);
    if (player.id !== room.hostId)  return emitError(socket, 'Only the host can add bots.');
    if (room.started)               return emitError(socket, 'Cannot add bots after the game starts.');

    const cfg = GAME_TYPES[gameTypeOf(room)];
    if (!cfg.bots)                        return emitError(socket, `${cfg.label} is real players only.`);
    if (room.players.length >= cfg.max)   return emitError(socket, 'Room is full.');
    if (!cfg.botNames.includes(botName))  return emitError(socket, 'Unknown bot name.');
    if (room.players.some(p => p.name === botName && p.isBot)) {
      return emitError(socket, `${botName} is already in the room.`);
    }

    const botId = uuidv4();
    room.players.push({ id: botId, name: botName, socketId: null, isBot: true });
    emitRoomUpdate(room);
    console.log(`Bot "${botName}" added to room ${room.roomCode}`);
  });

  // ── Remove Bot ───────────────────────────────────────────
  socket.on('removeBot', ({ botId }) => {
    const room   = getRoomBySocket(socket.id);
    if (!room)   return emitError(socket, 'You are not in a room.');

    const player = getPlayerBySocket(room, socket.id);
    if (player.id !== room.hostId) return emitError(socket, 'Only the host can remove bots.');

    const bot = room.players.find(p => p.id === botId && p.isBot);
    if (!bot) return emitError(socket, 'Bot not found.');

    room.players = room.players.filter(p => p.id !== botId);
    emitRoomUpdate(room);
    console.log(`Bot "${bot.name}" removed from room ${room.roomCode}`);
  });

  // ── Rejoin Room ──────────────────────────────────────────
  socket.on('rejoinRoom', ({ roomCode, playerId }) => {
    const code = roomCode?.toUpperCase().trim();
    const room = rooms[code];
    if (!room) return socket.emit('rejoinFailed', { message: 'Room no longer exists.' });

    const player = room.players.find(p => p.id === playerId);
    if (!player) return socket.emit('rejoinFailed', { message: 'Player not found in room.' });

    // Update the player's socket mapping and re-join the Socket.IO room
    player.socketId = socket.id;
    socket.join(code);

    // Restore session state for this client
    socket.emit('joinedRoom', { playerId, roomCode: code });
    emitRoomUpdate(room);

    if (room.gameState) {
      const state = room.gameState;
      if (isMahjong(room)) {
        socket.emit('gameState', sanitizeMahjong(state, player.id));
      } else {
        socket.emit('gameState', {
          ...state,
          players: Object.fromEntries(
            Object.entries(state.players).map(([id, p]) => [id, {
              ...p,
              hand: id === player.id
                ? p.hand
                : p.hand.map(() => ({ id: 'hidden', type: 'hidden' })),
            }])
          ),
          deck: state.deck.length,
        });
      }
    }

    console.log(`${player.name} rejoined room ${code}`);
  });

  // ── Disconnect ───────────────────────────────────────────
  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    const player = getPlayerBySocket(room, socket.id);
    if (!player) return;

    console.log(`${player.name} disconnected from room ${room.roomCode}`);

    if (!room.started) {
      room.players = room.players.filter(p => p.socketId !== socket.id);
      if (room.players.length === 0) {
        delete rooms[room.roomCode];
      } else {
        if (room.hostId === player.id) room.hostId = room.players[0].id;
        emitRoomUpdate(room);
      }
    } else {
      io.to(room.roomCode).emit('playerDisconnected', {
        playerId:   player.id,
        playerName: player.name,
      });
    }
  });
});

// ============================================================
// START SERVER
// ============================================================

http.listen(PORT, () => {
  console.log(`Game server running on port ${PORT}`);
});