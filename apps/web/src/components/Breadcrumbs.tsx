"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

function titleCase(input: string) {
  return input
    .split(" ")
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(" ");
}

function looksLikeOpaqueId(segment: string) {
  if (/^[0-9a-f]{8,}$/i.test(segment)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);
}

function humanizeSegment(segment: string, labelBySegment: Record<string, string>) {
  const mapped = labelBySegment[segment];
  if (mapped) return mapped;

  // likely UUID / opaque ids: short stable label (workspace/project/item use path placeholders instead)
  if (looksLikeOpaqueId(segment)) return segment.slice(0, 8);

  return titleCase(segment.replace(/[-_]+/g, " "));
}

export type Breadcrumb = { href: string; label: string };

type ResolvedName = { label: string };

const workspaceNameCache = new Map<string, ResolvedName>();
const projectNameCache = new Map<string, ResolvedName>();

const breadcrumbNameCacheListeners = new Set<() => void>();
let breadcrumbNameCacheEpoch = 0;

function subscribeBreadcrumbNameCache(onStoreChange: () => void) {
  breadcrumbNameCacheListeners.add(onStoreChange);
  return () => breadcrumbNameCacheListeners.delete(onStoreChange);
}

function getBreadcrumbNameCacheEpoch() {
  return breadcrumbNameCacheEpoch;
}

function notifyBreadcrumbNameCache() {
  breadcrumbNameCacheEpoch += 1;
  for (const l of breadcrumbNameCacheListeners) l();
}

/** 在任意已拿到工作空间名称的地方调用，使面包屑无需再等自身请求即可显示名称。 */
export function primeWorkspaceNameForBreadcrumb(workspaceId: string, name: string) {
  const n = name?.trim();
  if (!workspaceId || !n) return;
  if (workspaceNameCache.get(workspaceId)?.label === n) return;
  workspaceNameCache.set(workspaceId, { label: n });
  notifyBreadcrumbNameCache();
}

export function getCachedWorkspaceName(workspaceId: string): string | null {
  return workspaceNameCache.get(workspaceId)?.label ?? null;
}

export function getCachedProjectName(workspaceId: string, projectId: string): string | null {
  return projectNameCache.get(`${workspaceId}:${projectId}`)?.label ?? null;
}

export function useBreadcrumbNameCacheEpoch(): number {
  return useSyncExternalStore(
    subscribeBreadcrumbNameCache,
    getBreadcrumbNameCacheEpoch,
    getBreadcrumbNameCacheEpoch,
  );
}

/** 在任意已拿到项目名称的地方调用（与 {@link primeWorkspaceNameForBreadcrumb} 同理）。 */
export function primeProjectNameForBreadcrumb(workspaceId: string, projectId: string, name: string) {
  const n = name?.trim();
  if (!workspaceId || !projectId || !n) return;
  const key = `${workspaceId}:${projectId}`;
  if (projectNameCache.get(key)?.label === n) return;
  projectNameCache.set(key, { label: n });
  notifyBreadcrumbNameCache();
}

