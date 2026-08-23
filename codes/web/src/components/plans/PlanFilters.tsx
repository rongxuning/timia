"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { SystemSelect, type SystemSelectOption } from "@/components/SystemSelect";

export const PLAN_TABS = ["discover", "created", "imported", "subscribed"] as const;
export type PlanTab = (typeof PLAN_TABS)[number];

export const PLAN_TAB_LABELS: Record<PlanTab, string> = {
  discover: "发现",
  created: "我创建的",
  imported: "已加入",
  subscribed: "订阅中",
};

export type PlanFilterValues = {
  q: string;
  creator_q: string;
  period_kind: string;
  usage_kind: string;
  tags: string[];
  visibility: string;
  favorite: string;
};

export const EMPTY_PLAN_FILTERS: PlanFilterValues = {
  q: "",
  creator_q: "",
  period_kind: "",
  usage_kind: "",
  tags: [],
  visibility: "",
  favorite: "",
};

const PERIOD_OPTIONS = [
  { value: "", label: "全部周期" },
  { value: "day", label: "日" },
  { value: "week", label: "周" },
  { value: "month", label: "月" },
  { value: "year", label: "年" },
];

const USAGE_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "one_shot", label: "加入" },
  { value: "subscription", label: "订阅" },
];

const VISIBILITY_OPTIONS = [
  { value: "", label: "全部范围" },
  { value: "public", label: "公开" },
  { value: "private", label: "私有" },
];

const FAVORITE_OPTIONS = [
  { value: "", label: "全部收藏" },
  { value: "true", label: "已收藏" },
  { value: "false", label: "未收藏" },
];

const PERIOD_KIND_SET = new Set(PERIOD_OPTIONS.map((option) => option.value).filter(Boolean));
const USAGE_KIND_SET = new Set(USAGE_OPTIONS.map((option) => option.value).filter(Boolean));
const VISIBILITY_SET = new Set(VISIBILITY_OPTIONS.map((option) => option.value).filter(Boolean));
const FAVORITE_SET = new Set(FAVORITE_OPTIONS.map((option) => option.value).filter(Boolean));

const FILTER_INPUT_CLASS =
  "box-border h-[38px] rounded-xl border border-border-subtle bg-surface-bright px-3 text-small leading-normal text-text-primary outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10";

const FILTER_FIELD_SHELL =
  "box-border flex h-[38px] items-center gap-1 rounded-xl border border-border-subtle bg-surface-bright px-3 text-small leading-normal text-text-primary transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10";

const TAG_INPUT_SHELL =
  "box-border flex h-[38px] items-center gap-0.5 rounded-xl border border-border-subtle bg-surface-bright px-1.5 py-0.5 text-small leading-normal text-text-primary transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10";

function PlanFilterTextInput({
  label,
  value,
  onChange,
  onClear,
  placeholder,
  className = "w-[186px]",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={`shrink-0 space-y-1 ${className}`}>
      <span className="text-caption text-neutral-muted">{label}</span>
      <div className={FILTER_FIELD_SHELL}>
        <input
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-neutral-muted"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        {value ? (
          <button
            type="button"
            className="flex shrink-0 items-center text-neutral-muted transition-colors hover:text-text-secondary"
            onClick={onClear}
            aria-label={`清除${label}`}
          >
            <span
              className="material-symbols-outlined inline-flex shrink-0 items-center leading-none [font-size:11px] [font-variation-settings:'opsz'_20]"
              aria-hidden
            >
              close
            </span>
          </button>
        ) : null}
      </div>
    </label>
  );
}

const TAG_FILTER_HINT = "所有标签需完全匹配";

function FilterLabelWithHint({ label, hint }: { label: string; hint: string }) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function showTip(x: number, y: number) {
    setTip({ x, y });
  }

  return (
    <span className="inline-flex items-center gap-[2px]">
      <span className="text-caption text-neutral-muted">{label}</span>
      <button
        type="button"
        className="inline-flex h-[12px] w-[12px] items-center justify-center rounded-full text-neutral-muted transition-colors hover:text-text-secondary"
        aria-label={hint}
        onMouseEnter={(event) => showTip(event.clientX, event.clientY)}
        onMouseMove={(event) => showTip(event.clientX, event.clientY)}
        onMouseLeave={() => setTip(null)}
        onFocus={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          showTip(rect.left + rect.width / 2, rect.bottom);
        }}
        onBlur={() => setTip(null)}
      >
        <span className="text-[8px] leading-none" aria-hidden>
          ?
        </span>
      </button>
      {mounted && tip
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[100] whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] leading-snug text-white shadow-md"
              style={{ left: tip.x + 10, top: tip.y + 12 }}
              role="tooltip"
            >
              {hint}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

