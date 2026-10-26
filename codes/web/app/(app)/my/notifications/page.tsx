"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { PageMain } from "@/components/layout";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { publishNotificationsChanged } from "@/lib/use-unread-notifications";
import { isAppNotificationLink, type InboxItem, type InboxResponse } from "@/types/notification";

export default function NotificationsPage() {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<InboxResponse>("/v1/inbox?limit=50", { token });
      setItems(data.items);
      setUnread(data.unread_count);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAll() {
    const token = getToken();
    if (!token || unread === 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/v1/inbox/read-all", { method: "POST", token });
      publishNotificationsChanged();
      await load();
    } catch {
      setError(t("loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function openItem(item: InboxItem) {
    const token = getToken();
    if (!token) return;
    setError(null);
    try {
      if (!item.read_at) {
        await apiFetch(`/v1/inbox/${item.id}/read`, { method: "POST", token });
        publishNotificationsChanged();
      }
    } catch {
      setError(t("loadFailed"));
      return;
    }
    if (isAppNotificationLink(item.link)) {
      router.push(item.link);
      return;
    }
    await load();
  }

  const timeFmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <PageMain className="!px-3">
      <div className="mx-auto max-w-2xl space-y-lg">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-subhead text-subhead text-text-primary">{t("title")}</h1>
          <button
            type="button"
            onClick={() => void markAll()}
            disabled={busy || unread === 0}
            className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-small text-text-primary transition-colors hover:bg-surface-container-lowest disabled:opacity-50"
          >
            {busy ? t("marking") : t("markAllRead")}
          </button>
        </div>
        {loading ? <p className="text-small text-text-secondary">{t("loading")}</p> : null}
        {error ? <p className="text-small text-error">{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <p className="text-small text-text-secondary">{t("empty")}</p>
        ) : null}
        <ul className="space-y-3">
          {items.map((item) => {
            const unreadItem = !item.read_at;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void openItem(item)}
                  className={[
                    "w-full rounded-xl border border-border-subtle bg-white p-lg text-left transition-colors hover:bg-surface-container-lowest",
                    unreadItem ? "ring-1 ring-primary/20" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-text-primary">{item.title}</div>
                      <p className="mt-1 text-small text-text-secondary">{item.body}</p>
                    </div>
                    <span className={unreadItem ? "text-small text-primary" : "text-small text-neutral-muted"}>
                      {unreadItem ? t("unread") : t("read")}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-neutral-muted">
                    <span>{item.sender_display_name || t("systemSender")}</span>
                    <span>{timeFmt.format(new Date(item.created_at))}</span>
                    {isAppNotificationLink(item.link) ? <span className="text-primary">{t("open")}</span> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </PageMain>
  );
}
