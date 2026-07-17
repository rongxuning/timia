"use client";

import { useRouter } from "next/navigation";
import { useCardReorderAnimation } from "@/hooks/useCardReorderAnimation";
import type { WorkspaceProjectCard } from "@/types/api/views/workspace";

export type ProjectListProps = {
  workspaceId: string;
  projects: WorkspaceProjectCard[];
  canCreateProject: boolean;
  favoritingProjectId?: string | null;
  onFavoriteProject?: (project: WorkspaceProjectCard) => void;
  onEditProject?: (project: WorkspaceProjectCard) => void;
  onDeleteProject?: (project: WorkspaceProjectCard) => void;
  deletingProjectId?: string | null;
};

export function ProjectList({
  workspaceId,
  projects,
  canCreateProject,
  favoritingProjectId,
  onFavoriteProject,
  onEditProject,
  onDeleteProject,
  deletingProjectId,
}: ProjectListProps) {
  const router = useRouter();
  const orderKey = projects.map((project) => `${project.id}:${project.is_favorite}`).join("|");
  const gridRef = useCardReorderAnimation(orderKey);

  return (
    <section>
      {projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-border-subtle p-lg text-small text-text-secondary">
          {canCreateProject
            ? "暂无项目。创建第一个项目即可开始。"
            : "暂无你可访问的项目。请联系空间负责人将你加入项目。"}
        </div>
      ) : (
        <div ref={gridRef} className="grid grid-cols-1 gap-sm sm:grid-cols-2 lg:grid-cols-4">
          {projects.map((p) => {
            const total = p.todo_doing + p.done_archived;
            return (
              <article
                key={p.id}
                data-card-reorder-id={p.id}
                role="link"
                tabIndex={0}
                className="group relative flex min-h-[210px] cursor-pointer flex-col overflow-hidden rounded-xl border border-border-subtle bg-white transition-all hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                onClick={() => router.push(`/workspace/${workspaceId}/projects/${p.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/workspace/${workspaceId}/projects/${p.id}`);
                  }
                }}
              >
                <div className="flex flex-1 flex-col p-4" style={{ backgroundColor: p.color || "#FFFFFF" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="min-w-0">
                        <h3 className="min-w-0 truncate font-subhead text-base text-text-primary transition-colors group-hover:text-primary">
                          {p.name}
                        </h3>
                      </div>
                      <p className="line-clamp-2 break-words text-caption text-text-secondary">{p.description || "暂无描述。"}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 border-t border-border-subtle bg-white p-3">
                  <div className="space-y-2">
                    <div className="flex justify-between text-caption">
                      <span className="text-zinc-500">项目进度</span>
                      <span className="font-bold text-primary">
                        {p.done_archived}/{total}（{p.progress_percent}%）
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${p.progress_percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5">
                    {onFavoriteProject ? (
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50/40 text-primary transition-colors hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                        title={p.is_favorite ? "取消收藏" : "收藏项目"}
                        aria-label={p.is_favorite ? "取消收藏" : "收藏项目"}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onFavoriteProject(p);
                        }}
                        disabled={favoritingProjectId === p.id}
                      >
                        <span
                          className="material-symbols-outlined text-[17px]"
                          style={p.is_favorite ? { fontVariationSettings: "'FILL' 1" } : undefined}
                        >
                          favorite
                        </span>
                      </button>
                    ) : null}
                    {p.can_manage && onEditProject ? (
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50/40 text-primary transition-colors hover:border-indigo-300 hover:bg-indigo-50"
                        title="编辑项目"
                        aria-label="编辑项目"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onEditProject(p);
                        }}
                      >
                        <span className="material-symbols-outlined text-[17px]">edit</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50/40 text-primary transition-colors hover:border-indigo-300 hover:bg-indigo-50"
                      title={p.can_manage ? "成员管理" : "查看成员"}
                      aria-label={p.can_manage ? "成员管理" : "查看成员"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(`/workspace/${workspaceId}/projects/${p.id}/members`);
                      }}
                    >
                      <span className="material-symbols-outlined text-[17px]">
                        {p.can_manage ? "person_add" : "group"}
                      </span>
                    </button>
                    {p.can_manage && onDeleteProject ? (
                      <button
                        type="button"
                        className="group/delete flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        title="删除项目"
                        aria-label="删除项目"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDeleteProject(p);
                        }}
                        disabled={deletingProjectId === p.id}
                      >
                        <span className="material-symbols-outlined text-[17px]">delete</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
