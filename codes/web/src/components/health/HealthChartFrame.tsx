"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

type HealthChartFrameProps = {
  title: string;
  hint?: string;
  aside?: ReactNode;
  help?: ReactNode;
  children: ReactNode;
};

export function HealthChartFrame({ title, hint, aside, help, children }: HealthChartFrameProps) {
  return (
    <section className="mt-lg overflow-visible">
      <div className="flex flex-wrap items-baseline gap-x-md gap-y-1 overflow-visible">
        <div className="flex items-center gap-1.5 overflow-visible">
          <h3 className="text-small font-medium text-text-primary">{title}</h3>
          {help}
        </div>
        {aside}
      </div>
      {hint ? <p className="mt-1 text-caption text-neutral-muted">{hint}</p> : null}
      <div className="mt-sm overflow-visible">{children}</div>
    </section>
  );
}

const HELP_GAP_PX = 8;
const HELP_HIDE_MS = 140;

export function HealthChartHelp({ label, children }: { label: string; children: ReactNode }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const cancelHide = () => {
    if (hideTimer.current == null) return;
    window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };

  const show = () => {
    cancelHide();
    setOpen(true);
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setOpen(false), HELP_HIDE_MS);
  };

  const place = useCallback(() => {
    const icon = wrapRef.current;
    const panel = panelRef.current;
    if (!icon || !panel) return;
    const rect = icon.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = HELP_GAP_PX;
    const panelH = panel.offsetHeight;
    const panelW = panel.offsetWidth;
    // 默认：问号右侧、垂直中线对齐；仅当整框完全离开视口时再轻推，不引入内部滚动。
    let left = rect.right + HELP_GAP_PX;
    let top = rect.top + rect.height / 2;
    if (left + panelW < 0) left = margin;
    if (left > vw) left = Math.max(margin, vw - panelW - margin);
    if (top + panelH / 2 < 0) top = panelH / 2 + margin;
    if (top - panelH / 2 > vh) top = vh - panelH / 2 - margin;
    setStyle({
      position: "fixed",
      left,
      top,
      transform: "translateY(-50%)",
      zIndex: 80,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => place();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, place]);

  useEffect(() => () => cancelHide(), []);

  return (
    <span
      ref={wrapRef}
      className="relative z-20 -m-1 inline-flex shrink-0 items-center overflow-visible p-1"
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      <button
        type="button"
        className="inline-flex size-3 items-center justify-center rounded-full border border-current p-0 text-[8px] leading-none text-neutral-muted hover:bg-gray-50 hover:text-text-secondary"
        aria-label={label}
        aria-expanded={open}
        onFocus={show}
        onBlur={scheduleHide}
        onClick={show}
      >
        ?
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={panelRef}
              role="tooltip"
              className="w-96 max-w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border-subtle bg-white px-md py-md text-left shadow-lg"
              style={style ?? { position: "fixed", left: 0, top: 0, visibility: "hidden", zIndex: 80 }}
              onMouseEnter={show}
              onMouseLeave={scheduleHide}
            >
              {children}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

export function HealthEmptyHint({ text }: { text: string }) {
  return <p className="py-md text-caption text-neutral-muted">{text}</p>;
}

export function HealthStatGrid({ items }: { items: { label: string; value: string }[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="mt-lg grid grid-cols-2 gap-md sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-caption text-neutral-muted">{item.label}</dt>
          <dd className="mt-1 text-small font-medium tabular-nums text-text-primary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HealthSleepStatGrid({ items }: { items: { label: string; value: string }[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="mt-lg grid grid-cols-2 gap-md sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-small font-medium text-text-primary">{item.label}</dt>
          <dd className="mt-1 text-caption tabular-nums text-neutral-muted">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
