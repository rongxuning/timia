"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageMain } from "@/components/layout";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/system-role";
import { useCurrentMe } from "@/lib/use-current-me";
import type { NotificationScenario } from "@/types/notification";

const SCENARIO_KEYS = [
  "task_self_join",
  "task_member_added",
  "workspace_member_added",
  "project_member_added",
  "task_created_in_project",
] as const;

type ScenarioKey = (typeof SCENARIO_KEYS)[number];

function isScenarioKey(key: string): key is ScenarioKey {
  return (SCENARIO_KEYS as readonly string[]).includes(key);
}

function scenarioCopy(
  t: ReturnType<typeof useTranslations<"notificationAdmin">>,
  key: ScenarioKey,
) {
  switch (key) {
    case "task_self_join":
      return {
        title: t("scenarios.task_self_join.title"),
        description: t("scenarios.task_self_join.description"),
      };
    case "task_member_added":
      return {
        title: t("scenarios.task_member_added.title"),
        description: t("scenarios.task_member_added.description"),
      };
    case "workspace_member_added":
      return {
        title: t("scenarios.workspace_member_added.title"),
        description: t("scenarios.workspace_member_added.description"),
      };
    case "project_member_added":
      return {
        title: t("scenarios.project_member_added.title"),
        description: t("scenarios.project_member_added.description"),
      };
    case "task_created_in_project":
      return {
        title: t("scenarios.task_created_in_project.title"),
        description: t("scenarios.task_created_in_project.description"),
      };
  }
}

export default function NotificationAdminPage() {
  const t = useTranslations("notificationAdmin");
  const router = useRouter();
  const me = useCurrentMe();
  const [rows, setRows] = useState<NotificationScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<NotificationScenario[]>("/v1/admin/scenarios", { token });
      setRows(data);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    if (!me || !isSystemAdmin(me.system_role)) return;
    void load();
  }, [load, me]);

  async function toggle(row: NotificationScenario) {
    const token = getToken();
    if (!token) return;
    setPendingKey(row.key);
    setError(null);
    const next = !row.enabled;
    setRows((current) => current.map((item) => (item.key === row.key ? { ...item, enabled: next } : item)));
    try {
      const updated = await apiFetch<NotificationScenario>(`/v1/admin/scenarios/${row.key}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ enabled: next }),
      });
      setRows((current) => current.map((item) => (item.key === updated.key ? updated : item)));
    } catch {
      setRows((current) => current.map((item) => (item.key === row.key ? row : item)));
      setError(t("saveFailed"));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <PageMain className="!px-3">
      <div className="mx-auto max-w-2xl space-y-lg">
        <div>
          <h1 className="font-subhead text-subhead text-text-primary">{t("title")}</h1>
          <p className="mt-2 text-small text-text-secondary">{t("intro")}</p>
        </div>
        {loading ? <p className="text-small text-text-secondary">{t("loading")}</p> : null}
        {error ? <p className="text-small text-error">{error}</p> : null}
        <div className="space-y-3">
          {rows.map((row) => {
            if (!isScenarioKey(row.key)) return null;
            const copy = scenarioCopy(t, row.key);
            return (
            <article key={row.key} className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-medium text-text-primary">{copy.title}</h2>
                  <p className="mt-1 text-small text-text-secondary">{copy.description}</p>
                  <p className="mt-2 text-caption text-neutral-muted">{row.title_template}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.enabled}
                  aria-label={copy.title}
                  disabled={pendingKey === row.key}
                  onClick={() => void toggle(row)}
                  className={[
                    "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
                    row.enabled ? "bg-primary" : "bg-gray-300",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
                      row.enabled ? "translate-x-5" : "translate-x-0.5",
                    ].join(" ")}
                  />
                </button>
              </div>
              <p className="mt-3 text-caption text-neutral-muted">{row.enabled ? t("enabled") : t("disabled")}</p>
            </article>
            );
          })}
        </div>
      </div>
    </PageMain>
  );
}
