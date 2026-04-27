import Card, { getColorConfig } from './Card.jsx';
import { SET_SIZE } from '../game/cards.js';

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
    </div>
  );
}

function PropertyGroup({
  color, group, isYou, targetingMode, targetingType,
  onPropertyClick, onGroupClick, playerId, isMyTurn, onMoveWildcard, highlightCardIds,
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
              onClick={isCardTarget ? () => onPropertyClick?.(playerId, card) : undefined}
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