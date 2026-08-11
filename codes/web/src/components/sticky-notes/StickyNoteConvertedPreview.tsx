"use client";

import type { StickyNoteAIParseOut } from "@/lib/api/sticky-notes";
import { priorityLabel } from "@/components/schedule/taskUtils";

type Props = {
  parse: StickyNoteAIParseOut;
};

const STATUS_LABEL: Record<string, string> = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
  archived: "已归档",
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StickyNoteConvertedPreview({ parse }: Props) {
  const draft = parse.draft;
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-container-lowest p-2.5">
      <div className="mb-1.5 flex items-center gap-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-text-secondary" aria-hidden>
          <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/>
        </svg>
        <h4 className="text-caption font-semibold text-text-primary">
          解析结果
        </h4>
      </div>
      {draft ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-2 gap-y-1 text-caption">
          <dt className="text-text-secondary">标题</dt>
          <dd className="font-medium text-text-primary">{draft.title}</dd>
          {draft.body && (
            <>
              <dt className="text-text-secondary">内容</dt>
              <dd className="whitespace-pre-wrap text-text-primary">{draft.body}</dd>
            </>
          )}
          <dt className="text-text-secondary">时间</dt>
          <dd className="text-text-primary">
            {formatDateTime(draft.start_at)} ~ {formatDateTime(draft.end_at)}
          </dd>
          <dt className="text-text-secondary">状态</dt>
          <dd className="text-text-primary">
            {STATUS_LABEL[draft.status] ?? draft.status}
          </dd>
          <dt className="text-text-secondary">优先级</dt>
          <dd className="text-text-primary">
            {priorityLabel(draft.priority)}
          </dd>
          {draft.location && (
            <>
              <dt className="text-text-secondary">地点</dt>
              <dd className="text-text-primary">{draft.location}</dd>
            </>
          )}
          {draft.workspace_name && (
            <>
              <dt className="text-text-secondary">工作空间</dt>
              <dd className="text-text-primary">{draft.workspace_name}</dd>
            </>
          )}
          {draft.project_name && (
            <>
              <dt className="text-text-secondary">项目</dt>
              <dd className="text-text-primary">{draft.project_name}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="text-caption text-text-secondary">任务信息</p>
      )}
    </div>
  );
}
