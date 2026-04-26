import { useState, useEffect } from 'react';

import { useState, useEffect } from 'react';

export function useGameState(socket) {
  const [roomCode,       setRoomCode]       = useState(null);
  const [playerId,       setPlayerId]       = useState(null);
  const [roomInfo,       setRoomInfo]       = useState(null);
  const [gameState,      setGameState]      = useState(null);
  const [gameOver,       setGameOver]       = useState(null);
  const [error,          setError]          = useState(null);
  const [resignedPlayer, setResignedPlayer] = useState(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('joinedRoom',  ({ playerId, roomCode }) => {
      setPlayerId(playerId);
      setRoomCode(roomCode);
      setError(null);
    });
    socket.on('roomUpdate',      info  => setRoomInfo(info));
    socket.on('gameStarted',     ()    => setError(null));
    socket.on('gameState',       state => setGameState(state));
    socket.on('gameOver',        info  => setGameOver(info));
    socket.on('error',           ({ message }) => setError(message));
    socket.on('playerResigned',  ({ playerName }) => {
      setResignedPlayer(playerName);
      setTimeout(() => setResignedPlayer(null), 4000);
    });

    return () => {
      socket.off('joinedRoom');
      socket.off('roomUpdate');
      socket.off('gameStarted');
      socket.off('gameState');
      socket.off('gameOver');
      socket.off('error');
      socket.off('playerResigned');
    };
  }, [socket]);

  const actions = {
    createRoom:      (playerName)               => socket.emit('createRoom',      { playerName }),
    joinRoom:        (roomCode, playerName)      => socket.emit('joinRoom',        { roomCode, playerName }),
    startGame:       ()                          => socket.emit('startGame'),
    playCard:        (cardId, destination, opts) => socket.emit('playCard',        { cardId, destination, options: opts }),
    respondToAction: (response, cardId, opts)    => socket.emit('respondToAction', { response, cardId, options: opts ?? {} }),
    moveWildcard:    (cardId, newColor)          => socket.emit('moveWildcard',    { cardId, newColor }),
    endTurn:         (discardIds = [])           => socket.emit('endTurn',         { discardIds }),
    resignGame:      ()                          => socket.emit('resignGame'),
  };

  return { roomCode, playerId, roomInfo, gameState, gameOver, error, actions, resignedPlayer };
}

export function useGameState(socket) {
  const [roomCode,  setRoomCode]  = useState(null);
  const [playerId,  setPlayerId]  = useState(null);
  const [roomInfo,  setRoomInfo]  = useState(null);
  const [gameState, setGameState] = useState(null);
  const [gameOver,  setGameOver]  = useState(null);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    if (!socket) return;
    socket.on('joinedRoom',  ({ playerId, roomCode }) => { setPlayerId(playerId); setRoomCode(roomCode); setError(null); });
    socket.on('roomUpdate',  info  => setRoomInfo(info));
    socket.on('gameStarted', ()    => setError(null));
    socket.on('gameState',   state => setGameState(state));
    socket.on('gameOver',    info  => setGameOver(info));
    socket.on('error',       ({ message }) => setError(message));
    return () => {
      socket.off('joinedRoom');
      socket.off('roomUpdate');
      socket.off('gameStarted');
      socket.off('gameState');
      socket.off('gameOver');
      socket.off('error');
    };
  }, [socket]);

  const actions = {
    createRoom:      (playerName)               => socket.emit('createRoom',      { playerName }),
    joinRoom:        (roomCode, playerName)      => socket.emit('joinRoom',        { roomCode, playerName }),
    startGame:       ()                          => socket.emit('startGame'),
    playCard:        (cardId, destination, opts) => socket.emit('playCard',        { cardId, destination, options: opts }),
    respondToAction: (response, cardId, opts)    => socket.emit('respondToAction', { response, cardId, options: opts ?? {} }),
    moveWildcard:    (cardId, newColor)          => socket.emit('moveWildcard',    { cardId, newColor }),
    endTurn:         (discardIds = [])           => socket.emit('endTurn',         { discardIds }),
  };

  return { roomCode, playerId, roomInfo, gameState, gameOver, error, actions };
}