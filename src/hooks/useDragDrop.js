import { createContext, useCallback, useContext, useEffect, useId, useRef } from 'react';

// Shared by the drag layer and everything that takes part in a drag.
export const DragDropCtx = createContext(null);

// Registers a drop zone with the drag layer.
//
// `data` describes the zone and carries its `accepts(card, source)` predicate.
// The caller rebuilds it on every render so those predicates always close over
// current game state; the registry keeps a ref to it rather than the value, so
// a zone is registered once and never has to re-register.
export function useDropZone(data, enabled = true) {
  const dnd     = useContext(DragDropCtx);
  const id      = useId();
  const nodeRef = useRef(null);
  const dataRef = useRef(data);

  useEffect(() => { dataRef.current = data; });

  const setNode = useCallback(node => { nodeRef.current = node; }, []);

  const { register, unregister } = dnd;
  useEffect(() => {
    if (!enabled) return undefined;
    register(id, nodeRef, dataRef);
    return () => unregister(id);
  }, [register, unregister, id, enabled]);

  const card     = dnd.dragCard;
  const eligible = !!card && enabled && (!data.accepts || data.accepts(card, dnd.dragSource));

  return { attach: setNode, isOver: dnd.overId === id, eligible, dragCard: card };
}

// Lets a card be picked up. `beginDrag` is called from onPointerDown; a press
// that never moves far enough to be a drag comes back as a tap instead.
export function useDragSource() {
  const dnd = useContext(DragDropCtx);
  return { beginDrag: dnd.beginDrag, dragCard: dnd.dragCard };
}
