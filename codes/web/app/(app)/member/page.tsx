"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserDirectoryList, UserDirectorySummary } from "@/components/users/UserDirectory";
import { fetchUserDirectory, fetchUserMembershipDetail } from "@/lib/api/user-views";
import { getToken } from "@/lib/auth";
import type { UserDirectoryView, UserMembershipWorkspace } from "@/types/api/views/users";

export default function MemberPage() {
  const router = useRouter();
  const token = useMemo(() => getToken(), []);

  const [directory, setDirectory] = useState<UserDirectoryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [detailsByUserId, setDetailsByUserId] = useState<Record<string, UserMembershipWorkspace[] | undefined>>({});
  const [detailsLoadingUserId, setDetailsLoadingUserId] = useState<string | null>(null);
  const [detailsErrorByUserId, setDetailsErrorByUserId] = useState<Record<string, string | undefined>>({});

  const [copyStateByUserId, setCopyStateByUserId] = useState<Record<string, "idle" | "success" | "error">>({});
  const copyResetTimersRef = useRef<Record<string, number | undefined>>({});

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    fetchUserDirectory(token)
      .then(setDirectory)
      .catch((e: { message?: string }) => setError(e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, [router, token]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(copyResetTimersRef.current)) {
        if (timerId) window.clearTimeout(timerId);
      }
    };
  }, []);

  async function toggleUser(userId: string) {
    if (!token) return;
    const nextExpanded = expandedUserId === userId ? null : userId;
    setExpandedUserId(nextExpanded);
    if (!nextExpanded || detailsByUserId[userId]) return;

    setDetailsLoadingUserId(userId);
    setDetailsErrorByUserId((prev) => ({ ...prev, [userId]: undefined }));
    try {
      const detail = await fetchUserMembershipDetail(token, userId);
      setDetailsByUserId((prev) => ({ ...prev, [userId]: detail.workspaces }));
    } catch (e: unknown) {
      setDetailsErrorByUserId((prev) => ({
        ...prev,
        [userId]: (e as { message?: string })?.message ?? "加载失败",
      }));
    } finally {
      setDetailsLoadingUserId(null);
    }
  }

  function setCopyState(userId: string, state: "idle" | "success" | "error") {
    setCopyStateByUserId((prev) => ({ ...prev, [userId]: state }));
    const existing = copyResetTimersRef.current[userId];
    if (existing) window.clearTimeout(existing);
    if (state === "idle") return;
    copyResetTimersRef.current[userId] = window.setTimeout(() => {
      setCopyStateByUserId((prev) => ({ ...prev, [userId]: "idle" }));
    }, 1000);
  }

  async function writeClipboardWithFallback(text: string) {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!ok) throw new Error("copy_failed");
  }

  async function handleCopyEmail(e: React.MouseEvent, userId: string, email: string) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await writeClipboardWithFallback(email);
      setCopyState(userId, "success");
    } catch {
      setCopyState(userId, "error");
    }
  }

  return (
    <main className="px-lg py-lg">
      <div className="max-w-container-max mx-auto">
        <UserDirectorySummary
          loading={loading}
          userTotal={directory?.user_total ?? 0}
          usersWithWorkspace={directory?.users_with_workspace ?? 0}
          unassignedUserCount={directory?.unassigned_user_count ?? 0}
          workspaceAssignmentsTotal={directory?.workspace_assignments_total ?? 0}
        />

        {error && (
          <div className="mb-lg rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        )}

        <UserDirectoryList
          loading={loading}
          users={directory?.users ?? []}
          expandedUserId={expandedUserId}
          detailsByUserId={detailsByUserId}
          detailsLoadingUserId={detailsLoadingUserId}
          detailsErrorByUserId={detailsErrorByUserId}
          copyStateByUserId={copyStateByUserId}
          onToggleUser={toggleUser}
          onCopyEmail={handleCopyEmail}
        />
      </div>
    </main>
  );
}
