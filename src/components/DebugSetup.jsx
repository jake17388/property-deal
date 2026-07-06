import { useState } from 'react';
import { FULL_DECK, CARD_TYPE, COLOR } from '../game/cards.js';

// Color swatch for property/wildcard cards
const COLOR_DOT = {
  [COLOR.BROWN]:      '#92400e',
  [COLOR.LIGHT_BLUE]: '#0284c7',
  [COLOR.PINK]:       '#db2777',
  [COLOR.ORANGE]:     '#ea580c',
  [COLOR.RED]:        '#dc2626',
  [COLOR.YELLOW]:     '#ca8a04',
  [COLOR.GREEN]:      '#16a34a',
  [COLOR.DARK_BLUE]:  '#1d4ed8',
  [COLOR.RAILROAD]:   '#374151',
  [COLOR.UTILITY]:    '#6b7280',
};

const PLAYER_COLORS = ['#1d4ed8', '#7c3aed', '#be185d', '#ea580c', '#15803d'];

function colorDot(color, small) {
  const bg = COLOR_DOT[color] ?? '#9333ea';
  const size = small ? 8 : 10;
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      borderRadius: '50%', background: bg, flexShrink: 0,
      border: '1px solid rgba(0,0,0,0.15)',
    }} />
  );
}

const CARD_GROUPS = [
  {
    label: 'Properties',
    cards: FULL_DECK.filter(c => c.type === CARD_TYPE.PROPERTY),
    subgroup: c => c.color,
  },
  {
    label: 'Wildcards',
    cards: FULL_DECK.filter(c => c.type === CARD_TYPE.WILDCARD),
    subgroup: c => c.colors?.join('/') ?? 'wild',
  },
  {
    label: 'Action Cards',
    cards: FULL_DECK.filter(c => c.type === CARD_TYPE.ACTION),
    subgroup: c => c.action,
  },
  {
    label: 'Rent Cards',
    cards: FULL_DECK.filter(c => c.type === CARD_TYPE.RENT),
    subgroup: c => c.name,
  },
  {
    label: 'Money',
    cards: FULL_DECK.filter(c => c.type === CARD_TYPE.MONEY),
    subgroup: c => `$${c.value}M`,
  },
];

function cardLabel(card) {
  if (card.type === CARD_TYPE.MONEY) return `$${card.value}M`;
  return card.name ?? card.id;
}

function cardValue(card) {
  return card.bankValue ?? card.value ?? 0;
}

