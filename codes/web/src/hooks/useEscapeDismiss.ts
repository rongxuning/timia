"use client";

import { useEffect, useRef } from "react";
import { registerDismissibleLayer } from "@/lib/dismissibleLayerStack";

type Options = {
  open: boolean;
  onDismiss: () => void;
  disabled?: boolean;
  restoreFocus?: boolean;
};

export function useEscapeDismiss({
  open,
  onDismiss,
  disabled = false,
  restoreFocus = true,
}: Options) {
  const dismissRef = useRef(onDismiss);
  const disabledRef = useRef(disabled);

  dismissRef.current = onDismiss;
  disabledRef.current = disabled;

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const unregister = registerDismissibleLayer({
      id: Symbol("dismissible-layer"),
      dismiss: () => dismissRef.current(),
      disabled: () => disabledRef.current,
    });

    return () => {
      unregister();
      if (!restoreFocus || !previouslyFocused?.isConnected) return;
      window.requestAnimationFrame(() => previouslyFocused.focus());
    };
  }, [open, restoreFocus]);
}
