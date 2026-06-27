"use client";

import type { StatusKey } from "@/types/api/views/schedule";

export const TASK_STATUS_ICON: Record<
  StatusKey,
  { icon: string; label: string; colorClass: string; completeOnClick: boolean }
> = {
  todo: {
    icon: "radio_button_unchecked",
    label: "未开始",
    colorClass: "text-zinc-400 hover:text-zinc-600",
    completeOnClick: true,
  },
  doing: {
    icon: "timelapse",
    label: "进行中",
    colorClass: "text-indigo-600 hover:text-indigo-700",
    completeOnClick: true,
  },
  done: {
    icon: "check_circle",
    label: "已完成",
    colorClass: "text-success",
    completeOnClick: false,
  },
  archived: {
    icon: "inventory_2",
    label: "已归档",
    colorClass: "text-zinc-400",
    completeOnClick: false,
  },
};

function normalizeStatusKey(status: string): StatusKey {
  if (status === "todo" || status === "doing" || status === "done" || status === "archived") {
    return status;
  }
  return "todo";
}

type TaskStatusIconProps = {
  status: string;
  loading?: boolean;
  onComplete?: () => void;
  size?: "default" | "compact";
};

export function TaskStatusIcon({
  status,
  loading = false,
  onComplete,
  size = "default",
}: TaskStatusIconProps) {
  const key = normalizeStatusKey(status);
  const cfg = TASK_STATUS_ICON[key];
  const canComplete = cfg.completeOnClick && !!onComplete;
  const boxClass = size === "compact" ? "h-4 w-4" : "h-5 w-5";
  const iconClass = size === "compact" ? "text-[14px]" : "text-[18px]";

  if (!canComplete) {
    return (
      <span
        className={`inline-flex ${boxClass} shrink-0 items-center justify-center ${cfg.colorClass}`}
        title={cfg.label}
        aria-label={cfg.label}
      >
        <span className={`material-symbols-outlined ${iconClass} leading-none`}>{cfg.icon}</span>
      </span>
    );
  }

  return (
    <span
      role="button"
      tabIndex={loading ? -1 : 0}
      aria-disabled={loading}
      className={[
        `inline-flex ${boxClass} shrink-0 items-center justify-center rounded-full transition-colors`,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        loading ? "opacity-50 cursor-wait pointer-events-none" : "cursor-pointer",
        cfg.colorClass,
      ].join(" ")}
      title={`${cfg.label} · 点击标记为已完成`}
      aria-label={`${cfg.label}，点击标记为已完成`}
      onClick={(e) => {
        e.stopPropagation();
        if (loading) return;
        onComplete?.();
      }}
      onKeyDown={(e) => {
        if (loading) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onComplete?.();
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span
        className={[
          `material-symbols-outlined ${iconClass} leading-none`,
          loading ? "animate-spin" : "",
        ].join(" ")}
      >
        {loading ? "progress_activity" : cfg.icon}
      </span>
    </span>
  );
}
