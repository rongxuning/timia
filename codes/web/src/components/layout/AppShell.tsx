"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, bootstrapSession, type ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { convertStickyNoteToTask } from "@/lib/api/sticky-notes";
import { useEscapeDismiss } from "@/hooks/useEscapeDismiss";
import {
  getMeClientSnapshot,
  publishMe,
  redirectToLoginPage,
  loginRedirectReasonWhenUnauthenticated,
} from "@/lib/auth";
import { useCurrentMe } from "@/lib/use-current-me";
import { isAdminOnlyPath, isSystemAdmin, type MeWithSystemRole } from "@/lib/system-role";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import { FloatingDraggableButton } from "@/components/FloatingDraggableButton";
import { StickyNoteModal } from "@/components/sticky-notes/StickyNoteModal";
import { TaskDrawerWithComments } from "@/components/TaskDrawerWithComments";
import {
  TaskCreateDrawerProvider,
  type TaskCreatePrefill,
  useTaskCreateDrawer,
} from "./TaskCreateDrawerContext";

export type AppShellProps = {
  children: ReactNode;
};

let inflightMeFetch: Promise<void> | null = null;

function refreshMeIfNeeded() {
  if (getMeClientSnapshot()) return Promise.resolve();
  if (inflightMeFetch) return inflightMeFetch;

  const t = getAccessToken();
  if (!t) return Promise.resolve();

  inflightMeFetch = apiFetch<MeWithSystemRole>("/auth/me", { token: t })
    .then((data) => {
      publishMe(data);
    })
    .catch((err: ApiError) => {
      if (err?.status === 401) {
        publishMe(null);
      }
    })
    .finally(() => {
      inflightMeFetch = null;
    });

  return inflightMeFetch;
}

function pageOwnsTaskCreateDrawer(pathname: string) {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return (
    normalizedPathname === "/my/schedule" ||
    /^\/workspace\/[^/]+\/projects\/[^/]+$/.test(normalizedPathname)
  );
}

function FloatingButtons({
  pathname,
  setPendingConvertNoteId,
  pendingConvertPrefillRef,
}: {
  pathname: string;
  setPendingConvertNoteId: (noteId: string | null) => void;
  pendingConvertPrefillRef: React.MutableRefObject<TaskCreatePrefill | null>;
}) {
  const [stickyNoteOpen, setStickyNoteOpen] = useState(false);
  const { openCreate, close: closeTaskCreate } = useTaskCreateDrawer();
  const previousPathnameRef = useRef(pathname);

  function openTaskFromStickyNote(noteId: string, prefill: TaskCreatePrefill) {
    console.info("[sticky-note] openTaskFromStickyNote", { noteId, parseId: prefill.parseId });
    pendingConvertPrefillRef.current = prefill;
    setPendingConvertNoteId(noteId);
    const { noteId: _noteId, parseId: _parseId, ...createPrefill } = prefill;
    openCreate(createPrefill);
    setStickyNoteOpen(false);
  }

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;
    closeTaskCreate();
    setStickyNoteOpen(false);
  }, [closeTaskCreate, pathname]);

  return (
    <>
      <FloatingDraggableButton
        ariaLabel="新建任务"
        initialRight={88}
        className="flex h-12 w-12 cursor-grab items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-primary-hover active:cursor-grabbing"
        onClick={() => openCreate()}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </FloatingDraggableButton>

      {/* Sticky note button (right) */}
      <FloatingDraggableButton
        ariaLabel="打开便利贴"
        className="flex h-12 w-12 cursor-grab items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-primary-hover active:cursor-grabbing"
        onClick={() => setStickyNoteOpen(true)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
        </svg>
      </FloatingDraggableButton>

      <StickyNoteModal
        open={stickyNoteOpen}
        onClose={() => setStickyNoteOpen(false)}
        onConvertToTask={openTaskFromStickyNote}
      />
    </>
  );
}

