"use client";

import type { StickyNoteAIParseOut } from "@/lib/api/sticky-notes";

type Props = {
  parse: StickyNoteAIParseOut;
  isConverting?: boolean;
  onConvert: () => void | Promise<void>;
  onClose?: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
  archived: "已归档",
};

const PRIORITY_LABEL: Record<string, string> = {
  "1": "P1 · 低",
  "2": "P2",
  "3": "P3",
  "4": "P4 · 高",
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function StickyNoteDraftPreview({
  parse,
  isConverting,
  onConvert,
  onClose,
}: Props) {
  const draft = parse.draft;
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-container-lowest p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="inline-flex items-center gap-1 text-subhead font-semibold text-text-primary">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/>
          </svg>
          任务预览
        </h4>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full text-text-secondary hover:bg-surface-container-lowest hover:text-text-primary"
            aria-label="关闭预览"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        )}
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
            {PRIORITY_LABEL[draft.priority] ?? draft.priority}
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
          {draft.assignee_name && (
            <>
              <dt className="text-text-secondary">负责人</dt>
              <dd className="text-text-primary">{draft.assignee_name}</dd>
            </>
          )}
          {draft.participant_names && draft.participant_names.length > 0 && (
            <>
              <dt className="text-text-secondary">参与人</dt>
              <dd className="text-text-primary">
                {draft.participant_names.join("、")}
              </dd>
            </>
          )}
        </dl>
      ) : (
        <p className="text-caption text-text-secondary">无任务草稿</p>
      )}

      {parse.assumptions && parse.assumptions.length > 0 && (
        <div className="mt-2">
          <p className="text-caption font-semibold text-text-secondary">模型假设</p>
          <ul className="list-disc pl-4 text-caption text-text-secondary">
            {parse.assumptions.map((a, idx) => (
              <li key={idx}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {parse.missing_fields && parse.missing_fields.length > 0 && (
        <div className="mt-1.5">
          <p className="text-caption font-semibold text-warning">缺失信息</p>
          <ul className="list-disc pl-4 text-caption text-warning">
            {parse.missing_fields.map((m, idx) => (
              <li key={idx}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {parse.ambiguities && parse.ambiguities.length > 0 && (
        <div className="mt-1.5">
          <p className="text-caption font-semibold text-warning">歧义</p>
          <ul className="list-disc pl-4 text-caption text-warning">
            {parse.ambiguities.map((a, idx) => (
              <li key={idx}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onConvert}
          disabled={isConverting}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-caption font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isConverting && (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          转化为任务
        </button>
      </div>
    </div>
  );
}
