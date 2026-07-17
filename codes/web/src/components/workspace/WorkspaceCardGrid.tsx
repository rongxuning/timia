"use client";

import { useRouter } from "next/navigation";
import { useCardReorderAnimation } from "@/hooks/useCardReorderAnimation";
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
      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-indigo-50 text-[10px] font-bold text-indigo-700"
    >
      {getInitial(label)}
    </div>
  );
}

export type WorkspaceCardGridProps = {
  cards: WorkspaceCardView[];
  deletingId?: string | null;
  favoritingId?: string | null;
  onCreateClick: () => void;
  onFavoriteClick: (card: WorkspaceCardView) => void;
  onEditClick: (card: WorkspaceCardView) => void;
  onDeleteClick: (card: WorkspaceCardView) => void;
};

export function WorkspaceCardGrid({
  cards,
  deletingId,
  favoritingId,
  onCreateClick,
  onFavoriteClick,
  onEditClick,
  onDeleteClick,
}: WorkspaceCardGridProps) {
  const router = useRouter();
  const orderKey = cards.map((card) => `${card.id}:${card.is_favorite}`).join("|");
  const gridRef = useCardReorderAnimation(orderKey);

  return (
    <div ref={gridRef} className="grid grid-cols-1 gap-sm md:grid-cols-2 xl:grid-cols-4">
      {cards.map((w) => {
        const owners = w.owners ?? [];
        const members = w.members ?? [];
        const isWorkspaceOwner = w.my_workspace_role === "owner";

        return (
          <section
            key={w.id}
            data-card-reorder-id={w.id}
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/workspace/${w.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") router.push(`/workspace/${w.id}`);
            }}
            className="flex h-full min-h-[190px] cursor-pointer flex-col overflow-hidden rounded-xl border border-border-subtle bg-white outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] focus:ring-4 focus:ring-primary/10"
          >
            <div
              className="grid flex-1 grid-cols-[minmax(0,1fr)_146px] items-start gap-4 p-4"
              style={{ backgroundColor: w.color || "#FFFFFF" }}
            >
              <div className="min-w-0">
                <h2 className="truncate font-subhead text-lg font-bold text-black" title={w.name}>{w.name}</h2>
                <p className="mt-1 line-clamp-2 break-words text-caption text-black">
                  {w.description || "供团队与项目使用的协作空间。"}
                </p>
              </div>
              <div className="flex w-[146px] min-w-0 flex-col items-start gap-2 text-left">
                <div className="flex min-h-7 items-center gap-2">
                  <span className="w-8 shrink-0 text-[9px] leading-4 text-black">负责人</span>
                  <div className="flex min-h-7 items-center -space-x-2">
                  {owners.slice(0, 2).map((m) => (
                    <AvatarCircle
                      key={m.id}
                      label={m.display_name || m.email}
                      title={`${m.display_name || m.email} (${m.email}) · ${m.role}`}
                    />
                  ))}
                  {owners.length > 2 && (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[9px] font-bold text-gray-500">
                      +{owners.length - 2}
                    </div>
                  )}
                  </div>
                </div>
                <div className="flex min-h-7 items-center gap-2">
                  <span className="w-8 shrink-0 text-[9px] leading-4 text-black">成员</span>
                  <div className="flex min-h-7 items-center -space-x-2">
                  {members.slice(0, 2).map((m) => (
                    <AvatarCircle
                      key={m.id}
                      label={m.display_name || m.email}
                      title={`${m.display_name || m.email} (${m.email}) · ${m.role}`}
                    />
                  ))}
                  {members.length > 2 && (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[9px] font-bold text-gray-500">
                      +{members.length - 2}
                    </div>
                  )}
                  </div>
                </div>
                <div className="flex min-h-7 items-center gap-2">
                  <span className="w-8 shrink-0 text-[9px] leading-4 text-black">项目</span>
                  <span className="text-[10px] font-semibold text-black">{w.project_count} 个</span>
                </div>
              </div>
            </div>

            <div className="mt-auto flex shrink-0 items-center justify-between gap-1 border-t border-gray-100 px-4 py-3">
              <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold">
                <span className="flex items-center gap-1 whitespace-nowrap text-gray-600" title="待办任务">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />待 {w.todo_count}
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap text-blue-600" title="进行中任务">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />进 {w.doing_count}
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap text-emerald-600" title="已完成任务">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />完 {w.done_count}
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap text-zinc-600" title="已归档任务">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />归 {w.archived_count}
                </span>
              </div>
              <div className="flex w-[146px] shrink-0 items-center justify-start gap-1.5">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50/40 text-primary transition-colors hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                title={w.is_favorite ? "取消收藏" : "收藏工作空间"}
                aria-label={w.is_favorite ? "取消收藏" : "收藏工作空间"}
                onClick={(e) => {
                  e.stopPropagation();
                  onFavoriteClick(w);
                }}
                disabled={favoritingId === w.id}
              >
                <span
                  className="material-symbols-outlined text-[17px]"
                  style={w.is_favorite ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  favorite
                </span>
              </button>
              {isWorkspaceOwner ? (
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50/40 text-primary transition-colors hover:border-indigo-300 hover:bg-indigo-50"
                  title="编辑工作空间"
                  aria-label="编辑工作空间名称、描述与颜色"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditClick(w);
                  }}
                >
                  <span className="material-symbols-outlined text-[17px]">edit</span>
                </button>
              ) : null}
              <a
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50/40 text-primary transition-colors hover:border-indigo-300 hover:bg-indigo-50"
                href={`/workspace/${w.id}/members`}
                title={isWorkspaceOwner ? "成员管理" : "查看成员"}
                aria-label={isWorkspaceOwner ? "成员管理" : "查看成员"}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="material-symbols-outlined text-[17px]">
                  {isWorkspaceOwner ? "person_add" : "group"}
                </span>
              </a>
              {isWorkspaceOwner ? (
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
                  title="删除工作空间"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClick(w);
                  }}
                  disabled={deletingId === w.id}
                >
                  <span className="material-symbols-outlined text-[17px]">delete</span>
                </button>
              ) : null}
              </div>
            </div>
          </section>
        );
      })}

      <button
        type="button"
        data-card-reorder-id="create-workspace"
        className="group flex min-h-[190px] h-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-4 text-center transition-colors hover:border-primary/50"
        onClick={onCreateClick}
      >
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 text-gray-400 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
          <span className="material-symbols-outlined text-[26px]">add</span>
        </div>
        <h3 className="font-subhead text-base font-bold text-black">新建工作空间</h3>
        <p className="mt-1 max-w-[200px] text-caption text-black">为下一个重要项目创建新的协作空间。</p>
      </button>
    </div>
  );
}
