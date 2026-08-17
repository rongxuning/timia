"use client";

import { useEffect, useRef, useState } from "react";
import { PinnedTagSelect } from "@/components/PinnedTagSelect";
import { ProjectModal, type ProjectModalResult } from "@/components/ProjectModal";
import { WorkspaceModal } from "@/components/WorkspaceModal";
import { fetchWorkspaceCards } from "@/lib/api/workspace-views";
import { fetchMyProjects, type ProjectOption, type WorkspaceOption } from "@/lib/api/workspaces";

type Props = {
  token: string;
  workspaceId: string;
  projectId: string;
  onWorkspaceChange: (workspaceId: string) => void;
  onProjectChange: (projectId: string) => void;
  disabled?: boolean;
};

export function PlanTargetPickers({
  token,
  workspaceId,
  projectId,
  onWorkspaceChange,
  onProjectChange,
  disabled = false,
}: Props) {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const onWorkspaceChangeRef = useRef(onWorkspaceChange);
  const onProjectChangeRef = useRef(onProjectChange);
  onWorkspaceChangeRef.current = onWorkspaceChange;
  onProjectChangeRef.current = onProjectChange;

  useEffect(() => {
    let cancelled = false;
    setWorkspacesLoading(true);
    setLoadError(null);
    fetchWorkspaceCards(token)
      .then((rows) => {
        if (cancelled) return;
        setWorkspaces(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            is_favorite: Boolean(row.is_favorite),
            created_at: row.created_at ?? "",
          })),
        );
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setLoadError(err?.message ?? "工作空间列表加载失败");
      })
      .finally(() => {
        if (!cancelled) setWorkspacesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (workspaceId || workspaces.length === 0) return;
    onWorkspaceChangeRef.current(workspaces[0].id);
  }, [workspaceId, workspaces]);

  useEffect(() => {
    if (!workspaceId) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    setProjects([]);
    setProjectsLoading(true);
    fetchMyProjects(token, workspaceId)
      .then((rows) => {
        if (cancelled) return;
        setProjects(rows);
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setLoadError(err?.message ?? "项目列表加载失败");
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      if (projectId) onProjectChangeRef.current("");
      return;
    }
    if (projects.length === 0) {
      if (projectId) onProjectChangeRef.current("");
      return;
    }
    if (projects.some((row) => row.id === projectId)) return;
    onProjectChangeRef.current(projects[0].id);
  }, [workspaceId, projectId, projects]);

  function onWorkspaceCreated(workspace: WorkspaceOption) {
    setWorkspaces((prev) => [workspace, ...prev.filter((row) => row.id !== workspace.id)]);
    onWorkspaceChange(workspace.id);
  }

  function onProjectCreated(project: ProjectModalResult) {
    const option: ProjectOption = {
      id: project.id,
      name: project.name,
      description: project.description,
      is_favorite: false,
      created_at: project.created_at ?? "",
    };
    setProjects((prev) => [option, ...prev.filter((row) => row.id !== option.id)]);
    onProjectChange(option.id);
  }

  return (
    <div className="space-y-4">
      {loadError ? <p className="text-small text-error">{loadError}</p> : null}
      <PinnedTagSelect
        label="工作空间"
        searchable
        searchPlaceholder="搜索工作空间…"
        options={workspaces.map((workspace) => ({
          value: workspace.id,
          label: workspace.name,
          is_favorite: workspace.is_favorite,
          created_at: workspace.created_at,
        }))}
        value={workspaceId || null}
        onChange={onWorkspaceChange}
        loading={workspacesLoading}
        disabled={disabled}
        emptyText="暂无可用工作空间"
        onCreate={() => setCreateWorkspaceOpen(true)}
      />
      <PinnedTagSelect
        label="所属项目"
        searchable
        searchPlaceholder="搜索所属项目…"
        options={projects.map((project) => ({
          value: project.id,
          label: project.name,
          hint: project.description?.trim() || undefined,
          is_favorite: project.is_favorite,
          created_at: project.created_at,
        }))}
        value={projectId || null}
        onChange={onProjectChange}
        loading={projectsLoading}
        disabled={disabled || !workspaceId}
        emptyText={workspaceId ? "该工作空间下暂无可选项目" : "请先选择工作空间"}
        onCreate={workspaceId ? () => setCreateProjectOpen(true) : undefined}
      />
      <WorkspaceModal
        open={createWorkspaceOpen}
        onClose={() => setCreateWorkspaceOpen(false)}
        token={token}
        onSuccess={onWorkspaceCreated}
      />
      <ProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        workspaceId={workspaceId}
        token={token}
        mode="create"
        onSuccess={onProjectCreated}
      />
    </div>
  );
}
