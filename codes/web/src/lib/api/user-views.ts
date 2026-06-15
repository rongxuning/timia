import { apiFetch } from "@/lib/api";
import type { UserDirectoryView, UserMembershipDetailView } from "@/types/api/views/users";

export function fetchUserDirectory(token: string): Promise<UserDirectoryView> {
  return apiFetch<UserDirectoryView>("/views/users/directory", { token });
}

export function fetchUserMembershipDetail(token: string, userId: string): Promise<UserMembershipDetailView> {
  return apiFetch<UserMembershipDetailView>(`/views/users/${userId}/membership-detail`, { token });
}