export function Breadcrumbs({
  className,
  labelBySegment,
  rootHrefOverrides,
  hideOnPaths,
}: {
  className?: string;
  labelBySegment?: Record<string, string>;
  rootHrefOverrides?: Record<string, string>;
  hideOnPaths?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const nameCacheEpoch = useSyncExternalStore(
    subscribeBreadcrumbNameCache,
    getBreadcrumbNameCacheEpoch,
    getBreadcrumbNameCacheEpoch,
  );

  const [workspaceLabels, setWorkspaceLabels] = useState<Record<string, string>>({});
  const [projectLabels, setProjectLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!pathname) return;

    const segments = pathname.split("/").filter(Boolean);
    const workspaceIdx = segments.findIndex((s) => s === "workspace");
    const workspaceId = workspaceIdx >= 0 ? segments[workspaceIdx + 1] : undefined;
    const projectsIdx = segments.findIndex((s) => s === "projects");
    const projectId = projectsIdx >= 0 ? segments[projectsIdx + 1] : undefined;

    const token = getToken();
    if (!token) return;

    let cancelled = false;

    if (workspaceId) {
      const cached = workspaceNameCache.get(workspaceId);
      if (cached) {
        setWorkspaceLabels((prev) => (prev[workspaceId] ? prev : { ...prev, [workspaceId]: cached.label }));
      } else {
        apiFetch<{ id: string; name: string }>(`/workspaces/${workspaceId}`, { token })
          .then((w) => {
            if (cancelled) return;
            primeWorkspaceNameForBreadcrumb(workspaceId, w.name);
            setWorkspaceLabels((prev) => ({ ...prev, [workspaceId]: w.name }));
          })
          .catch(() => {
            // ignore: keep fallback label
          });
      }
    }

    if (workspaceId && projectId) {
      const key = `${workspaceId}:${projectId}`;
      const cached = projectNameCache.get(key);
      if (cached) {
        setProjectLabels((prev) =>
          prev[key] || prev[projectId] ? prev : { ...prev, [key]: cached.label, [projectId]: cached.label },
        );
      } else {
        apiFetch<{ id: string; name: string }>(`/workspaces/${workspaceId}/projects/${projectId}`, { token })
          .then((p) => {
            if (cancelled) return;
            primeProjectNameForBreadcrumb(workspaceId, projectId, p.name);
            // Store both keyed by workspace+project and by projectId alone
            // so breadcrumb rendering remains robust even if path parsing changes.
            setProjectLabels((prev) => ({ ...prev, [key]: p.name, [projectId]: p.name }));
          })
          .catch(() => {
            // ignore: keep fallback label
          });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const crumbs = useMemo<Array<Breadcrumb>>(() => {
    if (!pathname) return [];
    if (hideOnPaths?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return [];

    const defaultLabelBySegment: Record<string, string> = {
      workspaces: "工作空间",
      workspace: "工作空间",
      projects: "项目",
      project: "项目",
      items: "任务",
      item: "任务",
      activity: "活动",
      settings: "设置",
      members: "成员",
      documents: "文档",
      code: "代码文档",
      guide: "使用指南",
      database: "数据库结构",
      api: "后端 API",
      my: "我的",
      schedule: "日程",
      analytics: "数据分析",
    };

    const labels = { ...defaultLabelBySegment, ...(labelBySegment ?? {}) };
    const overrides = rootHrefOverrides ?? {
      documents: "/documents",
      workspace: "/workspaces",
    };

    const segments = pathname.split("/").filter(Boolean);
    const out: Array<Breadcrumb> = [];
    let href = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const prev = segments[i - 1];

      // For project detail paths like /workspace/:wid/projects/:pid, hide the "projects" segment.
      if (segment === "projects" && segments[i - 1] && segments[i + 1]) {
        // Still advance href so the next segment keeps the correct URL.
        href += `/${segment}`;
        continue;
      }

      // For /my/schedule, collapse the "my" + "schedule" pair into a single "我的日程" crumb.
      if (segment === "my" && segments[i + 1] === "schedule") {
        href += `/${segment}`;
        continue;
      }
      if (segment === "schedule" && prev === "my") {
        href += `/${segment}`;
        out.push({ href, label: "我的日程" });
        continue;
      }

      if (segment === "my" && segments[i + 1] === "analytics") {
        href += `/${segment}`;
        continue;
      }
      if (segment === "analytics" && prev === "my") {
        href += `/${segment}`;
        out.push({ href, label: "数据分析" });
        continue;
      }

      href += `/${segment}`;
      const resolvedWorkspace =
        prev === "workspace"
          ? workspaceLabels[segment] ?? workspaceNameCache.get(segment)?.label
          : undefined;
      const workspaceIdForProject =
        prev === "projects" && segments[i - 3] === "workspace" ? segments[i - 2] : undefined;
      const resolvedProject =
        prev === "projects" && workspaceIdForProject
          ? projectLabels[segment] ??
            projectLabels[`${workspaceIdForProject}:${segment}`] ??
            projectNameCache.get(`${workspaceIdForProject}:${segment}`)?.label
          : undefined;

      let label = resolvedProject ?? resolvedWorkspace;
      if (!label) {
        // 工作空间名称由列表/子页 prime + 缓存订阅尽快显示，此处不再用「工作空间」占位以免与真实名称切换闪烁。
        const idSlotPlaceholder =
          prev === "projects" && segments[i - 3] === "workspace"
            ? "项目"
            : prev === "items"
              ? "任务"
              : undefined;
        if (idSlotPlaceholder && looksLikeOpaqueId(segment)) {
          label = idSlotPlaceholder;
        }
      }
      if (!label) {
        label = humanizeSegment(segment, labels);
      }

      out.push({
        href: overrides[segment] ?? href,
        label,
      });
    }
    return out;
  }, [hideOnPaths, labelBySegment, nameCacheEpoch, pathname, projectLabels, rootHrefOverrides, workspaceLabels]);

  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="面包屑导航" className={className}>
      <ol className="flex items-center gap-1 text-sm text-gray-500 min-w-0">
        {crumbs.map((c, idx) => {
          const isLast = idx === crumbs.length - 1;
          return (
            <li key={c.href} className="flex items-center gap-1 min-w-0">
              {idx > 0 && <span className="text-gray-300 select-none">/</span>}
              {isLast ? (
                <button
                  type="button"
                  className="text-gray-700 font-medium truncate hover:text-gray-900"
                  onClick={() => {
                    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
                    router.refresh();
                  }}
                  aria-label={`刷新 ${c.label}`}
                >
                  {c.label}
                </button>
              ) : (
                <Link className="hover:text-gray-700 truncate" href={c.href}>
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

