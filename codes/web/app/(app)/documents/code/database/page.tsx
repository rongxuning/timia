"use client";

import { useEffect, useMemo, useState } from "react";

export default function DatabaseDiagramPage() {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const diagram = useMemo(
    () => `erDiagram
      %% ============================================================
      %% 身份与会话（auth / identity / device / session）
      %% ============================================================
      USERS {
        uuid id PK
        datetime created_at
        datetime updated_at
        string email "UNIQUE, INDEX"
        string password_hash
        string display_name "UNIQUE, INDEX"
        string status "active | disabled"
        string system_role "admin | user"
      }

      AUTH_IDENTITIES {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid user_id FK
        string provider
        string provider_tenant
        string provider_subject
        string normalized_email
        string normalized_phone
        bool email_verified
        bool phone_verified
        datetime last_login_at
        text provider_metadata
      }

      AUTH_CHALLENGES {
        uuid id PK
        datetime created_at
        string purpose "register | login | exchange | refresh"
        string installation_id
        uuid session_id
        string nonce_hash "UNIQUE"
        int attempt_count
        datetime expires_at
        datetime consumed_at
      }

      MOBILE_DEVICES {
        uuid id PK
        datetime created_at
        datetime updated_at
        string installation_id "UNIQUE, INDEX"
        text public_key "Ed25519"
        string platform "ios (default)"
        string device_name
        string os_version
        string app_version
        string app_attest_key_id
        string attestation_status
        datetime last_seen_at
        datetime disabled_at
      }

      MOBILE_SESSIONS {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid user_id FK
        uuid device_id FK
        string login_provider
        string refresh_token_hash "UNIQUE"
        string previous_refresh_token_hash "UNIQUE"
        uuid token_family_id
        int refresh_generation
        string last_rotation_request_id
        datetime last_rotated_at
        datetime last_used_at
        datetime idle_expires_at
        datetime absolute_expires_at
        datetime revoked_at
        string revoke_reason
        string last_ip
        string last_user_agent
      }

      WEB_SESSIONS {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid user_id FK
        string login_provider
        string refresh_token_hash "UNIQUE"
        string previous_refresh_token_hash "UNIQUE"
        uuid token_family_id
        int refresh_generation
        string last_rotation_request_id
        datetime last_rotated_at
        datetime last_used_at
        datetime idle_expires_at
        datetime absolute_expires_at
        datetime revoked_at
        string revoke_reason
        string last_ip
        string last_user_agent
        string user_agent_fingerprint
      }

      %% ============================================================
      %% 工作空间 / 项目 / 任务 / 评论
      %% ============================================================
      WORKSPACES {
        uuid id PK
        datetime created_at
        datetime updated_at
        string name
        string description
        string color "DEFAULT #FFFFFF"
        uuid created_by_user_id FK
      }

      WORKSPACE_MEMBERS {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid workspace_id FK
        uuid user_id FK
        string role "owner | member"
        string status "active | removed"
        bool is_favorite
        datetime last_active_at
      }

      PROJECTS {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid workspace_id FK
        uuid created_by_user_id FK
        string name
        string description
        string color "DEFAULT #FFFFFF"
        bool archived
      }

      PROJECT_MEMBERS {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid workspace_id FK
        uuid project_id FK
        uuid user_id FK
        string role "owner | member"
        string status "active | removed"
      }

      PROJECT_FAVORITES {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid workspace_id FK
        uuid project_id FK
        uuid user_id FK
      }

      ITEMS {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid workspace_id FK
        uuid project_id FK
        string title
        string body
        string color "DEFAULT #FFFFFF"
        string status "todo | doing | done | archived"
        string priority "low | medium | high"
        datetime start_at
        datetime end_at
        datetime completed_at
        string details
        uuid created_by_user_id FK
        uuid assignee_user_id FK
        uuid_array participant_user_ids
        string location
        int version "乐观锁"
      }

      COMMENTS {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid workspace_id FK
        uuid item_id FK
        uuid author_user_id FK
        string body
        datetime deleted_at
        uuid parent_comment_id FK
        string completion_status "pending | done"
      }

      ACTIVITY_LOG {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid workspace_id FK
        uuid actor_user_id FK
        string entity_type
        uuid entity_id
        string action
        jsonb metadata
      }

      %% ============================================================
      %% 便利贴（sticky notes，owner-scoped，无 workspace）
      %% ============================================================
      STICKY_NOTES {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid owner_user_id FK
        string title
        text content
        datetime recorded_at
        string timezone
        float location_lat
        float location_lng
        float location_accuracy_m
        string location_name
        string location_source "gps | ip | manual"
        string device_kind
        string user_agent
        datetime archived_at
        int converted_count
      }

      STICKY_NOTE_ATTACHMENTS {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid sticky_note_id FK
        string attachment_type "text | image | audio | video | file"
        string storage_url
        string mime_type
        int byte_size
        int duration_ms
        int width_px
        int height_px
        text transcript
        text ocr_text
      }

      STICKY_NOTE_AI_PARSES {
        uuid id PK
        datetime created_at
        datetime updated_at
        uuid sticky_note_id FK
        string parse_status "pending | success | failed | skipped"
        string parse_provider
        int parse_latency_ms
        jsonb draft_json
        float confidence
        jsonb assumptions
        jsonb missing_fields
        jsonb ambiguities
        uuid converted_item_id FK
        datetime converted_at
        string error_code
        text error_message
      }

      %% ============================================================
      %% 关系
      %% ============================================================
      USERS ||--o{ AUTH_IDENTITIES : has
      USERS ||--o{ WEB_SESSIONS : holds
      USERS ||--o{ MOBILE_SESSIONS : holds
      MOBILE_DEVICES ||--o{ MOBILE_SESSIONS : hosts
      USERS ||--o{ AUTH_CHALLENGES : triggers
      MOBILE_DEVICES ||--o{ AUTH_CHALLENGES : scoped_to

      USERS ||--o{ WORKSPACES : creates
      WORKSPACES ||--o{ WORKSPACE_MEMBERS : has
      USERS ||--o{ WORKSPACE_MEMBERS : joins
      WORKSPACES ||--o{ PROJECTS : contains
      USERS ||--o{ PROJECTS : creates
      PROJECTS ||--o{ PROJECT_MEMBERS : has
      USERS ||--o{ PROJECT_MEMBERS : joins
      PROJECTS ||--o{ PROJECT_FAVORITES : has
      USERS ||--o{ PROJECT_FAVORITES : stars

      WORKSPACES ||--o{ ITEMS : contains
      PROJECTS ||--o{ ITEMS : contains
      USERS ||--o{ ITEMS : creates
      USERS ||--o{ ITEMS : assigned
      USERS ||--o{ ITEMS : participates

      WORKSPACES ||--o{ COMMENTS : contains
      ITEMS ||--o{ COMMENTS : has
      USERS ||--o{ COMMENTS : writes
      COMMENTS ||--o{ COMMENTS : threads

      WORKSPACES ||--o{ ACTIVITY_LOG : records
      USERS ||--o{ ACTIVITY_LOG : acts

      USERS ||--o{ STICKY_NOTES : owns
      STICKY_NOTES ||--o{ STICKY_NOTE_ATTACHMENTS : carries
      STICKY_NOTES ||--o{ STICKY_NOTE_AI_PARSES : parses
      STICKY_NOTE_AI_PARSES }o--|| ITEMS : converts_to
    `,
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "strict",
        });
        const { svg } = await mermaid.render("timia-db-er", diagram);
        if (!cancelled) setSvg(svg);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "渲染失败");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [diagram]);

  return (
    <main className="min-h-screen px-container-padding py-8">
      <div className="max-w-container-max mx-auto space-y-4xl">
        <div className="flex flex-col gap-sm sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-xs">
            <h1 className="font-section-heading text-section-heading text-text-primary">数据库结构</h1>
            <p className="text-body text-text-secondary">
              从迁移文件（`0001_init_schema` → `0007_comment_threading`）推断的表结构、字段与关联关系。
            </p>
          </div>
          <a
            className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-border-subtle bg-surface px-md py-sm text-small font-medium text-text-primary hover:bg-surface-container-lowest transition-colors sm:self-auto"
            href="/documents/code/database/data"
          >
            <span className="material-symbols-outlined text-[16px]">table</span>
            查看表数据
          </a>
        </div>

        {error ? (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-4 text-small text-error">
            {error}
          </div>
        ) : svg ? (
          <div className="rounded-xl border border-border-subtle bg-surface p-3xl overflow-auto">
            {/* mermaid returns a full SVG string */}
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
        ) : (
          <div className="text-small text-text-secondary">渲染中…</div>
        )}
      </div>
    </main>
  );
}

