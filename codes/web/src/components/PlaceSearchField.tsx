"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { AnchoredPopover } from "@/components/AnchoredPopover";
import { searchGeoPlaces, type GeoPlace } from "@/lib/api/geo";
import {
  geoSearchErrorKind,
  isPinnedPlace,
  placeFromFreeText,
  placeFromSearchHit,
  shouldSearchPlaces,
  type PlaceValue,
  PLACE_NAME_MAX,
  PLACE_SEARCH_DEBOUNCE_MS,
} from "@/lib/placeValue";

type PlaceSearchFieldProps = {
  id?: string;
  value: PlaceValue;
  onChange: (place: PlaceValue) => void;
  token: string | null;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function PlaceSearchField({
  id,
  value,
  onChange,
  token,
  disabled = false,
  onOpenChange,
}: PlaceSearchFieldProps) {
  const t = useTranslations("place");
  const generatedId = useId().replace(/:/g, "");
  const inputId = id ?? `${generatedId}-place`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(value.name);
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<"rateLimited" | "unavailable" | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const pinned = isPinnedPlace(value);
  const listboxId = `${generatedId}-place-list`;

  useEffect(() => {
    if (pinned) {
      setQuery(value.name);
      return;
    }
    setQuery(value.name);
  }, [pinned, value.name]);

  function closePanel() {
    setPanelOpen(false);
    setSearching(false);
  }

  useEffect(() => {
    onOpenChange?.(panelOpen);
  }, [panelOpen, onOpenChange]);

  useEffect(() => {
    if (pinned || disabled) {
      closePanel();
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    if (!shouldSearchPlaces(query) || !token) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      setPanelOpen(true);
      searchGeoPlaces(token, query.trim(), 8, { signal: controller.signal })
        .then((data) => {
          setResults(data.items);
          setSearchError(null);
          setActiveIndex(0);
        })
        .catch((err: unknown) => {
          if ((err as { name?: string } | null)?.name === "AbortError") return;
          setResults([]);
          setSearchError(geoSearchErrorKind(err));
        })
        .finally(() => setSearching(false));
    }, PLACE_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, token, pinned, disabled]);

  function clearPlace() {
    onChange(placeFromFreeText(""));
    setQuery("");
    setResults([]);
    setSearchError(null);
    closePanel();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function pick(hit: GeoPlace) {
    onChange(placeFromSearchHit(hit));
    setQuery(hit.name);
    setResults([]);
    closePanel();
  }

  function handleInputChange(next: string) {
    setQuery(next);
    onChange(placeFromFreeText(next));
    if (shouldSearchPlaces(next)) {
      setPanelOpen(true);
    } else {
      closePanel();
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (panelOpen) {
        event.preventDefault();
        event.stopPropagation();
        closePanel();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!panelOpen || results.length === 0) return;
      event.preventDefault();
      setActiveIndex((current) => {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        return (current + delta + results.length) % results.length;
      });
      return;
    }
    if (event.key === "Enter" && panelOpen && results[activeIndex]) {
      event.preventDefault();
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      pick(results[activeIndex]);
    }
  }

  function handleChipKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      clearPlace();
    }
  }

  const showEmpty =
    panelOpen && !searching && !searchError && results.length === 0 && shouldSearchPlaces(query);

  return (
    <div ref={rootRef} className="space-y-2">
      <label className="text-sm font-medium text-on-surface-variant" htmlFor={pinned ? undefined : inputId}>
        {t("label")}
      </label>
      {pinned ? (
        <div
          ref={chipRef}
          tabIndex={disabled ? -1 : 0}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-lg py-md text-body outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
          onKeyDown={handleChipKeyDown}
          aria-label={t("pinnedAria", { name: value.name })}
        >
          <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden>
            location_on
          </span>
          <span className="min-w-0 flex-1 truncate text-text-primary">{value.name}</span>
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-white/80 hover:text-text-primary"
            onClick={clearPlace}
            disabled={disabled}
            aria-label={t("clear")}
            title={t("clear")}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      ) : (
        <div className="relative">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-neutral-muted"
            aria-hidden
          >
            search
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            maxLength={PLACE_NAME_MAX}
            placeholder={t("placeholder")}
            className="w-full rounded-xl border border-border-subtle bg-surface-bright py-md pl-10 pr-lg text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-50"
            value={query}
            onChange={(event) => handleInputChange(event.target.value)}
            onKeyDown={handleInputKeyDown}
            onFocus={() => {
              if (shouldSearchPlaces(query) && (results.length > 0 || searchError || searching)) {
                setPanelOpen(true);
              }
            }}
            disabled={disabled}
            role="combobox"
            aria-expanded={panelOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
          />
        </div>
      )}
      <AnchoredPopover
        open={panelOpen && !pinned}
        anchorRef={inputRef}
        onClose={closePanel}
        id={`${listboxId}-panel`}
        preferredBelowHeight={180}
        maxMenuHeight={280}
      >
        <div
          id={listboxId}
          className="min-h-0 overflow-y-auto"
          role="listbox"
          aria-label={t("label")}
        >
          {searching ? (
            <div className="px-3 py-2 text-small text-text-secondary">{t("searching")}</div>
          ) : null}
          {searchError ? (
            <div className="px-3 py-2 text-small text-error">
              {searchError === "rateLimited" ? t("rateLimited") : t("error")}
            </div>
          ) : null}
          {showEmpty ? (
            <div className="px-3 py-2 text-small text-text-secondary">{t("empty")}</div>
          ) : null}
          {results.map((hit, index) => (
            <button
              key={`${hit.lat},${hit.lng},${hit.name},${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={[
                "flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition-colors",
                index === activeIndex ? "bg-primary/10" : "hover:bg-surface-container-lowest",
              ].join(" ")}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(hit)}
            >
              <span className="text-small text-text-primary">{hit.name}</span>
              {hit.address ? (
                <span className="text-caption text-text-secondary">{hit.address}</span>
              ) : null}
            </button>
          ))}
        </div>
      </AnchoredPopover>
    </div>
  );
}
