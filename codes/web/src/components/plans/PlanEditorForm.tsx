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
  slotOutToDraft,
  type PlanPeriodKind,
  type PlanSlotDraft,
  type PlanUsageKind,
  type PlanVisibility,
} from "./planSlots";

const FIELD_CLASS =
  "w-full rounded-xl border border-border-subtle bg-surface-bright px-3 py-2 text-small text-text-primary outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60";

const CHOICE_BASE =
  "rounded-xl border px-3 py-2 text-small font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const CHOICE_ON = "border-indigo-200 bg-indigo-50 text-indigo-700";
const CHOICE_OFF = "border-border-subtle bg-white text-text-secondary hover:bg-gray-50";

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
  const [slots, setSlots] = useState<PlanSlotDraft[]>(() => (initial?.slots ?? []).map(slotOutToDraft));
  const [localError, setLocalError] = useState<string | null>(null);

  const kindsReady = isPlanUsageKind(usageKind) && isPlanPeriodKind(periodKind);

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
    <form className="space-y-lg" onSubmit={handleSubmit}>
      <fieldset className="space-y-2">
        <legend className="text-small font-medium text-text-primary">类型</legend>
        <div className="flex flex-wrap gap-2">
          {(["one_shot", "subscription"] as const).map((value) => (
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
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-small font-medium text-text-primary">周期</legend>
        <div className="flex flex-wrap gap-2">
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
      </fieldset>

      {!kindsReady ? (
        <p className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
          请先选择类型和周期
        </p>
      ) : (
        <>
          <label className="block space-y-1">
            <span className="text-caption text-neutral-muted">标题</span>
            <input
              className={FIELD_CLASS}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="规划标题"
              required
              disabled={submitting}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-caption text-neutral-muted">介绍</span>
            <textarea
              className={`${FIELD_CLASS} min-h-[96px]`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="规划介绍"
              disabled={submitting}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-caption text-neutral-muted">创建人介绍</span>
            <textarea
              className={`${FIELD_CLASS} min-h-[72px]`}
              value={creatorIntro}
              onChange={(event) => setCreatorIntro(event.target.value)}
              placeholder="关于这份规划的说明"
              disabled={submitting}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-small font-medium text-text-primary">范围</legend>
            <div className="flex flex-wrap gap-2">
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
          </fieldset>
          <div className="space-y-1">
            <span className="text-caption text-neutral-muted">标签</span>
            <div className={`flex min-h-[42px] flex-wrap items-center gap-1.5 ${FIELD_CLASS}`}>
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-white px-2 py-0.5 text-caption text-text-secondary"
                  onClick={() => setTags(tags.filter((item) => item !== tag))}
                  aria-label={`移除标签 ${tag}`}
                  disabled={submitting}
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
                placeholder={tags.length ? "" : "输入后回车，最多 8 个"}
                aria-label="添加标签"
                disabled={submitting || tags.length >= PLAN_MAX_TAGS}
              />
            </div>
            {tagError ? <p className="text-caption text-error">{tagError}</p> : null}
          </div>
          <PlanSlotEditor
            key={periodKind}
            periodKind={periodKind}
            slots={slots}
            onChange={setSlots}
          />
        </>
      )}

      {localError || error ? (
        <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
          {localError || error}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 text-small text-on-primary disabled:opacity-50"
          disabled={submitting || !kindsReady}
        >
          {submitting ? (mode === "create" ? "创建中…" : "保存中…") : mode === "create" ? "创建" : "保存"}
        </button>
        <Link href={cancelHref} className="rounded-xl px-4 py-2 text-small text-text-secondary hover:bg-gray-100">
          取消
        </Link>
      </div>
    </form>
  );
}
