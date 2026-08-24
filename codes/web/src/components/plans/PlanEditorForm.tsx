"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import type { PlanSlotOut, PlanSlotPut } from "@/lib/api/plans";
import { PLAN_PERIOD_LABEL, PLAN_USAGE_LABEL, PLAN_VISIBILITY_LABEL } from "./planLabels";
import { PlanSlotEditor } from "./PlanSlotEditor";
import {
  draftsToPuts,
  isPlanPeriodKind,
  isPlanUsageKind,
  PLAN_MAX_TAG_LEN,
  PLAN_MAX_TAGS,
  putToDraft,
  slotOutToDraft,
  type PlanPeriodKind,
  type PlanSlotDraft,
  type PlanUsageKind,
  type PlanVisibility,
} from "./planSlots";

const FIELD_CLASS =
  "w-full rounded-lg border border-border-subtle bg-surface-bright px-2.5 py-1.5 text-caption text-text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60";

const INLINE_CONTROL_CLASS =
  "rounded-lg border border-border-subtle bg-surface-bright px-2.5 py-1 text-caption text-text-primary outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60";

const CHOICE_BASE =
  "rounded-lg border px-2.5 py-1 text-caption font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const CHOICE_ON = "border-indigo-200 bg-indigo-50 text-indigo-700";
const CHOICE_OFF = "border-border-subtle bg-white text-text-secondary hover:bg-gray-50";

const FIELD_LABEL_CLASS = "text-caption font-medium text-text-primary";

type CreateGuideStep =
  | "usage_kind"
  | "period_kind"
  | "title"
  | "description"
  | "creator_intro"
  | "tags"
  | "slots";

const CREATE_GUIDE_TEXT: Record<CreateGuideStep, string> = {
  usage_kind:
    "选择规划模式。「计划模式」用于一次性将规划导入到指定周期；「订阅模式」用于按周期重复提醒，每期确认后再导入。",
  period_kind:
    "选择相对周期。时段将按日、周、月或年在相对日历上编排，导入时映射到实际日期。",
  title: "填写标题，让读者快速了解这份规划的主题。",
  description: "填写介绍，说明规划的目的、适用场景与主要内容。",
  creator_intro: "填写创建人介绍，帮助他人了解你的背景或创建初衷。",
  tags: "添加标签，便于他人搜索发现。输入后按回车添加，最多 8 个。",
  slots: "在下方相对日历中点击空白处添加时段，标注每个时间块的任务安排。",
};

function FieldGuide({ children }: { children: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] leading-none text-indigo-700/90 [white-space:nowrap] [word-break:keep-all]">
      {children}
    </span>
  );
}

function FieldHeader({ label, guide }: { label: string; guide?: string }) {
  return (
    <div className="flex flex-row flex-nowrap items-center gap-2 overflow-x-auto">
      <span className={`shrink-0 ${FIELD_LABEL_CLASS}`}>{label}</span>
      {guide ? <FieldGuide>{guide}</FieldGuide> : null}
    </div>
  );
}

function shouldShowCreateGuide(
  step: CreateGuideStep,
  usageKind: PlanUsageKind | "",
  periodKind: PlanPeriodKind | "",
  title: string,
  description: string,
  creatorIntro: string,
  tags: string[],
  slots: PlanSlotDraft[],
): boolean {
  const kindsReady = isPlanUsageKind(usageKind) && isPlanPeriodKind(periodKind);
  switch (step) {
    case "usage_kind":
      return !isPlanUsageKind(usageKind);
    case "period_kind":
      return !isPlanPeriodKind(periodKind);
    case "title":
      return kindsReady && !title.trim();
    case "description":
      return kindsReady && !!title.trim() && !description.trim();
    case "creator_intro":
      return kindsReady && !!title.trim() && !!description.trim() && !creatorIntro.trim();
    case "tags":
      return (
        kindsReady &&
        !!title.trim() &&
        !!description.trim() &&
        !!creatorIntro.trim() &&
        tags.length === 0
      );
    case "slots":
      return (
        kindsReady &&
        !!title.trim() &&
        !!description.trim() &&
        !!creatorIntro.trim() &&
        tags.length > 0 &&
        slots.length === 0
      );
    default:
      return false;
  }
}

