"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { TaskDrawerWithComments, type TaskDrawerSaveContext } from "@/components/TaskDrawerWithComments";

export default function ItemDetailPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string; projectId: string; itemId: string }>();
  const { workspaceId, projectId, itemId } = params;
  const token = useMemo(() => getToken(), []);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const transferredLocationRef = useRef<{ workspaceId: string; projectId: string } | null>(null);

  useEffect(() => {
    if (!token) {
      router.push("/login");
    }
  }, [router, token]);

  useEffect(() => {
    setDrawerOpen(true);
    transferredLocationRef.current = null;
  }, [itemId]);

  const projectHref = `/workspace/${workspaceId}/projects/${projectId}`;

  function handleTaskSaved(ctx: TaskDrawerSaveContext) {
    if (ctx.workspaceId !== workspaceId || ctx.projectId !== projectId) {
      transferredLocationRef.current = {
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
      };
    }
  }

  function handleClose() {
    setDrawerOpen(false);
    const transferred = transferredLocationRef.current;
    if (transferred) {
      router.replace(
        `/workspace/${transferred.workspaceId}/projects/${transferred.projectId}/items/${itemId}`,
      );
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-container-max px-container-padding py-md">
        <a className="text-small font-medium text-primary hover:underline" href={projectHref}>
          ← 返回项目
        </a>
      </div>

      <TaskDrawerWithComments
        open={!!token && drawerOpen}
        onClose={handleClose}
        workspaceId={workspaceId}
        projectId={projectId}
        itemId={itemId}
        highlightCommentId={null}
        token={token}
        onTaskSaved={handleTaskSaved}
        onTaskDeleted={() => {
          router.push(projectHref);
        }}
      />
    </main>
  );
}
