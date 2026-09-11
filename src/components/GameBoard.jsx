import { useState, useEffect, useRef } from 'react';
import PlayerBoard from './PlayerBoard.jsx';
import Hand from './Hand.jsx';
import Card, { getColorConfig } from './Card.jsx';
import DragDropProvider from './DragDrop.jsx';
import { CARD_TYPE, SET_SIZE } from '../game/cards.js';
import {
  bankValueOf, chargeableColors, completeColors, hasRoomFor, houseColors,
  hotelColors, isPropertyCard, isSetComplete, labelOf, placementColors, rentFor,
} from '../game/dropRules.js';

const ACTIONS_PER_TURN = 3;

export default function GameBoard({ gameState, playerId, playerNames, actions, resignedPlayer }) {
  const [targeting,        setTargeting]        = useState(null);
  const [paymentModal,     setPaymentModal]     = useState(null);
  const [selectedPayCards, setSelectedPayCards] = useState([]);
  const [rentModal,        setRentModal]        = useState(null);
  const [colorModal,       setColorModal]       = useState(null);
  const [choiceModal,      setChoiceModal]      = useState(null);
  const [discardModal,     setDiscardModal]     = useState(false);
  const [discardSelected,  setDiscardSelected]  = useState([]);
  const [showLog,          setShowLog]          = useState(false);
  const [showSettings,     setShowSettings]     = useState(false);
  const boardRef = useRef(null);

  const me            = gameState.players[playerId];
  const opponents     = gameState.playerOrder.filter(id => id !== playerId);
  const currentTurnId = gameState.playerOrder[gameState.currentPlayerIndex];
  const isMyTurn      = currentTurnId === playerId;
  const pending       = gameState.pendingAction;
  const myProps       = me?.properties ?? {};
  const actionsLeft   = ACTIONS_PER_TURN - gameState.actionsUsed;

  const iAmTarget = pending && (
    pending.fromId === playerId ||
    pending.remaining?.includes(playerId) ||
    pending.targetId === playerId
  );
  const hasJSN        = me?.hand?.some(c => c.action === 'justSayNo');
  const hasDoubleRent = me?.hand?.some(c => c.action === 'doubleRent');

  // Auto end turn after 3 actions, but only once any pending responses are resolved
  const debugMode = !!gameState.debugMode;

  useEffect(() => {
    if (!isMyTurn || gameState.actionsUsed < ACTIONS_PER_TURN || gameState.phase !== 'playing') return;
    if (!debugMode && (me?.hand?.length ?? 0) > 7) {
      const timer = setTimeout(() => { setDiscardSelected([]); setDiscardModal(true); }, 600);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => actions.endTurn(), 600);
    return () => clearTimeout(timer);
  }, [gameState.actionsUsed, gameState.phase, isMyTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleEndTurn() {
    if (!debugMode && (me?.hand?.length ?? 0) > 7) {
      setDiscardSelected([]);
      setDiscardModal(true);
    } else {
      actions.endTurn();
    }
  }

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
    return completeColors(gameState.players[pid]?.properties).length;
  }

  function getName(pid) {
    return playerNames[pid] ?? pid?.slice(0, 6) ?? 'Player';
  }

  // ── Drag and drop ─────────────────────────────────────────
  //
  // Everything you can do with a card in hand is a drop: onto your bank, onto
  // one of your sets, onto open board space, or onto an opponent (or one of
  // their cards) for the cards you play at people. Anything that still needs a
  // decision — which colour, which player, whether to double the rent — opens
  // on release rather than before the drag.

  const canPlay = isMyTurn && !pending && gameState.phase === 'playing' && actionsLeft > 0;
  const canMove = isMyTurn && (gameState.phase === 'playing' || gameState.phase === 'movingWildcard');

  // A set filled up under a wildcard of yours — a stolen complete set landing on
  // top of it — and the engine couldn't pick its new colour for you. Ask.
  const overflowPick = (() => {
    if (pending?.type !== 'wildcardOverflow' || pending.playerId !== playerId || !pending.cardId) return null;
    const card = myProps[pending.color]?.cards.find(c => c.id === pending.cardId);
    if (!card) return null;
    const others   = (card.colors ?? []).filter(c => c !== pending.color);
    const withRoom = others.filter(c => !isSetComplete(c, myProps[c]));
    return { card, colors: withRoom.length > 0 ? withRoom : others };
  })();

  const dropCtx = {
    canPlay,
    canMove,
    myProperties:    myProps,
    myPropertyCount: Object.values(myProps).reduce((n, g) => n + g.cards.length, 0),
    opponentCount:   opponents.length,
  };

  function play(card, destination, opts = {}) {
    actions.playCard(card.id, destination, opts);
  }

  function openRent(card, { color = null, targetPlayerId = null } = {}) {
    setRentModal({ card, color, targetPlayerId });
  }

  function handleDrop(card, zone, source) {
    if (!zone) return;

    // A wildcard being dragged between your own sets
    if (source?.from === 'board') {
      if (zone.kind === 'mySet') {
        actions.moveWildcard(card.id, zone.color);
      } else if (zone.kind === 'myBoard') {
        const colors = (card.colors ?? []).filter(c => c !== source.color && !isSetComplete(c, myProps[c]));
        if (colors.length === 1) actions.moveWildcard(card.id, colors[0]);
        else setColorModal({ card, colors, mode: 'move', title: 'Move wildcard' });
      }
      return;
    }

    switch (zone.kind) {
      case 'bank':
        play(card, 'bank');
        return;

      case 'mySet':
        if (isPropertyCard(card))              play(card, 'property', { targetColor: zone.color });
        else if (card.type === CARD_TYPE.RENT) openRent(card, { color: zone.color });
        else                                   play(card, 'action', { targetColor: zone.color });
        return;

      case 'myBoard': {
        if (card.type === CARD_TYPE.MONEY)    { play(card, 'bank'); return; }
        if (card.type === CARD_TYPE.PROPERTY) { play(card, 'property', { targetColor: card.color }); return; }
        if (card.type === CARD_TYPE.WILDCARD) {
          const colors = placementColors(card).filter(c => hasRoomFor(c, myProps[c]));
          if (colors.length === 1) play(card, 'property', { targetColor: colors[0] });
          else setColorModal({ card, colors, mode: 'play', title: 'Which colour?' });
          return;
        }
        if (card.type === CARD_TYPE.RENT) { openRent(card); return; }

        if (card.action === 'passGo' || card.action === 'birthday') { play(card, 'action'); return; }

        if (card.action === 'debtCollector') {
          if (opponents.length === 1) { play(card, 'action', { targetPlayerId: opponents[0] }); return; }
          setChoiceModal({
            title: 'Debt Collector',
            subtitle: 'Who owes you $5M?',
            options: opponents.map(pid => ({
              key: pid, label: getName(pid), color: '#dc2626',
              onPress: () => play(card, 'action', { targetPlayerId: pid }),
            })),
          });
          return;
        }

        if (card.action === 'house' || card.action === 'hotel') {
          const eligible = card.action === 'house' ? houseColors(myProps) : hotelColors(myProps);
          if (eligible.length === 1) { play(card, 'action', { targetColor: eligible[0] }); return; }
          setChoiceModal({
            title: card.action === 'house' ? '🏠 Build a house' : '🏨 Build a hotel',
            subtitle: 'Which set?',
            options: eligible.map(c => ({
              key: c, label: labelOf(c), color: getColorConfig(c).bg,
              onPress: () => play(card, 'action', { targetColor: c }),
            })),
          });
        }
        return;
      }

      case 'opponent':
        if (card.type === CARD_TYPE.RENT) { openRent(card, { targetPlayerId: zone.playerId }); return; }
        if (card.action === 'debtCollector') { play(card, 'action', { targetPlayerId: zone.playerId }); return; }
        if (card.action === 'dealBreaker') {
          const sets = completeColors(gameState.players[zone.playerId]?.properties);
          if (sets.length === 1) { play(card, 'action', { targetPlayerId: zone.playerId, targetColor: sets[0] }); return; }
          setChoiceModal({
            title: 'Deal Breaker',
            subtitle: `Which of ${getName(zone.playerId)}'s sets?`,
            options: sets.map(c => ({
              key: c, label: labelOf(c), color: getColorConfig(c).bg,
              onPress: () => play(card, 'action', { targetPlayerId: zone.playerId, targetColor: c }),
            })),
          });
        }
        return;

      case 'oppCard':
        if (card.action === 'slyDeal') {
          play(card, 'action', { targetPlayerId: zone.playerId, targetCardId: zone.cardId });
        } else if (card.action === 'forceDeal') {
          // Second step stays a tap: pick which of your own properties to give.
          setTargeting({
            card, type: 'forceDeal', step: 'pickOwn',
            targetPlayerId: zone.playerId, targetCardId: zone.cardId,
          });
        } else if (card.action === 'dealBreaker') {
          play(card, 'action', { targetPlayerId: zone.playerId, targetColor: zone.color });
        }
        return;

      case 'oppSet':
        if (card.action === 'dealBreaker') {
          play(card, 'action', { targetPlayerId: zone.playerId, targetColor: zone.color });
        }
        return;

      default:
    }
  }

  function handleOwnPropertyClick(card) {
    if (!targeting || targeting.step !== 'pickOwn') return;
    actions.playCard(targeting.card.id, 'action', {
      targetPlayerId: targeting.targetPlayerId,
      targetCardId:   targeting.targetCardId,
      offeredCardId:  card.id,
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

  const selectedPayTotal = selectedPayCards.reduce((s, c) => s + bankValueOf(c), 0);

  return (
    <DragDropProvider onDrop={handleDrop} scrollRef={boardRef}>
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
              ? `✦ Your Turn (${actionsLeft}/3)`
              : `${getName(currentTurnId)}'s turn`}
          </div>
          <button
            onClick={() => setShowLog(v => !v)}
            style={{
              background: showLog ? '#ede9fe' : '#f3f4f6',
              border: showLog ? '1px solid #c4b5fd' : 'none',
              borderRadius: 10,
              width: 36, height: 36, fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Game log"
          >📋</button>
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

      {/* ── Force Deal second step ── */}
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
            👆 Now tap one of YOUR properties to give
          </span>
          <button
            onClick={() => setTargeting(null)}
            style={{
              background: 'transparent', color: '#92400e',
              border: '1px solid #f59e0b', borderRadius: 20,
              padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
            }}
          >Cancel</button>
        </div>
      )}

      {/* ── Wildcard overflow banner ── */}
      {pending?.type === 'wildcardOverflow' && pending.playerId === playerId && (
        <div style={{
          flexShrink: 0,
          background: '#fef3c7', borderBottom: '2px solid #f59e0b',
          padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#92400e',
        }}>
          {pending.cardId
            ? <>⚠️ Your <strong>{labelOf(pending.color)}</strong> set is full — pick a new colour for your wildcard.</>
            : <>⚠️ Your <strong>{labelOf(pending.color)}</strong> set is overfull — drag a wildcard (⇄) into another set.</>}
        </div>
      )}

      {/* ── Pending action banner ── */}
      {pending && !targeting && pending.type !== 'wildcardOverflow' && (
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
      <div ref={boardRef} style={{
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
              targetingMode={false}
              targetingType={null}
              onPropertyClick={null}
              isMyTurn={false}
              highlightCardIds={pendingHighlightIds(oid)}
              dropCtx={dropCtx}
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
          isMyTurn={isMyTurn}
          highlightCardIds={pendingHighlightIds(playerId)}
          dropCtx={dropCtx}
        />
      </div>

      {/* ── Hand (pinned to bottom) ── */}
      <div style={{ flexShrink: 0 }}>
        <Hand
          cards={me?.hand ?? []}
          gameState={gameState}
          playerId={playerId}
          actions={actions}
          actionsLeft={actionsLeft}
          canPlay={canPlay}
          targetingMode={!!targeting}
          onEndTurn={handleEndTurn}
        />
      </div>

      {/* ── Rent modal ── */}
      {rentModal && (
        <RentModal
          card={rentModal.card}
          presetColor={rentModal.color}
          presetTarget={rentModal.targetPlayerId}
          myProperties={myProps}
          opponents={opponents}
          getName={getName}
          canDouble={hasDoubleRent && actionsLeft > 1}
          onCharge={(color, targetPlayerId, doubleRent) => {
            play(rentModal.card, 'action', { rentColor: color, targetPlayerId, doubleRent });
            setRentModal(null);
          }}
          onBank={() => { play(rentModal.card, 'bank'); setRentModal(null); }}
          onClose={() => setRentModal(null)}
        />
      )}

      {/* ── Colour picker (wildcards) ── */}
      {colorModal && (
        <ColorModal
          card={colorModal.card}
          colors={colorModal.colors}
          title={colorModal.title}
          myProperties={myProps}
          onPick={color => {
            if (colorModal.mode === 'move') actions.moveWildcard(colorModal.card.id, color);
            else play(colorModal.card, 'property', { targetColor: color });
            setColorModal(null);
          }}
          onClose={() => setColorModal(null)}
        />
      )}

      {/* ── Forced wildcard placement (a stolen set filled the colour) ── */}
      {overflowPick && (
        <ColorModal
          card={overflowPick.card}
          colors={overflowPick.colors}
          title={`Your ${labelOf(pending.color)} set is full`}
          subtitle="Pick the colour this wildcard switches to"
          myProperties={myProps}
          dismissible={false}
          onPick={color => actions.moveWildcard(overflowPick.card.id, color)}
        />
      )}

      {/* ── Generic choice sheet ── */}
      {choiceModal && (
        <ChoiceModal
          title={choiceModal.title}
          subtitle={choiceModal.subtitle}
          options={choiceModal.options}
          onPick={opt => { opt.onPress(); setChoiceModal(null); }}
          onClose={() => setChoiceModal(null)}
        />
      )}

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

      {/* ── Discard Modal ── */}
      {discardModal && (
        <DiscardModal
          cards={me?.hand ?? []}
          excess={(me?.hand?.length ?? 0) - 7}
          selected={discardSelected}
          onToggle={card => setDiscardSelected(prev =>
            prev.find(c => c.id === card.id) ? prev.filter(c => c.id !== card.id) : [...prev, card]
          )}
          onConfirm={() => {
            actions.endTurn(discardSelected.map(c => c.id));
            setDiscardModal(false);
            setDiscardSelected([]);
          }}
        />
      )}

      {/* ── Game Log Panel ── */}
      <GameLog entries={gameState.log ?? []} open={showLog} onClose={() => setShowLog(false)} />
    </div>
    </DragDropProvider>
  );
}

// ── Bottom sheet shell ────────────────────────────────────────

function Sheet({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '16px 16px 0 0',
          width: '100%', maxWidth: 480,
          margin: '0 auto',
          padding: '20px 16px 32px',
          maxHeight: '80vh', overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function SheetTitle({ title, subtitle }) {
  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>{subtitle}</div>}
    </>
  );
}

function CancelButton({ onClick, label = 'Cancel' }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', background: '#f3f4f6', color: '#6b7280',
        border: 'none', borderRadius: 12, padding: '12px',
        fontSize: 14, cursor: 'pointer', marginTop: 10,
      }}
    >
      {label}
    </button>
  );
}

// ── Rent modal ────────────────────────────────────────────────
//
// Opens when a rent card is dropped on the table: which colour to charge, who
// pays, whether to spend a second action doubling it — or bank it after all.

function RentModal({
  card, presetColor, presetTarget, myProperties, opponents, getName, canDouble,
  onCharge, onBank, onClose,
}) {
  const available = chargeableColors(card, myProperties);
  const [color,  setColor]  = useState(
    presetColor && available.includes(presetColor) ? presetColor
      : available.length === 1 ? available[0] : null
  );
  const [target, setTarget] = useState(card.allPlayers ? null : presetTarget ?? (opponents.length === 1 ? opponents[0] : null));
  const [double, setDouble] = useState(false);

  const base   = color ? rentFor(color, myProperties[color]) : 0;
  const amount = base * (double ? 2 : 1);
  const ready  = !!color && (card.allPlayers || !!target);

  return (
    <Sheet onClose={onClose}>
      <SheetTitle
        title="Charge rent"
        subtitle={card.name}
      />

      {available.length === 0 ? (
        <div style={{
          fontSize: 13, color: '#b45309', background: '#fffbeb',
          border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 12px', marginBottom: 12,
        }}>
          You have no properties in this card's colours, so there's no rent to charge — bank it instead.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, marginBottom: 6, letterSpacing: '0.06em' }}>
            WHICH COLOUR?
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {available.map(c => {
              const cfg = getColorConfig(c);
              const on  = color === c;
              return (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    background: on ? cfg.bg : cfg.light,
                    color: on ? '#fff' : cfg.bg,
                    border: `2px solid ${cfg.bg}`,
                    borderRadius: 12, padding: '8px 12px',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                  }}
                >
                  <span>{cfg.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>
                    ${rentFor(c, myProperties[c])}M · {myProperties[c].cards.length}/{SET_SIZE[c] ?? '?'}
                  </span>
                </button>
              );
            })}
          </div>

          {!card.allPlayers && (
            <>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, marginBottom: 6, letterSpacing: '0.06em' }}>
                WHO PAYS?
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {opponents.map(pid => (
                  <button
                    key={pid}
                    onClick={() => setTarget(pid)}
                    style={{
                      background: target === pid ? '#be185d' : '#fdf2f8',
                      color: target === pid ? '#fff' : '#be185d',
                      border: '2px solid #be185d',
                      borderRadius: 12, padding: '8px 14px',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {getName(pid)}
                  </button>
                ))}
              </div>
            </>
          )}

          {card.allPlayers && (
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
              Every other player pays.
            </div>
          )}

          {canDouble && (
            <button
              onClick={() => setDouble(v => !v)}
              style={{
                width: '100%', textAlign: 'left',
                background: double ? '#fdf2f8' : '#f9fafb',
                border: `2px solid ${double ? '#9d174d' : '#e5e7eb'}`,
                borderRadius: 12, padding: '10px 12px', marginBottom: 14,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: double ? '#9d174d' : '#fff',
                border: `2px solid ${double ? '#9d174d' : '#d1d5db'}`,
                color: '#fff', fontSize: 13, fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{double ? '✓' : ''}</span>
              <span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#9d174d' }}>
                  ×2 Double the Rent
                </span>
                <span style={{ display: 'block', fontSize: 11, color: '#6b7280' }}>
                  Plays your Double the Rent card too — costs a second action
                </span>
              </span>
            </button>
          )}

          <button
            onClick={() => onCharge(color, card.allPlayers ? null : target, double)}
            disabled={!ready}
            style={{
              width: '100%',
              background: ready ? (double ? '#9d174d' : '#be185d') : '#d1d5db',
              color: '#fff', border: 'none', borderRadius: 12, padding: '14px',
              fontSize: 14, fontWeight: 700, cursor: ready ? 'pointer' : 'not-allowed',
            }}
          >
            {ready
              ? `Charge $${amount}M${double ? ' (doubled)' : ''}`
              : !color ? 'Pick a colour' : 'Pick who pays'}
          </button>
        </>
      )}

      <button
        onClick={onBank}
        style={{
          width: '100%', background: '#f0fdf4', color: '#15803d',
          border: '2px solid #86efac', borderRadius: 12, padding: '12px',
          fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 10,
        }}
      >
        Bank it for ${bankValueOf(card)}M
      </button>
      <CancelButton onClick={onClose} />
    </Sheet>
  );
}

// ── Colour picker ─────────────────────────────────────────────

function ColorModal({ card, colors, title, subtitle, myProperties, onPick, onClose, dismissible = true }) {
  return (
    <Sheet onClose={dismissible ? onClose : undefined}>
      <SheetTitle title={title} subtitle={subtitle ?? card.name} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {colors.map(c => {
          const cfg   = getColorConfig(c);
          const group = myProperties[c];
          return (
            <button
              key={c}
              onClick={() => onPick(c)}
              style={{
                background: cfg.light, color: cfg.bg,
                border: `2px solid ${cfg.bg}`, borderRadius: 12,
                padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
              }}
            >
              <span>{cfg.label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>
                {(group?.cards.length ?? 0)}/{SET_SIZE[c] ?? '?'}
              </span>
            </button>
          );
        })}
      </div>
      {dismissible && <CancelButton onClick={onClose} />}
    </Sheet>
  );
}

// ── Generic choice sheet ──────────────────────────────────────

function ChoiceModal({ title, subtitle, options, onPick, onClose }) {
  return (
    <Sheet onClose={onClose}>
      <SheetTitle title={title} subtitle={subtitle} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map(opt => (
          <button
            key={opt.key}
            onClick={() => onPick(opt)}
            style={{
              background: opt.color, color: '#fff', border: 'none',
              borderRadius: 12, padding: '12px 16px',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <CancelButton onClick={onClose} />
    </Sheet>
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
  const initiatorId  = pending.toId ?? pending.initiatorId;
  const isInitiator  = playerId === initiatorId;
  const needsPayment = ['payment', 'birthdayPayment', 'rentPayment'].includes(pending.type);
  const needsAccept  = ['slyDeal', 'forceDeal', 'dealBreaker'].includes(pending.type);

  const jsnBy = pending.justSayNoBy;

  // When the initiator played the most recent JSN (counter-JSN), the TARGET is now on the hook.
  // When the target played the most recent JSN, the INITIATOR needs to counter or concede.
  // Use falsy checks — justSayNoBy is undefined (not null) when no JSN has been played.
  const lastJSNWasInitiator = !!jsnBy && jsnBy === initiatorId;

  const showTargetButtons    = iAmTarget   && (!jsnBy || lastJSNWasInitiator);
  const showInitiatorButtons = isInitiator && !!jsnBy && !lastJSNWasInitiator;

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
    const taken   = findCardInProperties(gameState.players, pending.targetId,    pending.targetCardId);
    const offered = findCardInProperties(gameState.players, pending.initiatorId, pending.offeredCardId);
    if (taken && offered) dealDetail = `Taking: ${taken.name} · Offering: ${offered.name}`;
    else if (taken)       dealDetail = `Taking: ${taken.name}`;
  }

  function playJSN() {
    const jsn = gameState.players[playerId].hand.find(c => c.action === 'justSayNo');
    actions.respondToAction('justSayNo', jsn.id);
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
          {pending.targetColor && ` · ${labelOf(pending.targetColor)} set targeted`}
          {pending.remaining?.length > 0 && ` · ${pending.remaining.length} player(s) left to pay`}
          {dealDetail && dealDetail}
        </div>
        {jsnBy && (
          <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, marginTop: 2 }}>
            🚫 Just Say No! by {getName(jsnBy)}
            {lastJSNWasInitiator && ' — counter Just Say No!'}
          </div>
        )}
      </div>

      {/* Target responds: initial action OR after initiator's counter-JSN */}
      {showTargetButtons && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {needsPayment && (
            <ActionBtn
              label={lastJSNWasInitiator ? 'Pay (JSN countered)' : 'Choose cards to pay'}
              color="#15803d"
              onClick={onOpenPayment}
            />
          )}
          {needsAccept && (
            <ActionBtn
              label={lastJSNWasInitiator ? 'Accept (JSN countered)' : 'Accept'}
              color="#15803d"
              onClick={() => lastJSNWasInitiator
                ? actions.respondToAction('acceptJustSayNo')
                : actions.respondToAction('accept')
              }
            />
          )}
          {hasJSN && (
            <ActionBtn
              label={lastJSNWasInitiator ? 'Counter with Just Say No!' : 'Just Say No!'}
              color="#dc2626"
              onClick={playJSN}
            />
          )}
        </div>
      )}

      {/* Initiator responds: after a target-side JSN */}
      {showInitiatorButtons && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hasJSN && (
            <ActionBtn label="Counter with Just Say No!" color="#7c3aed" onClick={playJSN} />
          )}
          <ActionBtn
            label="Accept — action blocked"
            color="#6b7280"
            onClick={() => actions.respondToAction('acceptJustSayNo')}
          />
        </div>
      )}

      {!showTargetButtons && !showInitiatorButtons && (
        <div style={{ fontSize: 12, color: '#b45309' }}>
          {jsnBy === playerId ? `Waiting for ${getName(lastJSNWasInitiator ? pending.fromId ?? pending.targetId : initiatorId)} to respond…` : 'Waiting for response…'}
        </div>
      )}
    </div>
  );
}

// ── Payment Modal ─────────────────────────────────────────────

function getLockedCardIds(player, selectedCardIds) {
  const selectedSet = new Set(selectedCardIds);
  const locked = new Set();
  for (const group of Object.values(player.properties)) {
    const hotelSelected = group.hotelCard && selectedSet.has(group.hotelCard.id);
    const houseSelected = group.houseCard && selectedSet.has(group.houseCard.id);
    // House locked until hotel is selected
    if (group.hasHotel && !hotelSelected && group.houseCard) locked.add(group.houseCard.id);
    // Properties locked until all required buildings selected
    for (const c of group.cards) {
      if ((group.hasHotel && !hotelSelected) || (group.hasHouse && !houseSelected)) {
        locked.add(c.id);
      }
    }
  }
  return locked;
}

function PaymentModal({ amount, player, selectedCards, selectedTotal, onToggle, onSubmit, onJSN }) {
  const buildingCards = Object.values(player.properties).flatMap(g => [g.houseCard, g.hotelCard].filter(Boolean));
  const allCards   = [...player.bank, ...Object.values(player.properties).flatMap(g => g.cards), ...buildingCards];
  const totalAssets = allCards.reduce((sum, c) => sum + bankValueOf(c), 0);
  const insolvent  = totalAssets < amount;
  const canPay     = selectedTotal >= amount;
  const overpaid   = selectedTotal > amount;
  const lockedCardIds = getLockedCardIds(player, selectedCards.map(c => c.id));

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
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {Object.values(player.properties).flatMap(g => g.cards).map(card => (
                  <Card key={card.id} card={card} dimmed />
                ))}
              </div>
            </>
          )}

          {buildingCards.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 8 }}>BUILDINGS</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                {buildingCards.map(card => <Card key={card.id} card={card} dimmed />)}
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {Object.values(player.properties).flatMap(g => g.cards).map(card => (
            <Card
              key={card.id} card={card}
              selected={!!selectedCards.find(c => c.id === card.id)}
              onClick={lockedCardIds.has(card.id) ? null : onToggle}
              dimmed={lockedCardIds.has(card.id)}
            />
          ))}
          {Object.keys(player.properties).length === 0 && <span style={{ fontSize: 12, color: '#d1d5db' }}>No properties</span>}
        </div>

        {buildingCards.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}>
              BUILDINGS <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(sold at face value)</span>
            </div>
            {lockedCardIds.size > 0 && (
              <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8 }}>
                ⚠ Sell hotel before house, buildings before properties
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {buildingCards.map(card => (
                <Card
                  key={card.id} card={card}
                  selected={!!selectedCards.find(c => c.id === card.id)}
                  onClick={lockedCardIds.has(card.id) ? null : onToggle}
                  dimmed={lockedCardIds.has(card.id)}
                />
              ))}
            </div>
          </>
        )}

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

