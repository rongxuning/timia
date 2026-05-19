"use client";

import { useCallback, useMemo, useState, type DragEvent } from "react";

/** Users shown on the left (system users or workspace members). */
export type MembershipAssignable = {
  user_id: string;
  email: string;
  display_name: string;
};

/** Current members of the workspace or project (right column). */
export type MembershipMember = {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  is_creator?: boolean;
};

export type MembershipManagerProps = {
  backHref: string;
  totalMemberCount: number;
  error: string | null;
  readOnlyBanner: string | null;
  canManage: boolean;
  saving: boolean;
  leftTitle: string;
  leftDescription: string;
  /** When the left list has no rows at all (e.g. empty workspace). */
  leftEmptySourceMessage: string;
  assignableUsers: MembershipAssignable[];
  /** user_ids already members of this workspace / project */
  inScopeUserIds: ReadonlySet<string>;
  rightTitle: string;
  rightDescription: string;
  members: MembershipMember[];
  createdByUserId: string | null | undefined;
  /** When true, owner list shows project/workspace creator first. */
  sortOwnersCreatorFirst?: boolean;
  onAdd: (userId: string, role: "owner" | "member") => Promise<void>;
  onUpdateRole: (userId: string, role: "owner" | "member") => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
};

function matchesUserSearch(u: MembershipAssignable, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const name = (u.display_name || "").toLowerCase();
  const email = (u.email || "").toLowerCase();
  const id = (u.user_id || "").toLowerCase();
  return name.includes(s) || email.includes(s) || id.includes(s);
}

