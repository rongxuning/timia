export type LlmKeyRole = "primary" | "standby" | "disabled";

export type LlmApiKey = {
  id: string;
  name: string;
  base_url: string;
  api_key_hint: string;
  model: string;
  enabled: boolean;
  priority: number;
  timeout_seconds: number | null;
  role: LlmKeyRole;
  cooldown_until: string | null;
  last_status: string | null;
  last_error: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LlmApiKeyList = {
  keys: LlmApiKey[];
};

export type LlmApiKeyWrite = {
  name: string;
  base_url: string;
  api_key?: string;
  model: string;
  enabled: boolean;
  priority: number;
  timeout_seconds: number | null;
};
