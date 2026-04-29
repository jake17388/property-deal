import { useState, useEffect, useRef } from 'react';

const SESSION_KEY = 'pd_session';

function saveSession(playerId, roomCode, playerName) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ playerId, roomCode, playerName }));
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
export function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function useGameState(socket) {
  const [roomCode,       setRoomCode]       = useState(null);
  const [playerId,       setPlayerId]       = useState(null);
  const [roomInfo,       setRoomInfo]       = useState(null);
  const [gameState,      setGameState]      = useState(null);
  const [gameOver,       setGameOver]       = useState(null);
  const [error,          setError]          = useState(null);
  const [resignedPlayer, setResignedPlayer] = useState(null);
  const [hasSession,     setHasSession]     = useState(() => !!loadSession());
  const [rematchStatus,  setRematchStatus]  = useState(null);

  const pendingNameRef = useRef('');

  useEffect(() => {
    if (!socket) return;

    function tryRejoin() {
      const saved = loadSession();
      if (saved) socket.emit('rejoinRoom', saved);
    }

    socket.on('connect', tryRejoin);
    // If socket is already connected when this effect runs, rejoin immediately
    if (socket.connected) tryRejoin();

    socket.on('joinedRoom', ({ playerId, roomCode }) => {
      setPlayerId(playerId);
      setRoomCode(roomCode);
      setError(null);
      saveSession(playerId, roomCode, pendingNameRef.current);
      setHasSession(true);
    });

    socket.on('rejoinFailed', () => {
      clearSession();
      setHasSession(false);
    });

    socket.on('roomUpdate',  info  => setRoomInfo(info));
    socket.on('gameStarted', ()    => setError(null));

    socket.on('gameState', state => {
      setGameState(state);
      // When a new game state arrives (rematch), clear the game-over screen
      setGameOver(null);
      setRematchStatus(null);
    });

    socket.on('gameOver', info => {
      setGameOver(info);
      clearSession();
      setHasSession(false);
    });

    socket.on('rematchStatus', status => setRematchStatus(status));

    socket.on('error', ({ message }) => setError(message));

    socket.on('playerResigned', ({ playerName }) => {
      setResignedPlayer(playerName);
      setTimeout(() => setResignedPlayer(null), 4000);
    });

    return () => {
      socket.off('connect', tryRejoin);
      socket.off('joinedRoom');
      socket.off('rejoinFailed');
      socket.off('roomUpdate');
      socket.off('gameStarted');
      socket.off('gameState');
      socket.off('gameOver');
      socket.off('rematchStatus');
      socket.off('error');
      socket.off('playerResigned');
    };
  }, [socket]);

  const actions = {
    createRoom: (playerName) => {
      pendingNameRef.current = playerName;
      socket.emit('createRoom', { playerName });
    },
    joinRoom: (roomCode, playerName) => {
      pendingNameRef.current = playerName;
      socket.emit('joinRoom', { roomCode, playerName });
    },
    startGame:       ()                          => socket.emit('startGame'),
    playCard:        (cardId, destination, opts) => socket.emit('playCard',        { cardId, destination, options: opts }),
    respondToAction: (response, cardId, opts)    => socket.emit('respondToAction', { response, cardId, options: opts ?? {} }),
    moveWildcard:    (cardId, newColor)          => socket.emit('moveWildcard',    { cardId, newColor }),
    endTurn:         (discardIds = [])           => socket.emit('endTurn',         { discardIds }),
    resignGame:      ()                          => socket.emit('resignGame'),
    voteRematch:     ()                          => socket.emit('voteRematch'),
    beginRematch:    ()                          => socket.emit('beginRematch'),
  };

  return { roomCode, playerId, roomInfo, gameState, gameOver, error, actions, resignedPlayer, hasSession, rematchStatus };
}