export type PlanEditorSubmitData = {
  title: string;
  description: string | null;
  creator_intro: string | null;
  usage_kind: PlanUsageKind;
  period_kind: PlanPeriodKind;
  visibility: PlanVisibility;
  tags: string[];
  slots: PlanSlotPut[];
};

export type PlanEditorFormProps = {
  mode: "create" | "edit";
  cancelHref: string;
  submitting?: boolean;
  error?: string | null;
  /** When set (including empty), seeds slots instead of `initial.slots` (e.g. create-time draft). */
  initialSlotPuts?: PlanSlotPut[] | null;
  initial?: {
    usage_kind: string;
    period_kind: string;
    title: string;
    description?: string | null;
    creator_intro?: string | null;
    visibility: string;
    tags?: string[];
    slots?: PlanSlotOut[];
  };
  onSubmit: (data: PlanEditorSubmitData) => void | Promise<void>;
};

export function PlanEditorForm({
  mode,
  cancelHref,
  submitting = false,
  error,
  initialSlotPuts = null,
  initial,
  onSubmit,
}: PlanEditorFormProps) {
  const locked = mode === "edit";
  const [usageKind, setUsageKind] = useState<PlanUsageKind | "">(
    initial && isPlanUsageKind(initial.usage_kind) ? initial.usage_kind : "",
  );
  const [periodKind, setPeriodKind] = useState<PlanPeriodKind | "">(
    initial && isPlanPeriodKind(initial.period_kind) ? initial.period_kind : "",
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [creatorIntro, setCreatorIntro] = useState(initial?.creator_intro ?? "");
  const [visibility, setVisibility] = useState<PlanVisibility>(
    initial?.visibility === "public" ? "public" : "private",
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [slots, setSlots] = useState<PlanSlotDraft[]>(() =>
    initialSlotPuts != null
      ? initialSlotPuts.map(putToDraft)
      : (initial?.slots ?? []).map(slotOutToDraft),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const kindsReady = isPlanUsageKind(usageKind) && isPlanPeriodKind(periodKind);

  function showCreateGuide(step: CreateGuideStep) {
    if (mode !== "create") return false;
    return shouldShowCreateGuide(
      step,
      usageKind,
      periodKind,
      title,
      description,
      creatorIntro,
      tags,
      slots,
    );
  }

  function addTag(raw: string) {
    const name = raw.trim();
    if (!name) {
      setTagDraft("");
      return;
    }
    if (name.length > PLAN_MAX_TAG_LEN) {
      setTagError(`标签最长 ${PLAN_MAX_TAG_LEN} 字`);
      return;
    }
    if (tags.includes(name)) {
      setTagDraft("");
      setTagError(null);
      return;
    }
    if (tags.length >= PLAN_MAX_TAGS) {
      setTagError(`最多 ${PLAN_MAX_TAGS} 个标签`);
      return;
    }
    setTags([...tags, name]);
    setTagDraft("");
    setTagError(null);
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagDraft);
    } else if (event.key === "Backspace" && !tagDraft && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!isPlanUsageKind(usageKind) || !isPlanPeriodKind(periodKind)) {
      setLocalError("请先选择类型和周期");
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setLocalError("请填写标题");
      return;
    }
    await onSubmit({
      title: trimmedTitle,
      description: description.trim() ? description.trim() : null,
      creator_intro: creatorIntro.trim() ? creatorIntro.trim() : null,
      usage_kind: usageKind,
      period_kind: periodKind,
      visibility,
      tags,
      slots: draftsToPuts(slots),
    });
  }

  return (
    <form className="space-y-md" onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <FieldHeader
          label="模式"
          guide={showCreateGuide("usage_kind") ? CREATE_GUIDE_TEXT.usage_kind : undefined}
        />
        <div className="flex flex-wrap gap-1.5">
          {(["plan_mode", "subscription_mode"] as const).map((value) => (
            <button
              key={value}
              type="button"
              disabled={locked || submitting}
              className={`${CHOICE_BASE} ${usageKind === value ? CHOICE_ON : CHOICE_OFF}`}
              onClick={() => setUsageKind(value)}
            >
              {PLAN_USAGE_LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <FieldHeader
          label="周期"
          guide={showCreateGuide("period_kind") ? CREATE_GUIDE_TEXT.period_kind : undefined}
        />
        <div className="flex flex-wrap gap-1.5">
          {(["day", "week", "month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              disabled={locked || submitting}
              className={`${CHOICE_BASE} ${periodKind === value ? CHOICE_ON : CHOICE_OFF}`}
              onClick={() => {
                if (periodKind === value) return;
                setPeriodKind(value);
                if (!locked) setSlots([]);
              }}
            >
              {PLAN_PERIOD_LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      {kindsReady ? (
        <>
          <div className="space-y-1.5">
            <FieldHeader
              label="标题"
              guide={showCreateGuide("title") ? CREATE_GUIDE_TEXT.title : undefined}
            />
            <input
              className={FIELD_CLASS}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="规划标题"
              required
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <FieldHeader
              label="介绍"
              guide={showCreateGuide("description") ? CREATE_GUIDE_TEXT.description : undefined}
            />
            <textarea
              className={`${FIELD_CLASS} min-h-[72px]`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="规划介绍"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <FieldHeader
              label="创建人介绍"
              guide={showCreateGuide("creator_intro") ? CREATE_GUIDE_TEXT.creator_intro : undefined}
            />
            <textarea
              className={`${FIELD_CLASS} min-h-[60px]`}
              value={creatorIntro}
              onChange={(event) => setCreatorIntro(event.target.value)}
              placeholder="关于这份规划的说明"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <FieldHeader label="范围" />
            <div className="flex flex-wrap gap-1.5">
              {(["private", "public"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={submitting}
                  className={`${CHOICE_BASE} ${visibility === value ? CHOICE_ON : CHOICE_OFF}`}
                  onClick={() => setVisibility(value)}
                >
                  {PLAN_VISIBILITY_LABEL[value]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldHeader
              label="标签"
              guide={showCreateGuide("tags") ? CREATE_GUIDE_TEXT.tags : undefined}
            />
            <div className={`flex items-center gap-1 ${INLINE_CONTROL_CLASS}`}>
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded-full border border-border-subtle bg-white px-1.5 text-[11px] leading-none text-text-secondary"
                  onClick={() => setTags(tags.filter((item) => item !== tag))}
                  aria-label={`移除标签 ${tag}`}
                  disabled={submitting}
                >
                  {tag}
                  <span className="material-symbols-outlined text-[12px]" aria-hidden>
                    close
                  </span>
                </button>
              ))}
              <input
                className="min-w-[72px] flex-1 bg-transparent text-caption leading-normal outline-none"
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={onTagKeyDown}
                onBlur={() => {
                  if (tagDraft.trim()) addTag(tagDraft);
                }}
                placeholder={tags.length ? "" : "输入后回车，最多 8 个"}
                aria-label="添加标签"
                disabled={submitting || tags.length >= PLAN_MAX_TAGS}
              />
            </div>
            {tagError ? <p className="text-[11px] text-error">{tagError}</p> : null}
          </div>
          <PlanSlotEditor
            key={periodKind}
            periodKind={periodKind}
            slots={slots}
            onChange={setSlots}
            guide={showCreateGuide("slots") ? CREATE_GUIDE_TEXT.slots : undefined}
          />
        </>
      ) : null}

      {localError || error ? (
        <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
          {localError || error}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-primary px-3 py-1.5 text-caption text-on-primary disabled:opacity-50"
          disabled={submitting || !kindsReady}
        >
          {submitting ? (mode === "create" ? "创建中…" : "保存中…") : mode === "create" ? "创建" : "保存"}
        </button>
        <Link href={cancelHref} className="rounded-lg px-3 py-1.5 text-caption text-text-secondary hover:bg-gray-100">
          取消
        </Link>
      </div>
    </form>
  );
}
