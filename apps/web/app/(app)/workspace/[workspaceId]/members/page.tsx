"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";
import { MembershipManager, type MembershipMember } from "@/components/membership/MembershipManager";

type Workspace = { id: string; name: string; description?: string | null; created_by_user_id?: string | null };
type Me = { id: string };
type WorkspaceMember = {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  is_creator?: boolean;
};

type SystemUser = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  workspace_count?: number;
  created_at?: string;
};

export default function MembersPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const token = useMemo(() => getToken(), []);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canManageWorkspace = useMemo(() => {
    if (!me?.id) return false;
    const row = workspaceMembers.find((m) => m.user_id === me.id && m.status === "active");
    return row?.role === "owner";
  }, [me, workspaceMembers]);

  const reload = useCallback(async () => {
    if (!token) return;
    const [m, u, meRes] = await Promise.all([
      apiFetch<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`, { token }),
      apiFetch<SystemUser[]>("/users", { token }).catch(() => [] as SystemUser[]),
      apiFetch<Me>("/auth/me", { token }).catch(() => null as any),
    ]);
    setWorkspaceMembers(m.filter((x) => x.status === "active"));
    setSystemUsers((u ?? []).filter((x) => x.status === "active"));
    setMe(meRes);
  }, [token, workspaceId]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setError(null);
    Promise.all([
      apiFetch<Workspace>(`/workspaces/${workspaceId}`, { token })
        .then((w) => {
          setWorkspace(w);
          primeWorkspaceNameForBreadcrumb(w.id, w.name);
        })
        .catch(() => setWorkspace(null)),
      reload(),
    ]).catch((e: any) => setError(e?.message ?? "加载失败"));
  }, [router, token, workspaceId, reload]);

  const memberUserIds = useMemo(() => new Set(workspaceMembers.map((m) => m.user_id)), [workspaceMembers]);

  const assignableUsers = useMemo(
    () =>
      systemUsers.map((u) => ({
        user_id: u.id,
        email: u.email,
        display_name: u.display_name,
      })),
    [systemUsers],
  );

  const membershipRows: MembershipMember[] = useMemo(
    () =>
      workspaceMembers.map((m) => ({
        user_id: m.user_id,
        email: m.email,
        display_name: m.display_name,
        role: m.role,
        is_creator: m.is_creator,
      })),
    [workspaceMembers],
  );

  async function addToWorkspace(userId: string, role: "owner" | "member") {
    if (!token) return;
    if (!canManageWorkspace) return;
    if (memberUserIds.has(userId)) return;
    const creatorId = workspace?.created_by_user_id;
    const effectiveRole: "owner" | "member" =
      creatorId && userId === creatorId ? "owner" : role;
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<WorkspaceMember>(`/workspaces/${workspaceId}/members`, {
        method: "POST",
        token,
        body: JSON.stringify({ user_id: userId, role: effectiveRole }),
      });
      setWorkspaceMembers((prev) => [created, ...prev]);
    } catch (e: any) {
      setError(e?.message ?? "添加失败（需空间负责人 owner）");
    } finally {
      setSaving(false);
    }
  }

  async function setWorkspaceMemberRole(userId: string, role: "owner" | "member") {
    if (!token) return;
    if (!canManageWorkspace) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<WorkspaceMember>(`/workspaces/${workspaceId}/members/${userId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ role }),
      });
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "更新角色失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeFromWorkspace(userId: string) {
    if (!token) return;
    if (!canManageWorkspace) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<void>(`/workspaces/${workspaceId}/members/${userId}`, {
        method: "DELETE",
        token,
      });
      setWorkspaceMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (e: any) {
      setError(e?.message ?? "移除失败（需空间负责人 owner）");
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
      assignableUsers={assignableUsers}
      inScopeUserIds={memberUserIds}
      rightTitle="工作空间成员"
      rightDescription="从左侧将用户拖到下方「负责人」或「成员」区域即可按对应角色加入。"
      members={membershipRows}
      createdByUserId={workspace?.created_by_user_id}
      sortOwnersCreatorFirst={false}
      onAdd={addToWorkspace}
      onUpdateRole={setWorkspaceMemberRole}
      onRemove={removeFromWorkspace}
    />
  );
}
