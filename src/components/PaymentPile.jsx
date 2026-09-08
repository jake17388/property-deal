import Card from './Card.jsx';
import { bankCardValue } from './BankStacks.jsx';

const CARD_W = 44;   // matches Card's `small` size
const CARD_H = 62;
const MAX_SPREAD = 150;
const IDEAL_OFFSET = 15;

// The pile of cards the player has picked to hand over. Cards land here in the
// order they were tapped; the one on top can be tapped again to send it back.
export default function PaymentPile({ cards, onReturnTop, onReturnAll }) {
  const total = cards.reduce((sum, c) => sum + bankCardValue(c), 0);
  const offset = cards.length > 1
    ? Math.max(5, Math.min(IDEAL_OFFSET, MAX_SPREAD / (cards.length - 1)))
    : 0;
  const spread = offset * (cards.length - 1);

  return (
    <div style={{
      background: '#f9fafb',
      border: '1.5px dashed #d1d5db',
      borderRadius: 12,
      padding: '8px 10px',
      marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6,
      }}>
        <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.06em' }}>
          PAYING
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: total > 0 ? '#15803d' : '#d1d5db' }}>
          ${total}M
        </span>
        {cards.length > 1 && (
          <span
            onClick={onReturnAll}
            style={{
              marginLeft: 'auto', fontSize: 11, color: '#6b7280',
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            return all
          </span>
        )}
      </div>

      {cards.length === 0 ? (
        <div style={{
          height: CARD_H,
          display: 'flex', alignItems: 'center',
          fontSize: 12, color: '#d1d5db', fontStyle: 'italic',
        }}>
          Tap cards below to add them here
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <div style={{
            position: 'relative',
            width: CARD_W + spread,
            height: CARD_H,
            flexShrink: 0,
          }}>
            {cards.map((card, i) => {
              const isTop = i === cards.length - 1;
              return (
                <div
                  key={card.id}
                  title={isTop ? `Tap to put ${card.name ?? `$${card.value}M`} back` : undefined}
                  data-pile-top={isTop ? 'true' : undefined}
                  style={{ position: 'absolute', left: i * offset, top: 0 }}
                >
                  <Card
                    card={card}
                    small
                    onClick={isTop ? onReturnTop : undefined}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1.4, paddingBottom: 2 }}>
            {cards.length} card{cards.length === 1 ? '' : 's'}
            <br />
            tap the top one<br />to put it back
          </div>
        </div>
      )}
    </div>
  );
}
