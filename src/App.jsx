import { useSocket }    from './hooks/useSocket';
import { useGameState } from './hooks/useGameState';
import { useState }     from 'react';
import GameBoard from './components/GameBoard.jsx';

export default function App() {
  const { socket, connected } = useSocket();
  const {
    roomCode, playerId, roomInfo, gameState, gameOver, error, actions,
  } = useGameState(socket);

  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');

  if (gameOver) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="text-center">
        <div className="text-6xl mb-4">🏆</div>
        <h1 className="text-3xl font-bold mb-2">{gameOver.winnerName} wins!</h1>
        <p className="text-gray-400">Refresh to play again.</p>
      </div>
    </div>
  );

  if (gameState) return (
    <GameBoard
      gameState={gameState}
      playerId={playerId}
      playerNames={Object.fromEntries(
        roomInfo?.players?.map(p => [p.id, p.name]) ?? []
      )}
      actions={actions}
  />
  );

  if (roomInfo) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="bg-gray-800 rounded-xl p-8 w-80">
        <h1 className="text-2xl font-bold mb-1">Room {roomCode}</h1>
        <p className="text-gray-400 text-sm mb-6">Share this code with friends</p>
        <div className="mb-6">
          <h2 className="text-sm text-gray-400 mb-2">Players ({roomInfo.players.length}/5)</h2>
          {roomInfo.players.map(p => (
            <div key={p.id} className="flex items-center gap-2 py-1">
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              <span>{p.name}</span>
              {p.id === roomInfo.hostId && <span className="text-xs text-yellow-400">host</span>}
            </div>
          ))}
        </div>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        {playerId === roomInfo.hostId && (
          <button
            onClick={actions.startGame}
            disabled={roomInfo.players.length < 2}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 py-2 rounded-lg font-bold"
          >Start Game</button>
        )}
        {playerId !== roomInfo.hostId && (
          <p className="text-center text-gray-500 text-sm">Waiting for host to start...</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="bg-gray-800 rounded-xl p-8 w-80">
        <h1 className="text-3xl font-bold mb-1">Property Deal</h1>
        <p className="text-gray-400 text-sm mb-6">Multiplayer card game</p>
        <div className={`w-2 h-2 rounded-full inline-block mr-2 ${connected ? 'bg-green-400' : 'bg-red-400'}`}></div>
        <span className="text-xs text-gray-500 mb-6 block">{connected ? 'Connected to server' : 'Connecting...'}</span>
        <input
          className="w-full bg-gray-700 rounded-lg px-3 py-2 mb-4 text-sm outline-none"
          placeholder="Your name"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
        />
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button
          onClick={() => actions.createRoom(nameInput)}
          disabled={!connected || !nameInput.trim()}
          className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 py-2 rounded-lg font-bold mb-3"
        >Create Game</button>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-700 rounded-lg px-3 py-2 text-sm outline-none uppercase"
            placeholder="Room code"
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase())}
            maxLength={5}
          />
          <button
            onClick={() => actions.joinRoom(codeInput, nameInput)}
            disabled={!connected || !nameInput.trim() || !codeInput.trim()}
            className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 px-4 rounded-lg font-bold"
          >Join</button>
        </div>
      </div>
    </div>
  );
}