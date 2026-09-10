import { useState } from 'react';
import Card, { getColorConfig } from './Card.jsx';
import { useDragSource, useDropZone } from '../hooks/useDragDrop.js';
import { bankValueOf, dropZone, isSetComplete } from '../game/dropRules.js';
import { SET_SIZE, RENT_VALUES, BUILDING_BONUS, CARD_TYPE } from '../game/cards.js';

export default function PlayerBoard({
  player,
  playerName,
  isCurrentPlayer,
  isYou,
  completeSets,
  targetingMode,
  targetingType,
  onPropertyClick,
  isMyTurn,
  highlightCardIds,
  dropCtx,
}) {
  const [tooltipInfo, setTooltipInfo] = useState(null);
  const [bankOpen,    setBankOpen]    = useState(false);

  const bankTotal = player.bank.reduce((sum, c) => sum + bankValueOf(c), 0);
  const propertyEntries = Object.entries(player.properties ?? {});

  // The whole board is a drop target: your own for playing cards, an
  // opponent's for the cards you play at them.
  const boardSpec = isYou
    ? { kind: 'myBoard', playerId: player.id }
    : { kind: 'opponent', playerId: player.id, completeCount: completeSets };
  const {
    attach: boardAttach, isOver: boardOver, eligible: boardEligible,
  } = useDropZone(dropZone(boardSpec, dropCtx), !!dropCtx);

  return (
    <div
      ref={boardAttach}
      data-zone={isYou ? 'myBoard' : 'opponent'}
      data-player={player.id}
      style={{
        background: '#fff',
        border: `2px solid ${
          boardOver ? '#f59e0b'
          : boardEligible ? '#93c5fd'
          : isCurrentPlayer ? '#f59e0b' : isYou ? '#3b82f6' : '#e5e7eb'}`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: boardOver
          ? '0 0 0 3px rgba(245,158,11,0.35)'
          : isYou ? '0 2px 12px rgba(59,130,246,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
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
            {completeSets}/3 sets · Hand: {player.handCount ?? player.hand?.length ?? 0}
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

      <div style={{ padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* Bank — one pile, not a row of cards */}
        <BankPile
          cards={player.bank}
          total={bankTotal}
          isYou={isYou}
          playerId={player.id}
          dropCtx={dropCtx}
          onOpen={() => player.bank.length > 0 && setBankOpen(true)}
        />

        {/* Properties */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {propertyEntries.length > 0 ? (
            <>
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
                    playerId={player.id}
                    isMyTurn={isMyTurn}
                    highlightCardIds={highlightCardIds}
                    dropCtx={dropCtx}
                    onCardInfoClick={(c, g) => setTooltipInfo({
                      color: c, cardCount: g.cards.length, hasHouse: g.hasHouse, hasHotel: g.hasHotel,
                    })}
                  />
                ))}
              </div>
            </>
          ) : (
            <div style={{
              fontSize: 12, color: '#d1d5db', fontStyle: 'italic',
              textAlign: 'center', padding: '18px 0',
            }}>
              {isYou && boardEligible ? 'Drop here to play' : 'No properties yet'}
            </div>
          )}
        </div>
      </div>

      {tooltipInfo && <RentTooltip info={tooltipInfo} onClose={() => setTooltipInfo(null)} />}
      {bankOpen && (
        <BankModal
          cards={player.bank}
          total={bankTotal}
          playerName={playerName}
          onClose={() => setBankOpen(false)}
        />
      )}
    </div>
  );
}

// ── Bank pile ─────────────────────────────────────────────────

// Every banked card lives in one stack. The top three or four are drawn
// slightly offset so the pile reads as a pile; tapping it lists the lot.
function BankPile({ cards, total, isYou, playerId, dropCtx, onOpen }) {
  const { attach, isOver, eligible } = useDropZone(
    dropZone({ kind: 'bank', playerId }, dropCtx),
    isYou && !!dropCtx,
  );
  const shown = cards.slice(-4);
  const empty = cards.length === 0;

  return (
    <div
      ref={isYou ? attach : undefined}
      data-zone="bank"
      data-player={playerId}
      onClick={onOpen}
      style={{
        width: 62, flexShrink: 0,
        borderRadius: 10,
        padding: '5px 4px 4px',
        background: isOver ? '#fffbeb' : empty ? '#f9fafb' : '#f0fdf4',
        border: `1.5px ${empty && !isOver ? 'dashed' : 'solid'} ${
          isOver ? '#f59e0b' : eligible ? '#93c5fd' : empty ? '#e5e7eb' : '#86efac'}`,
        boxShadow: isOver ? '0 0 0 3px rgba(245,158,11,0.3)' : 'none',
        cursor: empty ? 'default' : 'pointer',
        textAlign: 'center',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
      }}
    >
      <div style={{ fontSize: 8, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.08em' }}>
        BANK
      </div>

      <div style={{ position: 'relative', height: 62, marginTop: 3 }}>
        {empty ? (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: '#d1d5db', lineHeight: 1.2, padding: '0 2px',
          }}>
            {isYou ? 'drop cards here' : 'empty'}
          </div>
        ) : shown.map((card, i) => (
          <div key={card.id} style={{
            position: 'absolute',
            left: 4 + i * 3,
            top: i * 3,
            zIndex: i,
          }}>
            <Card card={card} small />
          </div>
        ))}
        {cards.length > 1 && (
          <div style={{
            position: 'absolute', right: -2, top: -4, zIndex: 10,
            background: '#111827', color: '#fff', borderRadius: 20,
            fontSize: 9, fontWeight: 700, padding: '1px 5px',
          }}>
            ×{cards.length}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, fontWeight: 800, color: empty ? '#d1d5db' : '#15803d', marginTop: 3 }}>
        ${total}M
      </div>
    </div>
  );
}

function BankModal({ cards, total, playerName, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '16px 16px 0 0',
          width: '100%', maxWidth: 480, margin: '0 auto',
          padding: '20px 16px 32px', maxHeight: '70vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
              {playerName}'s bank
            </div>
            <div style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>
              {cards.length} card{cards.length !== 1 ? 's' : ''} · ${total}M
            </div>
          </div>
          <span onClick={onClose} style={{ fontSize: 22, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>×</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {cards.map(card => <Card key={card.id} card={card} />)}
        </div>
      </div>
    </div>
  );
}

// ── Property groups ───────────────────────────────────────────

function PropertyGroup({
  color, group, isYou, targetingMode, targetingType,
  onPropertyClick, playerId, isMyTurn, highlightCardIds, onCardInfoClick, dropCtx,
}) {
  const cfg      = getColorConfig(color);
  const needed   = SET_SIZE[color] ?? 0;
  const have     = group.cards.length;
  const complete = isSetComplete(color, group);

  const { attach, isOver, eligible } = useDropZone(
    dropZone(
      isYou
        ? { kind: 'mySet', playerId, color }
        : { kind: 'oppSet', playerId, color, complete },
      dropCtx,
    ),
    !!dropCtx,
  );

  // Force Deal's second step still works by tapping one of your own properties.
  const isCardTarget = targetingMode && isYou && targetingType === 'forceDealOwn';

  return (
    <div
      ref={attach}
      data-zone={isYou ? 'mySet' : 'oppSet'}
      data-player={playerId}
      data-color={color}
      style={{
        background: isOver ? '#fffbeb' : complete ? '#f0fdf4' : '#f9fafb',
        border: `1.5px solid ${
          isOver ? '#f59e0b' : eligible ? '#93c5fd' : complete ? '#86efac' : '#e5e7eb'}`,
        borderRadius: 8,
        padding: '5px 6px',
        transition: 'all 0.15s',
        boxShadow: isOver ? '0 0 0 3px rgba(245,158,11,0.3)' : 'none',
      }}
    >
      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.bg, flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 600 }}>{cfg.label}</span>
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
          <BoardCard
            key={card.id}
            card={card}
            color={color}
            complete={complete}
            playerId={playerId}
            isYou={isYou}
            isMyTurn={isMyTurn}
            dropCtx={dropCtx}
            highlighted={isCardTarget || highlightCardIds?.has(card.id)}
            onTargetClick={isCardTarget ? () => onPropertyClick?.(playerId, card) : null}
            onInfoClick={() => onCardInfoClick?.(color, group)}
          />
        ))}
      </div>
    </div>
  );
}

