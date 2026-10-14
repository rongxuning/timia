"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LocaleSwitcher, PageMain } from "@/components/layout";
import { apiFetch } from "@/lib/api";
import { getToken, logoutAndClear, publishMe } from "@/lib/auth";
import { useCurrentMe } from "@/lib/use-current-me";
import type { MeWithSystemRole } from "@/lib/system-role";
import { MONDAY, SATURDAY, SUNDAY, normalizeWeekStart } from "@/lib/weekStart";

const CHOICES = [
  { value: MONDAY, labelKey: "monday" },
  { value: SATURDAY, labelKey: "saturday" },
  { value: SUNDAY, labelKey: "sunday" },
] as const;

export default function AccountPage() {
  const t = useTranslations("account");
  const router = useRouter();
  const me = useCurrentMe();
  const [weekStartsOn, setWeekStartsOn] = useState<1 | 6 | 7>(() =>
    normalizeWeekStart(me?.week_starts_on),
  );
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setWeekStartsOn(normalizeWeekStart(me?.week_starts_on));
  }, [me?.week_starts_on]);

  async function choose(value: 1 | 6 | 7) {
    if (!me || saving || value === normalizeWeekStart(me.week_starts_on)) return;
    const token = getToken();
    if (!token) return;
    const previous = normalizeWeekStart(me.week_starts_on);
    setWeekStartsOn(value);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<MeWithSystemRole>("/auth/me", {
        method: "PATCH",
        token,
        body: JSON.stringify({ week_starts_on: value }),
      });
      publishMe({
        ...me,
        ...updated,
        week_starts_on: normalizeWeekStart(updated.week_starts_on ?? value),
      });
      setSaved(true);
    } catch {
      setWeekStartsOn(previous);
      setError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function logOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    await logoutAndClear();
    router.push("/login");
  }

  return (
    <PageMain className="!px-3">
      <div className="mx-auto max-w-lg space-y-lg">
        <div>
          <h1 className="font-subhead text-subhead text-text-primary">{t("title")}</h1>
        </div>
        <section className="space-y-3 rounded-xl border border-border-subtle bg-white p-lg">
          <div className="text-small text-text-secondary">
            <div>{me?.display_name}</div>
            <div>{me?.email}</div>
          </div>
          <div className="space-y-1.5">
            <div className="text-caption font-medium text-text-primary">{t("weekStart")}</div>
            <p className="text-caption text-text-secondary">{t("weekStartHint")}</p>
            <div className="flex flex-wrap gap-1.5">
              {CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  disabled={saving || !me}
                  aria-pressed={weekStartsOn === choice.value}
                  className={[
                    "rounded-lg border px-2.5 py-1 text-caption font-medium transition-colors disabled:opacity-60",
                    weekStartsOn === choice.value
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-border-subtle bg-white text-text-secondary hover:bg-gray-50",
                  ].join(" ")}
                  onClick={() => void choose(choice.value)}
                >
                  {t(choice.labelKey)}
                </button>
              ))}
            </div>
          </div>
          {saved ? <p className="text-caption text-text-secondary">{t("saved")}</p> : null}
          {error ? <p className="text-caption text-error">{error}</p> : null}
          <div className="space-y-1.5">
            <label htmlFor="account-language" className="block text-caption font-medium text-text-primary">
              {t("language")}
            </label>
            <LocaleSwitcher id="account-language" variant="field" />
          </div>
          <div className="border-t border-border-subtle pt-3">
            <button
              type="button"
              disabled={loggingOut}
              className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-small font-medium text-text-secondary transition-colors hover:bg-gray-50 disabled:opacity-60"
              onClick={() => void logOut()}
            >
              {loggingOut ? t("loggingOut") : t("logOut")}
            </button>
          </div>
        </section>
      </div>
    </PageMain>
  );
}