function PlanFilterSelect({
  label,
  value,
  options,
  onChange,
  className = "w-[140px]",
}: {
  label: string;
  value: string;
  options: SystemSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <span className="text-caption text-neutral-muted">{label}</span>
      <SystemSelect
        label={label}
        hideLabel
        showAccent={false}
        value={value}
        options={options}
        onChange={onChange}
        placeholder={options[0]?.label ?? "请选择"}
        renderTrigger={({ open, disabled, loading, selected, triggerRef, toggle, onKeyDown }) => (
          <button
            ref={triggerRef}
            type="button"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-haspopup="listbox"
            disabled={disabled || loading}
            className={`flex w-full items-center gap-1 py-0 ${FILTER_INPUT_CLASS}`}
            onClick={toggle}
            onKeyDown={onKeyDown}
          >
            <span className="min-w-0 flex-1 truncate text-left">
              {loading ? "加载中…" : (selected?.label ?? options[0]?.label ?? "请选择")}
            </span>
            <span
              className={`material-symbols-outlined shrink-0 text-[16px] text-neutral-muted transition-transform ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden
            >
              expand_more
            </span>
          </button>
        )}
      />
    </div>
  );
}

export function parsePlanTab(raw: string | null): PlanTab {
  if (raw === "created" || raw === "imported" || raw === "subscribed") return raw;
  return "discover";
}

export function parsePlanFilters(searchParams: URLSearchParams): PlanFilterValues {
  const period_kind = searchParams.get("period_kind") ?? "";
  const usage_kind = searchParams.get("usage_kind") ?? "";
  const visibility = searchParams.get("visibility") ?? "";
  const favorite = searchParams.get("favorite") ?? "";
  return {
    q: searchParams.get("q") ?? "",
    creator_q: searchParams.get("creator_q") ?? "",
    period_kind: PERIOD_KIND_SET.has(period_kind) ? period_kind : "",
    usage_kind: USAGE_KIND_SET.has(usage_kind) ? usage_kind : "",
    tags: searchParams
      .getAll("tag")
      .map((tag) => tag.trim())
      .filter(Boolean),
    visibility: VISIBILITY_SET.has(visibility) ? visibility : "",
    favorite: FAVORITE_SET.has(favorite) ? favorite : "",
  };
}

export function planListSearchParams(tab: PlanTab, filters: PlanFilterValues): URLSearchParams {
  const params = new URLSearchParams();
  if (tab !== "discover") params.set("tab", tab);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.creator_q.trim()) params.set("creator_q", filters.creator_q.trim());
  if (filters.period_kind) params.set("period_kind", filters.period_kind);
  if (filters.usage_kind) params.set("usage_kind", filters.usage_kind);
  for (const tag of filters.tags) {
    const name = tag.trim();
    if (name) params.append("tag", name);
  }
  if (tab === "created" && filters.visibility) {
    params.set("visibility", filters.visibility);
  }
  if (filters.favorite) params.set("favorite", filters.favorite);
  return params;
}

export function planListHref(tab: PlanTab, filters: PlanFilterValues): string {
  const qs = planListSearchParams(tab, filters).toString();
  return qs ? `/plans?${qs}` : "/plans";
}

export function PlanTabBar({ tab, filters }: { tab: PlanTab; filters: PlanFilterValues }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="规划列表" className="flex flex-wrap gap-1">
        {PLAN_TABS.map((id) => {
          const selected = tab === id;
          return (
            <Link
              key={id}
              role="tab"
              aria-selected={selected}
              href={planListHref(id, filters)}
              scroll={false}
              className={
                selected
                  ? "rounded-lg bg-indigo-50 px-3 py-1.5 text-small font-medium text-indigo-700"
                  : "rounded-lg px-3 py-1.5 text-small font-medium text-text-secondary transition-colors hover:bg-gray-100"
              }
            >
              {PLAN_TAB_LABELS[id]}
            </Link>
          );
        })}
      </div>
      <Link
        href="/plans/new"
        className="shrink-0 rounded-xl bg-primary px-4 py-2 text-small text-on-primary"
      >
        创建规划
      </Link>
    </div>
  );
}

export type PlanFiltersProps = {
  tab: PlanTab;
  value: PlanFilterValues;
  onChange: (next: PlanFilterValues) => void;
};

export function PlanFilters({ tab, value, onChange }: PlanFiltersProps) {
  const [qDraft, setQDraft] = useState(value.q);
  const [creatorDraft, setCreatorDraft] = useState(value.creator_q);
  const [tagDraft, setTagDraft] = useState("");
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    setQDraft(value.q);
  }, [value.q]);

  useEffect(() => {
    setCreatorDraft(value.creator_q);
  }, [value.creator_q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = valueRef.current;
      if (qDraft === current.q && creatorDraft === current.creator_q) return;
      onChange({ ...current, q: qDraft, creator_q: creatorDraft });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qDraft, creatorDraft, onChange]);

  function commit(next: Partial<PlanFilterValues>) {
    onChange({ ...valueRef.current, q: qDraft, creator_q: creatorDraft, ...next });
  }

  function addTag(raw: string) {
    const name = raw.trim();
    if (!name || value.tags.includes(name)) {
      setTagDraft("");
      return;
    }
    setTagDraft("");
    commit({ tags: [...value.tags, name] });
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagDraft);
    } else if (event.key === "Backspace" && !tagDraft && value.tags.length > 0) {
      commit({ tags: value.tags.slice(0, -1) });
    }
  }

  function onTagSubmit(event: FormEvent) {
    event.preventDefault();
    addTag(tagDraft);
  }

  function clearQ() {
    setQDraft("");
    onChange({ ...valueRef.current, q: "" });
  }

  function clearCreator() {
    setCreatorDraft("");
    onChange({ ...valueRef.current, creator_q: "" });
  }

  function resetAll() {
    setQDraft("");
    setCreatorDraft("");
    setTagDraft("");
    onChange({ ...EMPTY_PLAN_FILTERS });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <PlanFilterTextInput
        label="名称"
        value={qDraft}
        onChange={setQDraft}
        onClear={clearQ}
        placeholder="按标题搜索"
      />
      <PlanFilterTextInput
        label="创建人"
        value={creatorDraft}
        onChange={setCreatorDraft}
        onClear={clearCreator}
        placeholder="按创建人搜索"
      />
      <PlanFilterSelect
        label="周期"
        value={value.period_kind}
        options={PERIOD_OPTIONS}
        onChange={(period_kind) => commit({ period_kind })}
      />
      <PlanFilterSelect
        label="类型"
        value={value.usage_kind}
        options={USAGE_OPTIONS}
        onChange={(usage_kind) => commit({ usage_kind })}
      />
      {tab === "created" ? (
        <PlanFilterSelect
          label="范围"
          value={value.visibility}
          options={VISIBILITY_OPTIONS}
          onChange={(visibility) => commit({ visibility })}
        />
      ) : null}
      <PlanFilterSelect
        label="收藏"
        value={value.favorite}
        options={FAVORITE_OPTIONS}
        onChange={(favorite) => commit({ favorite })}
      />
      <div className="flex min-w-[180px] flex-1 items-end gap-1">
        <form className="min-w-0 flex-1 space-y-1" onSubmit={onTagSubmit}>
          <FilterLabelWithHint label="标签" hint={TAG_FILTER_HINT} />
          <div className={TAG_INPUT_SHELL}>
            {value.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="inline-flex h-[25px] shrink-0 items-center gap-0 rounded-full border border-border-subtle bg-white pl-1.5 pr-0.5 text-[10px] leading-none text-text-secondary"
                onClick={() => commit({ tags: value.tags.filter((item) => item !== tag) })}
                aria-label={`移除标签 ${tag}`}
              >
                {tag}
                <span className="inline-flex w-[10px] items-center justify-center text-[10px] leading-none text-neutral-muted" aria-hidden>
                  ×
                </span>
              </button>
            ))}
            <input
              className="min-w-[60px] flex-1 bg-transparent text-small leading-normal outline-none"
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={onTagKeyDown}
              onBlur={() => {
                if (tagDraft.trim()) addTag(tagDraft);
              }}
              placeholder={value.tags.length ? "" : "输入后回车"}
              aria-label="添加标签"
            />
          </div>
        </form>
        <div className="shrink-0 space-y-1">
          <span className="pointer-events-none text-caption text-transparent select-none" aria-hidden>
            标签
          </span>
          <button
            type="button"
            className={`px-3 text-text-secondary hover:bg-gray-50 ${FILTER_INPUT_CLASS}`}
            onClick={resetAll}
          >
            重置
          </button>
        </div>
      </div>
    </div>
  );
}
