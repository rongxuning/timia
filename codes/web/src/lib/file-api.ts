import { apiFetch, apiFetchBlob, type ApiError } from "./api";

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const MAX_ITEM_BINDINGS = 20;

export type FileKind = "image" | "video" | "file";

export type FileUserBrief = {
  id: string;
  display_name: string;
};

export type FileBindingOut = {
  id: string;
  binding_type: string;
  binding_id: string;
};

export type FileOut = {
  id: string;
  kind: FileKind | string;
  status: string;
  mime_type: string;
  byte_size: number;
  original_filename: string;
  width_px?: number | null;
  height_px?: number | null;
  duration_ms?: number | null;
  workspace_id: string;
  project_id?: string | null;
  folder_id?: string | null;
  created_by?: FileUserBrief | null;
  created_at: string;
  bindings: FileBindingOut[];
  content_path: string;
  thumb_path?: string | null;
  poster_path?: string | null;
};

export type FileListOut = {
  items: FileOut[];
  next_cursor?: string | null;
};

export function kindForFile(file: File): FileKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

export function validateTaskMedia(file: File): { ok: true; kind: FileKind } | { ok: false; reason: "unsupported" | "imageTooLarge" | "videoTooLarge" } {
  const kind = kindForFile(file);
  if (!kind) return { ok: false, reason: "unsupported" };
  if (kind === "image" && file.size > IMAGE_MAX_BYTES) return { ok: false, reason: "imageTooLarge" };
  if (kind === "video" && file.size > VIDEO_MAX_BYTES) return { ok: false, reason: "videoTooLarge" };
  return { ok: true, kind };
}

export async function listItemFiles(opts: {
  token: string;
  workspaceId: string;
  projectId: string;
  itemId: string;
}): Promise<FileOut[]> {
  const params = new URLSearchParams({
    workspace_id: opts.workspaceId,
    project_id: opts.projectId,
    binding_type: "item",
    binding_id: opts.itemId,
    limit: "100",
  });
  const listed = await apiFetch<FileListOut>(`/files?${params.toString()}`, { token: opts.token });
  return listed.items ?? [];
}

export async function uploadTaskFile(opts: {
  token: string;
  workspaceId: string;
  projectId: string;
  itemId: string;
  file: File;
  kind?: FileKind;
}): Promise<FileOut> {
  const kind = opts.kind ?? kindForFile(opts.file);
  if (!kind || kind === "file") {
    const err: ApiError = { status: 400, message: "unsupported" };
    throw err;
  }
  const body = new FormData();
  body.append("file", opts.file);
  body.append("kind", kind);
  body.append("workspace_id", opts.workspaceId);
  body.append("project_id", opts.projectId);
  body.append("binding_type", "item");
  body.append("binding_id", opts.itemId);
  return apiFetch<FileOut>("/files", { method: "POST", token: opts.token, body });
}

export async function deleteFile(opts: { token: string; fileId: string }): Promise<void> {
  await apiFetch<void>(`/files/${opts.fileId}`, { method: "DELETE", token: opts.token });
}

export async function fetchFileBlob(path: string, token: string): Promise<Blob> {
  return apiFetchBlob(path, { token });
}

export async function uploadPendingTaskFiles(opts: {
  token: string;
  workspaceId: string;
  projectId: string;
  itemId: string;
  files: File[];
}): Promise<void> {
  const { files, ...rest } = opts;
  for (const file of files) {
    await uploadTaskFile({ ...rest, file });
  }
}
