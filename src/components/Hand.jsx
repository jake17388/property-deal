import { useLayoutEffect, useRef, useState } from 'react';
import Card, { getColorConfig } from './Card.jsx';
import { useDragSource } from '../hooks/useDragDrop.js';
import { CARD_TYPE, SET_SIZE, RENT_VALUES } from '../game/cards.js';

// Width of a full-size card, and the narrowest slice of a card we'll settle
// for before giving up on fanning and letting the row scroll.
const CARD_W   = 72;
const MIN_STEP = 24;

// How far apart to place the cards so the whole hand fits the space it has.
// Cards overlap like a hand of real cards rather than scrolling: a scroller
// and a drag would be fighting over the same swipe, and you'd have to go
// looking for a card before you could play it.
function fanStep(count, width) {
  if (count < 2) return CARD_W;
  if (!width) return CARD_W + 6;
  return Math.min(CARD_W + 6, Math.max(MIN_STEP, (width - CARD_W) / (count - 1)));
}

// Your hand. Cards are played by dragging them onto the table — your bank,
// one of your sets, open board space, or an opponent — and tapping one shows
// what it does.
export default function Hand({
  cards,
  gameState,
  playerId,
  actions,
  actionsLeft,
  canPlay,
  targetingMode,
  onEndTurn,
}) {
  const [infoCard, setInfoCard] = useState(null);
  const [rowWidth, setRowWidth] = useState(0);
  const rowRef = useRef(null);
  const { beginDrag, dragCard } = useDragSource();

  const isMyTurn  = gameState.playerOrder[gameState.currentPlayerIndex] === playerId;
  const draggable = canPlay && !targetingMode;

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    setRowWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setRowWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const step = fanStep(cards.length, rowWidth);
  // Only a hand too big to fan even at the narrowest slice falls back to
  // scrolling, and then the swipe has to be shared with the drag again.
  const scrolls = rowWidth > 0 && CARD_W + (cards.length - 1) * step > rowWidth + 1;

  return (
    <div style={{ background: '#fff', borderTop: '2px solid #e5e7eb' }}>
      {/* Hand header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px 4px',
        gap: 8,
      }}>
        <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>
          HAND · {cards.length}
        </span>
        <span style={{ fontSize: 11, color: '#9ca3af', flex: 1, textAlign: 'center' }}>
          {draggable ? 'Drag a card onto the table to play it' : 'Tap a card to see what it does'}
        </span>
        {isMyTurn && (
          <>
            <span style={{
              fontSize: 11,
              color: actionsLeft > 0 ? '#15803d' : '#dc2626',
              fontWeight: 600,
            }}>
              {actionsLeft} left
            </span>
            <button
              onClick={onEndTurn ?? (() => actions.endTurn())}
              disabled={!!gameState.pendingAction}
              style={{
                background: gameState.pendingAction ? '#9ca3af' : '#1d4ed8',
                color: '#fff',
                border: 'none',
                borderRadius: 20,
                padding: '5px 16px',
                fontSize: 12,
                fontWeight: 700,
                cursor: gameState.pendingAction ? 'not-allowed' : 'pointer',
              }}
            >
              End Turn
            </button>
          </>
        )}
      </div>

      {/* Cards row — fanned so the whole hand fits; drag one out to play it */}
      <div ref={rowRef} data-hand style={{
        display: 'flex',
        overflowX: scrolls ? 'auto' : 'hidden',
        padding: '10px 12px 14px',
        WebkitOverflowScrolling: 'touch',
      }}>
        {cards.map((card, i) => {
          const beingDragged = dragCard?.id === card.id;
          return (
            <div
              key={card.id}
              onPointerDown={draggable ? e => beginDrag(e, card, { from: 'hand' }, setInfoCard) : undefined}
              onClick={draggable ? undefined : () => setInfoCard(card)}
              style={{
                flexShrink: 0,
                // Each card sits `step` from the last, overlapping the one
                // behind it. The right-hand card is whole; the rest show the
                // colour band and the start of their name.
                marginLeft: i === 0 ? 0 : step - CARD_W,
                zIndex: i,
                touchAction: draggable ? (scrolls ? 'pan-x' : 'none') : undefined,
                cursor: draggable ? 'grab' : 'pointer',
                opacity: beingDragged ? 0.25 : 1,
                transition: 'opacity 0.12s, margin-left 0.15s',
                filter: i > 0 && step < CARD_W ? 'drop-shadow(-2px 0 2px rgba(0,0,0,0.10))' : undefined,
              }}
            >
              <Card card={card} dimmed={!isMyTurn} />
            </div>
          );
        })}
        {cards.length === 0 && (
          <span style={{ fontSize: 12, color: '#d1d5db', fontStyle: 'italic', padding: '8px 0' }}>
            No cards in hand
          </span>
        )}
      </div>

      {infoCard && (
        <HandCardInfo
          card={infoCard}
          myProperties={gameState.players[playerId]?.properties ?? {}}
          onClose={() => setInfoCard(null)}
        />
      )}
    </div>
  );
}

