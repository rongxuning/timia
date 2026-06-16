"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";
import { MembershipManager, type MembershipMember } from "@/components/membership/MembershipManager";
import { fetchWorkspaceMembersPage } from "@/lib/api/workspace-views";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { MembershipRow, WorkspaceMembersPageView } from "@/types/api/views/members";

export default function MembersPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const token = useMemo(() => getToken(), []);

  const [page, setPage] = useState<WorkspaceMembersPageView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    const data = await fetchWorkspaceMembersPage(token, workspaceId);
    setPage(data);
    primeWorkspaceNameForBreadcrumb(data.workspace_id, data.name);
  }, [token, workspaceId]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setError(null);
    reload().catch((e: { message?: string }) => setError(e?.message ?? "加载失败"));
  }, [router, token, reload]);

  const workspaceMembers = page?.members ?? [];
  const memberUserIds = useMemo(() => new Set(workspaceMembers.map((m) => m.user_id)), [workspaceMembers]);
  const canManageWorkspace = page?.can_manage_workspace ?? false;

  const membershipRows: MembershipMember[] = useMemo(
    () =>
      workspaceMembers.map((m: MembershipRow) => ({
        user_id: m.user_id,
        email: m.email,
        display_name: m.display_name,
        role: m.role,
        is_creator: m.is_creator,
      })),
    [workspaceMembers],
  );

  async function addToWorkspace(userId: string, role: "owner" | "member") {
    if (!token || !canManageWorkspace || memberUserIds.has(userId)) return;
    const creatorId = page?.created_by_user_id;
    const effectiveRole: "owner" | "member" = creatorId && userId === creatorId ? "owner" : role;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/workspaces/${workspaceId}/members`, {
        method: "POST",
        token,
        body: JSON.stringify({ user_id: userId, role: effectiveRole }),
      });
      await reload();
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "添加失败（需空间负责人 owner）");
    } finally {
      setSaving(false);
    }
  }

  async function setWorkspaceMemberRole(userId: string, role: "owner" | "member") {
    if (!token || !canManageWorkspace) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/workspaces/${workspaceId}/members/${userId}`, {
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

  async function removeFromWorkspace(userId: string) {
    if (!token || !canManageWorkspace) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<void>(`/workspaces/${workspaceId}/members/${userId}`, {
        method: "DELETE",
        token,
      });
      await reload();
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "移除失败（需空间负责人 owner）");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MembershipManager
      backHref={`/workspace/${workspaceId}`}
      totalMemberCount={workspaceMembers.length}
      error={error}
      readOnlyBanner={
        !canManageWorkspace
          ? "你当前为工作空间成员，仅可查看列表；添加/移除成员与调整角色需空间负责人（owner）操作。"
          : null
      }
      canManage={canManageWorkspace}
      saving={saving}
      leftTitle="系统所有成员"
      leftDescription="支持姓名、邮箱或用户 ID 模糊搜索；拖拽到右侧分组即可添加。"
      leftEmptySourceMessage="没有可用的系统用户。"
      assignableUsers={page?.assignable_users ?? []}
      inScopeUserIds={memberUserIds}
      rightTitle="工作空间成员"
      rightDescription="从左侧将用户拖到下方「负责人」或「成员」区域即可按对应角色加入。"
      members={membershipRows}
      createdByUserId={page?.created_by_user_id}
      sortOwnersCreatorFirst={false}
      onAdd={addToWorkspace}
      onUpdateRole={setWorkspaceMemberRole}
      onRemove={removeFromWorkspace}
    />
  );
}
