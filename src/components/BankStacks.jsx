import { useState } from 'react';
import Card from './Card.jsx';

// Value a card is worth once it sits in the bank
export function bankCardValue(card) {
  return card.value ?? card.bankValue ?? 0;
}

const STACK_W  = 44;   // wide enough to stay a comfortable tap target
const STACK_H  = 58;
const LAYER_GAP = 3;   // px each buried card peeks out by
const MAX_LAYERS = 3;  // visual depth cap — the badge carries the real count

// Bank cards collapsed into one stack per denomination ($1M…$10M),
// so a big bank never pushes the properties off screen.
//
// onSelectCard turns the stacks into a picker: tapping a stack hands the next
// card of that denomination to the caller (used by the payment modal) instead
// of opening the read-only detail sheet.
export default function BankStacks({ bank, onSelectCard, emptyText, dimmed }) {
  const [openValue, setOpenValue] = useState(null);

  if (!bank?.length) {
    if (!emptyText) return null;
    return (
      <div style={{ marginBottom: 8 }}>
        <SectionLabel total={0} count={0} />
        <div style={{ fontSize: 12, color: '#d1d5db' }}>{emptyText}</div>
      </div>
    );
  }

  const groups = new Map();
  for (const card of bank) {
    const v = bankCardValue(card);
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(card);
  }
  const denominations = [...groups.keys()].sort((a, b) => a - b);
  const total = bank.reduce((sum, c) => sum + bankCardValue(c), 0);
  const openCards = openValue == null ? null : groups.get(openValue);

  return (
    <div style={{ marginBottom: 8 }}>
      <SectionLabel total={total} count={bank.length} />

      <div style={{
        display: 'flex',
        gap: 6,
        alignItems: 'flex-end',
        // Capped height keeps the bank to one short row whatever it holds;
        // the extra 4px leaves room for the count badges to hang below.
        height: STACK_H + (MAX_LAYERS - 1) * LAYER_GAP + 4,
        paddingBottom: 4,
        overflowX: 'auto',
        boxSizing: 'border-box',
        opacity: dimmed ? 0.35 : 1,
      }}>
        {denominations.map(value => (
          <BankStack
            key={value}
            value={value}
            count={groups.get(value).length}
            selectable={!!onSelectCard}
            onClick={() =>
              onSelectCard
                ? onSelectCard(groups.get(value)[0])
                : setOpenValue(value)
            }
          />
        ))}
      </div>

      {openCards && !onSelectCard && (
        <StackDetail
          value={openValue}
          cards={openCards}
          onClose={() => setOpenValue(null)}
        />
      )}
    </div>
  );
}

function SectionLabel({ total, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 6,
      fontSize: 10, color: '#9ca3af', fontWeight: 600,
      marginBottom: 4, letterSpacing: '0.06em',
    }}>
      BANK
      <span style={{ color: '#15803d', letterSpacing: 0 }}>${total}M</span>
      <span style={{ color: '#d1d5db', fontWeight: 400, letterSpacing: 0 }}>
        · {count} card{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}

function BankStack({ value, count, selectable, onClick }) {
  const layers = Math.min(count, MAX_LAYERS);
  const spread = (layers - 1) * LAYER_GAP;

  return (
    <div
      onClick={onClick}
      title={
        selectable
          ? `Tap to add a $${value}M card to your payment (${count} left)`
          : `${count} card${count === 1 ? '' : 's'} worth $${value}M each`
      }
      style={{
        position: 'relative',
        width: STACK_W + spread,
        height: STACK_H + spread,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {/* Layers painted back-to-front: only the front one shows its face */}
      {Array.from({ length: layers }).map((_, i) => {
        const isFront = i === layers - 1;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: (layers - 1 - i) * LAYER_GAP,
              top: i * LAYER_GAP,
              width: STACK_W,
              height: STACK_H,
              borderRadius: 6,
              background: '#f0fdf4',
              border: `1.5px solid ${isFront ? '#15803d' : '#86efac'}`,
              boxShadow: isFront ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {isFront && (
              <>
                <div style={{
                  background: '#15803d',
                  height: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{
                    fontSize: 6, color: '#fff', fontWeight: 700, letterSpacing: '0.05em',
                  }}>BANK</span>
                </div>
                <div style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: value >= 10 ? 12 : 13,
                  fontWeight: 800,
                  color: '#14532d',
                }}>
                  ${value}M
                </div>
              </>
            )}
          </div>
        );
      })}

      {count > 1 && (
        <span style={{
          position: 'absolute',
          right: spread - 3,
          bottom: -3,
          minWidth: 15,
          height: 15,
          padding: '0 3px',
          borderRadius: 8,
          background: '#15803d',
          color: '#fff',
          fontSize: 9,
          fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid #fff',
          boxSizing: 'border-box',
        }}>
          ×{count}
        </span>
      )}
    </div>
  );
}

function StackDetail({ value, cards, onClose }) {
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
          width: '100%', maxWidth: 300,
          maxHeight: '70vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{
          background: '#15803d', padding: '12px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
            ${value}M stack — {cards.length} card{cards.length === 1 ? '' : 's'}
          </span>
          <span
            onClick={onClose}
            style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)', cursor: 'pointer', lineHeight: 1 }}
          >×</span>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {cards.map(card => (
            <Card key={card.id} card={card} small />
          ))}
        </div>
      </div>
    </div>
  );
}
