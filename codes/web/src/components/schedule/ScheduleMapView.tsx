"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SystemSelect } from "@/components/SystemSelect";
import { ScheduleMapCanvas } from "@/components/schedule/ScheduleMapCanvas";
import { fetchScheduleMap } from "@/lib/api/schedule-views";
import { fetchMyProjects, fetchMyWorkspaces, type ProjectOption, type WorkspaceOption } from "@/lib/api/workspaces";
import {
  defaultScheduleMapFilters,
  isDefaultMapFilters,
  isProjectFilterEnabled,
  MAP_STATUS_KEYS,
  setMapProject,
  setMapWorkspace,
  toggleMapStatus,
  type ScheduleMapFilters,
} from "@/lib/scheduleMapFilters";
import type { ScheduleMapItem, ScheduleMapViewData } from "@/lib/scheduleMapGeo";

type ScheduleMapViewProps = {
  token: string;
  refreshNonce?: number;
  onItemClick: (item: ScheduleMapItem) => void;
  drawerOpen?: boolean;
};

const STATUS_LABEL_KEY = {
  todo: "statusTodo",
  doing: "statusDoing",
  done: "statusDone",
  archived: "statusArchived",
} as const;

export function ScheduleMapView({
  token,
  refreshNonce = 0,
  onItemClick,
  drawerOpen = false,
}: ScheduleMapViewProps) {
  const t = useTranslations("scheduleMap");
  const [filters, setFilters] = useState<ScheduleMapFilters>(() => defaultScheduleMapFilters());
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [view, setView] = useState<ScheduleMapViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setWorkspacesLoading(true);
    fetchMyWorkspaces(token)
      .then((rows) => {
        if (!cancelled) setWorkspaces(rows);
      })
      .catch(() => {
        if (!cancelled) setWorkspaces([]);
      })
      .finally(() => {
        if (!cancelled) setWorkspacesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!filters.workspaceId) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    setProjectsLoading(true);
    fetchMyProjects(token, filters.workspaceId)
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, filters.workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchScheduleMap(
      token,
      {
        statuses: filters.statuses,
        workspaceId: filters.workspaceId,
        projectId: filters.projectId,
      },
      { signal: controller.signal },
    )
      .then((data) => setView(data))
      .catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name === "AbortError") return;
        setError((err as { message?: string } | null)?.message ?? t("loadError"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, filters, refreshNonce, t]);

  const workspaceOptions = useMemo(
    () => [
      { value: "", label: t("allWorkspaces") },
      ...workspaces.map((row) => ({ value: row.id, label: row.name })),
    ],
    [t, workspaces],
  );
  const projectOptions = useMemo(
    () => [
      { value: "", label: t("allProjects") },
      ...projects.map((row) => ({ value: row.id, label: row.name })),
    ],
    [t, projects],
  );

  const items = view?.items ?? [];
  const emptyMessage =
    !loading && !error && items.length === 0
      ? isDefaultMapFilters(filters)
        ? t("emptyNone")
        : t("emptyFiltered")
      : null;
  const placeCountLabel =
    view == null
      ? null
      : view.truncated
        ? t("placeCountTruncated", { count: view.items.length })
        : t("placeCount", { count: view.items.length });

  return (
    <section className="flex min-h-[60vh] flex-1 flex-col overflow-hidden rounded-xl border border-border-subtle bg-white lg:min-h-0">
      <div className="relative shrink-0 space-y-2 border-b border-border-subtle px-lg py-3">
        {view != null && placeCountLabel ? (
          <span
            className="absolute right-lg top-3 inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-primary/10 px-2 text-small font-medium text-primary"
            title={placeCountLabel}
            aria-label={placeCountLabel}
          >
            {view.items.length}
          </span>
        ) : null}
        <div className="flex min-h-8 flex-wrap items-center gap-2 pr-12">
          <span className="w-10 shrink-0 text-caption font-medium text-text-secondary">{t("status")}</span>
          {MAP_STATUS_KEYS.map((key) => {
            const selected = filters.statuses.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                className={[
                  "h-8 rounded-full border px-3 text-small transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border-subtle bg-white text-text-secondary hover:bg-surface-container-lowest",
                ].join(" ")}
                onClick={() =>
                  setFilters((current) => ({ ...current, statuses: toggleMapStatus(current.statuses, key) }))
                }
              >
                {t(STATUS_LABEL_KEY[key])}
              </button>
            );
          })}
        </div>
        <div className="flex min-h-8 flex-wrap items-center gap-2 pr-12">
          <span className="w-10 shrink-0 text-caption font-medium text-text-secondary">{t("scope")}</span>
          <div className="min-w-[160px] flex-1">
            <SystemSelect
              label={t("workspace")}
              hideLabel
              compact
              showAccent={false}
              searchable
              searchPlaceholder={t("searchWorkspace")}
              value={filters.workspaceId ?? ""}
              options={workspaceOptions}
              onChange={(value) => setFilters((current) => setMapWorkspace(current, value || null))}
              loading={workspacesLoading}
              placeholder={t("allWorkspaces")}
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <SystemSelect
              label={t("project")}
              hideLabel
              compact
              showAccent={false}
              searchable
              searchPlaceholder={t("searchProject")}
              value={filters.projectId ?? ""}
              options={projectOptions}
              onChange={(value) => setFilters((current) => setMapProject(current, value || null))}
              loading={projectsLoading}
              disabled={!isProjectFilterEnabled(filters)}
              placeholder={t("allProjects")}
            />
          </div>
        </div>
        {error ? (
          <div className="flex flex-wrap items-center gap-3 text-small text-error">
            <span>{error}</span>
            <button
              type="button"
              className="rounded-lg border border-error-container px-2 py-1 text-caption hover:bg-error-container/10"
              onClick={() => setFilters((current) => ({ ...current }))}
            >
              {t("retry")}
            </button>
          </div>
        ) : null}
      </div>
      <ScheduleMapCanvas
        items={items}
        loading={loading}
        emptyMessage={emptyMessage}
        onItemClick={onItemClick}
        drawerOpen={drawerOpen}
      />
    </section>
  );
}
