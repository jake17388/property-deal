import Tile from './Tile.jsx';
import { HANDS_BY_ID, SLOT_COLOR } from '../../game/mahjong/card.js';

// Shown on the game-over screen: everyone's tiles face up, plus the card hand
// the winner completed.
export default function MahjongReveal({ gameState, playerId, playerNames, winningHands = [] }) {
  if (!gameState || gameState.gameType !== 'mahjong') return null;

  const name = pid => playerNames?.[pid] ?? gameState.playerNames?.[pid] ?? 'Player';

  return (
    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginBottom: 20 }}>
      {winningHands.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#374151',
            textAlign: 'center', marginBottom: 8, letterSpacing: '0.04em',
          }}>WINNING HAND</div>
          {winningHands.map(id => {
            const h = HANDS_BY_ID[id];
            if (!h) return null;
            return (
              <div key={id} style={{
                background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: 10,
                padding: '8px 10px', marginBottom: 6, textAlign: 'center',
              }}>
                <div style={{ lineHeight: 1.4 }}>
                  {h.display.map((s, i) => (
                    <span key={i} style={{
                      color: SLOT_COLOR[s.s] ?? SLOT_COLOR[0],
                      fontWeight: s.s === 0 ? 400 : 800, fontSize: 13,
                      fontStyle: s.s === 0 ? 'italic' : 'normal', whiteSpace: 'pre-wrap',
                    }}>{s.text}{i < h.display.length - 1 && s.s !== 0 ? ' ' : ''}</span>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: '#92400e', marginTop: 2 }}>
                  {h.category} · {h.points} points
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        fontSize: 12, fontWeight: 700, color: '#374151',
        textAlign: 'center', marginBottom: 10, letterSpacing: '0.04em',
      }}>FINAL HANDS</div>

      {gameState.playerOrder.map(pid => {
        const p = gameState.players[pid];
        if (!p) return null;
        return (
          <div key={pid} style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, marginBottom: 4,
              color: pid === gameState.winner ? '#b45309' : '#374151',
            }}>
              {name(pid)}{pid === playerId ? ' (you)' : ''}{pid === gameState.winner ? ' 🏆' : ''}
            </div>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {p.hand.map(t => <Tile key={t.id} tile={t} small />)}
              {p.exposures.map((e, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 2, padding: 2,
                  background: '#f9fafb', borderRadius: 6, border: '1px dashed #d1d5db',
                }}>
                  {e.tiles.map(t => <Tile key={t.id} tile={t} small />)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
