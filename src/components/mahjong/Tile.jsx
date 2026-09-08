import {
  TILE_KIND, SUIT_STYLE, DRAGON_STYLE, WIND_LABEL,
} from '../../game/mahjong/tiles.js';

// Same silhouette as the Property Deal card: colour header bar over a tinted
// body, so a mixed table still reads as one game.
function visuals(tile) {
  switch (tile.kind) {
    case TILE_KIND.NUMBER: {
      const s = SUIT_STYLE[tile.suit] ?? SUIT_STYLE.black;
      return { headerBg: s.bg, bodyBg: s.light, ink: s.bg, label: s.label, glyph: String(tile.num) };
    }
    case TILE_KIND.DRAGON: {
      const d = DRAGON_STYLE[tile.dragon] ?? DRAGON_STYLE.soap;
      return {
        headerBg: d.bg, bodyBg: d.light, ink: d.bg,
        label: tile.dragon === 'soap' ? 'Soap' : 'Dragon',
        glyph: tile.dragon === 'soap' ? null : 'D',
        soap: tile.dragon === 'soap',
      };
    }
    case TILE_KIND.WIND:
      return { headerBg: '#111827', bodyBg: '#f9fafb', ink: '#111827', label: WIND_LABEL[tile.wind], glyph: tile.wind };
    case TILE_KIND.FLOWER:
      return { headerBg: '#db2777', bodyBg: '#fce7f3', ink: '#db2777', label: 'Flower', glyph: 'F' };
    case TILE_KIND.JOKER:
      return { headerBg: '#ea580c', bodyBg: '#fff7ed', ink: '#ea580c', label: 'Joker', glyph: 'J' };
    case TILE_KIND.BLANK:
      return { headerBg: '#9ca3af', bodyBg: '#f3f4f6', ink: '#9ca3af', label: 'Blank', glyph: null };
    default:
      return { headerBg: '#6b7280', bodyBg: '#f3f4f6', ink: '#111827', label: '', glyph: '?' };
  }
}

export default function Tile({ tile, onClick, selected, small, faceDown, dimmed, highlighted, badge }) {
  const w = small ? 40 : 58;
  const h = small ? 56 : 82;

  if (faceDown || !tile || tile.kind === 'hidden') {
    return (
      <div style={{
        width: w, height: h, borderRadius: 8, flexShrink: 0,
        background: 'repeating-linear-gradient(45deg,#1e3a8a,#1e3a8a 4px,#1d4ed8 4px,#1d4ed8 8px)',
        border: '2px solid #1e3a8a',
      }} />
    );
  }

  const v = visuals(tile);

  return (
    <div
      onClick={() => onClick?.(tile)}
      className={highlighted ? 'card-shake' : undefined}
      style={{
        width: w, height: h, borderRadius: 8,
        background: v.bodyBg,
        border: selected ? '2px solid #f59e0b' : `2px solid ${v.ink}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
        opacity: dimmed ? 0.35 : 1,
        transform: selected ? 'translateY(-8px)' : undefined,
        boxShadow: selected ? '0 8px 20px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
        transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s',
        userSelect: 'none', position: 'relative',
      }}
    >
      <div style={{
        background: v.headerBg, height: small ? 14 : 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span style={{
          fontSize: small ? 6 : 7, color: '#fff', fontWeight: 700,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          textShadow: '0 1px 2px rgba(0,0,0,0.4)',
        }}>{v.label}</span>
      </div>

      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {v.soap ? (
          // The Soap (white dragon) — an empty white panel, as on a real tile.
          <div style={{
            width: small ? 18 : 26, height: small ? 24 : 34,
            background: '#fff', border: `2px solid ${v.ink}`, borderRadius: 4,
          }} />
        ) : v.glyph ? (
          <span style={{
            fontSize: small ? 20 : 30, fontWeight: 800, color: v.ink, lineHeight: 1,
          }}>{v.glyph}</span>
        ) : null}
      </div>

      {badge != null && (
        <div style={{
          position: 'absolute', top: small ? 15 : 19, right: 2,
          background: '#111827', color: '#fff', borderRadius: 20,
          fontSize: 9, fontWeight: 700, padding: '1px 5px',
        }}>{badge}</div>
      )}
    </div>
  );
}
