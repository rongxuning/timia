"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

export type AnchoredPopoverPosition = {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
};

type AnchoredPopoverProps = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Optional id for the panel wrapper (not necessarily the listbox) */
  id?: string;
  minWidth?: number;
  maxMenuHeight?: number;
  preferredBelowHeight?: number;
};

function supportsPopover(): boolean {
  return typeof HTMLElement !== "undefined" && Object.hasOwn(HTMLElement.prototype, "popover");
}

/** Prefer the open dialog that owns the anchor so the menu is not inert under showModal(). */
function resolvePortalRoot(anchor: HTMLElement | null): HTMLElement {
  const dialog = anchor?.closest("dialog");
  if (dialog instanceof HTMLElement) return dialog;
  return document.body;
}

/**
 * One-shot flag: after an outside press closes a menu, the next parent-dialog
 * light-dismiss (click or closedby) should be ignored, then the flag clears.
 */
let suppressNextDialogLightDismiss = false;

export function suppressDialogLightDismiss(): void {
  suppressNextDialogLightDismiss = true;
}

/** Returns true once if a menu outside-close asked to suppress the next dismiss. */
export function consumeDialogLightDismissSuppression(): boolean {
  if (!suppressNextDialogLightDismiss) return false;
  suppressNextDialogLightDismiss = false;
  return true;
}

export function clearDialogLightDismissSuppression(): void {
  suppressNextDialogLightDismiss = false;
}

/** Viewport-aware placement relative to an anchor (fallback when CSS anchor positioning is unavailable). */
export function computeAnchoredPosition(
  anchor: DOMRect,
  options?: {
    minWidth?: number;
    maxMenuHeight?: number;
    preferredBelowHeight?: number;
    viewportPadding?: number;
    gap?: number;
  },
): AnchoredPopoverPosition {
  const viewportPadding = options?.viewportPadding ?? 12;
  const gap = options?.gap ?? 8;
  const preferredBelowHeight = options?.preferredBelowHeight ?? 220;
  const maxMenuHeight = options?.maxMenuHeight ?? 320;
  const minWidth = options?.minWidth ?? 280;
  const availableBelow = window.innerHeight - anchor.bottom - viewportPadding - gap;
  const availableAbove = anchor.top - viewportPadding - gap;
  const placeAbove = availableBelow < preferredBelowHeight && availableAbove > availableBelow;
  const availableHeight = Math.max(140, placeAbove ? availableAbove : availableBelow);
  const width = Math.min(Math.max(anchor.width, minWidth), window.innerWidth - viewportPadding * 2);
  const left = Math.min(
    Math.max(viewportPadding, anchor.left),
    window.innerWidth - viewportPadding - width,
  );
  return {
    left,
    width,
    maxHeight: Math.min(maxMenuHeight, availableHeight),
    ...(placeAbove
      ? { bottom: window.innerHeight - anchor.top + gap }
      : { top: anchor.bottom + gap }),
  };
}

/**
 * Top-layer dropdown panel.
 * Uses Popover API with `popover=manual` when available (top layer without treating the
 * trigger as an outside light-dismiss target — that would race with toggle clicks).
 * Falls back to a body portal + fixed positioning so overflow/transform ancestors cannot clip.
 */
export function AnchoredPopover({
  open,
  anchorRef,
  onClose,
  children,
  className = "",
  id,
  minWidth = 280,
  maxMenuHeight = 320,
  preferredBelowHeight = 220,
}: AnchoredPopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const generatedId = useId().replace(/:/g, "");
  const panelId = id ?? `anchored-popover-${generatedId}`;
  const useNativePopover = supportsPopover();

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !open || !anchor) return;

    function place() {
      const el = panelRef.current;
      const trigger = anchorRef.current;
      if (!el || !trigger) return;
      const pos = computeAnchoredPosition(trigger.getBoundingClientRect(), {
        minWidth,
        maxMenuHeight,
        preferredBelowHeight,
      });
      el.style.position = "fixed";
      el.style.left = `${pos.left}px`;
      el.style.width = `${pos.width}px`;
      el.style.maxHeight = `${pos.maxHeight}px`;
      el.style.right = "auto";
      el.style.margin = "0";
      if (pos.top != null) {
        el.style.top = `${pos.top}px`;
        el.style.bottom = "auto";
      } else if (pos.bottom != null) {
        el.style.bottom = `${pos.bottom}px`;
        el.style.top = "auto";
      }
    }

    place();

    if (useNativePopover) {
      try {
        if (!panel.matches(":popover-open")) {
          panel.showPopover();
        }
      } catch {
        // Attribute alone may not open on older engines; keep fixed styles.
      }
    }

    function onViewport() {
      place();
    }
    window.addEventListener("resize", onViewport);
    window.addEventListener("scroll", onViewport, true);
    return () => {
      window.removeEventListener("resize", onViewport);
      window.removeEventListener("scroll", onViewport, true);
    };
  }, [open, anchorRef, minWidth, maxMenuHeight, preferredBelowHeight, useNativePopover]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const current = panelRef.current;
      if (!current) return;
      if (current.contains(target) || anchorRef.current?.contains(target)) return;
      // Only suppress parent light-dismiss when the press is on the dialog scrim
      // or backdrop — not when focusing another control inside the dialog.
      const dialog = anchorRef.current?.closest("dialog");
      if (dialog && (target === dialog || !dialog.contains(target))) {
        suppressDialogLightDismiss();
      }
      onCloseRef.current();
    }

    // Capture phase so we close before the trigger's click toggles open again
    // when the user clicked elsewhere; trigger clicks are ignored above.
    document.addEventListener("mousedown", onPointerDown, true);

    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      if (useNativePopover) {
        try {
          if (panel.matches(":popover-open")) panel.hidePopover();
        } catch {
          /* ignore */
        }
      }
    };
  }, [open, useNativePopover, anchorRef]);

  if (!open) return null;

  const style: CSSProperties = {
    position: "fixed",
    inset: "auto",
    margin: 0,
  };

  const panel = (
    <div
      ref={panelRef}
      id={panelId}
      {...(useNativePopover ? ({ popover: "manual" } as { popover: "manual" }) : {})}
      className={`z-[70] flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface p-1.5 shadow-xl ${className}`.trim()}
      style={style}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      }}
    >
      {children}
    </div>
  );

  // Without Popover top-layer, portal out of overflow/transform ancestors.
  // Stay inside the owning dialog when present so the menu is not inert under showModal().
  if (!useNativePopover && typeof document !== "undefined") {
    return createPortal(panel, resolvePortalRoot(anchorRef.current));
  }
  return panel;
}
