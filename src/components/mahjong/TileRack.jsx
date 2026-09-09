import { useMemo, useRef, useState } from 'react';
import Tile from './Tile.jsx';

// Past this much movement a press stops being a tap and becomes a drag.
const DRAG_THRESHOLD = 6;

const setId = ids => [...ids].sort().join(',');

// Where a tile ends up once the held tile is pulled out of `from` and dropped
// at `over`: everything between them slides one slot to close the gap.
function slotFor(index, from, over) {
  if (index === from) return over;
  if (from < over && index > from && index <= over) return index - 1;
  if (from > over && index >= over && index < from) return index + 1;
  return index;
}

// Your rack, arrangeable by dragging. Built on pointer events rather than
// HTML5 drag-and-drop, which iOS Safari doesn't fire at all.
//
// The DOM order never changes while a drag is in flight — tiles are moved with
// transforms instead. That keeps the browser's pointer capture attached to the
// tile under the finger, which reordering the elements would put at risk, and
// it lets the tiles slide into place rather than jumping.
export default function TileRack({ tiles, selectedIds = [], highlightIds, newIds, onSelect, onReorder }) {
  const wrapRef = useRef(null);
  const [drag, setDrag] = useState(null);

  // A reorder shows immediately and holds until the server echoes it back, so
  // the rack never snaps back for a round trip. Tagging it with the set of
  // tiles it describes means it drops itself the moment the hand changes.
  const [pending, setPending] = useState({ key: '', ids: null });
  const handKey = setId(tiles.map(t => t.id));
  const arranged = useMemo(() => {
    if (pending.key !== handKey || !pending.ids) return tiles;
    const byId = new Map(tiles.map(t => [t.id, t]));
    return pending.ids.map(id => byId.get(id));
  }, [tiles, pending, handKey]);

  function beginDrag(e, index) {
    if (e.button != null && e.button !== 0) return;
    // Slot positions are measured once. Every tile is the same size and the
    // count can't change mid-drag, so the grid stays put even as tiles slide
    // between its slots — which is what keeps the drop target from flickering.
    const slots = [...wrapRef.current.children].map(node => {
      const r = node.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({
      pointerId: e.pointerId, slots, from: index, over: index, moved: false,
      startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
      grabX: e.clientX - slots[index].cx,
      grabY: e.clientY - slots[index].cy,
    });
  }

  function moveDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const far = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD;
    if (!drag.moved && !far) return;

    let over = 0, best = Infinity;
    drag.slots.forEach((s, i) => {
      const d = (e.clientX - s.cx) ** 2 + (e.clientY - s.cy) ** 2;
      if (d < best) { best = d; over = i; }
    });
    setDrag(d => d && { ...d, moved: true, over, x: e.clientX, y: e.clientY });
  }

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.moved) {
      onSelect?.(arranged[drag.from]);
    } else if (drag.over !== drag.from) {
      const next = [...arranged];
      const [held] = next.splice(drag.from, 1);
      next.splice(drag.over, 0, held);
      const ids = next.map(t => t.id);
      setPending({ key: setId(ids), ids });
      onReorder?.(ids);
    }
    setDrag(null);
  }

  return (
    <div
      ref={wrapRef}
      style={{
        display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center',
        paddingTop: 8, paddingBottom: 6,
        touchAction: 'none',   // the rack owns the gesture; don't scroll the page
      }}
    >
      {arranged.map((tile, i) => {
        const held = drag?.moved && i === drag.from;
        let transform, transition;

        if (held) {
          const home = drag.slots[i];
          transform = `translate(${drag.x - drag.grabX - home.cx}px, ${drag.y - drag.grabY - home.cy}px) scale(1.12)`;
        } else if (drag?.moved) {
          const to = slotFor(i, drag.from, drag.over);
          const dx = drag.slots[to].cx - drag.slots[i].cx;
          const dy = drag.slots[to].cy - drag.slots[i].cy;
          transform  = `translate(${dx}px, ${dy}px)`;
          transition = 'transform 0.14s ease';
        }

        return (
          <div
            key={tile.id}
            onPointerDown={e => beginDrag(e, i)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={() => setDrag(null)}
            style={{
              touchAction: 'none',
              position: 'relative',
              zIndex: held ? 40 : 1,
              cursor: held ? 'grabbing' : 'grab',
              transform, transition,
              filter: held ? 'drop-shadow(0 10px 14px rgba(0,0,0,0.28))' : undefined,
            }}
          >
            <Tile
              tile={tile}
              small
              cursor="inherit"
              selected={selectedIds.includes(tile.id)}
              highlighted={highlightIds?.has(tile.id)}
              isNew={newIds?.has(tile.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
