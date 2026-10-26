"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageMain } from "@/components/layout";
import { apiFetch, type ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/system-role";
import { useCurrentMe } from "@/lib/use-current-me";
import type {
  NotificationAudienceType,
  NotificationCreated,
  NotificationScenario,
  NotificationTiming,
} from "@/types/notification";

const SCENARIO_KEYS = [
  "task_self_join",
  "task_member_added",
  "workspace_member_added",
  "project_member_added",
  "task_created_in_project",
] as const;

type ScenarioKey = (typeof SCENARIO_KEYS)[number];

const AUDIENCES: NotificationAudienceType[] = ["broadcast", "user_ids", "project_id", "workspace_id"];
const TIMINGS: NotificationTiming[] = ["immediate", "delay", "scheduled"];

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

function audienceLabel(
  t: ReturnType<typeof useTranslations<"notificationAdmin">>,
  type: NotificationAudienceType,
) {
  switch (type) {
    case "broadcast":
      return t("send.audience.broadcast");
    case "user_ids":
      return t("send.audience.user_ids");
    case "project_id":
      return t("send.audience.project_id");
    case "workspace_id":
      return t("send.audience.workspace_id");
  }
}

function timingLabel(
  t: ReturnType<typeof useTranslations<"notificationAdmin">>,
  value: NotificationTiming,
) {
  switch (value) {
    case "immediate":
      return t("send.timing.immediate");
    case "delay":
      return t("send.timing.delay");
    case "scheduled":
      return t("send.timing.scheduled");
  }
}

function parseIds(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function errorText(
  t: ReturnType<typeof useTranslations<"notificationAdmin">>,
  err: unknown,
): string {
  const code = typeof err === "object" && err && "message" in err ? String((err as ApiError).message) : "";
  switch (code) {
    case "invalid_audience":
      return t("send.errors.invalid_audience");
    case "invalid_link":
      return t("send.errors.invalid_link");
    case "missing_title":
      return t("send.errors.missing_title");
    case "missing_scheduled_at":
      return t("send.errors.missing_scheduled_at");
    case "admin_required":
      return t("send.errors.admin_required");
    default:
      return t("send.failed");
  }
}

const fieldClass =
  "w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";

export default function NotificationAdminPage() {
  const t = useTranslations("notificationAdmin");
  const router = useRouter();
  const me = useCurrentMe();
  const [rows, setRows] = useState<NotificationScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [audienceType, setAudienceType] = useState<NotificationAudienceType>("broadcast");
  const [userIds, setUserIds] = useState("");
  const [projectId, setProjectId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [timing, setTiming] = useState<NotificationTiming>("immediate");
  const [delayMinutes, setDelayMinutes] = useState("30");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);

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

  async function patchRow(row: NotificationScenario, body: { enabled?: boolean; push_enabled?: boolean }) {
    const token = getToken();
    if (!token) return;
    const pending = body.push_enabled === undefined ? row.key : `${row.key}:push`;
    setPendingKey(pending);
    setError(null);
    setRows((current) => current.map((item) => (item.key === row.key ? { ...item, ...body } : item)));
    try {
      const updated = await apiFetch<NotificationScenario>(`/v1/admin/scenarios/${row.key}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(body),
      });
      setRows((current) => current.map((item) => (item.key === updated.key ? updated : item)));
    } catch {
      setRows((current) => current.map((item) => (item.key === row.key ? row : item)));
      setError(t("saveFailed"));
    } finally {
      setPendingKey(null);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const token = getToken();
    if (!token) return;
    setSendError(null);
    setSendNotice(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setSendError(t("send.errors.missing_title"));
      return;
    }
    const ids = parseIds(userIds);
    if (audienceType === "user_ids" && ids.length === 0) {
      setSendError(t("send.errors.invalid_audience"));
      return;
    }
    if (audienceType === "project_id" && !projectId.trim()) {
      setSendError(t("send.errors.invalid_audience"));
      return;
    }
    if (audienceType === "workspace_id" && !workspaceId.trim()) {
      setSendError(t("send.errors.invalid_audience"));
      return;
    }
    let scheduled_at: string | null = null;
    if (timing === "delay") {
      const minutes = Number(delayMinutes);
      if (!Number.isFinite(minutes) || minutes < 1) {
        setSendError(t("send.errors.missing_scheduled_at"));
        return;
      }
      scheduled_at = new Date(Date.now() + minutes * 60_000).toISOString();
    }
    if (timing === "scheduled") {
      const when = new Date(scheduledAt);
      if (!scheduledAt || Number.isNaN(when.getTime())) {
        setSendError(t("send.errors.missing_scheduled_at"));
        return;
      }
      scheduled_at = when.toISOString();
    }
    setSending(true);
    try {
      const created = await apiFetch<NotificationCreated>("/v1/admin/notifications", {
        method: "POST",
        token,
        body: JSON.stringify({
          title: trimmedTitle,
          body: body.trim(),
          link: link.trim() || null,
          audience: {
            type: audienceType,
            user_ids: audienceType === "user_ids" ? ids : [],
            project_id: audienceType === "project_id" ? projectId.trim() : null,
            workspace_id: audienceType === "workspace_id" ? workspaceId.trim() : null,
          },
          timing,
          scheduled_at,
        }),
      });
      setTitle("");
      setBody("");
      setLink("");
      setSendNotice(
        created.status === "scheduled" ? t("send.scheduled") : t("send.sent", { count: created.delivery_count }),
      );
    } catch (err) {
      setSendError(errorText(t, err));
    } finally {
      setSending(false);
    }
  }

  return (
    <PageMain className="!px-3">
      <div className="mx-auto max-w-2xl space-y-lg">
        <div>
          <h1 className="font-subhead text-subhead text-text-primary">{t("title")}</h1>
          <p className="mt-2 text-small text-text-secondary">{t("intro")}</p>
        </div>

        <form onSubmit={(event) => void send(event)} className="space-y-4 rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
          <div>
            <h2 className="font-medium text-text-primary">{t("send.title")}</h2>
            <p className="mt-1 text-small text-text-secondary">{t("send.intro")}</p>
          </div>
          <label className="block space-y-1">
            <span className="text-small font-medium text-on-surface-variant">{t("send.titleLabel")}</span>
            <input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label className="block space-y-1">
            <span className="text-small font-medium text-on-surface-variant">{t("send.bodyLabel")}</span>
            <textarea className={fieldClass} rows={3} value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-small font-medium text-on-surface-variant">{t("send.linkLabel")}</span>
            <input
              className={fieldClass}
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder={t("send.linkPlaceholder")}
            />
            <span className="text-caption text-neutral-muted">{t("send.linkHint")}</span>
          </label>
          <label className="block space-y-1">
            <span className="text-small font-medium text-on-surface-variant">{t("send.audienceLabel")}</span>
            <select
              className={fieldClass}
              value={audienceType}
              onChange={(event) => setAudienceType(event.target.value as NotificationAudienceType)}
            >
              {AUDIENCES.map((item) => (
                <option key={item} value={item}>
                  {audienceLabel(t, item)}
                </option>
              ))}
            </select>
          </label>
          {audienceType === "user_ids" ? (
            <label className="block space-y-1">
              <span className="text-small font-medium text-on-surface-variant">{t("send.userIdsLabel")}</span>
              <textarea className={fieldClass} rows={3} value={userIds} onChange={(event) => setUserIds(event.target.value)} />
              <span className="text-caption text-neutral-muted">{t("send.userIdsHint")}</span>
            </label>
          ) : null}
          {audienceType === "project_id" ? (
            <label className="block space-y-1">
              <span className="text-small font-medium text-on-surface-variant">{t("send.projectIdLabel")}</span>
              <input className={fieldClass} value={projectId} onChange={(event) => setProjectId(event.target.value)} />
            </label>
          ) : null}
          {audienceType === "workspace_id" ? (
            <label className="block space-y-1">
              <span className="text-small font-medium text-on-surface-variant">{t("send.workspaceIdLabel")}</span>
              <input className={fieldClass} value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} />
            </label>
          ) : null}
          <label className="block space-y-1">
            <span className="text-small font-medium text-on-surface-variant">{t("send.timingLabel")}</span>
            <select
              className={fieldClass}
              value={timing}
              onChange={(event) => setTiming(event.target.value as NotificationTiming)}
            >
              {TIMINGS.map((item) => (
                <option key={item} value={item}>
                  {timingLabel(t, item)}
                </option>
              ))}
            </select>
          </label>
          {timing === "delay" ? (
            <label className="block space-y-1">
              <span className="text-small font-medium text-on-surface-variant">{t("send.delayMinutes")}</span>
              <input
                className={fieldClass}
                type="number"
                min={1}
                step={1}
                value={delayMinutes}
                onChange={(event) => setDelayMinutes(event.target.value)}
              />
            </label>
          ) : null}
          {timing === "scheduled" ? (
            <label className="block space-y-1">
              <span className="text-small font-medium text-on-surface-variant">{t("send.scheduledAt")}</span>
              <input
                className={fieldClass}
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>
          ) : null}
          {sendError ? <p className="text-small text-error">{sendError}</p> : null}
          {sendNotice ? <p className="text-small text-text-secondary">{sendNotice}</p> : null}
          <button
            type="submit"
            disabled={sending}
            className="rounded-xl bg-primary px-lg py-md text-on-primary disabled:opacity-50"
          >
            {sending ? t("send.submitting") : t("send.submit")}
          </button>
        </form>

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
                    onClick={() => void patchRow(row, { enabled: !row.enabled })}
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
                <label className="mt-3 flex items-center gap-2 text-small text-text-secondary">
                  <input
                    type="checkbox"
                    checked={row.push_enabled}
                    disabled={pendingKey === `${row.key}:push`}
                    onChange={() => void patchRow(row, { push_enabled: !row.push_enabled })}
                  />
                  {t("pushEnabled")}
                </label>
                <p className="mt-1 text-caption text-neutral-muted">{t("pushHint")}</p>
              </article>
            );
          })}
        </div>
      </div>
    </PageMain>
  );
}
