"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

export const PLAN_TABS = ["discover", "created", "imported", "subscribed"] as const;
export type PlanTab = (typeof PLAN_TABS)[number];

export const PLAN_TAB_LABELS: Record<PlanTab, string> = {
  discover: "发现",
  created: "我创建的",
  imported: "已导入",
  subscribed: "订阅中",
};

export type PlanFilterValues = {
  q: string;
  creator_q: string;
  period_kind: string;
  usage_kind: string;
  tags: string[];
  visibility: string;
};

export const EMPTY_PLAN_FILTERS: PlanFilterValues = {
  q: "",
  creator_q: "",
  period_kind: "",
  usage_kind: "",
  tags: [],
  visibility: "",
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

const PERIOD_KIND_SET = new Set(PERIOD_OPTIONS.map((option) => option.value).filter(Boolean));
const USAGE_KIND_SET = new Set(USAGE_OPTIONS.map((option) => option.value).filter(Boolean));
const VISIBILITY_SET = new Set(VISIBILITY_OPTIONS.map((option) => option.value).filter(Boolean));

const FILTER_INPUT_CLASS =
  "rounded-xl border border-border-subtle bg-surface-bright px-3 py-2 text-small text-text-primary outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10";

export function parsePlanTab(raw: string | null): PlanTab {
  if (raw === "created" || raw === "imported" || raw === "subscribed") return raw;
  return "discover";
}

export function parsePlanFilters(searchParams: URLSearchParams): PlanFilterValues {
  const period_kind = searchParams.get("period_kind") ?? "";
  const usage_kind = searchParams.get("usage_kind") ?? "";
  const visibility = searchParams.get("visibility") ?? "";
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
  return params;
}

export function planListHref(tab: PlanTab, filters: PlanFilterValues): string {
  const qs = planListSearchParams(tab, filters).toString();
  return qs ? `/plans?${qs}` : "/plans";
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

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-[160px] flex-1 space-y-1">
        <span className="text-caption text-neutral-muted">名称</span>
        <input
          className={`w-full ${FILTER_INPUT_CLASS}`}
          value={qDraft}
          onChange={(event) => setQDraft(event.target.value)}
          placeholder="按标题搜索"
        />
      </label>
      <label className="min-w-[160px] flex-1 space-y-1">
        <span className="text-caption text-neutral-muted">创建人</span>
        <input
          className={`w-full ${FILTER_INPUT_CLASS}`}
          value={creatorDraft}
          onChange={(event) => setCreatorDraft(event.target.value)}
          placeholder="按创建人搜索"
        />
      </label>
      <label className="w-[140px] space-y-1">
        <span className="text-caption text-neutral-muted">周期</span>
        <select
          className={`w-full ${FILTER_INPUT_CLASS}`}
          value={value.period_kind}
          onChange={(event) => commit({ period_kind: event.target.value })}
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="w-[140px] space-y-1">
        <span className="text-caption text-neutral-muted">类型</span>
        <select
          className={`w-full ${FILTER_INPUT_CLASS}`}
          value={value.usage_kind}
          onChange={(event) => commit({ usage_kind: event.target.value })}
        >
          {USAGE_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {tab === "created" ? (
        <label className="w-[140px] space-y-1">
          <span className="text-caption text-neutral-muted">范围</span>
          <select
            className={`w-full ${FILTER_INPUT_CLASS}`}
            value={value.visibility}
            onChange={(event) => commit({ visibility: event.target.value })}
          >
            {VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <form className="min-w-[180px] flex-1 space-y-1" onSubmit={onTagSubmit}>
        <span className="text-caption text-neutral-muted">标签</span>
        <div className={`flex min-h-[38px] flex-wrap items-center gap-1.5 ${FILTER_INPUT_CLASS}`}>
          {value.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-white px-2 py-0.5 text-caption text-text-secondary"
              onClick={() => commit({ tags: value.tags.filter((item) => item !== tag) })}
              aria-label={`移除标签 ${tag}`}
            >
              {tag}
              <span className="material-symbols-outlined text-[14px]" aria-hidden>
                close
              </span>
            </button>
          ))}
          <input
            className="min-w-[80px] flex-1 bg-transparent py-0.5 text-small text-text-primary outline-none"
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
    </div>
  );
}