export function MembershipManager({
  backHref,
  totalMemberCount,
  error,
  readOnlyBanner,
  canManage,
  saving,
  leftTitle,
  leftDescription,
  leftEmptySourceMessage,
  assignableUsers,
  inScopeUserIds,
  rightTitle,
  rightDescription,
  members,
  createdByUserId,
  sortOwnersCreatorFirst = false,
  onAdd,
  onUpdateRole,
  onRemove,
}: MembershipManagerProps) {
  const [search, setSearch] = useState("");

  const filteredAssignable = useMemo(() => {
    return assignableUsers.filter((u) => matchesUserSearch(u, search));
  }, [assignableUsers, search]);

  const owners = useMemo(() => {
    const list = members.filter((m) => m.role === "owner");
    if (!sortOwnersCreatorFirst) return list;
    return [...list].sort((a, b) => {
      if (a.is_creator && !b.is_creator) return -1;
      if (!a.is_creator && b.is_creator) return 1;
      return (a.display_name || a.email).localeCompare(b.display_name || b.email);
    });
  }, [members, sortOwnersCreatorFirst]);

  const memberRoleList = useMemo(() => members.filter((m) => m.role === "member"), [members]);

  const allowDropMove = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  function MemberRow({
    m,
    showRoleSelect,
  }: {
    m: MembershipMember;
    showRoleSelect: boolean;
  }) {
    const isCreator =
      m.is_creator === true || (!!createdByUserId && m.user_id === createdByUserId);
    return (
      <li className="flex items-center justify-between gap-lg rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-sm">
        <div className="flex min-w-0 items-center gap-lg">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container text-sm font-semibold text-text-primary">
            {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-small font-semibold text-text-primary">{m.display_name || m.email}</div>
              {isCreator ? (
                <span className="shrink-0 rounded-full bg-surface-container-low px-2 py-0.5 text-overline text-primary">
                  创建人
                </span>
              ) : null}
            </div>
            <div className="truncate text-caption text-neutral-muted">{m.email}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-lg">
          {showRoleSelect && !isCreator ? (
            <select
              className="rounded-lg border border-border-subtle bg-surface-bright px-2 py-1.5 text-caption text-text-primary outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              value={m.role === "owner" ? "owner" : "member"}
              disabled={saving}
              aria-label="成员角色"
              onChange={(e) => {
                const next = e.target.value as "owner" | "member";
                if (next !== m.role) void onUpdateRole(m.user_id, next);
              }}
            >
              <option value="owner">负责人（owner）</option>
              <option value="member">成员（member）</option>
            </select>
          ) : null}
          {isCreator ? (
            <span className="text-caption text-neutral-muted whitespace-nowrap">不可调整</span>
          ) : null}
          {!isCreator && canManage ? (
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="移除"
              disabled={saving}
              onClick={() => onRemove(m.user_id)}
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <main className="px-lg py-lg">
      <div className="max-w-container-max mx-auto space-y-lg">
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-lg">
          <div className="space-y-sm">
            <div className="flex items-center gap-2">
              <h1 className="font-subhead text-subhead text-text-primary">成员</h1>
              <span className="text-small text-text-secondary">· 共 {totalMemberCount} 人</span>
            </div>
          </div>

          <div className="flex items-center gap-sm">
            <a
              className="px-lg py-sm rounded-xl border border-zinc-200 text-sm font-medium text-text-primary hover:bg-zinc-50 transition-all flex items-center gap-2"
              href={backHref}
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              返回
            </a>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        )}

        {readOnlyBanner && (
          <div className="rounded-xl border border-border-subtle bg-surface-container-lowest p-lg text-small text-text-secondary">
            {readOnlyBanner}
          </div>
        )}

        <section className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <div className="space-y-lg overflow-hidden rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <div className="flex flex-col gap-lg sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-xs">
                <h2 className="font-subhead text-lg text-text-primary">{leftTitle}</h2>
                <p className="text-caption text-neutral-muted">{leftDescription}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-neutral-muted">search</span>
                <input
                  className="w-[min(320px,80vw)] rounded-xl border border-border-subtle bg-surface-bright px-md py-sm text-small outline-none focus:ring-2 focus:ring-primary/20"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索姓名、邮箱或用户 ID…"
                />
              </div>
            </div>

            <ul className="space-y-sm">
              {filteredAssignable.map((u) => {
                const added = inScopeUserIds.has(u.user_id);
                return (
                  <li
                    key={u.user_id}
                    draggable={canManage && !added && !saving}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", u.user_id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={[
                      "flex items-center justify-between gap-lg rounded-xl border border-border-subtle p-lg transition-all",
                      added ? "bg-surface-container-lowest opacity-50" : "bg-white hover:shadow-sm",
                    ].join(" ")}
                    title={added ? "已在列表中" : canManage ? "拖拽以添加" : "无权限添加成员"}
                  >
                    <div className="flex min-w-0 items-center gap-lg">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container text-sm font-semibold text-text-primary">
                        {(u.display_name?.trim().slice(0, 1) || u.email.trim().slice(0, 1)).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-small font-semibold text-text-primary">{u.display_name || u.email}</div>
                        <div className="truncate text-caption text-neutral-muted">{u.email}</div>
                      </div>
                    </div>
                    <span className="shrink-0 text-overline text-zinc-400">{added ? "已添加" : "拖拽"}</span>
                  </li>
                );
              })}
              {filteredAssignable.length === 0 ? (
                <li className="rounded-xl border border-dashed border-border-subtle p-lg text-small text-text-secondary">
                  {assignableUsers.length === 0 ? leftEmptySourceMessage : "没有匹配的用户。"}
                </li>
              ) : null}
            </ul>
          </div>

          <div className="space-y-lg overflow-hidden rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <div className="space-y-xs">
              <h2 className="font-subhead text-lg text-text-primary">{rightTitle}</h2>
              <p className="text-caption text-neutral-muted">{rightDescription}</p>
            </div>

            <div className="flex flex-col gap-lg">
              <div
                className="space-y-lg rounded-xl border border-border-subtle bg-surface-container-lowest/40 p-lg"
                onDragOver={allowDropMove}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!canManage) return;
                  const userId = e.dataTransfer.getData("text/plain");
                  if (userId) void onAdd(userId, "owner");
                }}
              >
                <div className="flex items-center justify-between gap-lg border-b border-border-subtle pb-lg">
                  <h3 className="text-small font-semibold text-text-primary">负责人（owner）</h3>
                  <span className="text-caption text-neutral-muted">{owners.length}</span>
                </div>
                {canManage ? (
                  <div
                    className="flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] p-lg text-center"
                    onDragOver={allowDropMove}
                  >
                    <span className="material-symbols-outlined text-[22px] text-primary/70">person_add</span>
                    <span className="text-caption font-medium text-text-primary">拖放到此处添加为负责人</span>
                  </div>
                ) : null}
                {owners.length === 0 ? (
                  <div
                    className="rounded-xl border border-dashed border-border-subtle p-lg text-small text-text-secondary"
                    onDragOver={allowDropMove}
                  >
                    暂无负责人列表。{canManage ? "左侧用户拖入上方虚线框即可设为 owner。" : null}
                  </div>
                ) : (
                  <ul className="space-y-sm" onDragOver={allowDropMove}>
                    {owners.map((m) => (
                      <MemberRow key={m.user_id} m={m} showRoleSelect={canManage} />
                    ))}
                  </ul>
                )}
              </div>

              <div
                className="space-y-lg rounded-xl border border-border-subtle bg-surface-container-lowest/40 p-lg"
                onDragOver={allowDropMove}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!canManage) return;
                  const userId = e.dataTransfer.getData("text/plain");
                  if (userId) void onAdd(userId, "member");
                }}
              >
                <div className="flex items-center justify-between gap-lg border-b border-border-subtle pb-lg">
                  <h3 className="text-small font-semibold text-text-primary">成员（member）</h3>
                  <span className="text-caption text-neutral-muted">{memberRoleList.length}</span>
                </div>
                {canManage ? (
                  <div
                    className="flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-subtle bg-surface-bright p-lg text-center"
                    onDragOver={allowDropMove}
                  >
                    <span className="material-symbols-outlined text-[22px] text-neutral-muted">person_add</span>
                    <span className="text-caption font-medium text-text-primary">拖放到此处添加为成员</span>
                  </div>
                ) : null}
                {memberRoleList.length === 0 ? (
                  <div
                    className="rounded-xl border border-dashed border-border-subtle p-lg text-small text-text-secondary"
                    onDragOver={allowDropMove}
                  >
                    暂无成员列表。{canManage ? "左侧用户拖入上方虚线框即可加入为 member。" : null}
                  </div>
                ) : (
                  <ul className="space-y-sm" onDragOver={allowDropMove}>
                    {memberRoleList.map((m) => (
                      <MemberRow key={m.user_id} m={m} showRoleSelect={canManage} />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
