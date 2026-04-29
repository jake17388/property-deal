import { CARD_TYPE, COLOR } from '../game/cards.js';

const COLOR_CONFIG = {
  [COLOR.BROWN]:      { bg: '#92400e', light: '#fef3c7', label: 'Brown' },
  [COLOR.LIGHT_BLUE]: { bg: '#0284c7', light: '#e0f2fe', label: 'Light Blue' },
  [COLOR.PINK]:       { bg: '#db2777', light: '#fce7f3', label: 'Pink' },
  [COLOR.ORANGE]:     { bg: '#ea580c', light: '#fff7ed', label: 'Orange' },
  [COLOR.RED]:        { bg: '#dc2626', light: '#fef2f2', label: 'Red' },
  [COLOR.YELLOW]:     { bg: '#ca8a04', light: '#fefce8', label: 'Yellow' },
  [COLOR.GREEN]:      { bg: '#16a34a', light: '#f0fdf4', label: 'Green' },
  [COLOR.DARK_BLUE]:  { bg: '#1d4ed8', light: '#eff6ff', label: 'Dark Blue' },
  [COLOR.RAILROAD]:   { bg: '#374151', light: '#f9fafb', label: 'Railroad' },
  [COLOR.UTILITY]:    { bg: '#6b7280', light: '#f3f4f6', label: 'Utility' },
};

export function getColorConfig(color) {
  return COLOR_CONFIG[color] ?? { bg: '#9333ea', light: '#faf5ff', label: color };
}

function getCardVisuals(card) {
  if (card.type === CARD_TYPE.MONEY) {
    return { headerBg: '#15803d', bodyBg: '#f0fdf4', textColor: '#14532d', typeLabel: 'MONEY' };
  }
  if (card.type === CARD_TYPE.ACTION) {
    return { headerBg: '#0369a1', bodyBg: '#f0f9ff', textColor: '#0c4a6e', typeLabel: 'ACTION' };
  }
  if (card.type === CARD_TYPE.RENT) {
    return { headerBg: '#be185d', bodyBg: '#fdf2f8', textColor: '#500724', typeLabel: 'RENT' };
  }
  if (card.type === CARD_TYPE.PROPERTY) {
    const cfg = COLOR_CONFIG[card.color] ?? { bg: '#6b7280', light: '#f3f4f6' };
    return { headerBg: cfg.bg, bodyBg: cfg.light, textColor: cfg.bg, typeLabel: cfg.label?.toUpperCase() };
  }
  if (card.type === CARD_TYPE.WILDCARD) {
    // All-color wildcard: full rainbow gradient
    if (!card.canPayDebt) {
      return {
        headerBg:   'linear-gradient(to right, #92400e, #dc2626, #ea580c, #ca8a04, #16a34a, #0284c7, #1d4ed8, #9333ea)',
        bodyBg:     '#faf5ff',
        textColor:  '#374151',
        valueColor: '#9333ea',
        typeLabel:  'WILD',
      };
    }
    // Two-color wildcard: hard left/right split
    const cfg0 = COLOR_CONFIG[card.colors[0]] ?? { bg: '#9333ea', light: '#faf5ff' };
    const cfg1 = COLOR_CONFIG[card.colors[1]] ?? { bg: '#6b7280', light: '#f3f4f6' };
    return {
      headerBg:   `linear-gradient(to right, ${cfg0.bg} 50%, ${cfg1.bg} 50%)`,
      bodyBg:     `linear-gradient(to right, ${cfg0.light} 50%, ${cfg1.light} 50%)`,
      textColor:  '#374151',
      valueColor: cfg0.bg,
      typeLabel:  'WILD',
    };
  }
  return { headerBg: '#6b7280', bodyBg: '#f3f4f6', textColor: '#111827', typeLabel: '' };
}

export default function Card({ card, onClick, selected, small, faceDown, dimmed, highlighted }) {
  if (faceDown) {
    return (
      <div style={{
        width: small ? 44 : 72,
        height: small ? 62 : 100,
        borderRadius: 8,
        background: 'repeating-linear-gradient(45deg,#1e3a8a,#1e3a8a 4px,#1d4ed8 4px,#1d4ed8 8px)',
        border: '2px solid #1e3a8a',
        flexShrink: 0,
        borderRadius: 8,
      }} />
    );
  }

  const v = getCardVisuals(card);
  const w = small ? 44 : 72;
  const h = small ? 62 : 100;

  return (
    <div
      onClick={() => onClick?.(card)}
      className={highlighted ? 'card-shake' : undefined}
      style={{
        width: w,
        height: h,
        borderRadius: 8,
        background: v.bodyBg,
        border: `2px solid ${selected ? '#f59e0b' : (v.valueColor ?? v.headerBg)}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
        opacity: dimmed ? 0.35 : 1,
        transform: selected ? 'translateY(-8px)' : undefined,
        boxShadow: selected ? '0 8px 20px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
        transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Color header bar */}
      <div style={{
        background: v.headerBg,
        height: small ? 16 : 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: small ? 6 : 8,
          color: '#fff',
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          textShadow: '0 1px 2px rgba(0,0,0,0.4)',
        }}>
          {v.typeLabel}
        </span>
      </div>

      {/* Card body */}
      <div style={{
        flex: 1,
        padding: small ? '3px 4px' : '5px 6px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
        <div style={{
          fontSize: small ? 7 : 9,
          fontWeight: 700,
          color: v.textColor,
          lineHeight: 1.2,
          wordBreak: 'break-word',
        }}>
          {card.name ?? `$${card.value}M`}
        </div>

        <div style={{
          fontSize: small ? 8 : 11,
          fontWeight: 800,
          color: v.valueColor ?? v.headerBg,
          textAlign: 'right',
        }}>
          {card.value > 0 ? `$${card.value}M` : card.bankValue ? `$${card.bankValue}M` : ''}
        </div>
      </div>
    </div>
  );
}