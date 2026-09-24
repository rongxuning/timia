"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  createLlmApiKey,
  deleteLlmApiKey,
  fetchLlmApiKeys,
  makeLlmApiKeyPrimary,
  probeLlmApiKey,
  updateLlmApiKey,
} from "@/lib/api/llm-keys";
import { getToken } from "@/lib/auth";
import type { LlmApiKey, LlmApiKeyList, LlmKeyRole } from "@/types/api/llm-keys";

type Draft = {
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  enabled: boolean;
  priority: string;
  timeout_seconds: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  base_url: "https://api.minimaxi.com/v1",
  api_key: "",
  model: "MiniMax-M2.7",
  enabled: true,
  priority: "0",
  timeout_seconds: "",
};

function errorText(t: ReturnType<typeof useTranslations<"llmKeys">>, error: unknown): string {
  const message = (error as { message?: string })?.message ?? "";
  switch (message) {
    case "name_taken":
      return t("errors.name_taken");
    case "invalid_base_url":
      return t("errors.invalid_base_url");
    case "name_invalid":
      return t("errors.name_invalid");
    case "not_found":
      return t("errors.not_found");
    case "admin_required":
      return t("errors.admin_required");
    default:
      return message || t("errors.generic");
  }
}

function formatWhen(value: string | null, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function roleClass(role: LlmKeyRole): string {
  if (role === "primary") return "bg-indigo-50 text-indigo-700";
  if (role === "standby") return "bg-surface-container-lowest text-text-secondary";
  return "bg-zinc-100 text-neutral-muted";
}

export function LlmKeySettings() {
  const t = useTranslations("llmKeys");
  const locale = useLocale();
  const router = useRouter();
  const token = useMemo(() => getToken(), []);

  const [page, setPage] = useState<LlmApiKeyList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function reload(current = token) {
    if (!current) return;
    const next = await fetchLlmApiKeys(current);
    setPage(next);
  }

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    fetchLlmApiKeys(token)
      .then(setPage)
      .catch((err: unknown) => setError(errorText(t, err)))
      .finally(() => setLoading(false));
  }, [router, token, t]);

  function openCreate() {
    const nextPriority =
      page && page.keys.length > 0 ? Math.max(...page.keys.map((key) => key.priority)) + 10 : 0;
    setEditingId(null);
    setFormError(null);
    setDraft({ ...EMPTY_DRAFT, priority: String(nextPriority) });
  }

  function openEdit(key: LlmApiKey) {
    setEditingId(key.id);
    setFormError(null);
    setDraft({
      name: key.name,
      base_url: key.base_url,
      api_key: "",
      model: key.model,
      enabled: key.enabled,
      priority: String(key.priority),
      timeout_seconds: key.timeout_seconds == null ? "" : String(key.timeout_seconds),
    });
  }

  async function saveDraft() {
    if (!token || !draft) return;
    const priority = Number(draft.priority);
    const timeout = draft.timeout_seconds.trim();
    const timeoutSeconds = timeout === "" ? null : Number(timeout);
    if (!draft.name.trim() || !draft.base_url.trim() || !draft.model.trim()) {
      setFormError(t("errors.required"));
      return;
    }
    if (!Number.isFinite(priority)) {
      setFormError(t("errors.priority"));
      return;
    }
    if (timeoutSeconds != null && (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 120)) {
      setFormError(t("errors.timeout"));
      return;
    }
    if (!editingId && draft.api_key.trim().length < 8) {
      setFormError(t("errors.api_key"));
      return;
    }
    if (editingId && draft.api_key.trim() && draft.api_key.trim().length < 8) {
      setFormError(t("errors.api_key"));
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: draft.name.trim(),
        base_url: draft.base_url.trim(),
        model: draft.model.trim(),
        enabled: draft.enabled,
        priority,
        timeout_seconds: timeoutSeconds,
      };
      if (editingId) {
        await updateLlmApiKey(token, editingId, {
          ...body,
          ...(draft.api_key.trim() ? { api_key: draft.api_key.trim() } : {}),
        });
      } else {
        await createLlmApiKey(token, { ...body, api_key: draft.api_key.trim() });
      }
      setDraft(null);
      setEditingId(null);
      await reload();
    } catch (err: unknown) {
      setFormError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  async function runRow(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err: unknown) {
      setError(errorText(t, err));
    } finally {
      setBusyId(null);
    }
  }

  const keys = page?.keys ?? [];

  return (
    <main className="px-container-padding py-lg">
      <div className="mx-auto flex max-w-container-max flex-col gap-lg">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-subhead text-subhead text-text-primary">{t("title")}</h1>
            <p className="mt-1 max-w-2xl text-small text-text-secondary">{t("intro")}</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-xl bg-primary px-4 py-2 text-small font-medium text-on-primary transition-colors hover:bg-primary-hover"
          >
            {t("add")}
          </button>
        </div>

        {page && page.keys.length > 0 && !page.keys.some((key) => key.enabled) ? (
          <div className="rounded-xl border border-border-subtle bg-surface px-lg py-md text-small text-text-secondary">
            {t("allDisabled")}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        ) : null}

        {draft ? (
          <form
            className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              void saveDraft();
            }}
          >
            <h2 className="font-section-heading text-section-heading text-text-primary">
              {editingId ? t("editTitle") : t("createTitle")}
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block text-small font-medium text-on-surface-variant">
                {t("fields.name")}
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                  required
                />
              </label>
              <label className="block text-small font-medium text-on-surface-variant">
                {t("fields.model")}
                <input
                  value={draft.model}
                  onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                  required
                />
              </label>
              <label className="block text-small font-medium text-on-surface-variant md:col-span-2">
                {t("fields.baseUrl")}
                <input
                  value={draft.base_url}
                  onChange={(event) => setDraft({ ...draft, base_url: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                  required
                />
              </label>
              <label className="block text-small font-medium text-on-surface-variant md:col-span-2">
                {t("fields.apiKey")}
                <input
                  type="password"
                  autoComplete="off"
                  value={draft.api_key}
                  placeholder={editingId ? t("fields.apiKeyKeep") : ""}
                  onChange={(event) => setDraft({ ...draft, api_key: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </label>
              <label className="block text-small font-medium text-on-surface-variant">
                {t("fields.priority")}
                <input
                  type="number"
                  value={draft.priority}
                  onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </label>
              <label className="block text-small font-medium text-on-surface-variant">
                {t("fields.timeout")}
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={draft.timeout_seconds}
                  placeholder={t("fields.timeoutDefault")}
                  onChange={(event) => setDraft({ ...draft, timeout_seconds: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </label>
            </div>
            <label className="mt-4 flex items-center gap-2 text-small text-text-secondary">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
              />
              {t("fields.enabled")}
            </label>
            {formError ? <p className="mt-3 text-small text-error">{formError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-primary px-4 py-2 text-small font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {saving ? t("saving") : t("save")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setEditingId(null);
                }}
                className="rounded-xl border border-border-subtle bg-white px-4 py-2 text-small text-text-secondary hover:bg-surface-container-lowest"
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        ) : null}

        {loading ? <p className="text-small text-text-secondary">{t("loading")}</p> : null}
        {!loading && keys.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-subtle bg-surface px-lg py-xl text-small text-text-secondary">
            {t("empty")}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {keys.map((key) => (
            <article key={key.id} className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-section-heading text-section-heading text-text-primary">{key.name}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-caption ${roleClass(key.role)}`}>
                      {t(`roles.${key.role}`)}
                    </span>
                    <span className="text-caption text-neutral-muted">
                      {key.last_status === "available"
                        ? t("status.available")
                        : key.last_status === "unavailable"
                          ? t("status.unavailable")
                          : t("status.unknown")}
                    </span>
                  </div>
                  <p className="mt-1 break-all font-code text-caption text-text-secondary">{key.base_url}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {key.role !== "primary" ? (
                    <button
                      type="button"
                      disabled={busyId === key.id}
                      onClick={() => void runRow(key.id, () => makeLlmApiKeyPrimary(token ?? "", key.id))}
                      className="rounded-xl border border-border-subtle px-3 py-1.5 text-caption text-text-secondary hover:bg-surface-container-lowest disabled:opacity-50"
                    >
                      {t("makePrimary")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === key.id}
                    onClick={() => void runRow(key.id, () => probeLlmApiKey(token ?? "", key.id))}
                    className="rounded-xl border border-border-subtle px-3 py-1.5 text-caption text-text-secondary hover:bg-surface-container-lowest disabled:opacity-50"
                  >
                    {busyId === key.id ? t("working") : t("probe")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(key)}
                    className="rounded-xl border border-border-subtle px-3 py-1.5 text-caption text-text-secondary hover:bg-surface-container-lowest"
                  >
                    {t("edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void runRow(key.id, () => updateLlmApiKey(token ?? "", key.id, { enabled: !key.enabled }))
                    }
                    className="rounded-xl border border-border-subtle px-3 py-1.5 text-caption text-text-secondary hover:bg-surface-container-lowest disabled:opacity-50"
                    disabled={busyId === key.id}
                  >
                    {key.enabled ? t("disable") : t("enable")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(key.id)}
                    className="rounded-xl bg-red-600 px-3 py-1.5 text-caption text-white hover:bg-red-700"
                  >
                    {t("delete")}
                  </button>
                </div>
              </div>
              <dl className="mt-4 grid gap-2 text-caption text-text-secondary sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-neutral-muted">{t("fields.model")}</dt>
                  <dd>{key.model}</dd>
                </div>
                <div>
                  <dt className="text-neutral-muted">{t("fields.apiKey")}</dt>
                  <dd className="font-code">{key.api_key_hint}</dd>
                </div>
                <div>
                  <dt className="text-neutral-muted">{t("fields.priority")}</dt>
                  <dd>{key.priority}</dd>
                </div>
                <div>
                  <dt className="text-neutral-muted">{t("fields.timeout")}</dt>
                  <dd>{key.timeout_seconds == null ? t("fields.timeoutDefault") : `${key.timeout_seconds}s`}</dd>
                </div>
                <div>
                  <dt className="text-neutral-muted">{t("lastUsed")}</dt>
                  <dd>{formatWhen(key.last_used_at, locale)}</dd>
                </div>
                <div>
                  <dt className="text-neutral-muted">{t("cooldown")}</dt>
                  <dd>{formatWhen(key.cooldown_until, locale)}</dd>
                </div>
              </dl>
              {key.last_error ? <p className="mt-3 text-caption text-error">{key.last_error}</p> : null}
              {pendingDeleteId === key.id ? (
                <div className="mt-4 rounded-xl border border-error-container bg-error-container/10 p-3">
                  <p className="text-small text-text-primary">{t("deleteConfirm", { name: key.name })}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === key.id}
                      onClick={() =>
                        void runRow(key.id, async () => {
                          await deleteLlmApiKey(token ?? "", key.id);
                          setPendingDeleteId(null);
                        })
                      }
                      className="rounded-xl bg-red-600 px-3 py-1.5 text-caption text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {t("delete")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      className="rounded-xl border border-border-subtle bg-white px-3 py-1.5 text-caption text-text-secondary"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
