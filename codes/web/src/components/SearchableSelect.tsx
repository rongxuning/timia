"use client";

import { useEffect, useId, useRef, useState } from "react";

export type SearchableSelectOption = {
  id: string;
  label: string;
  hint?: string;
};

type SearchableSelectProps = {
  label: string;
  placeholder: string;
  options: SearchableSelectOption[];
  value: string | null;
  onChange: (id: string) => void;
  loading?: boolean;
  disabled?: boolean;
  emptyText?: string;
  noMatchText?: string;
};

export function SearchableSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  loading = false,
  disabled = false,
  emptyText = "暂无可选项",
  noMatchText = "无匹配项",
}: SearchableSelectProps) {
  const uid = useId().replace(/:/g, "");
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);

  const selected = options.find((o) => o.id === value) ?? null;

  const filtered = options.filter((o) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return o.label.toLowerCase().includes(q) || (o.hint?.toLowerCase().includes(q) ?? false);
  });

  useEffect(() => {
    if (!panelOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (pickerRef.current?.contains(e.target as Node)) return;
      setPanelOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [panelOpen]);

  function pick(id: string) {
    onChange(id);
    setQuery("");
    setPanelOpen(false);
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-on-surface-variant" htmlFor={`${uid}-search`}>
        {label}
      </label>
      {selected ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex max-w-full items-center rounded-full border border-border-subtle bg-surface-bright px-3 py-1 text-small text-text-primary">
            <span className="min-w-0 truncate">{selected.label}</span>
          </span>
        </div>
      ) : null}
      <div className="relative" ref={pickerRef}>
        <input
          id={`${uid}-search`}
          type="search"
          autoComplete="off"
          placeholder={loading ? "加载中…" : placeholder}
          className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none disabled:opacity-50"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPanelOpen(true);
          }}
          onFocus={() => setPanelOpen(true)}
          disabled={disabled || loading || options.length === 0}
        />
        {panelOpen && !loading ? (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-border-subtle bg-surface py-1 shadow-lg"
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-caption text-neutral-muted">{emptyText}</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-caption text-neutral-muted">{noMatchText}</li>
            ) : (
              filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.id === value}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-small text-text-primary hover:bg-surface-container-lowest"
                    onClick={() => pick(o.id)}
                  >
                    <span className="font-medium">{o.label}</span>
                    {o.hint ? <span className="text-caption text-neutral-muted">{o.hint}</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
