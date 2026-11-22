"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

type ModalDialogAriaProps =
  | { titleId: string; ariaLabel?: undefined }
  | { titleId?: undefined; ariaLabel: string };

export type ModalDialogProps = ModalDialogAriaProps & {
  onClose: () => void;
  children: ReactNode | ((api: { requestClose: () => void }) => ReactNode);
  className?: string;
  busy?: boolean;
  lightDismiss?: boolean;
};

function supportsDialogClosedBy(): boolean {
  return typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;
}

function closedByValue(lightDismiss: boolean, busy: boolean): "any" | "closerequest" | "none" {
  if (busy) return "none";
  return lightDismiss ? "any" : "closerequest";
}

export function ModalDialog({
  titleId,
  ariaLabel,
  onClose,
  children,
  className = "",
  busy = false,
  lightDismiss = true,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  const lightDismissRef = useRef(lightDismiss);
  busyRef.current = busy;
  onCloseRef.current = onClose;
  lightDismissRef.current = lightDismiss;

  const requestClose = () => {
    if (busyRef.current) return;
    dialogRef.current?.close();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onDialogClose = () => {
      onCloseRef.current();
    };

    const onCancel = (event: Event) => {
      if (busyRef.current) event.preventDefault();
    };

    // Safari and other browsers without closedby: click outside content box closes.
    const onClick = (event: MouseEvent) => {
      if (!lightDismissRef.current || busyRef.current || supportsDialogClosedBy()) return;
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const { clientX, clientY } = event;
      const outside =
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom;
      if (outside) dialog.close();
    };

    dialog.addEventListener("close", onDialogClose);
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("click", onClick);
    return () => {
      dialog.removeEventListener("close", onDialogClose);
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("click", onClick);
    };
  }, []);

  const content = typeof children === "function" ? children({ requestClose }) : children;
  const closedby = closedByValue(lightDismiss, busy);

  return (
    <dialog
      ref={dialogRef}
      className={`modal-dialog ${className}`.trim()}
      {...(titleId ? { "aria-labelledby": titleId } : { "aria-label": ariaLabel })}
      // HTML attribute; browsers without closedby ignore it and use the click fallback above.
      {...({ closedby } as HTMLAttributes<HTMLDialogElement>)}
    >
      {content}
    </dialog>
  );
}