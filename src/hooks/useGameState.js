import { useState, useEffect, useRef } from 'react';

const SESSION_KEY = 'pd_session';

function saveSession(playerId, roomCode, playerName, gameType) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ playerId, roomCode, playerName, gameType }));
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
  const pendingGameRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    function tryRejoin() {
      const saved = loadSession();
      if (saved) {
        pendingGameRef.current = saved.gameType ?? pendingGameRef.current;
        socket.emit('rejoinRoom', { roomCode: saved.roomCode, playerId: saved.playerId });
      }
    }

    socket.on('connect', tryRejoin);
    // If socket is already connected when this effect runs, rejoin immediately
    if (socket.connected) tryRejoin();

    socket.on('joinedRoom', ({ playerId, roomCode }) => {
      setPlayerId(playerId);
      setRoomCode(roomCode);
      setError(null);
      saveSession(playerId, roomCode, pendingNameRef.current, pendingGameRef.current);
      setHasSession(true);
    });

    socket.on('rejoinFailed', () => {
      clearSession();
      setHasSession(false);
    });

    socket.on('roomUpdate', info => {
      setRoomInfo(info);
      if (info?.gameType) pendingGameRef.current = info.gameType;
    });
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
    createRoom: (playerName, gameType = 'property') => {
      pendingNameRef.current = playerName;
      pendingGameRef.current = gameType;
      socket.emit('createRoom', { playerName, gameType });
    },
    createDebugRoom: (playerName) => {
      pendingNameRef.current = playerName;
      pendingGameRef.current = 'property';
      socket.emit('createRoom', { playerName, gameType: 'property', debug: true });
    },
    joinRoom: (roomCode, playerName, gameType) => {
      pendingNameRef.current = playerName;
      pendingGameRef.current = gameType ?? null;
      socket.emit('joinRoom', { roomCode, playerName, gameType });
    },
    startGame:       ()                          => socket.emit('startGame'),
    debugStartGame:  (hands)                     => socket.emit('debugStartGame', { hands }),
    addBot:          (botName)                   => socket.emit('addBot',    { botName }),
    removeBot:       (botId)                     => socket.emit('removeBot', { botId }),
    playCard:        (cardId, destination, opts) => socket.emit('playCard',        { cardId, destination, options: opts }),
    respondToAction: (response, cardId, opts)    => socket.emit('respondToAction', { response, cardId, options: opts ?? {} }),
    moveWildcard:    (cardId, newColor)          => socket.emit('moveWildcard',    { cardId, newColor }),
    endTurn:         (discardIds = [])           => socket.emit('endTurn',         { discardIds }),
    resignGame:      ()                          => socket.emit('resignGame'),
    voteRematch:     ()                          => socket.emit('voteRematch'),
    beginRematch:    ()                          => socket.emit('beginRematch'),

    // Mah Jong
    mjConfirmPass:   (tileIds)                   => socket.emit('mj:confirmPass', { tileIds }),
    mjDraw:          ()                          => socket.emit('mj:draw'),
    mjClaim:         (size)                      => socket.emit('mj:claim',    { size }),
    mjDiscard:       (tileId)                    => socket.emit('mj:discard',  { tileId }),
    mjUseBlank:      (blankTileId, targetTileId) => socket.emit('mj:useBlank', { blankTileId, targetTileId }),
    mjSetMarked:     (handIds)                   => socket.emit('mj:setMarked', { handIds }),
    mjDeclare:       ()                          => socket.emit('mj:declare'),
  };

  return { roomCode, playerId, roomInfo, gameState, gameOver, error, actions, resignedPlayer, hasSession, rematchStatus };
}
