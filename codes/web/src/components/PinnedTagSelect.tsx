"use client";

import { useEffect, useMemo, useState } from "react";
import { SystemSelect, type SystemSelectTriggerState } from "@/components/SystemSelect";
import { sortFavoriteThenCreatedAt, visiblePinnedTags } from "@/lib/pinnedTags";

export type PinnedTagOption = {
  value: string;
  label: string;
  hint?: string;
  is_favorite: boolean;
  created_at: string;
};

type Props = {
  label: string;
  value: string | null;
  options: PinnedTagOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
};

export function PinnedTagSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  loading = false,
  searchable,
  searchPlaceholder,
  emptyText,
}: Props) {
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const optionKey = options
    .map((o) => o.value)
    .slice()
    .sort()
    .join(",");
  const sorted = useMemo(
    () =>
      sortFavoriteThenCreatedAt(
        options.map((o) => ({
          id: o.value,
          is_favorite: o.is_favorite,
          created_at: o.created_at,
          option: o,
        })),
      ),
    [options],
  );
  const tiles = useMemo(() => visiblePinnedTags(sorted, anchorId), [sorted, anchorId]);

  useEffect(() => {
    if (options.length === 0) {
      setAnchorId((prev) => (prev === null ? prev : null));
      return;
    }
    const valueInOptions = Boolean(value && options.some((o) => o.value === value));
    const valueInTiles = Boolean(value && tiles.some((row) => row.id === value));
    const next =
      valueInOptions && !valueInTiles
        ? value
        : !anchorId || !options.some((o) => o.value === anchorId)
          ? valueInOptions
            ? value
            : options[0].value
          : anchorId;
    setAnchorId((prev) => (prev === next ? prev : next));
  }, [optionKey, value, options, tiles, anchorId]);

  function renderPlusTrigger({
    open,
    disabled: triggerDisabled,
    loading: triggerLoading,
    triggerRef,
    toggle,
    onKeyDown,
  }: SystemSelectTriggerState) {
    return (
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={`更多${label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-bright text-text-primary outline-none transition-all hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={toggle}
        onKeyDown={onKeyDown}
        disabled={triggerDisabled || triggerLoading}
      >
        <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
          add
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-on-surface-variant">{label}</div>
      <div className="flex flex-wrap items-center gap-2">
        {loading ? (
          <span className="text-small text-neutral-muted">加载中…</span>
        ) : (
          tiles.map((row) => {
            const selected = row.id === value;
            return (
              <button
                key={row.id}
                type="button"
                aria-pressed={selected}
                className={`inline-flex h-8 max-w-[9rem] items-center rounded-full border px-3 text-small outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border-subtle bg-surface-bright text-text-primary"
                }`}
                disabled={disabled}
                onClick={() => onChange(row.id)}
              >
                <span className="truncate">{row.option.label}</span>
              </button>
            );
          })
        )}
        {options.length > 5 ? (
          <SystemSelect
            label={label}
            value={value}
            options={options.map((o) => ({
              value: o.value,
              label: o.label,
              hint: o.hint,
            }))}
            onChange={onChange}
            disabled={disabled}
            loading={loading}
            searchable={searchable}
            searchPlaceholder={searchPlaceholder}
            emptyText={emptyText}
            hideLabel
            showAccent={false}
            renderTrigger={renderPlusTrigger}
          />
        ) : null}
      </div>
    </div>
  );
}
