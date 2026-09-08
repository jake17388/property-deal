import { useState, useMemo, useRef, useEffect } from 'react';
import Tile from './Tile.jsx';
import TileRack from './TileRack.jsx';
import WinCard from './WinCard.jsx';
import { HANDS_BY_ID, SLOT_COLOR } from '../../game/mahjong/card.js';
import { claimOptions, winningHandIds, handProgress } from '../../game/mahjong/match.js';
import { passTargetIndex } from '../../game/mahjong/engine.js';
import { TILE_KIND } from '../../game/mahjong/tiles.js';

const PASS_SIZE = 3;

export default function MahjongBoard({ gameState, playerId, playerNames, actions, resignedPlayer }) {
  // Tile selection belongs to one moment of the game — the Charleston pass in
  // progress, or the discard you're about to make. Tagging it with that moment
  // means it falls away on its own when play moves on.
  const [selection,   setSelection]   = useState({ key: '', ids: [] });
  const [showCard,    setShowCard]    = useState(false);
  const [showLog,     setShowLog]     = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [blankMode,   setBlankMode]   = useState(null); // id of the blank being spent
  const [error,       setError]       = useState(null);
  const pileRef = useRef(null);

  const me          = gameState.players[playerId];
  const order       = gameState.playerOrder;
  const n           = order.length;
  const myIndex     = order.indexOf(playerId);
  const currentId   = order[gameState.currentPlayerIndex];
  const isMyTurn    = currentId === playerId;
  const inCharleston = gameState.phase === 'charleston';

  const turnKey = [
    gameState.phase, gameState.turnStage,
    gameState.currentPlayerIndex, gameState.charleston?.round ?? 0,
  ].join(':');
  const selected = selection.key === turnKey ? selection.ids : [];

  function setSelected(update) {
    setSelection(prev => {
      const current = prev.key === turnKey ? prev.ids : [];
      return { key: turnKey, ids: typeof update === 'function' ? update(current) : update };
    });
  }

  const myTiles = useMemo(
    () => [...(me?.hand ?? []), ...(me?.exposures ?? []).flatMap(e => e.tiles)],
    [me]
  );
  const completedIds = useMemo(() => winningHandIds(myTiles), [myTiles]);
  const marked       = useMemo(() => me?.markedHands ?? [], [me?.markedHands]);

  const claimable = gameState.claimable;
  const claims    = useMemo(() => {
    if (!isMyTurn || inCharleston || gameState.turnStage !== 'draw' || !claimable) return [];
    return claimOptions(claimable.tile, me?.hand ?? [], marked);
  }, [isMyTurn, inCharleston, gameState.turnStage, claimable, me?.hand, marked]);

  // Tiles that arrived since your last discard, and where from — a drawn tile
  // gets sorted into the middle of the rack, so it needs pointing out.
  const newIds = useMemo(() => new Set(me?.justReceived ?? []), [me?.justReceived]);
  const newLabel = {
    wall: 'just drawn',
    pile: 'from the pile',
    pass: 'just received',
  }[me?.justReceivedFrom] ?? null;

  const myBlank = me?.hand?.find(t => t.kind === TILE_KIND.BLANK);
  const canUseBlank = !inCharleston && gameState.phase === 'playing'
    && gameState.turnStage === 'draw' && !!myBlank
    && gameState.discards.some(t => t.kind !== TILE_KIND.BLANK);

  // Keep the newest discard in view.
  useEffect(() => {
    if (pileRef.current) pileRef.current.scrollTop = pileRef.current.scrollHeight;
  }, [gameState.discards.length]);

  function name(pid) { return playerNames[pid] ?? gameState.playerNames?.[pid] ?? 'Player'; }

  function toggleTile(tile) {
    if (blankMode) return;
    if (inCharleston) {
      if (me?.passReady) return;
      setSelected(sel => sel.includes(tile.id)
        ? sel.filter(id => id !== tile.id)
        : sel.length >= PASS_SIZE ? sel : [...sel, tile.id]);
      return;
    }
    if (isMyTurn && gameState.turnStage === 'discard') {
      setSelected(sel => (sel[0] === tile.id ? [] : [tile.id]));
    }
  }

  function run(fn) {
    try { setError(null); fn(); } catch (e) { setError(e.message); }
  }

  function handlePileTile(tile) {
    if (!blankMode) return;
    if (tile.kind === TILE_KIND.BLANK) { setError('You cannot swap a blank for a blank.'); return; }
    actions.mjUseBlank(blankMode, tile.id);
    setBlankMode(null);
  }

  function toggleMarked(handId) {
    const next = marked.includes(handId) ? marked.filter(id => id !== handId) : [...marked, handId];
    actions.mjSetMarked(next);
  }

  // ── Status line ────────────────────────────────────────────
  let status, statusTone = 'idle';
  if (inCharleston) {
    const c      = gameState.charleston;
    const toId   = order[passTargetIndex(myIndex, c.round, n)];
    status = me?.passReady
      ? `Pass ${c.round + 1} of ${c.totalRounds} — waiting for the others…`
      : `Pass ${c.round + 1} of ${c.totalRounds} — pick 3 tiles for ${name(toId)}`;
    statusTone = me?.passReady ? 'idle' : 'active';
  } else if (isMyTurn) {
    status = gameState.turnStage === 'draw'
      ? (claims.length ? 'Your turn — claim the discard or draw' : 'Your turn — draw a tile')
      : 'Your turn — discard a tile';
    statusTone = 'active';
  } else {
    status = `${name(currentId)}'s turn`;
  }

  const opponents = order.filter(id => id !== playerId);

  return (
    <div style={{
      height: '100%', background: '#f3f4f6',
      display: 'flex', flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      maxWidth: 480, margin: '0 auto', position: 'relative', overflow: 'hidden',
    }}>

      {/* ── Top bar ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0, zIndex: 10,
      }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#111827' }}>🀄 Mah Jong</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontSize: 12, fontWeight: 600,
            background: statusTone === 'active' ? '#dcfce7' : '#f3f4f6',
            color:      statusTone === 'active' ? '#166534' : '#6b7280',
            borderRadius: 20, padding: '4px 12px',
            border: `1px solid ${statusTone === 'active' ? '#86efac' : '#e5e7eb'}`,
          }}>
            {isMyTurn && !inCharleston ? '✦ Your Turn' : inCharleston ? 'Charleston' : `${name(currentId)}'s turn`}
          </div>
          <button onClick={() => setShowLog(v => !v)} style={iconBtn(showLog)} title="Game log">📋</button>
          <button onClick={() => setShowSettings(true)} style={iconBtn(false)}>⚙️</button>
        </div>
      </div>

      {resignedPlayer && (
        <div style={{
          background: '#fef2f2', borderBottom: '1px solid #fca5a5', padding: '10px 16px',
          fontSize: 13, fontWeight: 600, color: '#dc2626', textAlign: 'center', flexShrink: 0,
        }}>
          {resignedPlayer} has resigned from the game
        </div>
      )}

      {/* ── Status banner ── */}
      <div style={{
        background: statusTone === 'active' ? '#ecfdf5' : '#fff',
        borderBottom: '1px solid #e5e7eb', padding: '8px 16px',
        fontSize: 13, fontWeight: 600,
        color: statusTone === 'active' ? '#166534' : '#6b7280',
        textAlign: 'center', flexShrink: 0,
      }}>
        {status}
      </div>

      {blankMode && (
        <div style={{
          background: '#fef3c7', borderBottom: '2px solid #f59e0b', padding: '10px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, zIndex: 9,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>
            👆 Pick a tile from the discard pile
          </span>
          <button onClick={() => setBlankMode(null)} style={{
            background: 'transparent', color: '#92400e', border: '1px solid #f59e0b',
            borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
          }}>Cancel</button>
        </div>
      )}

      {error && (
        <div style={{
          background: '#fef2f2', color: '#dc2626', padding: '8px 16px',
          fontSize: 12.5, textAlign: 'center', flexShrink: 0,
        }} onClick={() => setError(null)}>{error}</div>
      )}

      {/* ── Scrolling middle ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>

        {/* Discard pile */}
        <div style={{
          background: '#fff', borderRadius: 12, padding: '8px 10px', marginBottom: 8,
          border: blankMode ? '2px solid #f59e0b' : '1px solid #e5e7eb',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em' }}>
              DISCARD PILE ({gameState.discards.length})
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              🀫 {typeof gameState.wall === 'number' ? gameState.wall : gameState.wall.length} left in wall
            </span>
          </div>
          {gameState.discards.length === 0 ? (
            <div style={{ fontSize: 12, color: '#d1d5db', padding: '10px 0', textAlign: 'center' }}>
              Nothing discarded yet
            </div>
          ) : (
            <div ref={pileRef} style={{
              display: 'flex', gap: 4, flexWrap: 'wrap',
              maxHeight: 190, overflowY: 'auto', paddingBottom: 4,
            }}>
              {gameState.discards.map(t => (
                <Tile
                  key={t.id}
                  tile={t}
                  small
                  onClick={blankMode ? handlePileTile : undefined}
                  highlighted={!blankMode && claimable?.tile?.id === t.id && claims.length > 0}
                  dimmed={blankMode && t.kind === TILE_KIND.BLANK}
                />
              ))}
            </div>
          )}
        </div>

        {/* Opponents */}
        {opponents.map(pid => {
          const op = gameState.players[pid];
          if (!op) return null;
          const revealed = gameState.revealed;
          return (
            <div key={pid} style={{
              background: '#fff', borderRadius: 12, padding: '8px 10px', marginBottom: 8,
              border: pid === currentId ? '2px solid #86efac' : '1px solid #e5e7eb',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: op.exposures.length || gameState.revealed ? 6 : 0,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', background: '#6b7280',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>{name(pid)[0]?.toUpperCase()}</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{name(pid)}</span>
                {pid === gameState.dealerId && (
                  <span style={badge('#fef3c7', '#92400e', '#f59e0b')}>first</span>
                )}
                {inCharleston && (
                  <span style={badge(op.passReady ? '#dcfce7' : '#f3f4f6', op.passReady ? '#166534' : '#6b7280', '#e5e7eb')}>
                    {op.passReady ? 'ready' : 'choosing…'}
                  </span>
                )}
                <span style={{
                  marginLeft: 'auto', fontSize: 11, color: '#6b7280', fontWeight: 600,
                  background: '#f3f4f6', borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap',
                }}>
                  🀫 {op.hand.length}
                  {op.exposures.length > 0 && ` + ${op.exposures.reduce((k, e) => k + e.tiles.length, 0)} shown`}
                </span>
              </div>

              {/* A rack of face-down tiles says nothing a count doesn't, and it
                  pushes the discard pile off screen — so only what's public
                  gets drawn: their exposures, and their tiles once revealed. */}
              {(revealed || op.exposures.length > 0) && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {revealed && op.hand.map(t => <Tile key={t.id} tile={t} small />)}
                  {op.exposures.map((e, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 2, padding: 2,
                      background: '#f9fafb', borderRadius: 6, border: '1px dashed #d1d5db',
                    }}>
                      {e.tiles.map(t => <Tile key={t.id} tile={t} small />)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* My exposures */}
        {me?.exposures?.length > 0 && (
          <div style={{
            background: '#fff', borderRadius: 12, padding: '8px 10px', marginBottom: 8,
            border: '1px solid #e5e7eb',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', marginBottom: 6 }}>
              YOUR EXPOSURES
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {me.exposures.map((e, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 2, padding: 2,
                  background: '#f9fafb', borderRadius: 6, border: '1px dashed #d1d5db',
                }}>
                  {e.tiles.map(t => <Tile key={t.id} tile={t} small />)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Marked win conditions ── */}
      {marked.length > 0 && (
        <div style={{
          background: '#fff', borderTop: '1px solid #e5e7eb',
          padding: '6px 12px', flexShrink: 0, maxHeight: 108, overflowY: 'auto',
        }}>
          {marked.map(id => {
            const h = HANDS_BY_ID[id];
            if (!h) return null;
            const complete = completedIds.includes(id);
            return (
              <div key={id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px',
                borderRadius: 8, marginBottom: 3,
                background: complete ? '#fffbeb' : 'transparent',
                border: complete ? '1.5px solid #f59e0b' : '1.5px solid transparent',
              }}>
                <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                  {h.display.map((s, i) => (
                    <span key={i} style={{
                      color: SLOT_COLOR[s.s] ?? SLOT_COLOR[0],
                      fontWeight: s.s === 0 ? 400 : 800, fontSize: 12,
                      fontStyle: s.s === 0 ? 'italic' : 'normal', whiteSpace: 'pre-wrap',
                    }}>{s.text}{i < h.display.length - 1 && s.s !== 0 ? ' ' : ''}</span>
                  ))}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 800, flexShrink: 0,
                  color: complete ? '#b45309' : '#9ca3af',
                }}>
                  {complete ? 'COMPLETE ★' : `${handProgress(h, myTiles)}/14`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── My rack ── */}
      <div style={{
        background: '#fff', borderTop: '1px solid #e5e7eb', padding: '8px 12px 6px', flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em' }}>
              YOUR RACK ({me?.hand?.length ?? 0})
            </span>
            <button
              onClick={() => run(() => actions.mjSort())}
              style={{
                background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 20,
                padding: '2px 9px', fontSize: 11, fontWeight: 600, color: '#6b7280',
                cursor: 'pointer',
              }}
              title="Sort your rack by suit and number"
            >⇅ Sort</button>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {newIds.size > 0 && newLabel && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 11, fontWeight: 700, color: '#1d4ed8',
                background: '#eff6ff', border: '1px solid #bfdbfe',
                borderRadius: 20, padding: '2px 9px',
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#fff', border: '1.5px solid #2563eb',
                }} />
                {newIds.size > 1 ? `${newIds.size} ${newLabel}` : newLabel}
              </span>
            )}
            {inCharleston && !me?.passReady && (
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                {selected.length}/{PASS_SIZE} selected
              </span>
            )}
          </span>
        </div>
        <TileRack
          tiles={me?.hand ?? []}
          selectedIds={selected}
          newIds={newIds}
          onSelect={toggleTile}
          onReorder={ids => actions.mjReorder(ids)}
        />
      </div>

      {/* ── Action bar ── */}
      <div style={{
        background: '#fff', borderTop: '1px solid #e5e7eb',
        padding: '8px 12px 12px', flexShrink: 0,
        display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        <button onClick={() => setShowCard(true)} style={btn('#7c3aed', 1)}>
          🀄 Card{marked.length ? ` (${marked.length})` : ''}
        </button>

        {completedIds.length > 0 && gameState.phase === 'playing' && (
          <button onClick={() => run(() => actions.mjDeclare())} style={{ ...btn('#b45309', 1), flexBasis: '100%' }}>
            🎉 MAH JONG!
          </button>
        )}

        {inCharleston && !me?.passReady && (
          <button
            onClick={() => run(() => actions.mjConfirmPass(selected))}
            disabled={selected.length !== PASS_SIZE}
            style={btn(selected.length === PASS_SIZE ? '#15803d' : '#d1d5db', 1.4)}
          >
            Pass {PASS_SIZE} Tiles
          </button>
        )}

        {!inCharleston && isMyTurn && gameState.turnStage === 'draw' && (
          <>
            {claims.map(o => (
              <button key={o.size} onClick={() => run(() => actions.mjClaim(o.size))} style={btn('#1d4ed8', 1)}>
                Claim ×{o.size}{o.jokersUsed ? ` (${o.jokersUsed}J)` : ''}
              </button>
            ))}
            <button onClick={() => run(() => actions.mjDraw())} style={btn('#15803d', 1)}>
              Draw Tile
            </button>
          </>
        )}

        {!inCharleston && isMyTurn && gameState.turnStage === 'discard' && (
          <button
            onClick={() => run(() => actions.mjDiscard(selected[0]))}
            disabled={!selected[0]}
            style={btn(selected[0] ? '#dc2626' : '#d1d5db', 1.4)}
          >
            {selected[0] ? 'Discard Tile' : 'Select a tile to discard'}
          </button>
        )}

        {canUseBlank && !blankMode && (
          <button onClick={() => setBlankMode(myBlank.id)} style={btn('#6b7280', 1)}>
            ⬜ Use Blank
          </button>
        )}
      </div>

      {showCard && (
        <WinCard
          tiles={myTiles}
          marked={marked}
          completedIds={completedIds}
          onToggle={toggleMarked}
          onClose={() => setShowCard(false)}
        />
      )}

      {showLog && <GameLog entries={gameState.log ?? []} onClose={() => setShowLog(false)} />}
      {showSettings && (
        <SettingsSheet
          onClose={() => setShowSettings(false)}
          onResign={() => {
            if (window.confirm('Are you sure you want to resign?')) {
              actions.resignGame();
              setShowSettings(false);
            }
          }}
        />
      )}
    </div>
  );
}

// ── Styling helpers ──────────────────────────────────────────

function btn(color, grow) {
  return {
    flex: `${grow} 1 auto`, background: color, color: '#fff', border: 'none',
    borderRadius: 12, padding: '13px 14px', fontSize: 14, fontWeight: 700,
    cursor: color === '#d1d5db' ? 'not-allowed' : 'pointer',
  };
}

function iconBtn(active) {
  return {
    background: active ? '#ede9fe' : '#f3f4f6',
    border: active ? '1px solid #c4b5fd' : 'none',
    borderRadius: 10, width: 36, height: 36, fontSize: 18, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

function badge(bg, color, border) {
  return {
    fontSize: 10, background: bg, color, borderRadius: 20,
    padding: '2px 8px', fontWeight: 600, border: `1px solid ${border}`,
  };
}

function SettingsSheet({ onClose, onResign }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(17,24,39,0.45)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '16px 16px 0 0', width: '100%',
        maxWidth: 480, padding: '24px 20px 40px',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
          ⚙️ Settings
        </div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>Game options</div>
        <button onClick={onResign} style={{
          width: '100%', background: '#fef2f2', color: '#dc2626',
          border: '2px solid #fca5a5', borderRadius: 14, padding: '16px',
          fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
        }}>🏳️ Resign Game</button>
        <button onClick={onClose} style={{
          width: '100%', background: '#f3f4f6', color: '#6b7280',
          border: 'none', borderRadius: 14, padding: '16px',
          fontSize: 16, fontWeight: 600, cursor: 'pointer',
        }}>Close</button>
      </div>
    </div>
  );
}

function GameLog({ entries, onClose }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#1e1b2e', borderRadius: '20px 20px 0 0', maxHeight: '60%',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#e5e7eb' }}>📋 Game Log</span>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
            color: '#9ca3af', fontSize: 18, width: 30, height: 30, cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 16px', flex: 1 }}>
          {entries.length === 0
            ? <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Nothing yet.</div>
            : [...entries].reverse().map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 0' }}>
                <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>
                  {new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.4 }}>{e.message}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
