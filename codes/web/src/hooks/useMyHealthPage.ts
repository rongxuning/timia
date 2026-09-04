"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HEALTH_SOURCE_APPLE } from "@/components/health/HealthSourcePicker";
import { fetchMyHealth, patchHealthLayout, patchHealthProfile } from "@/lib/api/health-views";
import { getToken } from "@/lib/auth";
import type { MyHealthView } from "@/types/api/views/health";

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function healthQueryString(params: {
  date?: string | null;
  range?: number | null;
  month?: string;
}): string {
  const query = new URLSearchParams();
  if (params.range) query.set("range", String(params.range));
  else if (params.date) query.set("date", params.date);
  if (params.month) query.set("month", params.month);
  const text = query.toString();
  return text ? `?${text}` : "";
}

export function useMyHealthPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const token = useMemo(() => getToken(), []);
  const [view, setView] = useState<MyHealthView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState(HEALTH_SOURCE_APPLE);
  const [savingProfile, setSavingProfile] = useState(false);

  const rangeRaw = searchParams.get("range");
  const rangeDays = rangeRaw === "7" || rangeRaw === "30" || rangeRaw === "90" ? Number(rangeRaw) : null;
  const selectedDate = rangeDays ? null : (searchParams.get("date") ?? todayIso());
  const month = searchParams.get("month") ?? monthOf(selectedDate ?? todayIso());
  const queryString = healthQueryString({ date: selectedDate, range: rangeDays, month });

  const replaceQuery = useCallback(
    (patch: { date?: string | null; range?: number | null; month?: string }) => {
      const nextRange = patch.range !== undefined ? patch.range : rangeDays;
      const nextDate = patch.date !== undefined ? patch.date : selectedDate;
      const nextMonth = patch.month ?? month;
      router.replace(
        `${pathname}${healthQueryString({ date: nextRange ? null : nextDate, range: nextRange, month: nextMonth })}`,
        { scroll: false },
      );
    },
    [month, pathname, rangeDays, router, selectedDate],
  );

  const reload = useCallback(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    fetchMyHealth(token, {
      date: rangeDays ? undefined : selectedDate ?? undefined,
      range: rangeDays ?? undefined,
      month,
    })
      .then((next) => setView(next))
      .catch((e: { message?: string }) => setError(e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, [month, rangeDays, router, selectedDate, token]);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveProfile = useCallback(
    (payload: {
      sex: "male" | "female" | null;
      age_years: number | null;
      height_cm: number | null;
      max_hr_bpm: number | null;
    }) => {
      if (!token) return Promise.resolve(false);
      setSavingProfile(true);
      return patchHealthProfile(token, payload)
        .then(() => {
          reload();
          return true;
        })
        .catch((e: { message?: string }) => {
          setError(e?.message ?? "保存基础信息失败");
          return false;
        })
        .finally(() => setSavingProfile(false));
    },
    [reload, token],
  );

  const saveLayout = useCallback(
    (cardOrder: string[]) => {
      if (!token) return;
      setView((prev) => (prev ? { ...prev, card_order: cardOrder } : prev));
      patchHealthLayout(token, cardOrder).catch((e: { message?: string }) => {
        setError(e?.message ?? "保存卡片顺序失败");
      });
    },
    [token],
  );

  return {
    token,
    view,
    loading,
    error,
    source,
    setSource,
    rangeDays,
    selectedDate,
    month,
    queryString,
    savingProfile,
    today: todayIso(),
    rangeMode: rangeDays != null,
    setMonth: (next: string) => replaceQuery({ month: next }),
    setSelectedDate: (next: string) => replaceQuery({ date: next, range: null, month: monthOf(next) }),
    setRangeDays: (days: number) => replaceQuery({ range: days, date: null }),
    saveProfile,
    saveLayout,
    reload,
  };
}