export default function DebugSetup({ players, onStart, onCancel }) {
  // assignments[cardId] = playerId | null
  const [assignments, setAssignments] = useState({});
  const [collapsed, setCollapsed]     = useState({});

  function assign(cardId, playerId) {
    setAssignments(prev => ({
      ...prev,
      [cardId]: prev[cardId] === playerId ? null : playerId,
    }));
  }

  function clearAll()     { setAssignments({}); }
  function clearPlayer(pid) {
    setAssignments(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => { if (next[id] === pid) next[id] = null; });
      return next;
    });
  }

  function getHand(pid) {
    return FULL_DECK.filter(c => assignments[c.id] === pid);
  }

  function handleStart() {
    const hands = {};
    players.forEach(p => { hands[p.id] = getHand(p.id).map(c => c.id); });
    onStart(hands);
  }

  function toggleGroup(label) {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#111827', zIndex: 100,
      display: 'flex', flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#f9fafb',
      overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        background: '#1f2937', borderBottom: '1px solid #374151',
        padding: '14px 20px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <span style={{ fontSize: 20 }}>🔧</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#f9fafb' }}>Debug Setup</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              Assign cards to players — unassigned cards go in the deck
            </div>
          </div>
        </div>

        {/* Per-player hand counts */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {players.map((p, i) => {
            const count = getHand(p.id).length;
            return (
              <div key={p.id} style={{
                background: PLAYER_COLORS[i] + '22',
                border: `1px solid ${PLAYER_COLORS[i]}66`,
                borderRadius: 8, padding: '4px 12px',
                fontSize: 13, fontWeight: 700, color: PLAYER_COLORS[i],
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span>{p.name}</span>
                <span style={{
                  background: PLAYER_COLORS[i], color: '#fff',
                  borderRadius: 10, padding: '1px 7px', fontSize: 11,
                }}>{count}</span>
                {count > 0 && (
                  <button onClick={() => clearPlayer(p.id)} style={{
                    background: 'none', border: 'none', color: PLAYER_COLORS[i] + 'aa',
                    cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1,
                  }} title={`Clear ${p.name}'s hand`}>×</button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={clearAll} style={{
            background: '#374151', color: '#9ca3af', border: 'none',
            borderRadius: 8, padding: '8px 14px', fontSize: 13,
            cursor: 'pointer', fontWeight: 600,
          }}>
            Clear All
          </button>
          <button onClick={onCancel} style={{
            background: '#374151', color: '#9ca3af', border: 'none',
            borderRadius: 8, padding: '8px 14px', fontSize: 13,
            cursor: 'pointer', fontWeight: 600,
          }}>
            Cancel
          </button>
          <button onClick={handleStart} style={{
            background: '#15803d', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 18px', fontSize: 14,
            cursor: 'pointer', fontWeight: 700,
          }}>
            Start Game ▶
          </button>
        </div>
      </div>

      {/* ── Card List ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {CARD_GROUPS.map(group => {
          // Group cards by subgroup key
          const subgroups = {};
          group.cards.forEach(card => {
            const key = group.subgroup(card);
            if (!subgroups[key]) subgroups[key] = [];
            subgroups[key].push(card);
          });

          const isCollapsed = collapsed[group.label];

          return (
            <div key={group.label} style={{ marginBottom: 8 }}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.label)}
                style={{
                  width: '100%', background: '#1f2937',
                  border: '1px solid #374151', borderRadius: 8,
                  padding: '8px 14px', color: '#d1d5db',
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', marginBottom: isCollapsed ? 0 : 4,
                  fontSize: 13, fontWeight: 700,
                }}
              >
                <span style={{ fontSize: 11, color: '#6b7280', minWidth: 14 }}>
                  {isCollapsed ? '▶' : '▼'}
                </span>
                {group.label}
                <span style={{
                  marginLeft: 'auto', background: '#374151', borderRadius: 10,
                  padding: '1px 8px', fontSize: 11, color: '#9ca3af',
                }}>
                  {group.cards.length} cards
                </span>
              </button>

              {!isCollapsed && Object.entries(subgroups).map(([subKey, cards]) => (
                <div key={subKey} style={{ marginBottom: 4 }}>
                  {/* Subgroup label */}
                  <div style={{
                    fontSize: 11, color: '#6b7280', fontWeight: 600,
                    padding: '4px 8px', letterSpacing: '0.05em',
                    display: 'flex', alignItems: 'center', gap: 6,
                    textTransform: 'uppercase',
                  }}>
                    {group.label === 'Properties' && colorDot(subKey, true)}
                    {group.label === 'Wildcards' && (
                      <span style={{ fontSize: 9 }}>
                        {subKey.split('/').map((c, i) => (
                          <span key={i}>{i > 0 && '/'}{<span style={{ color: COLOR_DOT[c] ?? '#9333ea' }}>■</span>}</span>
                        ))}
                      </span>
                    )}
                    {subKey}
                  </div>

                  {/* Cards in this subgroup */}
                  {cards.map(card => {
                    const assignedPid  = assignments[card.id] ?? null;
                    const assignedIdx  = players.findIndex(p => p.id === assignedPid);

                    return (
                      <div key={card.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 8px', borderRadius: 6,
                        background: assignedPid ? (PLAYER_COLORS[assignedIdx] + '12') : 'transparent',
                        marginBottom: 2,
                      }}>
                        {/* Color dot */}
                        <span style={{ width: 12, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                          {card.type === CARD_TYPE.PROPERTY && colorDot(card.color)}
                          {card.type === CARD_TYPE.WILDCARD && (
                            <span style={{ fontSize: 8, lineHeight: 1 }}>🃏</span>
                          )}
                          {card.type === CARD_TYPE.MONEY && (
                            <span style={{ fontSize: 10, color: '#15803d' }}>$</span>
                          )}
                          {card.type === CARD_TYPE.ACTION && (
                            <span style={{ fontSize: 10, color: '#0369a1' }}>▶</span>
                          )}
                          {card.type === CARD_TYPE.RENT && (
                            <span style={{ fontSize: 10, color: '#be185d' }}>¢</span>
                          )}
                        </span>

                        {/* Card name */}
                        <span style={{
                          flex: 1, fontSize: 13,
                          color: assignedPid ? '#f9fafb' : '#9ca3af',
                          fontWeight: assignedPid ? 600 : 400,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {cardLabel(card)}
                        </span>

                        {/* Bank value */}
                        <span style={{
                          fontSize: 11, color: '#6b7280',
                          minWidth: 32, textAlign: 'right', flexShrink: 0,
                        }}>
                          ${cardValue(card)}M
                        </span>

                        {/* Player assignment buttons */}
                        {players.map((p, i) => (
                          <button
                            key={p.id}
                            onClick={() => assign(card.id, p.id)}
                            title={`Assign to ${p.name}`}
                            style={{
                              background: assignments[card.id] === p.id
                                ? PLAYER_COLORS[i]
                                : '#374151',
                              color: assignments[card.id] === p.id ? '#fff' : '#6b7280',
                              border: 'none', borderRadius: 6,
                              padding: '3px 10px', fontSize: 12, fontWeight: 600,
                              cursor: 'pointer', flexShrink: 0,
                              transition: 'background 0.1s',
                            }}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