function GlobalTaskCreateDrawer({
  enabled,
  pendingConvertNoteId,
  onStickyNoteConverted,
}: {
  enabled: boolean;
  pendingConvertNoteId: string | null;
  onStickyNoteConverted: (noteId: string, itemId: string, workspaceId: string, projectId: string) => void;
}) {
  const {
    open,
    initialStatus,
    initialPriority,
    initialStartAt,
    initialEndAt,
    initialTitle,
    initialBody,
    initialLocation,
    taskToEdit,
    close,
  } = useTaskCreateDrawer();

  if (!enabled) return null;

  const isEditMode = !!taskToEdit;

  return (
    <TaskDrawerWithComments
      open={open}
      onClose={close}
      workspaceId={taskToEdit?.workspaceId ?? ""}
      projectId={taskToEdit?.projectId ?? ""}
      itemId={taskToEdit?.itemId ?? null}
      highlightCommentId={null}
      token={getAccessToken()}
      variant={isEditMode ? "edit" : "create"}
      initialCreateStatus={initialStatus}
      initialCreatePriority={initialPriority}
      initialCreateStartAt={initialStartAt}
      initialCreateEndAt={initialEndAt}
      initialCreateTitle={initialTitle}
      initialCreateBody={initialBody}
      initialCreateLocation={initialLocation}
      onTaskCreated={(ctx) => {
        // 派发全局事件，由 AppShell 统一处理便利贴 link。
        // 这样 schedule/项目页等用自己 TaskDrawerWithComments 的页面也能复用。
        console.info("[sticky-note] GlobalDrawer.onTaskCreated → dispatch app:task-created", {
          itemId: ctx.item.id,
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId,
        });
        window.dispatchEvent(
          new CustomEvent("app:task-created", {
            detail: {
              itemId: ctx.item.id,
              workspaceId: ctx.workspaceId,
              projectId: ctx.projectId,
            },
          }),
        );
        close();
      }}
    />
  );
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useCurrentMe();
  const { openTaskEdit } = useTaskCreateDrawer();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [pendingConvertNoteId, setPendingConvertNoteId] = useState<string | null>(null);
  const pendingConvertNoteIdRef = useRef<string | null>(null);
  pendingConvertNoteIdRef.current = pendingConvertNoteId;
  const pendingConvertPrefillRef = useRef<TaskCreatePrefill | null>(null);
  const pendingTaskContextRef = useRef<{
    noteId: string;
    itemId: string;
    workspaceId: string;
    projectId: string;
  } | null>(null);
  const openTaskEditRef = useRef(openTaskEdit);
  openTaskEditRef.current = openTaskEdit;
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  useEscapeDismiss({
    open: userMenuOpen,
    onDismiss: () => setUserMenuOpen(false),
  });

  useLayoutEffect(() => {
    const scrollContainer = contentScrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await bootstrapSession();
      if (cancelled) return;
      if (!ok) {
        redirectToLoginPage({ reason: loginRedirectReasonWhenUnauthenticated() });
        return;
      }
      setAuthReady(true);
      void refreshMeIfNeeded();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = isSystemAdmin(me?.system_role);
  const ownsTaskCreateDrawer = pageOwnsTaskCreateDrawer(pathname);

  const handleStickyNoteConverted = async (
    noteId: string,
    itemId: string,
    workspaceId: string,
    projectId: string,
  ) => {
    // 调用后台 API 写入 converted_item_id，statusOf 依赖此字段判断 converted 状态
    const prefill = pendingConvertPrefillRef.current;
    const parseId = prefill?.parseId;
    console.info("[sticky-note] convert.start", { noteId, parseId, itemId, workspaceId, projectId });
    if (parseId) {
      try {
        await convertStickyNoteToTask(getAccessToken() ?? "", noteId, {
          parse_id: parseId,
          workspace_id: workspaceId,
          project_id: projectId,
          field_overrides: {},
          item_id: itemId,
        });
        console.info("[sticky-note] convert.ok", { noteId, parseId, itemId });
      } catch (err) {
        console.error("[sticky-note] convert.failed", err, { noteId, parseId, itemId });
      }
    } else {
      console.warn("[sticky-note] convert.skipped (no parseId)", { noteId, itemId });
    }
    // 存储 workspace/project 映射，供后续打开编辑时使用
    pendingTaskContextRef.current = { noteId, itemId, workspaceId, projectId };
    window.dispatchEvent(
      new CustomEvent("sticky-note-converted", { detail: { noteId, itemId, workspaceId, projectId } }),
    );
    pendingConvertPrefillRef.current = null;
    setPendingConvertNoteId(null);
  };

  // 监听点击"已转化"badge，打开对应的任务编辑
  useEffect(() => {
    function onOpenTask(e: Event) {
      const { noteId, itemId } = (e as CustomEvent<{ noteId: string; itemId: string }>).detail;
      const ctx = pendingTaskContextRef.current;
      if (ctx && ctx.noteId === noteId && ctx.itemId === itemId) {
        openTaskEditRef.current({ itemId: ctx.itemId, workspaceId: ctx.workspaceId, projectId: ctx.projectId });
      }
    }
    window.addEventListener("sticky-note-open-task", onOpenTask);
    return () => window.removeEventListener("sticky-note-open-task", onOpenTask);
  }, []);

  // 监听全局 task-created 事件，统一处理便利贴 link。
  // schedule/项目页等有自己的 TaskDrawerWithComments 实例，
  // 它们创建任务后 dispatch 这个事件，AppShell 统一收口。
  useEffect(() => {
    function onAppTaskCreated(e: Event) {
      const { itemId, workspaceId, projectId } = (e as CustomEvent<{
        itemId: string;
        workspaceId: string;
        projectId: string;
      }>).detail;
      const noteId = pendingConvertNoteIdRef.current;
      if (!noteId) return;
      void handleStickyNoteConverted(noteId, itemId, workspaceId, projectId);
    }
    window.addEventListener("app:task-created", onAppTaskCreated);
    return () => window.removeEventListener("app:task-created", onAppTaskCreated);
  }, []);

  useEffect(() => {
    if (!me || isAdmin) return;
    if (isAdminOnlyPath(pathname)) {
      router.replace("/my/schedule");
    }
  }, [me, isAdmin, pathname, router]);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      const sideMenu = document.getElementById("timia-user-menu-side");
      const topMenu = document.getElementById("timia-user-menu-top");
      if ((sideMenu && sideMenu.contains(target)) || (topMenu && topMenu.contains(target))) {
        return;
      }
      setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [userMenuOpen]);

  return (
    <TaskCreateDrawerProvider>
      <div className="flex h-screen min-h-0">
        <SideNav userMenuOpen={userMenuOpen} onUserMenuOpenChange={setUserMenuOpen} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar userMenuOpen={userMenuOpen} onUserMenuOpenChange={setUserMenuOpen} />
          <div ref={contentScrollRef} className="min-h-0 flex-1 overflow-y-auto">
            {authReady ? children : null}
          </div>
        </div>
        {authReady && me && (
          <FloatingButtons
            pathname={pathname}
            setPendingConvertNoteId={setPendingConvertNoteId}
            pendingConvertPrefillRef={pendingConvertPrefillRef}
          />
        )}
      </div>
      {authReady && me && (
        <GlobalTaskCreateDrawer
          enabled={!ownsTaskCreateDrawer}
          pendingConvertNoteId={pendingConvertNoteId}
          onStickyNoteConverted={handleStickyNoteConverted}
        />
      )}
    </TaskCreateDrawerProvider>
  );
}
