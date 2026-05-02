import { useState } from 'react';
import Card from './Card.jsx';
import { CARD_TYPE, SET_SIZE } from '../game/cards.js';

export default function Hand({
  cards,
  gameState,
  playerId,
  actions,
  actionsUsed,
  onEnterTargeting,
  onCancelTargeting,
  targetingMode,
  onEndTurn,
}) {
  const [selected, setSelected] = useState(null);

  const isMyTurn    = gameState.playerOrder[gameState.currentPlayerIndex] === playerId;
  const actionsLeft = 3 - actionsUsed;
  const opponents   = gameState.playerOrder.filter(id => id !== playerId);
  const hasDoubleRent = cards.some(c => c.action === 'doubleRent');
  const myProps     = gameState.players[playerId]?.properties ?? {};

  function selectCard(card) {
    if (!isMyTurn || targetingMode) return;
    setSelected(prev => prev?.id === card.id ? null : card);
  }

  function clearSelected() {
    setSelected(null);
  }

  function bankIt() {
    if (!selected) return;
    actions.playCard(selected.id, 'bank', {});
    clearSelected();
  }

  function playToProperty(color) {
    if (!selected) return;
    actions.playCard(selected.id, 'property', { targetColor: color });
    clearSelected();
  }

  function playAction(opts = {}) {
    if (!selected) return;
    actions.playCard(selected.id, 'action', opts);
    clearSelected();
  }

  function enterTargeting(type, opts = {}) {
    if (!selected) return;
    onEnterTargeting?.({ card: selected, type, ...opts });
    clearSelected();
  }

  // ── Action bar options for the selected card ──────────────
  function getActionOptions() {
    if (!selected) return [];
    const card = selected;
    const opts = [];

    if (card.type === CARD_TYPE.MONEY) {
      opts.push({ label: `Bank $${card.value}M`, color: '#15803d', onPress: bankIt });
      return opts;
    }

    if (card.type === CARD_TYPE.PROPERTY) {
      opts.push({ label: `Play to board`, color: '#1d4ed8', onPress: () => playToProperty(card.color) });
      return opts;
    }

    if (card.type === CARD_TYPE.WILDCARD) {
      card.colors.forEach(c => {
        opts.push({ label: `→ ${c}`, color: '#7c3aed', onPress: () => playToProperty(c) });
      });
      if (card.canPayDebt !== false) {
        opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
      }
      return opts;
    }

    if (card.type === CARD_TYPE.RENT) {
      const myRentColors = card.colors.filter(c => myProps[c]?.cards?.length > 0);
      if (myRentColors.length === 0) {
        opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
        return opts;
      }
      myRentColors.forEach(c => {
        if (card.allPlayers) {
          opts.push({
            label: `Charge ${c} rent`,
            color: '#be185d',
            onPress: () => playAction({ rentColor: c }),
          });
          if (hasDoubleRent) {
            opts.push({
              label: `2× ${c} rent`,
              color: '#9d174d',
              onPress: () => playAction({ rentColor: c, doubleRent: true }),
            });
          }
        } else {
          opponents.forEach(tid => {
            const name = getPlayerName(gameState, tid);
            opts.push({
              label: `${c} → ${name}`,
              color: '#be185d',
              onPress: () => playAction({ rentColor: c, targetPlayerId: tid }),
            });
            if (hasDoubleRent) {
              opts.push({
                label: `2× ${c} → ${name}`,
                color: '#9d174d',
                onPress: () => playAction({ rentColor: c, targetPlayerId: tid, doubleRent: true }),
              });
            }
          });
        }
      });
      opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
      return opts;
    }

    if (card.type === CARD_TYPE.ACTION) {
      switch (card.action) {

        case 'passGo':
          opts.push({ label: 'Draw 2 cards', color: '#0369a1', onPress: () => playAction() });
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;

        case 'birthday':
          opts.push({ label: 'Everyone pays $2M', color: '#d97706', onPress: () => playAction() });
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;

        case 'doubleRent':
          opts.push({ label: 'Select a rent card first', color: '#9ca3af', onPress: () => {} });
          opts.push({ label: 'Bank it ($1M)', color: '#15803d', onPress: bankIt });
          break;

        case 'debtCollector':
          opponents.forEach(tid => {
            opts.push({
              label: `Collect $5M from ${getPlayerName(gameState, tid)}`,
              color: '#dc2626',
              onPress: () => playAction({ targetPlayerId: tid }),
            });
          });
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;

        case 'slyDeal':
          opts.push({
            label: '👆 Tap a property to steal',
            color: '#dc2626',
            onPress: () => enterTargeting('slyDeal'),
          });
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;

        case 'forceDeal': {
          const myPropCards = Object.values(myProps).flatMap(g => g.cards);
          if (myPropCards.length === 0) {
            opts.push({ label: 'No properties to offer', color: '#9ca3af', onPress: () => {} });
          } else {
            opts.push({
              label: '👆 Tap a property to swap',
              color: '#7c3aed',
              onPress: () => enterTargeting('forceDeal'),
            });
          }
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;
        }

        case 'dealBreaker':
          opts.push({
            label: '👆 Tap a complete set to steal',
            color: '#991b1b',
            onPress: () => enterTargeting('dealBreaker'),
          });
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;

        case 'house': {
          const eligible = Object.entries(myProps)
            .filter(([c, g]) => g.cards.length >= (SET_SIZE[c] ?? 99) && !g.hasHouse && c !== 'railroad' && c !== 'utility')
            .map(([c]) => c);
          if (eligible.length === 0) {
            opts.push({ label: 'No eligible sets', color: '#9ca3af', onPress: () => {} });
          } else {
            eligible.forEach(c => opts.push({
              label: `House on ${c}`,
              color: '#15803d',
              onPress: () => playAction({ targetColor: c }),
            }));
          }
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;
        }

        case 'hotel': {
          const eligible = Object.entries(myProps)
            .filter(([c, g]) => g.hasHouse && !g.hasHotel && c !== 'railroad' && c !== 'utility')
            .map(([c]) => c);
          if (eligible.length === 0) {
            opts.push({ label: 'No sets with a house', color: '#9ca3af', onPress: () => {} });
          } else {
            eligible.forEach(c => opts.push({
              label: `Hotel on ${c}`,
              color: '#dc2626',
              onPress: () => playAction({ targetColor: c }),
            }));
          }
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;
        }

        default:
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
      }
    }

    return opts;
  }

  const actionOptions = getActionOptions();

  return (
    <div style={{
      background: '#fff',
      borderTop: '2px solid #e5e7eb',
    }}>
      {/* Action bar — shown when a card is selected */}
      {selected && isMyTurn && (
        <div style={{
          borderBottom: '1px solid #e5e7eb',
          padding: '10px 12px',
          background: '#f8fafc',
        }}>
          <div style={{
            fontSize: 12,
            color: '#6b7280',
            marginBottom: 8,
            fontWeight: 500,
          }}>
            Playing: <strong style={{ color: '#111827' }}>{selected.name ?? `$${selected.value}M`}</strong>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {actionOptions.map((opt, i) => (
              <button
                key={i}
                onClick={opt.onPress}
                style={{
                  background: opt.color,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 20,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={clearSelected}
              style={{
                background: 'transparent',
                color: '#9ca3af',
                border: '1px solid #e5e7eb',
                borderRadius: 20,
                padding: '6px 14px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Hand header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px 4px',
      }}>
        <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>
          HAND · {cards.length} cards
        </span>
        {isMyTurn && (
          <span style={{
            fontSize: 11,
            color: actionsLeft > 0 ? '#15803d' : '#dc2626',
            fontWeight: 600,
          }}>
            {actionsLeft} action{actionsLeft !== 1 ? 's' : ''} left
          </span>
        )}
        {isMyTurn && (
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
        )}
      </div>

      {/* Cards row */}
      <div style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        padding: '6px 12px 12px',
        WebkitOverflowScrolling: 'touch',
      }}>
        {cards.map(card => (
          <Card
            key={card.id}
            card={card}
            selected={selected?.id === card.id}
            dimmed={targetingMode || (!isMyTurn)}
            onClick={isMyTurn && !targetingMode ? selectCard : undefined}
          />
        ))}
        {cards.length === 0 && (
          <span style={{ fontSize: 12, color: '#d1d5db', fontStyle: 'italic', padding: '8px 0' }}>
            No cards in hand
          </span>
        )}
      </div>
    </div>
  );
}

function getPlayerName(gameState, playerId) {
  return gameState.playerNames?.[playerId] ?? playerId?.slice(0, 6) ?? 'Player';
}