"use client";

import { useLayoutEffect, useRef } from "react";

const CARD_SELECTOR = "[data-card-reorder-id]";

export function useCardReorderAnimation(orderKey: string) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousRectsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cards = Array.from(container.querySelectorAll<HTMLElement>(CARD_SELECTOR));
    const nextRects = new Map<string, DOMRect>();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (const card of cards) {
      const id = card.dataset.cardReorderId;
      if (!id) continue;
      const nextRect = card.getBoundingClientRect();
      nextRects.set(id, nextRect);
      const previousRect = previousRectsRef.current.get(id);
      if (!previousRect || reduceMotion) continue;

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;

      card.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)`, zIndex: 2 },
          { transform: "translate(0, 0)", zIndex: 2 },
        ],
        { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }

    previousRectsRef.current = nextRects;
  }, [orderKey]);

  return containerRef;
}
