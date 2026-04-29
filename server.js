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
  createGame, drawForTurn, playCard,
  respondToAction, moveWildcard, endTurn,
  resignGame, getCurrentPlayer, checkWin,
} from './src/game/engine.js';

// ============================================================
// SERVER SETUP
// ============================================================

const app  = express();
const http = createServer(app);
const io   = new Server(http, {
  cors: { origin: 'https://property-deal-chi.vercel.app', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ============================================================
// IN-MEMORY GAME STORE
// ============================================================

const rooms = {};

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

function emitRoomUpdate(room) {
  io.to(room.roomCode).emit('roomUpdate', {
    roomCode: room.roomCode,
    players:  room.players.map(p => ({ id: p.id, name: p.name })),
    hostId:   room.hostId,
    started:  room.started,
  });
}

// ============================================================
// SOCKET.IO EVENTS
// ============================================================

io.on('connection', socket => {
  console.log(`Socket connected: ${socket.id}`);

  // ── Create Room ──────────────────────────────────────────
  socket.on('createRoom', ({ playerName }) => {
    if (!playerName?.trim()) return emitError(socket, 'Player name is required.');

    const roomCode = generateRoomCode();
    const playerId = uuidv4();

    rooms[roomCode] = {
      roomCode,
      hostId:    playerId,
      started:   false,
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

    // Auto-draw for the first player
    drawForTurn(room.gameState, playerIds[0]);

    broadcastGameState(room);
    io.to(room.roomCode).emit('gameStarted');
    console.log(`Game started in room ${room.roomCode}`);
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