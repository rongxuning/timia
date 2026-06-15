"use client";

import { useRouter } from "next/navigation";
import type { WorkspaceCardView } from "@/types/api/views/workspace";

function getInitial(name: string) {
  const s = name.trim();
  if (!s) return "?";
  return s.slice(0, 1).toUpperCase();
}

function AvatarCircle({ label, title }: { label: string; title: string }) {
  return (
    <div
      title={title}
      className="w-8 h-8 rounded-full border-2 border-white bg-indigo-50 flex items-center justify-center text-[11px] font-bold text-indigo-700"
    >
      {getInitial(label)}
    </div>
  );
}

export type WorkspaceCardGridProps = {
  cards: WorkspaceCardView[];
  deletingId?: string | null;
  onCreateClick: () => void;
  onDeleteClick: (card: WorkspaceCardView) => void;
};

export function WorkspaceCardGrid({ cards, deletingId, onCreateClick, onDeleteClick }: WorkspaceCardGridProps) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
      {cards.map((w) => {
        const owners = w.owners ?? [];
        const members = w.members ?? [];
        const isWorkspaceOwner = w.my_workspace_role === "owner";

        return (
          <section
            key={w.id}
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/workspace/${w.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") router.push(`/workspace/${w.id}`);
            }}
            className="flex h-full flex-col bg-white border border-border-subtle rounded-[12px] p-6 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer outline-none focus:ring-4 focus:ring-primary/10"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="font-subhead text-subhead text-gray-900">{w.name}</h2>
                <p className="text-small text-text-secondary mt-1">
                  {w.description || "供团队与项目使用的协作空间。"}
                </p>
              </div>
              <span className="px-3 py-1 bg-surface-container-low text-primary text-overline rounded-full uppercase tracking-widest">
                {w.project_count} 个项目
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                {w.todo_count} 待办
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                {w.doing_count} 进行中
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {w.done_count} 已完成
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 text-zinc-600 rounded-full text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                {w.archived_count} 已归档
              </div>
            </div>

            <div className="flex flex-1 flex-col space-y-4 border-t border-gray-50 pt-4 mb-6 min-h-0">
              <div>
                <span className="text-overline text-gray-400 mb-2 block">负责人（空间 owner）</span>
                <div className="flex min-h-8 items-center -space-x-2">
                  {owners.slice(0, 2).map((m) => (
                    <AvatarCircle
                      key={m.id}
                      label={m.display_name || m.email}
                      title={`${m.display_name || m.email} (${m.email}) · ${m.role}`}
                    />
                  ))}
                  {owners.length > 2 && (
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                      +{owners.length - 2}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <span className="text-overline text-gray-400 mb-2 block">成员</span>
                <div className="flex min-h-8 items-center -space-x-2">
                  {members.slice(0, 3).map((m) => (
                    <AvatarCircle
                      key={m.id}
                      label={m.display_name || m.email}
                      title={`${m.display_name || m.email} (${m.email}) · ${m.role}`}
                    />
                  ))}
                  {members.length > 3 && (
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                      +{members.length - 3}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-gray-50 pt-4">
              <a
                className="flex-1 h-10 flex items-center justify-center gap-1.5 px-3 border border-border-subtle rounded-lg text-small font-medium hover:bg-gray-50 transition-colors"
                href={`/workspace/${w.id}/members`}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isWorkspaceOwner ? "person_add" : "group"}
                </span>
                {isWorkspaceOwner ? "成员管理" : "查看成员"}
              </a>
              <a
                className="w-10 h-10 flex items-center justify-center border border-border-subtle rounded-lg hover:bg-gray-50 transition-colors group"
                href={`/workspace/${w.id}/activity`}
                title="查看活动记录"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="material-symbols-outlined text-[18px] text-gray-400 group-hover:text-gray-600">
                  history
                </span>
              </a>
              {isWorkspaceOwner ? (
                <button
                  type="button"
                  className="w-10 h-10 flex items-center justify-center rounded-lg border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
                  title="删除工作空间"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClick(w);
                  }}
                  disabled={deletingId === w.id}
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              ) : null}
            </div>
          </section>
        );
      })}

      <button
        type="button"
        className="border-2 border-dashed border-gray-200 rounded-[12px] p-6 flex flex-col items-center justify-center text-center group hover:border-primary/50 transition-colors cursor-pointer min-h-[420px] h-full"
        onClick={onCreateClick}
      >
        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors mb-4">
          <span className="material-symbols-outlined text-[32px]">add</span>
        </div>
        <h3 className="font-subhead text-[18px] text-gray-900">新建工作空间</h3>
        <p className="text-small text-text-secondary mt-2 max-w-[200px]">为下一个重要项目创建新的协作空间。</p>
      </button>
    </div>
  );
}
