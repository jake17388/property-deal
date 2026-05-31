import { useState, useEffect, useRef } from 'react';
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
  onCardPlayed,
}) {
  const [selected,  setSelected]  = useState(null);
  const [dragging,  setDragging]  = useState(null);  // { card, initX, initY } | null
  const [overZone,  setOverZone]  = useState(null);  // 'bank' | 'play' | null

  const cardRefs       = useRef({});
  const ghostRef       = useRef(null);
  const bankZoneRef    = useRef(null);
  const playZoneRef    = useRef(null);
  const pendingDragRef = useRef(null); // { card, startX, startY }
  const draggingRef    = useRef(null); // mirror of dragging for use in closures
  const cleanupRef     = useRef(null); // stores { onMove, onUp } for cleanup

  const isMyTurn    = gameState.playerOrder[gameState.currentPlayerIndex] === playerId;
  const actionsLeft = 3 - actionsUsed;
  const opponents   = gameState.playerOrder.filter(id => id !== playerId);
  const hasDoubleRent = cards.some(c => c.action === 'doubleRent');
  const myProps     = gameState.players[playerId]?.properties ?? {};

  // Keep draggingRef in sync for event-listener closures
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);

  // Cancel any in-progress drag when turn ends or targeting mode changes
  useEffect(() => {
    if (!isMyTurn || targetingMode) cancelDrag();
  }, [isMyTurn, targetingMode]);

  // Cleanup on unmount
  useEffect(() => () => cancelDrag(), []);

  function cancelDrag() {
    if (cleanupRef.current) {
      window.removeEventListener('pointermove', cleanupRef.current.onMove);
      window.removeEventListener('pointerup',   cleanupRef.current.onUp);
      cleanupRef.current = null;
    }
    pendingDragRef.current = null;
    draggingRef.current    = null;
    setDragging(null);
    setOverZone(null);
  }

  // ── Play helpers ──────────────────────────────────────────────

  function fireAnim(card) {
    const rect = cardRefs.current[card.id]?.getBoundingClientRect();
    onCardPlayed?.(card, rect ?? null);
  }

  function bankCard(card) {
    fireAnim(card);
    actions.playCard(card.id, 'bank', {});
    setSelected(null);
  }

  function playProperty(card, color) {
    fireAnim(card);
    actions.playCard(card.id, 'property', { targetColor: color });
    setSelected(null);
  }

  function playAction(card, opts = {}) {
    fireAnim(card);
    actions.playCard(card.id, 'action', opts);
    setSelected(null);
  }

  // Wrappers used by the action bar (operate on `selected`)
  function bankIt()             { if (selected) bankCard(selected); }
  function playToProperty(c)    { if (selected) playProperty(selected, c); }
  function playActionOpt(opts)  { if (selected) playAction(selected, opts); }

  function enterTargeting(type, opts = {}) {
    if (!selected) return;
    onEnterTargeting?.({ card: selected, type, ...opts });
    setSelected(null);
  }

  // ── Drag & Drop ───────────────────────────────────────────────

  // What drop zones to show for a given card
  function getDropZones(card) {
    if (card.type === CARD_TYPE.MONEY) {
      return [{ id: 'bank', label: `💰 Bank $${card.value}M`, color: '#15803d', light: '#dcfce7' }];
    }
    if (card.type === CARD_TYPE.PROPERTY) {
      return [{ id: 'play', label: '🏠 Play to Board', color: '#1d4ed8', light: '#dbeafe' }];
    }
    if (card.type === CARD_TYPE.WILDCARD) {
      const zones = [{ id: 'play', label: '🏠 Choose Color', color: '#7c3aed', light: '#ede9fe' }];
      if (card.canPayDebt !== false) {
        zones.push({ id: 'bank', label: `💰 Bank $${card.bankValue ?? card.value}M`, color: '#15803d', light: '#dcfce7' });
      }
      return zones;
    }
    if (card.type === CARD_TYPE.RENT) {
      const myRentColors = card.colors.filter(c => myProps[c]?.cards?.length > 0);
      const playLabel = myRentColors.length > 0 ? '🏦 Charge Rent' : '🏦 Charge Rent';
      return [
        { id: 'play', label: playLabel, color: '#be185d', light: '#fce7f3' },
        { id: 'bank', label: `💰 Bank $${card.bankValue ?? card.value}M`, color: '#15803d', light: '#dcfce7' },
      ];
    }
    // ACTION
    const playLabel = card.action === 'passGo'   ? '▶ Draw 2 Cards'
                    : card.action === 'birthday'  ? '▶ Everyone Pays'
                    : card.action === 'debtCollector' ? '▶ Collect $5M'
                    : card.action === 'slyDeal'   ? '▶ Steal Property'
                    : card.action === 'forceDeal' ? '▶ Force Swap'
                    : card.action === 'dealBreaker' ? '▶ Steal Full Set'
                    : card.action === 'house'     ? '▶ Add House'
                    : card.action === 'hotel'     ? '▶ Add Hotel'
                    : '▶ Use Card';
    return [
      { id: 'play', label: playLabel, color: '#0369a1', light: '#e0f2fe' },
      { id: 'bank', label: `💰 Bank $${card.bankValue ?? card.value}M`, color: '#15803d', light: '#dcfce7' },
    ];
  }

  function getHitZone(x, y) {
    for (const [id, ref] of [['bank', bankZoneRef], ['play', playZoneRef]]) {
      if (!ref.current) continue;
      const r = ref.current.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  }

  // Execute a drop on the given zone
  function executeDrop(card, zone) {
    if (zone === 'bank') { bankCard(card); return; }

    if (zone === 'play') {
      // Simple plays — execute directly without the action bar
      if (card.type === CARD_TYPE.PROPERTY) { playProperty(card, card.color); return; }
      if (card.type === CARD_TYPE.ACTION && card.action === 'passGo')   { playAction(card); return; }
      if (card.type === CARD_TYPE.ACTION && card.action === 'birthday') { playAction(card); return; }
      // Anything else (wildcard color pick, rent target, etc.) — fall into the action bar
      setSelected(card);
    }
  }

  function handlePointerDown(e, card) {
    if (!isMyTurn || targetingMode) return;
    // Only primary button (or touch)
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();

    pendingDragRef.current = { card, startX: e.clientX, startY: e.clientY };

    function onMove(me) {
      const x = me.clientX, y = me.clientY;

      // Activate drag once threshold exceeded
      if (pendingDragRef.current) {
        const { startX, startY } = pendingDragRef.current;
        if (Math.hypot(x - startX, y - startY) > 10) {
          const { card: c } = pendingDragRef.current;
          pendingDragRef.current = null;
          setDragging({ card: c, initX: x, initY: y });
          setSelected(null);
        }
        return;
      }

      if (!draggingRef.current) return;

      // Update ghost position via CSS custom properties (no React re-render)
      if (ghostRef.current) {
        ghostRef.current.style.setProperty('--gx', `${x}px`);
        ghostRef.current.style.setProperty('--gy', `${y}px`);
      }

      // Update drop-zone highlight (triggers re-render only when zone changes)
      const zone = getHitZone(x, y);
      setOverZone(prev => prev === zone ? prev : zone);
    }

    function onUp(ue) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
      cleanupRef.current = null;

      const wasPending = pendingDragRef.current;
      pendingDragRef.current = null;

      if (draggingRef.current) {
        const zone     = getHitZone(ue.clientX, ue.clientY);
        const dragCard = draggingRef.current.card;
        setDragging(null);
        setOverZone(null);
        if (zone) executeDrop(dragCard, zone);
        // else: released outside a zone — card snaps back, no action
      } else if (wasPending) {
        // No drag threshold reached → treat as a tap
        setSelected(prev => prev?.id === wasPending.card.id ? null : wasPending.card);
      }
    }

    cleanupRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
  }

  // ── Action bar options ────────────────────────────────────────
  function getActionOptions() {
    if (!selected) return [];
    const card = selected;
    const opts = [];

    if (card.type === CARD_TYPE.MONEY) {
      opts.push({ label: `Bank $${card.value}M`, color: '#15803d', onPress: bankIt });
      return opts;
    }

    if (card.type === CARD_TYPE.PROPERTY) {
      opts.push({ label: 'Play to board', color: '#1d4ed8', onPress: () => playToProperty(card.color) });
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
          opts.push({ label: `Charge ${c} rent`, color: '#be185d', onPress: () => playActionOpt({ rentColor: c }) });
          if (hasDoubleRent && actionsLeft > 1) {
            opts.push({ label: `2× ${c} rent`, color: '#9d174d', onPress: () => playActionOpt({ rentColor: c, doubleRent: true }) });
          }
        } else {
          opponents.forEach(tid => {
            const name = getPlayerName(gameState, tid);
            opts.push({ label: `${c} → ${name}`, color: '#be185d', onPress: () => playActionOpt({ rentColor: c, targetPlayerId: tid }) });
            if (hasDoubleRent && actionsLeft > 1) {
              opts.push({ label: `2× ${c} → ${name}`, color: '#9d174d', onPress: () => playActionOpt({ rentColor: c, targetPlayerId: tid, doubleRent: true }) });
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
          opts.push({ label: 'Draw 2 cards', color: '#0369a1', onPress: () => playActionOpt() });
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;
        case 'birthday':
          opts.push({ label: 'Everyone pays $2M', color: '#d97706', onPress: () => playActionOpt() });
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
              onPress: () => playActionOpt({ targetPlayerId: tid }),
            });
          });
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;
        case 'slyDeal':
          opts.push({ label: '👆 Tap a property to steal', color: '#dc2626', onPress: () => enterTargeting('slyDeal') });
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;
        case 'forceDeal': {
          const myPropCards = Object.values(myProps).flatMap(g => g.cards);
          if (myPropCards.length === 0) {
            opts.push({ label: 'No properties to offer', color: '#9ca3af', onPress: () => {} });
          } else {
            opts.push({ label: '👆 Tap a property to swap', color: '#7c3aed', onPress: () => enterTargeting('forceDeal') });
          }
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;
        }
        case 'dealBreaker':
          opts.push({ label: '👆 Tap a complete set to steal', color: '#991b1b', onPress: () => enterTargeting('dealBreaker') });
          opts.push({ label: 'Bank it', color: '#15803d', onPress: bankIt });
          break;
        case 'house': {
          const eligible = Object.entries(myProps)
            .filter(([c, g]) => g.cards.length >= (SET_SIZE[c] ?? 99) && !g.hasHouse && c !== 'railroad' && c !== 'utility')
            .map(([c]) => c);
          if (eligible.length === 0) {
            opts.push({ label: 'No eligible sets', color: '#9ca3af', onPress: () => {} });
          } else {
            eligible.forEach(c => opts.push({ label: `House on ${c}`, color: '#15803d', onPress: () => playActionOpt({ targetColor: c }) }));
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
            eligible.forEach(c => opts.push({ label: `Hotel on ${c}`, color: '#dc2626', onPress: () => playActionOpt({ targetColor: c }) }));
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
  const dropZones     = dragging ? getDropZones(dragging.card) : [];
  const bankZone      = dropZones.find(z => z.id === 'bank');
  const playZone      = dropZones.find(z => z.id === 'play');

  return (
    <div style={{ background: '#fff', borderTop: '2px solid #e5e7eb', position: 'relative' }}>

      {/* ── Action bar (tap-to-select flow) ── */}
      {selected && isMyTurn && (
        <div style={{ borderBottom: '1px solid #e5e7eb', padding: '10px 12px', background: '#f8fafc' }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, fontWeight: 500 }}>
            Playing: <strong style={{ color: '#111827' }}>{selected.name ?? `$${selected.value}M`}</strong>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {actionOptions.map((opt, i) => (
              <button key={i} onClick={opt.onPress} style={{
                background: opt.color, color: '#fff', border: 'none',
                borderRadius: 20, padding: '6px 14px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                {opt.label}
              </button>
            ))}
            <button onClick={() => setSelected(null)} style={{
              background: 'transparent', color: '#9ca3af',
              border: '1px solid #e5e7eb', borderRadius: 20,
              padding: '6px 14px', fontSize: 12, cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Drop zones (shown while dragging) ── */}
      {dragging && (
        <div style={{
          display: 'flex', gap: 8, padding: '8px 12px',
          borderBottom: '1px solid #e5e7eb',
          animation: 'fadeSlideUp 0.15s ease',
        }}>
          {bankZone && (
            <div ref={bankZoneRef} style={{
              flex: 1, height: 56, borderRadius: 14,
              border: `2px dashed ${overZone === 'bank' ? bankZone.color : '#d1d5db'}`,
              background: overZone === 'bank' ? bankZone.light : '#f9fafb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              color: overZone === 'bank' ? bankZone.color : '#9ca3af',
              transition: 'all 0.12s ease',
              transform: overZone === 'bank' ? 'scale(1.04)' : 'scale(1)',
              boxShadow: overZone === 'bank' ? `0 0 0 3px ${bankZone.color}33` : 'none',
              userSelect: 'none',
            }}>
              {bankZone.label}
            </div>
          )}
          {playZone && (
            <div ref={playZoneRef} style={{
              flex: 1, height: 56, borderRadius: 14,
              border: `2px dashed ${overZone === 'play' ? playZone.color : '#d1d5db'}`,
              background: overZone === 'play' ? playZone.light : '#f9fafb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              color: overZone === 'play' ? playZone.color : '#9ca3af',
              transition: 'all 0.12s ease',
              transform: overZone === 'play' ? 'scale(1.04)' : 'scale(1)',
              boxShadow: overZone === 'play' ? `0 0 0 3px ${playZone.color}33` : 'none',
              userSelect: 'none',
            }}>
              {playZone.label}
            </div>
          )}
        </div>
      )}

      {/* ── Hand header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px 4px',
      }}>
        <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>
          HAND · {cards.length} cards
        </span>
        {isMyTurn && (
          <span style={{ fontSize: 11, color: actionsLeft > 0 ? '#15803d' : '#dc2626', fontWeight: 600 }}>
            {actionsLeft} action{actionsLeft !== 1 ? 's' : ''} left
          </span>
        )}
        {isMyTurn && (
          <button
            onClick={onEndTurn ?? (() => actions.endTurn())}
            disabled={!!gameState.pendingAction}
            style={{
              background: gameState.pendingAction ? '#9ca3af' : '#1d4ed8',
              color: '#fff', border: 'none', borderRadius: 20,
              padding: '5px 16px', fontSize: 12, fontWeight: 700,
              cursor: gameState.pendingAction ? 'not-allowed' : 'pointer',
            }}
          >
            End Turn
          </button>
        )}
      </div>

      {/* ── Cards row ── */}
      <div style={{
        display: 'flex', gap: 6,
        overflowX: dragging ? 'hidden' : 'auto',
        padding: '6px 12px 12px',
        WebkitOverflowScrolling: 'touch',
      }}>
        {cards.map(card => (
          <div
            key={card.id}
            ref={el => { if (el) cardRefs.current[card.id] = el; else delete cardRefs.current[card.id]; }}
            onPointerDown={isMyTurn && !targetingMode ? e => handlePointerDown(e, card) : undefined}
            style={{
              flexShrink: 0,
              touchAction: isMyTurn && !targetingMode ? 'none' : 'auto',
              opacity: dragging?.card.id === card.id ? 0.25 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            <Card
              card={card}
              selected={selected?.id === card.id}
              dimmed={targetingMode || !isMyTurn}
            />
          </div>
        ))}
        {cards.length === 0 && (
          <span style={{ fontSize: 12, color: '#d1d5db', fontStyle: 'italic', padding: '8px 0' }}>
            No cards in hand
          </span>
        )}
      </div>

      {/* ── Ghost card (follows pointer during drag) ── */}
      {dragging && (
        <div
          ref={el => {
            ghostRef.current = el;
            if (el) {
              el.style.setProperty('--gx', `${dragging.initX}px`);
              el.style.setProperty('--gy', `${dragging.initY}px`);
            }
          }}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            transform: 'translate(calc(var(--gx) - 50%), calc(var(--gy) - 65%)) rotate(4deg) scale(1.12)',
            pointerEvents: 'none',
            zIndex: 9999,
            filter: 'drop-shadow(0 14px 32px rgba(0,0,0,0.38))',
            willChange: 'transform',
            transition: 'none',
          }}
        >
          <Card card={dragging.card} />
        </div>
      )}
    </div>
  );
}

function getPlayerName(gameState, playerId) {
  return gameState.playerNames?.[playerId] ?? playerId?.slice(0, 6) ?? 'Player';
}