// A card sitting on someone's board. On an opponent's board it is its own drop
// zone, so Sly Deal, Force Deal and Deal Breaker land on the card you mean. On
// yours, a wildcard can be picked up and dragged into another of your sets.
function BoardCard({
  card, color, complete, playerId, isYou, isMyTurn, dropCtx,
  highlighted, onTargetClick, onInfoClick,
}) {
  const { beginDrag, dragCard } = useDragSource();

  const { attach, isOver, eligible } = useDropZone(
    dropZone({
      kind: 'oppCard', playerId, color, cardId: card.id, complete, cardName: card.name,
    }, dropCtx),
    !isYou && !!dropCtx,
  );

  const draggable =
    isYou && isMyTurn && !onTargetClick &&
    card.type === CARD_TYPE.WILDCARD && (card.colors?.length ?? 0) > 1 &&
    !!dropCtx?.canMove;

  const beingDragged = dragCard?.id === card.id;

  return (
    <div
      ref={isYou ? undefined : attach}
      onPointerDown={draggable ? e => beginDrag(e, card, { from: 'board', color }, onInfoClick) : undefined}
      style={{
        position: 'relative',
        borderRadius: 8,
        touchAction: draggable ? 'none' : undefined,
        cursor: draggable ? 'grab' : undefined,
        opacity: beingDragged ? 0.3 : 1,
        boxShadow: isOver
          ? '0 0 0 3px #f59e0b'
          : eligible ? '0 0 0 2px #93c5fd' : 'none',
      }}
    >
      <Card
        card={card}
        small
        highlighted={highlighted}
        onClick={onTargetClick ?? (draggable ? undefined : onInfoClick)}
      />
      {draggable && (
        <span style={{
          position: 'absolute', bottom: -2, right: -2,
          background: '#0369a1', color: '#fff',
          borderRadius: 20, fontSize: 7, fontWeight: 700,
          padding: '0 3px', pointerEvents: 'none',
        }}>
          ⇄
        </span>
      )}
    </div>
  );
}

// ── Rent tooltip ──────────────────────────────────────────────

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
        <div style={{ background: cfg.bg, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
            {cfg.label} — Rent
          </span>
          <span onClick={onClose} style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', lineHeight: 1 }}>×</span>
        </div>

        <div style={{ padding: '12px 16px' }}>
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
