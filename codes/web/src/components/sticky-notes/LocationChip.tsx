"use client";

import type { LocationSnapshot } from "@/lib/sticky-notes/geolocation";

type Props = {
  snapshot: LocationSnapshot | null;
  onClick?: () => void;
  onClear?: () => void;
  busy?: boolean;
};

export function LocationChip({ snapshot, onClick, onClear, busy }: Props) {
  const label = snapshot
    ? snapshot.name ?? `(${snapshot.lat.toFixed(4)}, ${snapshot.lng.toFixed(4)})`
    : busy
    ? "定位中…"
    : "地点";

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); }}
      className="inline-flex h-7 cursor-pointer items-center gap-1.5 appearance-none rounded-full border border-border-subtle bg-surface-bright px-3 text-caption"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill={snapshot ? "#2563eb" : "currentColor"}
        style={{ display: "inline-block", verticalAlign: "middle" }}
        aria-hidden
      >
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
      <span className={`max-w-[12rem] truncate ${snapshot ? "text-text-primary" : "text-text-secondary"}`}>
        {label}
      </span>
      {snapshot && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="-mr-1 ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-text-secondary hover:bg-surface-container-lowest hover:text-text-primary"
          aria-label="清除位置"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      )}
    </span>
  );
}
