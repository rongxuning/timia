"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MembershipManager, type MembershipMember } from "@/components/membership/MembershipManager";
import { fetchProjectMembersPage } from "@/lib/api/project-views";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { MembershipRow, ProjectMembersPageView } from "@/types/api/views/members";

export default function ProjectMembersPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string; projectId: string }>();
  const { workspaceId, projectId } = params;
  const token = useMemo(() => getToken(), []);

  const [page, setPage] = useState<ProjectMembersPageView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setPage(await fetchProjectMembersPage(token, workspaceId, projectId));
  }, [token, workspaceId, projectId]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setError(null);
    reload().catch((e: { message?: string }) => setError(e?.message ?? "加载失败"));
  }, [router, token, reload]);

  const projectMembers = page?.project_members ?? [];
  const projectUserIds = useMemo(() => new Set(projectMembers.map((m) => m.user_id)), [projectMembers]);
  const canManageProject = page?.can_manage_project ?? false;

  const membershipRows: MembershipMember[] = useMemo(
    () =>
      projectMembers.map((m: MembershipRow) => ({
        user_id: m.user_id,
        email: m.email,
        display_name: m.display_name,
        role: m.role,
        is_creator: m.is_creator,
      })),
    [projectMembers],
  );

  async function addToProject(userId: string, role: "owner" | "member") {
    if (!token || !canManageProject || projectUserIds.has(userId)) return;
    const creatorId = page?.created_by_user_id;
    const effectiveRole: "owner" | "member" = creatorId && userId === creatorId ? "owner" : role;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/workspaces/${workspaceId}/projects/${projectId}/members`, {
        method: "POST",
        token,
        body: JSON.stringify({ user_id: userId, role: effectiveRole }),
      });
      await reload();
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "添加失败（需项目或空间负责人）");
    } finally {
      setSaving(false);
    }
  }

  async function setProjectMemberRole(userId: string, role: "owner" | "member") {
    if (!token || !canManageProject) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/workspaces/${workspaceId}/projects/${projectId}/members/${userId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ role }),
      });
      await reload();
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "更新角色失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeFromProject(userId: string) {
    if (!token || !canManageProject) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<void>(`/workspaces/${workspaceId}/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
        token,
      });
      await reload();
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "移除失败（需项目或空间负责人）");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MembershipManager
      backHref={`/workspace/${workspaceId}/projects/${projectId}`}
      totalMemberCount={projectMembers.length}
      error={error}
      readOnlyBanner={
        !canManageProject
          ? "你当前为项目成员，仅可查看列表；添加/移除成员与调整角色需项目负责人或空间负责人操作。"
          : null
      }
      canManage={canManageProject}
      saving={saving}
      leftTitle="当前工作空间成员"
      leftDescription="支持姓名、邮箱或用户 ID 模糊搜索；拖拽到右侧「负责人」或「成员」区域按角色加入项目。"
      leftEmptySourceMessage="工作空间暂无成员。"
      assignableUsers={page?.workspace_member_pool ?? []}
      inScopeUserIds={projectUserIds}
      rightTitle="项目成员"
      rightDescription="从左侧将工作空间成员拖到下方「负责人」或「成员」区域即可按对应角色加入项目。项目创建人固定为负责人（owner），不可降级或移除。"
      members={membershipRows}
      createdByUserId={page?.created_by_user_id}
      sortOwnersCreatorFirst
      onAdd={addToProject}
      onUpdateRole={setProjectMemberRole}
      onRemove={removeFromProject}
    />
  );
}
