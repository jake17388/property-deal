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
//
// The card follows the finger on the frame loop, not on React state: a pointer
// reports sixty to a hundred and twenty times a second, and re-rendering at
// that rate to set a position is both slower and jerkier than writing one
// transform per frame. React only hears about the moments that change what is
// on screen — the card lifting, and the zone under it changing.
export default function DragDropProvider({ onDrop, scrollRef, children }) {
  const zones    = useRef(new Map());
  const dragRef  = useRef(null);
  const layerRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);

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

  // Puts the drag layer under the finger. Called from the frame loop, and again
  // the instant the layer mounts so it never paints a frame at the wrong spot.
  const positionLayer = useCallback(node => {
    if (node) layerRef.current = node;
    const el = layerRef.current;
    const d  = dragRef.current;
    if (!el || !d) return;
    el.style.transform = `translate3d(${Math.round(d.x - d.grabX)}px, ${Math.round(d.y - d.grabY)}px, 0)`;
  }, []);

  const beginDrag = useCallback((e, card, source = { from: 'hand' }, onTap = null) => {
    if (e.button != null && e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId, card, source, onTap,
      grabX: e.clientX - r.left, grabY: e.clientY - r.top,
      startX: e.clientX, startY: e.clientY,
      x: e.clientX, y: e.clientY,
      moved: false,
    };
    setDrag({ card, source, moved: false });
    setOver(null);
  }, []);

  const dragging = !!drag;

  const endDrag = useCallback(() => {
    dragRef.current = null;
    layerRef.current = null;
    setDrag(null);
    setOver(null);
  }, []);

  // The finger leaves the card almost immediately — that's the whole point of a
  // drag — so the rest of the gesture is tracked on the window.
  useEffect(() => {
    if (!dragging) return undefined;

    function move(e) {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.x = e.clientX;
      d.y = e.clientY;
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD) {
        d.moved = true;
        setDrag(prev => (prev ? { ...prev, moved: true } : prev));
      }
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
      endDrag();
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [dragging, hitTest, onDrop, endDrag]);

  // Moving the card, deciding which zone is under it, and scrolling the board
  // when the finger reaches its edge all run off the frame loop: a finger held
  // near the edge keeps scrolling, and the zone under it keeps up as the board
  // slides past.
  useEffect(() => {
    if (!dragging) return undefined;
    let raf  = 0;
    let last = null;
    const tick = () => {
      const d = dragRef.current;
      if (d?.moved) {
        positionLayer();

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

        // Hit-testing reads every zone's box, which the browser can only answer
        // by settling the layout — so it is worth skipping on the frames where
        // nothing the answer depends on has moved.
        const scrollTop = el?.scrollTop ?? 0;
        if (!last || last.x !== d.x || last.y !== d.y || last.scrollTop !== scrollTop) {
          last = { x: d.x, y: d.y, scrollTop };
          const hit = hitTest(d.card, d.source, d.x, d.y);
          const id  = hit?.id ?? null;
          setOver(prev => (prev?.id === id ? prev : (hit ? { id, data: hit.data } : null)));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragging, hitTest, scrollRef, positionLayer]);

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
        <div
          ref={positionLayer}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            zIndex: 300,
            pointerEvents: 'none',
            willChange: 'transform',
          }}
        >
          {/* The lift lives on its own element: the layer's transform is
              rewritten every frame, and an animation there would fight it. */}
          <div className="card-lift" style={{ filter: 'drop-shadow(0 14px 18px rgba(0,0,0,0.32))' }}>
            <Card card={drag.card} />
          </div>
          {chipText && (
            <div style={{
              position: 'absolute', top: '100%', left: '50%',
              transform: 'translate(-50%, 10px)',
              background: '#111827', color: '#fff',
              borderRadius: 20, padding: '4px 10px',
              fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
              animation: 'chip-in 120ms ease-out both',
            }}>
              {chipText}
            </div>
          )}
        </div>
      )}
    </DragDropCtx.Provider>
  );
}
