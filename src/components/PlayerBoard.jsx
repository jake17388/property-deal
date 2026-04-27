import { useState } from 'react';
import Card, { getColorConfig } from './Card.jsx';
import { SET_SIZE, RENT_VALUES, BUILDING_BONUS } from '../game/cards.js';

export default function PlayerBoard({
  player,
  playerName,
  isCurrentPlayer,
  isYou,
  completeSets,
  targetingMode,
  targetingType,
  onPropertyClick,
  onGroupClick,
  isMyTurn,
  onMoveWildcard,
  highlightCardIds,
}) {
  const [tooltipInfo, setTooltipInfo] = useState(null);

  const bankTotal = player.bank.reduce((sum, c) => sum + (c.value ?? c.bankValue ?? 0), 0);
  const propertyEntries = Object.entries(player.properties ?? {});

  return (
    <div style={{
      background: '#fff',
      border: `2px solid ${isCurrentPlayer ? '#f59e0b' : isYou ? '#3b82f6' : '#e5e7eb'}`,
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: isYou ? '0 2px 12px rgba(59,130,246,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{
        background: isYou ? '#eff6ff' : '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: isYou ? '#3b82f6' : '#6b7280',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>
          {playerName?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
            {playerName}{isYou && <span style={{ color: '#3b82f6', fontSize: 12, marginLeft: 6 }}>you</span>}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            {completeSets}/3 sets · Bank: ${bankTotal}M
          </div>
        </div>
        {isCurrentPlayer && (
          <span style={{
            fontSize: 10, background: '#fef3c7', color: '#92400e',
            borderRadius: 20, padding: '2px 8px', fontWeight: 700, border: '1px solid #f59e0b',
          }}>TURN</span>
        )}
        {completeSets >= 3 && (
          <span style={{
            fontSize: 10, background: '#dcfce7', color: '#166534',
            borderRadius: 20, padding: '2px 8px', fontWeight: 700,
          }}>🏆 WINS</span>
        )}
      </div>

      <div style={{ padding: '8px 12px' }}>
        {/* Bank */}
        {player.bank.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 4, letterSpacing: '0.06em' }}>
              BANK · ${bankTotal}M
            </div>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {player.bank.map(card => (
                <Card key={card.id} card={card} small />
              ))}
            </div>
          </div>
        )}

        {/* Properties */}
        {propertyEntries.length > 0 ? (
          <div>
            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 6, letterSpacing: '0.06em' }}>
              PROPERTIES
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {propertyEntries.map(([color, group]) => (
                <PropertyGroup
                  key={color}
                  color={color}
                  group={group}
                  isYou={isYou}
                  targetingMode={targetingMode}
                  targetingType={targetingType}
                  onPropertyClick={onPropertyClick}
                  onGroupClick={onGroupClick}
                  playerId={player.id}
                  isMyTurn={isMyTurn}
                  onMoveWildcard={onMoveWildcard}
                  highlightCardIds={highlightCardIds}
                  onCardInfoClick={(color, group) => setTooltipInfo({ color, cardCount: group.cards.length, hasHouse: group.hasHouse, hasHotel: group.hasHotel })}
                />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#d1d5db', fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
            No properties yet
          </div>
        )}
      </div>

      {tooltipInfo && (
        <RentTooltip info={tooltipInfo} onClose={() => setTooltipInfo(null)} />
      )}
    </div>
  );
}

function PropertyGroup({
  color, group, isYou, targetingMode, targetingType,
  onPropertyClick, onGroupClick, playerId, isMyTurn, onMoveWildcard, highlightCardIds, onCardInfoClick,
}) {
  const cfg      = getColorConfig(color);
  const needed   = SET_SIZE[color] ?? 0;
  const have     = group.cards.length;
  const complete = have >= needed;

  const isGroupTarget =
    targetingMode &&
    !isYou &&
    targetingType === 'dealBreaker' &&
    complete;

  const isCardTarget =
    targetingMode && (
      (!isYou && (targetingType === 'slyDeal' || targetingType === 'forceDeal') && !complete) ||
      (isYou && targetingType === 'forceDealOwn')
    );

  return (
    <div
      onClick={isGroupTarget ? () => onGroupClick?.(playerId, color) : undefined}
      style={{
        background: isGroupTarget ? '#fef3c7' : complete ? '#f0fdf4' : '#f9fafb',
        border: `1.5px solid ${isGroupTarget ? '#f59e0b' : complete ? '#86efac' : '#e5e7eb'}`,
        borderRadius: 8,
        padding: '5px 6px',
        cursor: isGroupTarget ? 'pointer' : 'default',
        transition: 'all 0.15s',
        boxShadow: isGroupTarget ? '0 0 0 2px #f59e0b' : 'none',
      }}
    >
      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: cfg.bg, flexShrink: 0,
        }} />
        <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 600 }}>
          {cfg.label}
        </span>
        <span style={{
          fontSize: 9,
          color: complete ? '#16a34a' : '#9ca3af',
          marginLeft: 'auto',
          fontWeight: complete ? 700 : 400,
        }}>
          {have}/{needed}
        </span>
      </div>

      {/* Building badges */}
      {(group.hasHouse || group.hasHotel) && (
        <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
          {group.hasHouse && (
            <span style={{ fontSize: 8, background: '#dcfce7', color: '#166534', borderRadius: 4, padding: '1px 4px', border: '1px solid #86efac' }}>
              🏠 +$3M
            </span>
          )}
          {group.hasHotel && (
            <span style={{ fontSize: 8, background: '#fee2e2', color: '#991b1b', borderRadius: 4, padding: '1px 4px', border: '1px solid #fca5a5' }}>
              🏨 +$4M
            </span>
          )}
        </div>
      )}

      {/* Cards */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {group.cards.map(card => (
          <div key={card.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Card
              card={card}
              small
              highlighted={isCardTarget || highlightCardIds?.has(card.id)}
              onClick={
                isCardTarget
                  ? () => onPropertyClick?.(playerId, card)
                  : () => onCardInfoClick?.(color, group)
              }
            />
            {isYou && isMyTurn && !targetingMode && card.type === 'wildcard' && card.colors?.length > 1 && (
              <button
                onClick={() => onMoveWildcard?.(card, color)}
                style={{
                  fontSize: 8,
                  background: '#f0f9ff',
                  color: '#0369a1',
                  border: '1px solid #bae6fd',
                  borderRadius: 4,
                  padding: '1px 5px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                move
              </button>
            )}
          </div>
        ))}
      </div>

      {isGroupTarget && (
        <div style={{ fontSize: 8, color: '#92400e', textAlign: 'center', marginTop: 4, fontWeight: 600 }}>
          TAP TO STEAL
        </div>
      )}
    </div>
  );
}

function RentTooltip({ info, onClose }) {
  const { color, cardCount, hasHouse, hasHotel } = info;
  const rentValues = RENT_VALUES[color] ?? [];
  const setSize    = SET_SIZE[color] ?? rentValues.length;
  const cfg        = getColorConfig(color);

  const baseRent    = rentValues[cardCount - 1] ?? 0;
  const houseBonus  = hasHouse ? BUILDING_BONUS.house : 0;
  const hotelBonus  = hasHotel ? BUILDING_BONUS.hotel : 0;
  const currentRent = baseRent + houseBonus + hotelBonus;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16,
          width: '100%', maxWidth: 260,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{ background: cfg.bg, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
            {cfg.label} — Rent
          </span>
          <span
            onClick={onClose}
            style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', lineHeight: 1 }}
          >×</span>
        </div>

        <div style={{ padding: '12px 16px' }}>
          {/* Rent rows */}
          {rentValues.map((rent, i) => {
            const level    = i + 1;
            const isActive = level === cardCount;
            const isFull   = level === setSize;
            return (
              <div
                key={i}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 10px', borderRadius: 8, marginBottom: 4,
                  background: isActive ? cfg.light : 'transparent',
                  border: `1.5px solid ${isActive ? cfg.bg : 'transparent'}`,
                  fontWeight: isActive ? 700 : 400,
                }}
              >
                <span style={{ fontSize: 13, color: '#374151' }}>
                  {level} card{level > 1 ? 's' : ''}{isFull ? ' ✓' : ''}
                </span>
                <span style={{ fontSize: 14, color: isActive ? cfg.bg : '#374151' }}>
                  ${rent}M{isActive ? ' ◀' : ''}
                </span>
              </div>
            );
          })}

          {/* House / Hotel */}
          <div style={{ marginTop: 8, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>
              BUILDINGS (full set only)
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { label: '🏠 House', bonus: BUILDING_BONUS.house, active: hasHouse },
                { label: '🏨 Hotel', bonus: BUILDING_BONUS.hotel, active: hasHotel },
              ].map(({ label, bonus, active }) => (
                <div
                  key={label}
                  style={{
                    flex: 1, padding: '5px 8px', borderRadius: 8, textAlign: 'center',
                    background: active ? cfg.light : '#f9fafb',
                    border: `1px solid ${active ? cfg.bg : '#e5e7eb'}`,
                  }}
                >
                  <div style={{ fontSize: 11, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: active ? cfg.bg : '#9ca3af' }}>
                    +${bonus}M
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Current total */}
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 10,
            background: '#f0fdf4', border: '1.5px solid #86efac',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>Current rent</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#15803d' }}>
              ${currentRent}M
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}