import { useState } from 'react';
import PlayerBoard from './PlayerBoard.jsx';
import Hand from './Hand.jsx';
import Card from './Card.jsx';
import { SET_SIZE } from '../game/cards.js';

export default function GameBoard({ gameState, playerId, playerNames, actions, resignedPlayer }) {
  const [targeting,        setTargeting]        = useState(null);
  const [paymentModal,     setPaymentModal]      = useState(null);
  const [selectedPayCards, setSelectedPayCards]  = useState([]);
  const [moveModal,        setMoveModal]         = useState(null);

  const me            = gameState.players[playerId];
  const opponents     = gameState.playerOrder.filter(id => id !== playerId);
  const currentTurnId = gameState.playerOrder[gameState.currentPlayerIndex];
  const isMyTurn      = currentTurnId === playerId;
  const pending       = gameState.pendingAction;
  const [showSettings, setShowSettings] = useState(false);

  const iAmTarget = pending && (
    pending.fromId === playerId ||
    pending.fromIds?.includes(playerId) ||
    pending.targetId === playerId
  );
  const hasJSN = me?.hand?.some(c => c.action === 'justSayNo');

  function pendingHighlightIds(pid) {
    if (!pending) return null;
    if (pending.type === 'slyDeal' && pending.fromId === pid)
      return new Set([pending.targetCardId]);
    if (pending.type === 'forceDeal') {
      if (pending.targetId === pid)    return new Set([pending.targetCardId]);
      if (pending.initiatorId === pid) return new Set([pending.offeredCardId]);
    }
    return null;
  }

  function getCompleteSets(pid) {
    let count = 0;
    for (const [color, group] of Object.entries(gameState.players[pid]?.properties ?? {})) {
      if (group.cards.length >= (SET_SIZE[color] ?? 99)) count++;
    }
    return count;
  }

  function getName(pid) {
    return playerNames[pid] ?? pid?.slice(0, 6) ?? 'Player';
  }

  // ── Targeting ─────────────────────────────────────────────
  function enterTargeting(info) { setTargeting(info); }
  function cancelTargeting()    { setTargeting(null); }

  function handlePropertyClick(ownerId, card) {
    if (!targeting) return;
    if (targeting.type === 'slyDeal') {
      actions.playCard(targeting.card.id, 'action', {
        targetPlayerId: ownerId,
        targetCardId:   card.id,
      });
      setTargeting(null);
      return;
    }
    if (targeting.type === 'forceDeal' && targeting.step !== 'pickOwn') {
      setTargeting(prev => ({
        ...prev,
        step:           'pickOwn',
        targetPlayerId: ownerId,
        targetCardId:   card.id,
      }));
    }
  }

  function handleOwnPropertyClick(card) {
    if (!targeting || targeting.type !== 'forceDeal' || targeting.step !== 'pickOwn') return;
    actions.playCard(targeting.card.id, 'action', {
      targetPlayerId: targeting.targetPlayerId,
      targetCardId:   targeting.targetCardId,
      offeredCardId:  card.id,
    });
    setTargeting(null);
  }

  function handleGroupClick(ownerId, color) {
    if (!targeting || targeting.type !== 'dealBreaker') return;
    actions.playCard(targeting.card.id, 'action', {
      targetPlayerId: ownerId,
      targetColor:    color,
    });
    setTargeting(null);
  }

  // ── Payment ───────────────────────────────────────────────
  function openPaymentModal() {
    setSelectedPayCards([]);
    setPaymentModal({ amount: pending.amount });
  }

  function togglePayCard(card) {
    setSelectedPayCards(prev =>
      prev.find(c => c.id === card.id)
        ? prev.filter(c => c.id !== card.id)
        : [...prev, card]
    );
  }

  function submitPayment(selectedCardIds) {
    actions.respondToAction('accept', null, { selectedCardIds });
    setPaymentModal(null);
    setSelectedPayCards([]);
  }

  const selectedPayTotal = selectedPayCards.reduce((s, c) => s + (c.value ?? c.bankValue ?? 0), 0);

  // ── Wildcard move ─────────────────────────────────────────
  function handleMoveWildcard(card, fromColor) {
    setMoveModal({ card, fromColor });
  }

  // ── Targeting banner text ─────────────────────────────────
  function targetingBannerText() {
    if (!targeting) return '';
    if (targeting.type === 'slyDeal')     return 'Tap any opponent property to steal it';
    if (targeting.type === 'dealBreaker') return 'Tap a complete set to steal it';
    if (targeting.type === 'forceDeal' && targeting.step !== 'pickOwn') return "Tap an opponent's property to take";
    if (targeting.type === 'forceDeal' && targeting.step === 'pickOwn') return 'Now tap one of YOUR properties to give';
    return '';
  }

  return (
    <div style={{
      height: '100%',
      background: '#f3f4f6',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      maxWidth: 480,
      margin: '0 auto',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Top bar ── */}
<div style={{
  background: '#fff',
  borderBottom: '1px solid #e5e7eb',
  padding: '10px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
  zIndex: 10,
}}>
  <span style={{ fontWeight: 800, fontSize: 16, color: '#111827' }}>
    🏠 Property Deal
  </span>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <div style={{
      fontSize: 12, fontWeight: 600,
      background: isMyTurn ? '#dcfce7' : '#f3f4f6',
      color: isMyTurn ? '#166534' : '#6b7280',
      borderRadius: 20, padding: '4px 12px',
      border: `1px solid ${isMyTurn ? '#86efac' : '#e5e7eb'}`,
    }}>
      {isMyTurn
        ? `✦ Your Turn (${3 - gameState.actionsUsed}/3)`
        : `${getName(currentTurnId)}'s turn`}
    </div>
    <button
      onClick={() => setShowSettings(true)}
      style={{
        background: '#f3f4f6', border: 'none', borderRadius: 10,
        width: 36, height: 36, fontSize: 18, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >⚙️</button>
  </div>
</div>

{/* ── Resignation toast ── */}
      {resignedPlayer && (
        <div style={{
          background: '#fef2f2',
          borderBottom: '1px solid #fca5a5',
          padding: '10px 16px',
          fontSize: 13,
          fontWeight: 600,
          color: '#dc2626',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          {resignedPlayer} has resigned from the game
        </div>
      )}
      
      {/* ── Targeting banner ── */}
      {targeting && (
        <div style={{
          background: '#fef3c7',
          borderBottom: '2px solid #f59e0b',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          zIndex: 9,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>
            👆 {targetingBannerText()}
          </span>
          <button
            onClick={cancelTargeting}
            style={{
              background: 'transparent', color: '#92400e',
              border: '1px solid #f59e0b', borderRadius: 20,
              padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
            }}
          >Cancel</button>
        </div>
      )}

      {/* ── Pending action banner ── */}
      {pending && !targeting && (
        <div style={{ flexShrink: 0 }}>
          <PendingBanner
            pending={pending}
            playerId={playerId}
            gameState={gameState}
            getName={getName}
            hasJSN={hasJSN}
            iAmTarget={iAmTarget}
            actions={actions}
            onOpenPayment={openPaymentModal}
          />
        </div>
      )}

      {/* ── Scrollable board ── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}>
        <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right', marginBottom: 8 }}>
          Deck: {gameState.deck} cards remaining
        </div>

        {/* Opponents */}
        {opponents.map(oid => (
          <div key={oid} style={{ marginBottom: 10 }}>
            <PlayerBoard
              player={gameState.players[oid]}
              playerName={getName(oid)}
              isCurrentPlayer={currentTurnId === oid}
              isYou={false}
              completeSets={getCompleteSets(oid)}
              targetingMode={!!targeting && targeting.step !== 'pickOwn'}
              targetingType={targeting?.type}
              onPropertyClick={handlePropertyClick}
              onGroupClick={handleGroupClick}
              isMyTurn={false}
              onMoveWildcard={null}
              highlightCardIds={pendingHighlightIds(oid)}
            />
          </div>
        ))}

        <div style={{
          textAlign: 'center', fontSize: 11, color: '#d1d5db',
          margin: '8px 0', letterSpacing: '0.1em',
        }}>
          — YOUR BOARD —
        </div>

        {/* My board */}
        <PlayerBoard
          player={me}
          playerName={getName(playerId)}
          isCurrentPlayer={isMyTurn}
          isYou={true}
          completeSets={getCompleteSets(playerId)}
          targetingMode={targeting?.step === 'pickOwn'}
          targetingType={targeting?.step === 'pickOwn' ? 'forceDealOwn' : null}
          onPropertyClick={(ownerId, card) => handleOwnPropertyClick(card)}
          onGroupClick={() => {}}
          isMyTurn={isMyTurn}
          onMoveWildcard={handleMoveWildcard}
          highlightCardIds={pendingHighlightIds(playerId)}
        />
      </div>

      {/* ── Hand (pinned to bottom) ── */}
      <div style={{ flexShrink: 0 }}>
        <Hand
          cards={me?.hand ?? []}
          gameState={gameState}
          playerId={playerId}
          actions={actions}
          actionsUsed={gameState.actionsUsed}
          onEnterTargeting={enterTargeting}
          onCancelTargeting={cancelTargeting}
          targetingMode={!!targeting}
        />
      </div>

      {/* ── Payment modal ── */}
      {paymentModal && (
        <PaymentModal
          amount={paymentModal.amount}
          player={me}
          selectedCards={selectedPayCards}
          selectedTotal={selectedPayTotal}
          onToggle={togglePayCard}
          onSubmit={submitPayment}
          onJSN={hasJSN ? () => {
            const jsn = me.hand.find(c => c.action === 'justSayNo');
            actions.respondToAction('justSayNo', jsn.id);
            setPaymentModal(null);
          } : null}
        />
      )}

{/* ── Settings Modal ── */}
{showSettings && (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'flex-end',
  }}>
    <div style={{
      background: '#fff',
      borderRadius: '16px 16px 0 0',
      width: '100%',
      maxWidth: 480,
      margin: '0 auto',
      padding: '24px 20px 40px',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
        ⚙️ Settings
      </div>
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>
        Game options
      </div>

      <button
  onClick={() => {
    if (window.confirm('Are you sure you want to resign?')) {
      actions.resignGame();
      setShowSettings(false);
    }
  }}
  style={{
    width: '100%', background: '#fef2f2', color: '#dc2626',
    border: '2px solid #fca5a5', borderRadius: 14, padding: '16px',
    fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
  }}
>
  🏳️ Resign Game
</button>

      <button
        onClick={() => setShowSettings(false)}
        style={{
          width: '100%', background: '#f3f4f6', color: '#6b7280',
          border: 'none', borderRadius: 14, padding: '16px',
          fontSize: 16, cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  </div>
)}

      {/* ── Move Wildcard Modal ── */}
      {moveModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '16px 16px 0 0',
            width: '100%',
            maxWidth: 480,
            margin: '0 auto',
            padding: '20px 16px 32px',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
              Move Wildcard
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              Currently in <strong>{moveModal.fromColor}</strong>. Pick a new color group:
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {moveModal.card.colors
                .filter(c => c !== moveModal.fromColor)
                .map(c => (
                  <button
                    key={c}
                    onClick={() => {
                      actions.moveWildcard(moveModal.card.id, c);
                      setMoveModal(null);
                    }}
                    style={{
                      background: '#f0f9ff',
                      color: '#0369a1',
                      border: '2px solid #bae6fd',
                      borderRadius: 10,
                      padding: '10px 18px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    → {c}
                  </button>
                ))
              }
            </div>
            <button
              onClick={() => setMoveModal(null)}
              style={{
                width: '100%', background: '#f3f4f6', color: '#6b7280',
                border: 'none', borderRadius: 12, padding: '12px',
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pending Action Banner ─────────────────────────────────────

function findCardInProperties(players, playerId, cardId) {
  const player = players?.[playerId];
  if (!player) return null;
  for (const group of Object.values(player.properties)) {
    const card = group.cards.find(c => c.id === cardId);
    if (card) return card;
  }
  return null;
}

function PendingBanner({ pending, playerId, gameState, getName, hasJSN, iAmTarget, actions, onOpenPayment }) {
  const isInitiator  = pending.toId === playerId || pending.initiatorId === playerId;
  const needsPayment = ['payment', 'birthdayPayment', 'rentPayment'].includes(pending.type);
  const needsAccept  = ['slyDeal', 'forceDeal', 'dealBreaker'].includes(pending.type);

  const typeLabels = {
    payment:         'Debt Collector',
    birthdayPayment: "It's My Birthday",
    rentPayment:     'Rent Due',
    slyDeal:         'Sly Deal',
    forceDeal:       'Force Deal',
    dealBreaker:     'Deal Breaker!',
  };

  let dealDetail = null;
  if (pending.type === 'slyDeal' && pending.targetCardId) {
    const stolen = findCardInProperties(gameState.players, pending.fromId, pending.targetCardId);
    if (stolen) dealDetail = `Stealing: ${stolen.name}`;
  } else if (pending.type === 'forceDeal' && pending.targetCardId && pending.offeredCardId) {
    const taken    = findCardInProperties(gameState.players, pending.targetId, pending.targetCardId);
    const offered  = findCardInProperties(gameState.players, pending.initiatorId, pending.offeredCardId);
    if (taken && offered) dealDetail = `Taking: ${taken.name} · Offering: ${offered.name}`;
    else if (taken)       dealDetail = `Taking: ${taken.name}`;
  }

  return (
    <div style={{
      background: '#fffbeb',
      borderBottom: '2px solid #f59e0b',
      padding: '10px 16px',
    }}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
          ⚡ {typeLabels[pending.type] ?? pending.type}
        </div>
        <div style={{ fontSize: 11, color: '#b45309' }}>
          {pending.amount && `$${pending.amount}M owed`}
          {pending.targetColor && ` · ${pending.targetColor} set targeted`}
          {pending.remaining?.length > 0 && ` · ${pending.remaining.length} player(s) left to pay`}
          {dealDetail && dealDetail}
        </div>
        {pending.justSayNoBy && (
          <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, marginTop: 2 }}>
            Just Say No by {getName(pending.justSayNoBy)}
          </div>
        )}
      </div>

      {iAmTarget && !pending.justSayNoBy && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {needsPayment && (
            <ActionBtn label="Choose cards to pay" color="#15803d" onClick={onOpenPayment} />
          )}
          {needsAccept && (
            <ActionBtn label="Accept" color="#15803d" onClick={() => actions.respondToAction('accept')} />
          )}
          {hasJSN && (
            <ActionBtn
              label="Just Say No!"
              color="#dc2626"
              onClick={() => {
                const jsn = gameState.players[playerId].hand.find(c => c.action === 'justSayNo');
                actions.respondToAction('justSayNo', jsn.id);
              }}
            />
          )}
        </div>
      )}

      {isInitiator && pending.justSayNoBy && hasJSN && (
        <ActionBtn
          label="Counter with Just Say No!"
          color="#7c3aed"
          onClick={() => {
            const jsn = gameState.players[playerId].hand.find(c => c.action === 'justSayNo');
            actions.respondToAction('justSayNo', jsn.id);
          }}
        />
      )}

      {!iAmTarget && !isInitiator && (
        <div style={{ fontSize: 12, color: '#b45309' }}>Waiting for response...</div>
      )}
    </div>
  );
}

// ── Payment Modal ─────────────────────────────────────────────

function PaymentModal({ amount, player, selectedCards, selectedTotal, onToggle, onSubmit, onJSN }) {
  const allCards   = [...player.bank, ...Object.values(player.properties).flatMap(g => g.cards)];
  const totalAssets = allCards.reduce((sum, c) => sum + (c.value ?? 0), 0);
  const insolvent  = totalAssets < amount;
  const canPay     = selectedTotal >= amount;
  const overpaid   = selectedTotal > amount;

  const sheet = {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'flex-end',
  };
  const inner = {
    background: '#fff',
    borderRadius: '16px 16px 0 0',
    width: '100%', maxWidth: 480,
    margin: '0 auto',
    padding: '20px 16px 32px',
    maxHeight: '80vh', overflowY: 'auto',
  };

  // ── Insolvent: skip selection, pay everything automatically ──
  if (insolvent) {
    return (
      <div style={sheet}>
        <div style={inner}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
            Pay ${amount}M
          </div>
          <div style={{
            fontSize: 13, color: '#dc2626', fontWeight: 600,
            background: '#fef2f2', border: '1px solid #fca5a5',
            borderRadius: 8, padding: '8px 12px', marginBottom: 16,
          }}>
            You only have ${totalAssets}M — all your cards will be handed over.
          </div>

          {player.bank.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 8 }}>BANK</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {player.bank.map(card => <Card key={card.id} card={card} dimmed />)}
              </div>
            </>
          )}

          {Object.keys(player.properties).length > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 8 }}>PROPERTIES</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                {Object.values(player.properties).flatMap(g => g.cards).map(card => (
                  <Card key={card.id} card={card} dimmed />
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onSubmit(allCards.map(c => c.id))}
              style={{
                flex: 1, background: '#15803d', color: '#fff', border: 'none',
                borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Pay All You Have (${totalAssets}M)
            </button>
            {onJSN && (
              <button
                onClick={onJSN}
                style={{
                  background: '#dc2626', color: '#fff', border: 'none',
                  borderRadius: 12, padding: '14px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                JSN!
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Normal: player selects which cards to hand over ──
  return (
    <div style={sheet}>
      <div style={inner}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
          Pay ${amount}M
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
          Tap cards to select what you'll hand over.
        </div>
        <div style={{
          fontSize: 13, fontWeight: 600, marginBottom: 16,
          color: canPay ? '#15803d' : '#dc2626',
        }}>
          Selected: ${selectedTotal}M
          {canPay && !overpaid && ' ✓ exact'}
          {overpaid && ` ✓ (opponent keeps the overage)`}
          {!canPay && ` — need $${amount - selectedTotal}M more`}
        </div>

        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 8 }}>BANK</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {player.bank.map(card => (
            <Card key={card.id} card={card} selected={!!selectedCards.find(c => c.id === card.id)} onClick={onToggle} />
          ))}
          {player.bank.length === 0 && <span style={{ fontSize: 12, color: '#d1d5db' }}>Bank is empty</span>}
        </div>

        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 8 }}>PROPERTIES</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {Object.values(player.properties).flatMap(g => g.cards).map(card => (
            <Card key={card.id} card={card} selected={!!selectedCards.find(c => c.id === card.id)} onClick={onToggle} />
          ))}
          {Object.keys(player.properties).length === 0 && <span style={{ fontSize: 12, color: '#d1d5db' }}>No properties</span>}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onSubmit(selectedCards.map(c => c.id))}
            disabled={!canPay}
            style={{
              flex: 1,
              background: canPay ? '#15803d' : '#d1d5db',
              color: '#fff', border: 'none',
              borderRadius: 12, padding: '14px',
              fontSize: 14, fontWeight: 700,
              cursor: canPay ? 'pointer' : 'not-allowed',
            }}
          >
            {canPay ? `Confirm Payment ($${selectedTotal}M)` : `Select $${amount - selectedTotal}M more`}
          </button>
          {onJSN && (
            <button
              onClick={onJSN}
              style={{
                background: '#dc2626', color: '#fff', border: 'none',
                borderRadius: 12, padding: '14px 16px',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              JSN!
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ label, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: color, color: '#fff', border: 'none',
      borderRadius: 20, padding: '6px 16px',
      fontSize: 12, fontWeight: 700, cursor: 'pointer',
    }}>
      {label}
    </button>
  );
}