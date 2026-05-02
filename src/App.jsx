import { useSocket }                        from './hooks/useSocket';
import { useGameState, loadSession, clearSession } from './hooks/useGameState';
import { useState }                        from 'react';
import GameBoard                           from './components/GameBoard.jsx';

export default function App() {
  const { socket, connected } = useSocket();
  const {
    roomCode, playerId, roomInfo, gameState, gameOver, error, actions, resignedPlayer, hasSession, rematchStatus,
  } = useGameState(socket);

  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');

  // ── Reconnecting ────────────────────────────────────────
  if (!connected && hasSession) {
    const session = loadSession();
    return (
      <div style={{
        height: '100%', background: '#f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: 24,
      }}>
        <div style={{
          background: '#fff', borderRadius: 20,
          padding: '40px 28px', width: '100%', maxWidth: 380,
          textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
            Reconnecting…
          </h2>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 6 }}>
            Returning to your game
          </p>
          {session?.roomCode && (
            <div style={{
              display: 'inline-block', background: '#f0f9ff',
              border: '1px solid #bae6fd', borderRadius: 10,
              padding: '6px 16px', fontSize: 20, fontWeight: 800,
              color: '#0369a1', letterSpacing: '0.15em', marginBottom: 28,
            }}>
              {session.roomCode}
            </div>
          )}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#3b82f6',
                  animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
          <button
            onClick={() => { clearSession(); window.location.reload(); }}
            style={{
              background: 'transparent', color: '#9ca3af',
              border: '1px solid #e5e7eb', borderRadius: 12,
              padding: '10px 20px', fontSize: 13, cursor: 'pointer',
            }}
          >
            Leave Game
          </button>
        </div>
      </div>
    );
  }

  // ── Game Over ───────────────────────────────────────────
  if (gameOver) {
    const playerOrder   = gameState?.playerOrder ?? [];
    const playerNames   = gameState?.playerNames ?? {};
    const myVote        = rematchStatus?.votes?.includes(playerId) ?? false;
    const rematchHostId = rematchStatus?.rematchHostId ?? null;
    const iAmHost       = rematchHostId === playerId;
    const voteCount     = rematchStatus?.votes?.length ?? 0;

    return (
      <div style={{
        height: '100%', background: '#f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: 24, overflowY: 'auto',
      }}>
        <div style={{
          background: '#fff', borderRadius: 20,
          padding: '32px 24px', width: '100%', maxWidth: 380,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}>
          {/* Winner */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>🏆</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 4 }}>
              {gameOver.winnerName} wins!
            </h1>
            <p style={{ fontSize: 13, color: '#6b7280' }}>
              {gameOver.reason === 'resignation' ? 'Game ended by resignation' : 'Great game everyone!'}
            </p>
          </div>

          {/* Rematch section */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', textAlign: 'center', marginBottom: 14, letterSpacing: '0.04em' }}>
              REMATCH?
            </div>

            {/* Per-player vote status */}
            <div style={{ marginBottom: 16 }}>
              {playerOrder.map(pid => {
                const voted = rematchStatus?.votes?.includes(pid) ?? false;
                const isHost = pid === rematchHostId;
                return (
                  <div key={pid} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 0', borderBottom: '1px solid #f3f4f6',
                  }}>
                    <div style={{ fontSize: 18, width: 24, textAlign: 'center' }}>
                      {voted ? '✅' : '⏳'}
                    </div>
                    <span style={{
                      flex: 1, fontSize: 14,
                      color: voted ? '#111827' : '#9ca3af',
                      fontWeight: pid === playerId ? 700 : 400,
                    }}>
                      {playerNames[pid] ?? pid}
                      {pid === playerId ? ' (you)' : ''}
                    </span>
                    {isHost && voted && (
                      <span style={{
                        fontSize: 10, background: '#eff6ff', color: '#1d4ed8',
                        borderRadius: 20, padding: '2px 8px', fontWeight: 700,
                        border: '1px solid #bfdbfe',
                      }}>HOST</span>
                    )}
                    <span style={{ fontSize: 12, color: voted ? '#16a34a' : '#d1d5db', fontWeight: 600 }}>
                      {voted ? 'In!' : '...'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Action button */}
            {!myVote ? (
              <button
                onClick={() => actions.voteRematch()}
                style={{
                  width: '100%', background: '#15803d', color: '#fff',
                  border: 'none', borderRadius: 12, padding: '14px',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 8,
                }}
              >
                Yes, Rematch! 🔁
              </button>
            ) : iAmHost ? (
              <button
                onClick={() => actions.beginRematch()}
                style={{
                  width: '100%', background: '#1d4ed8', color: '#fff',
                  border: 'none', borderRadius: 12, padding: '14px',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 8,
                }}
              >
                Begin Rematch ({voteCount} player{voteCount !== 1 ? 's' : ''}) 🚀
              </button>
            ) : (
              <div style={{
                textAlign: 'center', fontSize: 13, color: '#6b7280',
                padding: '10px 0', marginBottom: 8,
              }}>
                {rematchHostId
                  ? `Waiting for ${playerNames[rematchHostId] ?? 'host'} to start…`
                  : voteCount >= 1
                    ? 'Waiting for more players…'
                    : 'Waiting for others to vote…'}
              </div>
            )}
          </div>

          <button
            onClick={() => { clearSession(); window.location.reload(); }}
            style={{
              width: '100%', background: '#f3f4f6', color: '#6b7280',
              border: 'none', borderRadius: 12, padding: '12px',
              fontSize: 14, cursor: 'pointer',
            }}
          >
            🏠 Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── In Game ─────────────────────────────────────────────
  if (gameState) return (
    <GameBoard
      gameState={gameState}
      playerId={playerId}
      playerNames={Object.fromEntries(
        roomInfo?.players?.map(p => [p.id, p.name]) ?? []
      )}
      actions={actions}
      resignedPlayer={resignedPlayer}
    />
  );

  // ── Lobby ────────────────────────────────────────────────
  if (roomInfo) return (
    <div style={{
      height: '100%',
      background: '#f3f4f6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 20,
        padding: '32px 24px',
        width: '100%',
        maxWidth: 380,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏠</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 4 }}>
            Room Code:
          </h1>
          <div style={{
            display: 'inline-block',
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 10,
            padding: '6px 16px',
            fontSize: 20,
            fontWeight: 800,
            color: '#0369a1',
            letterSpacing: '0.15em',
          }}>
            {roomCode}
          </div>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>
            Share this code with friends
          </p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginBottom: 10, letterSpacing: '0.06em' }}>
            PLAYERS ({roomInfo.players.length}/5)
          </div>
          {roomInfo.players.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 0',
              borderBottom: '1px solid #f3f4f6',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: p.id === roomInfo.hostId ? '#1d4ed8' : '#6b7280',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {p.name[0].toUpperCase()}
              </div>
              <span style={{ fontSize: 16, fontWeight: 500, color: '#111827' }}>{p.name}</span>
              {p.id === roomInfo.hostId && (
                <span style={{
                  marginLeft: 'auto', fontSize: 11, background: '#fef3c7',
                  color: '#92400e', borderRadius: 20, padding: '2px 8px',
                  fontWeight: 600, border: '1px solid #f59e0b',
                }}>host</span>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {playerId === roomInfo.hostId ? (
          <button
            onClick={actions.startGame}
            disabled={roomInfo.players.length < 2}
            style={{
              width: '100%', background: roomInfo.players.length < 2 ? '#d1d5db' : '#15803d',
              color: '#fff', border: 'none', borderRadius: 14, padding: '18px',
              fontSize: 17, fontWeight: 700, cursor: roomInfo.players.length < 2 ? 'not-allowed' : 'pointer',
            }}
          >
            {roomInfo.players.length < 2 ? 'Waiting for players...' : 'Start Game 🚀'}
          </button>
        ) : (
          <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 14, padding: '12px 0' }}>
            Waiting for host to start...
          </div>
        )}
      </div>
    </div>
  );

  // ── Home Screen ──────────────────────────────────────────
  return (
    <div style={{
      height: '100%',
      background: '#f3f4f6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 20,
        padding: '40px 24px',
        width: '100%',
        maxWidth: 380,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🏠</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111827', marginBottom: 4 }}>
            Property Deal
          </h1>
          <p style={{ fontSize: 14, color: '#9ca3af' }}>Multiplayer card game</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: connected ? '#16a34a' : '#dc2626',
            }} />
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              {connected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
            Your Name
          </label>
          <input
            style={{
              width: '100%', background: '#f9fafb',
              border: '2px solid #e5e7eb', borderRadius: 12,
              padding: '14px 16px', fontSize: 16, outline: 'none',
              color: '#111827',
            }}
            placeholder="Enter your name"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onFocus={e => e.target.style.borderColor = '#3b82f6'}
            onBlur={e => e.target.style.borderColor = '#e5e7eb'}
          />
        </div>

        {error && (
          <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button
          onClick={() => actions.createRoom(nameInput)}
          disabled={!connected || !nameInput.trim()}
          style={{
            width: '100%', background: !connected || !nameInput.trim() ? '#d1d5db' : '#15803d',
            color: '#fff', border: 'none', borderRadius: 14, padding: '18px',
            fontSize: 17, fontWeight: 700,
            cursor: !connected || !nameInput.trim() ? 'not-allowed' : 'pointer',
            marginBottom: 12,
          }}
        >
          Create Game
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>or join existing</span>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{
              flex: 1, background: '#f9fafb',
              border: '2px solid #e5e7eb', borderRadius: 12,
              padding: '14px 16px', fontSize: 16, outline: 'none',
              color: '#111827', textTransform: 'uppercase', letterSpacing: '0.1em',
            }}
            placeholder="Room code"
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase())}
            onFocus={e => e.target.style.borderColor = '#3b82f6'}
            onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            maxLength={5}
          />
          <button
            onClick={() => actions.joinRoom(codeInput, nameInput)}
            disabled={!connected || !nameInput.trim() || !codeInput.trim()}
            style={{
              background: !connected || !nameInput.trim() || !codeInput.trim() ? '#d1d5db' : '#1d4ed8',
              color: '#fff', border: 'none', borderRadius: 12,
              padding: '14px 20px', fontSize: 16, fontWeight: 700,
              cursor: !connected || !nameInput.trim() || !codeInput.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}