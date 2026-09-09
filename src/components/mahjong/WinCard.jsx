import { useMemo } from 'react';
import { CATEGORIES, SLOT_COLOR } from '../../game/mahjong/card.js';
import { handProgress } from '../../game/mahjong/match.js';

// One printed row of the card: the hand written out in slot colours, its
// parenthetical note, and its point value.
function HandRow({ hand, marked, complete, progress, onToggle }) {
  return (
    <button
      onClick={() => onToggle(hand.id)}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px',
        borderRadius: 10,
        border: complete ? '2px solid #f59e0b' : marked ? '2px solid #1d4ed8' : '1px solid #e5e7eb',
        background: complete ? '#fffbeb' : marked ? '#eff6ff' : '#fff',
        marginBottom: 6,
      }}
    >
      <span style={{
        flexShrink: 0, width: 18, fontSize: 13, color: marked ? '#1d4ed8' : '#d1d5db',
      }}>{marked ? '★' : '☆'}</span>

      <span style={{ flex: 1, lineHeight: 1.45, minWidth: 0 }}>
        <span style={{ display: 'block' }}>
          {hand.display.map((s, i) => (
            <span key={i} style={{
              color: SLOT_COLOR[s.s] ?? SLOT_COLOR[0],
              fontWeight: s.s === 0 ? 400 : 800,
              fontSize: 13.5,
              fontStyle: s.s === 0 ? 'italic' : 'normal',
              whiteSpace: 'pre-wrap',
            }}>{s.text}{i < hand.display.length - 1 && s.s !== 0 ? ' ' : ''}</span>
          ))}
        </span>
        {hand.note && (
          <span style={{ display: 'block', fontSize: 10.5, color: '#6b7280', fontStyle: 'italic' }}>
            ({hand.note})
          </span>
        )}
      </span>

      <span style={{ flexShrink: 0, textAlign: 'right' }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#111827' }}>
          {hand.points}
        </span>
        {complete ? (
          <span style={{ fontSize: 9, fontWeight: 800, color: '#b45309' }}>COMPLETE</span>
        ) : (
          <span style={{ fontSize: 9, color: '#9ca3af' }}>{progress}/14</span>
        )}
      </span>
    </button>
  );
}

export default function WinCard({ tiles, marked, completedIds, onToggle, onClose }) {
  // Progress is only meaningful once there are tiles to measure.
  const progress = useMemo(() => {
    const out = {};
    for (const cat of CATEGORIES) {
      for (const h of cat.hands) out[h.id] = tiles?.length ? handProgress(h, tiles) : 0;
    }
    return out;
  }, [tiles]);

  const completed = new Set(completedIds ?? []);
  const markedSet = new Set(marked ?? []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 120,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', width: '100%', maxWidth: 480,
          height: '92%', borderRadius: '20px 20px 0 0',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 16px 10px', borderBottom: '1px solid #e5e7eb', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>
                American Mahjong
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                Timeless Play, Modern Spirit
              </div>
            </div>
            <button onClick={onClose} style={{
              background: '#f3f4f6', border: 'none', borderRadius: 8,
              width: 30, height: 30, fontSize: 18, cursor: 'pointer', color: '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}>×</button>
          </div>

          <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 8, lineHeight: 1.5 }}>
            Colour marks a suit, not a specific one: same colour = same suit, different colours =
            different suits.{' '}
            {[1, 2, 3].map(s => (
              <span key={s} style={{ color: SLOT_COLOR[s], fontWeight: 800, marginRight: 8 }}>
                suit {s}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: '#1d4ed8', marginTop: 6, fontWeight: 600 }}>
            Tap a hand to mark it — marked hands stay on screen under your rack.
          </div>
        </div>

        {/* Categories */}
        <div style={{ overflowY: 'auto', padding: '12px 14px 24px', flex: 1 }}>
          {CATEGORIES.map(cat => (
            <div key={cat.name} style={{ marginBottom: 18 }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 8,
                borderBottom: '1.5px solid #111827', paddingBottom: 4, marginBottom: 8,
              }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#111827', letterSpacing: '0.02em' }}>
                  {cat.name}
                </span>
                {cat.subtitle && (
                  <span style={{ fontSize: 10.5, color: '#6b7280', fontStyle: 'italic' }}>
                    ({cat.subtitle})
                  </span>
                )}
              </div>
              {cat.hands.map(h => (
                <HandRow
                  key={h.id}
                  hand={h}
                  marked={markedSet.has(h.id)}
                  complete={completed.has(h.id)}
                  progress={progress[h.id]}
                  onToggle={onToggle}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
