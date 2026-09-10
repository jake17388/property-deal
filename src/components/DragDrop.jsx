import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from './Card.jsx';
import { DragDropCtx } from '../hooks/useDragDrop.js';

// Past this much movement a press stops being a tap and becomes a drag.
const DRAG_THRESHOLD = 6;
// How close to the edge of the scrolling board the finger has to get before
// the board starts following it, and how fast it moves once it does.
const EDGE       = 74;
const EDGE_SPEED = 16;

// Drag-and-drop for the card table, built on pointer events rather than HTML5
// drag-and-drop, which iOS Safari doesn't fire at all.
//
// Zones register a DOM node plus an `accepts(card, source)` predicate; the
// smallest accepting zone under the finger wins, so a single property card
// beats the group it sits in, which beats the whole player board. The card
// being dragged is drawn in a fixed layer above everything, so nothing on the
// board has to move — or lose pointer capture — while a drag is in flight.
export default function DragDropProvider({ onDrop, scrollRef, children }) {
  const zones   = useRef(new Map());
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);

  useEffect(() => { dragRef.current = drag; });

  const register   = useCallback((id, elRef, dataRef) => { zones.current.set(id, { elRef, dataRef }); }, []);
  const unregister = useCallback(id => { zones.current.delete(id); }, []);

  const hitTest = useCallback((card, source, x, y) => {
    let best = null;
    let bestArea = Infinity;
    for (const [id, { elRef, dataRef }] of zones.current) {
      const el   = elRef.current;
      const data = dataRef.current;
      if (!el || !data) continue;
      if (data.accepts && !data.accepts(card, source)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const area = r.width * r.height;
      if (area < bestArea) { bestArea = area; best = { id, data }; }
    }
    return best;
  }, []);

  const beginDrag = useCallback((e, card, source = { from: 'hand' }, onTap = null) => {
    if (e.button != null && e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const started = {
      pointerId: e.pointerId, card, source, onTap,
      grabX: e.clientX - r.left, grabY: e.clientY - r.top,
      startX: e.clientX, startY: e.clientY,
      x: e.clientX, y: e.clientY,
      moved: false,
    };
    dragRef.current = started;
    setDrag(started);
    setOver(null);
  }, []);

  const dragging = !!drag;

  // The finger leaves the card almost immediately — that's the whole point of a
  // drag — so the rest of the gesture is tracked on the window.
  useEffect(() => {
    if (!dragging) return undefined;

    function move(e) {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD;
      const next = { ...d, x: e.clientX, y: e.clientY, moved };
      dragRef.current = next;
      setDrag(next);
    }

    function up(e) {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.moved) {
        d.onTap?.(d.card);
      } else {
        const hit = hitTest(d.card, d.source, e.clientX, e.clientY);
        onDrop?.(d.card, hit?.data ?? null, d.source);
      }
      dragRef.current = null;
      setDrag(null);
      setOver(null);
    }

    function cancel() {
      dragRef.current = null;
      setDrag(null);
      setOver(null);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [dragging, hitTest, onDrop]);

  // Which zone is under the finger, and scrolling the board when the finger
  // reaches its edge, both run off the frame loop rather than off pointermove:
  // a finger held near the edge keeps scrolling, and the zone under it keeps up
  // as the board slides past.
  useEffect(() => {
    if (!dragging) return undefined;
    let raf = 0;
    const tick = () => {
      const d = dragRef.current;
      if (d?.moved) {
        const el = scrollRef?.current;
        if (el) {
          const r = el.getBoundingClientRect();
          // Only once the finger is actually over the board — otherwise a drag
          // that starts in the hand, which sits below it, would scroll the
          // board out from under the card before it got there.
          const inside = d.x >= r.left && d.x <= r.right && d.y >= r.top && d.y <= r.bottom;
          if (!inside) {
            /* leave the board where it is */
          } else if (d.y < r.top + EDGE) {
            el.scrollTop -= EDGE_SPEED * Math.min(1, (r.top + EDGE - d.y) / EDGE);
          } else if (d.y > r.bottom - EDGE) {
            el.scrollTop += EDGE_SPEED * Math.min(1, (d.y - (r.bottom - EDGE)) / EDGE);
          }
        }
        const hit = hitTest(d.card, d.source, d.x, d.y);
        const id  = hit?.id ?? null;
        setOver(prev => (prev?.id === id ? prev : (hit ? { id, data: hit.data } : null)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragging, hitTest, scrollRef]);

  // Only the two things zones actually watch go into the context, so a pointer
  // that moves sixty times a second doesn't re-render the whole table.
  const dragCard   = drag?.moved ? drag.card   : null;
  const dragSource = drag?.moved ? drag.source : null;
  const overId     = over?.id ?? null;

  const value = useMemo(
    () => ({ register, unregister, beginDrag, dragCard, dragSource, overId }),
    [register, unregister, beginDrag, dragCard, dragSource, overId],
  );

  const chip     = over?.data?.label;
  const chipText = typeof chip === 'function' ? chip(drag?.card, drag?.source) : chip;

  return (
    <DragDropCtx.Provider value={value}>
      {children}
      {drag?.moved && (
        <div style={{
          position: 'fixed',
          left: drag.x - drag.grabX,
          top:  drag.y - drag.grabY,
          zIndex: 300,
          pointerEvents: 'none',
          transform: 'scale(1.08) rotate(-2deg)',
          filter: 'drop-shadow(0 14px 18px rgba(0,0,0,0.32))',
        }}>
          <Card card={drag.card} />
          {chipText && (
            <div style={{
              position: 'absolute', top: '100%', left: '50%',
              transform: 'translate(-50%, 6px)',
              background: '#111827', color: '#fff',
              borderRadius: 20, padding: '4px 10px',
              fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
            }}>
              {chipText}
            </div>
          )}
        </div>
      )}
    </DragDropCtx.Provider>
  );
}
