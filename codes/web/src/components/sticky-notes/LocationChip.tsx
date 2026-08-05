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
    ? snapshot.name ?? `📍 (${snapshot.lat.toFixed(4)}, ${snapshot.lng.toFixed(4)})`
    : busy
    ? "定位中…"
    : "添加位置";

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-bright px-2 py-1 text-caption leading-none">
      <span
        className="material-icons text-footnote"
        style={{ color: snapshot ? "#2563eb" : undefined }}
        aria-hidden
      >
        place
      </span>
      <button
        type="button"
        onClick={onClick}
        className={`max-w-[12rem] truncate ${snapshot ? "text-text-primary" : "text-text-secondary"} hover:underline`}
        title={label}
      >
        {label}
      </button>
      {snapshot && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="-mr-1 ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-text-secondary hover:bg-surface-container-lowest hover:text-text-primary"
          aria-label="清除位置"
        >
          <span className="material-icons text-footnote" aria-hidden>
            close
          </span>
        </button>
      )}
    </span>
  );
}
