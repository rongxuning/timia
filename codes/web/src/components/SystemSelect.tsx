"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnchoredPopover } from "@/components/AnchoredPopover";

export type SystemSelectOption = {
  value: string;
  label: string;
  hint?: string;
  accentClass?: string;
};

export type SystemSelectTriggerState = {
  open: boolean;
  disabled: boolean;
  loading: boolean;
  selected: SystemSelectOption | null;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  toggle: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

type Props = {
  label: string;
  value: string | null;
  options: SystemSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  showAccent?: boolean;
  hideLabel?: boolean;
  compact?: boolean;
  renderTrigger?: (state: SystemSelectTriggerState) => React.ReactNode;
};

export function SystemSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  loading = false,
  placeholder = "请选择",
  searchable = false,
  searchPlaceholder = "搜索…",
  emptyText = "暂无可选项",
  showAccent = true,
  hideLabel = false,
  compact = false,
  renderTrigger,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.value === value) ?? null;
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(normalized) ||
        (option.hint?.toLowerCase().includes(normalized) ?? false),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open || !searchable) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, searchable]);

  useEffect(() => {
    if (disabled || loading) setOpen(false);
  }, [disabled, loading]);

  function openPanel() {
    setQuery("");
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
    setQuery("");
  }

  function toggle() {
    if (open) closePanel();
    else openPanel();
  }

  function pick(option: SystemSelectOption) {
    onChange(option.value);
    closePanel();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function moveActive(direction: 1 | -1) {
    if (filteredOptions.length === 0) return;
    setActiveIndex(
      (current) => (current + direction + filteredOptions.length) % filteredOptions.length,
    );
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled || loading || options.length === 0) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      closePanel();
      return;
    }
    if (event.key === "Tab") {
      closePanel();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openPanel();
      else moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (!open) openPanel();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) pick(filteredOptions[activeIndex] ?? filteredOptions[0]);
      else openPanel();
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePanel();
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && filteredOptions.length > 0) {
      event.preventDefault();
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      pick(filteredOptions[activeIndex] ?? filteredOptions[0]);
    }
  }

  const menu = (
    <AnchoredPopover
      open={open}
      anchorRef={triggerRef}
      onClose={() => {
        closePanel();
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }}
      id={`${uid}-options-panel`}
    >
      {searchable ? (
        <div className="p-1.5">
          <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-bright px-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
            <span className="material-symbols-outlined text-[18px] text-neutral-muted" aria-hidden>
              search
            </span>
            <input
              ref={searchRef}
              type="search"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent py-2 text-small text-text-primary outline-none"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              aria-label={searchPlaceholder}
            />
          </div>
        </div>
      ) : null}
      <ul
        id={`${uid}-options`}
        role="listbox"
        aria-labelledby={hideLabel ? undefined : `${uid}-label`}
        aria-label={hideLabel ? label : undefined}
        className="min-h-0 overflow-y-auto"
      >
        {filteredOptions.length === 0 ? (
          <li className="px-3 py-3 text-caption text-neutral-muted">{emptyText}</li>
        ) : (
          filteredOptions.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li key={option.value}>
                <button
                  id={`${uid}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    isActive || isSelected
                      ? "bg-primary/10 text-primary"
                      : "text-text-primary hover:bg-surface-container-lowest"
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(option)}
                >
                  {showAccent ? (
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        option.accentClass ?? "bg-zinc-300"
                      }`}
                    />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-medium">{option.label}</span>
                    {option.hint ? (
                      <span className="mt-0.5 block text-caption text-neutral-muted">
                        {option.hint}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? (
                    <span
                      className="material-symbols-outlined shrink-0 text-[18px] text-primary"
                      aria-hidden
                    >
                      check
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </AnchoredPopover>
  );

  const triggerState: SystemSelectTriggerState = {
    open,
    disabled,
    loading,
    selected,
    triggerRef,
    toggle,
    onKeyDown: handleTriggerKeyDown,
  };

  return (
    <div ref={rootRef} className={hideLabel ? undefined : "space-y-2"}>
      {hideLabel ? null : (
        <div className="text-sm font-medium text-on-surface-variant" id={`${uid}-label`}>
          {label}
        </div>
      )}
      {renderTrigger ? (
        renderTrigger(triggerState)
      ) : (
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-labelledby={hideLabel ? undefined : `${uid}-label`}
          aria-label={hideLabel ? label : undefined}
          aria-controls={`${uid}-options`}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-activedescendant={open ? `${uid}-option-${activeIndex}` : undefined}
          className={
            compact
              ? "flex h-8 w-full items-center gap-2 rounded-full border border-border-subtle bg-white px-3 text-left text-small outline-none transition-all hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
              : "flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-left text-body outline-none transition-all hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          }
          onClick={toggle}
          onKeyDown={handleTriggerKeyDown}
          disabled={disabled || loading}
        >
          {showAccent ? (
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                selected?.accentClass ?? "bg-zinc-300"
              }`}
            />
          ) : null}
          <span
            className={`min-w-0 flex-1 truncate ${selected ? "text-text-primary" : "text-neutral-muted"}`}
          >
            {loading ? "加载中…" : selected?.label ?? placeholder}
          </span>
          <span
            className={`material-symbols-outlined shrink-0 text-[18px] text-neutral-muted transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
          >
            expand_more
          </span>
        </button>
      )}
      {menu}
    </div>
  );
}
