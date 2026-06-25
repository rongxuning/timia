"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const DRAG_THRESHOLD_PX = 6;

type FloatingDraggableButtonProps = {
  onClick: () => void;
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  initialBottom?: number;
  initialRight?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function FloatingDraggableButton({
  onClick,
  children,
  ariaLabel,
  className = "",
  initialBottom = 24,
  initialRight = 24,
}: FloatingDraggableButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    moved: boolean;
  } | null>(null);

  const syncInitialPosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({
      left: window.innerWidth - initialRight - rect.width,
      top: window.innerHeight - initialBottom - rect.height,
    });
  }, [initialBottom, initialRight]);

  useEffect(() => {
    syncInitialPosition();
  }, [syncInitialPosition]);

  useEffect(() => {
    function keepInViewport() {
      const el = buttonRef.current;
      if (!el) return;
      setPosition((prev) => {
        if (!prev) return prev;
        const rect = el.getBoundingClientRect();
        return {
          left: clamp(prev.left, 0, Math.max(0, window.innerWidth - rect.width)),
          top: clamp(prev.top, 0, Math.max(0, window.innerHeight - rect.height)),
        };
      });
    }

    window.addEventListener("resize", keepInViewport);
    return () => window.removeEventListener("resize", keepInViewport);
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    const el = event.currentTarget;
    let currentPos = position;
    if (!currentPos) {
      const rect = el.getBoundingClientRect();
      currentPos = { left: rect.left, top: rect.top };
      setPosition(currentPos);
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: currentPos.left,
      originTop: currentPos.top,
      moved: false,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
      drag.moved = true;
    }

    const el = buttonRef.current;
    const width = el?.offsetWidth ?? 0;
    const height = el?.offsetHeight ?? 0;

    setPosition({
      left: clamp(drag.originLeft + dx, 0, Math.max(0, window.innerWidth - width)),
      top: clamp(drag.originTop + dy, 0, Math.max(0, window.innerHeight - height)),
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.moved) {
      onClick();
    }
    dragRef.current = null;
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={ariaLabel}
      className={`fixed z-40 touch-none select-none ${className}`.trim()}
      style={
        position
          ? { left: position.left, top: position.top }
          : { right: initialRight, bottom: initialBottom }
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {children}
    </button>
  );
}
