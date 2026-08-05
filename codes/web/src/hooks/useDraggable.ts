"use client";

import { useEffect, useRef, useState } from "react";

type Options = {
  initialRight?: number;
  initialBottom?: number;
  /** When true, the panel itself is the drag handle. When false, the
   * consumer must attach the handleRef to a separate element. */
  wholePanelDraggable?: boolean;
};

const DRAG_THRESHOLD_PX = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(0, max));
}

/**
 * Drag-to-reposition for floating panels. Returns a panel ref, an optional
 * handle ref, and the current position. When ``position`` is ``null`` we
 * fall back to ``initialRight/initialBottom`` (CSS positioning).
 */
export function useDraggable(opts: Options = {}) {
  const { initialRight = 24, initialBottom = 24, wholePanelDraggable = true } = opts;
  const panelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const target = wholePanelDraggable ? panelRef.current : handleRef.current;
    if (!target) return;

    function onPointerDown(event: PointerEvent) {
      const el = panelRef.current;
      if (!el) return;
      let currentPos = position;
      if (!currentPos) {
        const rect = el.getBoundingClientRect();
        currentPos = { left: rect.left, top: rect.top };
        setPosition(currentPos);
      }
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originLeft: currentPos.left,
        originTop: currentPos.top,
        moved: false,
      };
    }

    function onPointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
        drag.moved = true;
      }
      const el = panelRef.current;
      const width = el?.offsetWidth ?? 0;
      const height = el?.offsetHeight ?? 0;
      setPosition({
        left: clamp(drag.originLeft + dx, 0, Math.max(0, window.innerWidth - width)),
        top: clamp(drag.originTop + dy, 0, Math.max(0, window.innerHeight - height)),
      });
    }

    function onPointerUp(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      (event.currentTarget as Element).releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }

    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerUp);
    return () => {
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      target.removeEventListener("pointercancel", onPointerUp);
    };
  }, [position, wholePanelDraggable]);

  return {
    panelRef,
    handleRef,
    position,
    initialRight,
    initialBottom,
  };
}
