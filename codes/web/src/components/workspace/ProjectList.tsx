"use client";

import Link from "next/link";
import type { WorkspaceProjectCard } from "@/types/api/views/workspace";

export type ProjectListProps = {
  workspaceId: string;
  projects: WorkspaceProjectCard[];
  canCreateProject: boolean;
  onDeleteProject?: (project: WorkspaceProjectCard) => void;
  deletingProjectId?: string | null;
};

export function ProjectList({
  workspaceId,
  projects,
  canCreateProject,
  onDeleteProject,
  deletingProjectId,
}: ProjectListProps) {
  return (
    <section className="space-y-lg">
      <h2 className="font-subhead text-subhead text-text-primary">进行中的项目</h2>

      {projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-border-subtle p-lg text-small text-text-secondary">
          {canCreateProject
            ? "暂无项目。创建第一个项目即可开始。"
            : "暂无你可访问的项目。请联系空间负责人将你加入项目。"}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
          {projects.map((p) => {
            const total = p.todo_doing + p.done_archived;
            return (
              <Link
                key={p.id}
                href={`/workspace/${workspaceId}/projects/${p.id}`}
                className="bg-white rounded-xl border border-border-subtle overflow-hidden hover:shadow-xl transition-all group relative"
              >
                <div className="p-lg space-y-lg">
                  <div className="flex justify-between items-start gap-md">
                    <div className="min-w-0 flex-1 space-y-xs">
                      <div className="flex w-max max-w-full min-w-0 flex-nowrap items-center gap-sm">
                        <h3 className="font-subhead text-xl text-text-primary group-hover:text-primary transition-colors min-w-0 truncate">
                          {p.name}
                        </h3>
                        <span className="shrink-0 whitespace-nowrap bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-overline">
                          进行中
                        </span>
                      </div>
                      <p className="text-body text-text-secondary text-sm">{p.description || "暂无描述。"}</p>
                    </div>
                    {p.can_manage && onDeleteProject ? (
                      <button
                        type="button"
                        className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 group/delete disabled:cursor-not-allowed disabled:opacity-50"
                        title="删除项目"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDeleteProject(p);
                        }}
                        disabled={deletingProjectId === p.id}
                      >
                        <span className="material-symbols-outlined text-[18px] text-red-600 group-hover/delete:text-red-700">
                          delete
                        </span>
                      </button>
                    ) : null}
                  </div>

                  <div className="space-y-sm">
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
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
