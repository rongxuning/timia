"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { TaskDrawerWithComments } from "@/components/TaskDrawerWithComments";

export default function ItemDetailPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string; projectId: string; itemId: string }>();
  const { workspaceId, projectId, itemId } = params;
  const token = useMemo(() => getToken(), []);
  const [drawerOpen, setDrawerOpen] = useState(true);

  useEffect(() => {
    if (!token) {
      router.push("/login");
    }
  }, [router, token]);

  useEffect(() => {
    setDrawerOpen(true);
  }, [itemId]);

  const projectHref = `/workspace/${workspaceId}/projects/${projectId}`;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-container-max px-container-padding py-md">
        <a className="text-small font-medium text-primary hover:underline" href={projectHref}>
          ← 返回项目
        </a>
      </div>

      <TaskDrawerWithComments
        open={!!token && drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
        }}
        workspaceId={workspaceId}
        projectId={projectId}
        itemId={itemId}
        highlightCommentId={null}
        token={token}
      />
    </main>
  );
}
