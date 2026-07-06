// ============================================================
// PROPERTY DEAL — Socket.IO Game Server
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
import { BOT_NAMES, getBotMove, getBotResponse, getBotDiscards } from './src/game/botAI.js';

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

    const state     = room.gameState;
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
  if (!room.gameState || room.gameState.phase === 'gameover') return;
  if (room.botTimeout) { clearTimeout(room.botTimeout); room.botTimeout = null; }

  if (room.gameState.phase === 'responding') {
    const responder = getPendingBotResponder(room);
    if (responder) {
      room.botTimeout = setTimeout(() => executeBotResponse(room, responder), BOT_RESPONSE_DELAY_MS);
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

// ============================================================
// SOCKET.IO EVENTS
// ============================================================

io.on('connection', socket => {
  console.log(`Socket connected: ${socket.id}`);

  // ── Create Room ──────────────────────────────────────────
  socket.on('createRoom', ({ playerName, debug }) => {
    if (!playerName?.trim()) return emitError(socket, 'Player name is required.');

    const roomCode = generateRoomCode();
    const playerId = uuidv4();

    rooms[roomCode] = {
      roomCode,
      hostId:    playerId,
      started:   false,
      debugMode: !!debug,
      gameState: null,
      players: [{ id: playerId, name: playerName.trim(), socketId: socket.id }],
    };

    socket.join(roomCode);
    socket.emit('joinedRoom', { playerId, roomCode });
    emitRoomUpdate(rooms[roomCode]);
    console.log(`Room ${roomCode} created by ${playerName}`);
  });

  // ── Join Room ────────────────────────────────────────────
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const code = roomCode?.toUpperCase().trim();
    if (!playerName?.trim()) return emitError(socket, 'Player name is required.');

    const room = rooms[code];
    if (!room)                return emitError(socket, `Room ${code} not found.`);
    if (room.started)         return emitError(socket, 'Game already in progress.');
    if (room.players.length >= 5) return emitError(socket, 'Room is full (max 5 players).');

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
    if (room.players.length < 2)   return emitError(socket, 'Need at least 2 players to start.');
    if (room.started)               return emitError(socket, 'Game already started.');

    const playerIds  = room.players.map(p => p.id);
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
      checkAndScheduleBotTurn(room);
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
    room.gameState   = createGame(playerIds);
    playerIds.forEach(id => {
      const p = room.players.find(pl => pl.id === id);
      if (p) room.gameState.playerNames[id] = p.name;
    });

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
    if (room.players.length >= 5)   return emitError(socket, 'Room is full (max 5 players).');
    if (!BOT_NAMES.includes(botName)) return emitError(socket, 'Unknown bot name.');
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
      const state     = room.gameState;
      const sanitized = {
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
      };
      socket.emit('gameState', sanitized);
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
  console.log(`Property Deal server running on port ${PORT}`);
});