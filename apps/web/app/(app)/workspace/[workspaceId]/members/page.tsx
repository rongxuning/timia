"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";

type Workspace = { id: string; name: string; description?: string | null };
type Member = {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
};

export default function MembersPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const token = useMemo(() => getToken(), []);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [items, setItems] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    if (!token) return;
    const data = await apiFetch<Member[]>(`/workspaces/${workspaceId}/members`, { token });
    setItems(data);
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, workspaceId]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      await apiFetch<Member>(`/workspaces/${workspaceId}/members`, {
        method: "POST",
        token,
        body: JSON.stringify({ email, role }),
      });
      setEmail("");
      setRole("member");
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "添加失败（需 Owner/Admin）");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="pt-4 pb-12 px-container-padding">
      <div className="max-w-container-max mx-auto space-y-3xl">
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-lg">
          <div className="space-y-sm">
            <div className="flex items-center gap-2">
              <h1 className="font-subhead text-subhead text-text-primary">成员</h1>
              <span className="text-small text-text-secondary">· 共 {items.length} 人</span>
            </div>
          </div>

          <div className="flex items-center gap-sm">
            <a
              className="px-lg py-sm rounded-xl border border-zinc-200 text-sm font-medium text-text-primary hover:bg-zinc-50 transition-all flex items-center gap-2"
              href={`/workspace/${workspaceId}`}
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              返回
            </a>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-4 text-small text-error">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
          <div className="lg:col-span-1 bg-white rounded-xl border border-border-subtle p-xl space-y-lg">
            <div className="space-y-xs">
              <div className="font-subhead text-lg text-text-primary">添加成员</div>
              <div className="text-small text-text-secondary">仅 Owner/Admin 可以添加成员。</div>
            </div>

            <form onSubmit={addMember} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-on-surface-variant" htmlFor="memberEmail">
                  成员邮箱
                </label>
                <input
                  id="memberEmail"
                  className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-on-surface-variant" htmlFor="memberRole">
                  角色
                </label>
                <select
                  id="memberRole"
                  className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={saving}
                >
                  <option value="admin">管理员（admin）</option>
                  <option value="member">成员（member）</option>
                  <option value="guest">访客（guest）</option>
                </select>
              </div>

              <button
                className="w-full px-lg py-sm rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover shadow-indigo-100 shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:translate-y-0"
                type="submit"
                disabled={saving || !email.trim()}
              >
                <span className="material-symbols-outlined text-lg">{saving ? "hourglass_top" : "person_add"}</span>
                {saving ? "添加中..." : "添加"}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-lg">
            <div className="flex items-center justify-between">
              <h2 className="font-subhead text-subhead text-text-primary">成员列表</h2>
            </div>

            {items.length === 0 ? (
              <div className="bg-white rounded-xl border border-border-subtle p-xl text-small text-text-secondary">
                暂无成员。
              </div>
            ) : (
              <ul className="space-y-sm">
                {items.map((m) => (
                  <li key={m.id} className="bg-white rounded-xl border border-border-subtle p-xl hover:shadow-md transition-all">
                    <div className="flex items-start justify-between gap-lg">
                      <div className="space-y-1">
                        <div className="font-subhead text-lg text-text-primary">
                          {m.display_name || m.email}
                          <span className="ml-2 text-small text-text-secondary font-body">({m.email})</span>
                        </div>
                        <div className="text-small text-text-secondary">
                          角色：<span className="font-semibold text-text-primary">{m.role}</span> · 状态：{" "}
                          <span className="font-semibold text-text-primary">{m.status}</span>
                        </div>
                      </div>

                      <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-overline uppercase tracking-widest">
                        {m.role}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

