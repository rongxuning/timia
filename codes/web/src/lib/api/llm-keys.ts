import { apiFetch } from "@/lib/api";
import type { LlmApiKey, LlmApiKeyList, LlmApiKeyWrite } from "@/types/api/llm-keys";

export function fetchLlmApiKeys(token: string): Promise<LlmApiKeyList> {
  return apiFetch<LlmApiKeyList>("/llm-api-keys", { token });
}

export function createLlmApiKey(token: string, body: LlmApiKeyWrite & { api_key: string }): Promise<LlmApiKey> {
  return apiFetch<LlmApiKey>("/llm-api-keys", {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateLlmApiKey(token: string, keyId: string, body: Partial<LlmApiKeyWrite>): Promise<LlmApiKey> {
  return apiFetch<LlmApiKey>(`/llm-api-keys/${keyId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteLlmApiKey(token: string, keyId: string): Promise<void> {
  return apiFetch<void>(`/llm-api-keys/${keyId}`, { token, method: "DELETE" });
}

export function makeLlmApiKeyPrimary(token: string, keyId: string): Promise<LlmApiKey> {
  return apiFetch<LlmApiKey>(`/llm-api-keys/${keyId}/make-primary`, {
    token,
    method: "POST",
  });
}

export function probeLlmApiKey(token: string, keyId: string): Promise<{ ok: boolean; key: LlmApiKey }> {
  return apiFetch<{ ok: boolean; key: LlmApiKey }>(`/llm-api-keys/${keyId}/probe`, {
    token,
    method: "POST",
  });
}