// ── Discard Modal ─────────────────────────────────────────────

function DiscardModal({ cards, excess, selected, onToggle, onConfirm }) {
  const canConfirm = selected.length === excess;
  const remaining  = excess - selected.length;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-end',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '16px 16px 0 0',
        width: '100%', maxWidth: 480,
        margin: '0 auto',
        padding: '20px 16px 32px',
        maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
          Too many cards!
        </div>
        <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>
          Choose cards to discard:
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          {canConfirm
            ? `✓ Ready — ${excess} card${excess !== 1 ? 's' : ''} selected`
            : `Select ${remaining} more card${remaining !== 1 ? 's' : ''} to discard`}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {cards.map(card => (
            <Card
              key={card.id}
              card={card}
              selected={!!selected.find(c => c.id === card.id)}
              onClick={onToggle}
            />
          ))}
        </div>
        <button
          onClick={onConfirm}
          disabled={!canConfirm}
          style={{
            width: '100%',
            background: canConfirm ? '#dc2626' : '#d1d5db',
            color: '#fff', border: 'none',
            borderRadius: 12, padding: '14px',
            fontSize: 14, fontWeight: 700,
            cursor: canConfirm ? 'pointer' : 'not-allowed',
          }}
        >
          {canConfirm
            ? `Discard ${excess} card${excess !== 1 ? 's' : ''}`
            : `Select ${remaining} more card${remaining !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

// ── Game Log ──────────────────────────────────────────────────

function GameLog({ entries, open, onClose }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, entries.length]);

  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.45)',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      opacity: open ? 1 : 0,
      pointerEvents: open ? 'auto' : 'none',
      transition: 'opacity 0.2s ease',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1e1b2e',
          borderRadius: '20px 20px 0 0',
          maxHeight: '60%',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#e5e7eb' }}>
            📋 Game Log
          </span>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
            color: '#9ca3af', fontSize: 18, width: 30, height: 30, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>×</button>
        </div>

        {/* Entries */}
        <div style={{ overflowY: 'auto', padding: '12px 16px', flex: 1 }}>
          {entries.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              No actions yet.
            </div>
          ) : (
            entries.map((entry, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'baseline',
                padding: '5px 0',
                borderBottom: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}>
                <span style={{
                  fontSize: 10, color: '#6b7280', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                }}>
                  {new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.4 }}>
                  {entry.message}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
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