// ── Hand Card Info (tap a card) ────────────────────────────────

function HandCardInfo({ card, myProperties, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16,
        width: '100%', maxWidth: 280,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        {card.type === CARD_TYPE.PROPERTY || card.type === CARD_TYPE.WILDCARD
          ? <PropertyCardInfo card={card} myProperties={myProperties} onClose={onClose} />
          : <ActionCardInfo card={card} onClose={onClose} />
        }
      </div>
    </div>
  );
}

function PropertyCardInfo({ card, myProperties, onClose }) {
  const colors = card.type === CARD_TYPE.WILDCARD ? card.colors : [card.color];

  return (
    <>
      {colors.map(color => {
        const cfg       = getColorConfig(color);
        const rentTable = RENT_VALUES[color] ?? [];
        const setSize   = SET_SIZE[color] ?? rentTable.length;
        const existing  = myProperties[color]?.cards.length ?? 0;
        const projected = Math.min(existing + 1, rentTable.length);

        return (
          <div key={color}>
            <div style={{ background: cfg.bg, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {card.name ?? cfg.label}
              </span>
              <span onClick={onClose} style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', lineHeight: 1 }}>×</span>
            </div>
            <div style={{ padding: '12px 16px' }}>
              {rentTable.map((rent, i) => {
                const level    = i + 1;
                const isActive = level === projected;
                const isFull   = level === setSize;
                return (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '5px 10px', borderRadius: 8, marginBottom: 4,
                    background: isActive ? cfg.light : 'transparent',
                    border: `1.5px solid ${isActive ? cfg.bg : 'transparent'}`,
                    fontWeight: isActive ? 700 : 400,
                  }}>
                    <span style={{ fontSize: 13, color: '#374151' }}>
                      {level} card{level > 1 ? 's' : ''}{isFull ? ' ✓' : ''}
                    </span>
                    <span style={{ fontSize: 14, color: isActive ? cfg.bg : '#374151' }}>
                      ${rent}M{isActive ? ' ◀' : ''}
                    </span>
                  </div>
                );
              })}
              <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
                {card.type === CARD_TYPE.WILDCARD ? `Can join: ${colors.join(' or ')}` : `Set size: ${setSize}`}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function ActionCardInfo({ card, onClose }) {
  const isRent = card.type === CARD_TYPE.RENT;

  let description = card.description;
  if (!description && isRent) {
    const allColors = card.colors.length >= 8;
    const colorStr  = allColors ? 'any color' : card.colors.join(' or ');
    const who       = card.allPlayers ? 'all players pay you' : 'one player of your choice pays';
    description = `Charge ${colorStr} rent — ${who}.`;
  }

  return (
    <>
      <div style={{
        background: '#1f2937', padding: '12px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#f9fafb' }}>
          {card.name ?? 'Card'}
        </span>
        <span onClick={onClose} style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', lineHeight: 1 }}>×</span>
      </div>
      <div style={{ padding: '16px' }}>
        <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.5, margin: '0 0 12px' }}>
          {description ?? 'No description available.'}
        </p>
        {card.bankValue != null && (
          <div style={{
            fontSize: 12, color: '#6b7280',
            background: '#f9fafb', borderRadius: 8, padding: '6px 10px',
            border: '1px solid #e5e7eb',
          }}>
            Bank value: <strong>${card.bankValue}M</strong>
          </div>
        )}
      </div>
    </>
  );
}
