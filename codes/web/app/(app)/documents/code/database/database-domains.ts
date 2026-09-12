export type DatabaseDomain = {
  id: string;
  title: string;
  description: string;
  borderClass: string;
  labelClass: string;
  tables: string[];
  diagram: string;
};

/** 全局汇总：仅保留核心表与跨域外键，便于先看整体再下钻各业务域 */
export const SUMMARY_ER_DIAGRAM = `erDiagram
  USERS {
    uuid id PK
    string email
    string display_name
  }
  WORKSPACES {
    uuid id PK
    uuid created_by_user_id FK
    string name
  }
  WORKSPACE_MEMBERS {
    uuid id PK
    uuid workspace_id FK
    uuid user_id FK
  }
  PROJECTS {
    uuid id PK
    uuid workspace_id FK
    uuid created_by_user_id FK
    string name
  }
  PROJECT_MEMBERS {
    uuid id PK
    uuid project_id FK
    uuid user_id FK
  }
  ITEMS {
    uuid id PK
    uuid workspace_id FK
    uuid project_id FK
    uuid source_plan_template_id FK
    uuid source_plan_apply_run_id FK
    string title
  }
  COMMENTS {
    uuid id PK
    uuid item_id FK
    uuid author_user_id FK
  }
  STICKY_NOTES {
    uuid id PK
    uuid owner_user_id FK
    string title
  }
  STICKY_NOTE_AI_PARSES {
    uuid id PK
    uuid sticky_note_id FK
    uuid converted_item_id FK
  }
  PLAN_TEMPLATES {
    uuid id PK
    uuid created_by_user_id FK
    string title
    string usage_kind
  }
  PLAN_SLOTS {
    uuid id PK
    uuid template_id FK
  }
  PLAN_SUBSCRIPTIONS {
    uuid id PK
    uuid template_id FK
    uuid subscriber_user_id FK
    uuid workspace_id FK
    uuid project_id FK
  }
  PLAN_APPLY_RUNS {
    uuid id PK
    uuid template_id FK
    uuid workspace_id FK
    uuid project_id FK
    uuid subscription_id FK
    string status
  }
  HEALTH_PROFILES {
    uuid id PK
    uuid owner_user_id FK
  }
  HEALTH_METRICS_DAILY {
    uuid id PK
    uuid owner_user_id FK
    date local_date
  }
  HEALTH_WORKOUT_SESSION {
    uuid id PK
    uuid owner_user_id FK
    uuid hk_uuid
    string activity_type
  }
  HEALTH_SYNC_STATE {
    uuid id PK
    uuid owner_user_id FK
    datetime last_health_synced_at
    datetime last_workout_synced_at
  }
  USERS ||--o{ WORKSPACES : creates
  USERS ||--o{ WORKSPACE_MEMBERS : joins
  USERS ||--o{ PROJECT_MEMBERS : joins
  USERS ||--o{ STICKY_NOTES : owns
  USERS ||--o{ PLAN_TEMPLATES : authors
  USERS ||--o{ PLAN_SUBSCRIPTIONS : subscribes
  WORKSPACES ||--o{ WORKSPACE_MEMBERS : has
  WORKSPACES ||--o{ PROJECTS : contains
  WORKSPACES ||--o{ ITEMS : scopes
  PROJECTS ||--o{ PROJECT_MEMBERS : has
  PROJECTS ||--o{ ITEMS : holds
  ITEMS ||--o{ COMMENTS : discussed
  STICKY_NOTES ||--o{ STICKY_NOTE_AI_PARSES : parses
  STICKY_NOTE_AI_PARSES }o--o| ITEMS : converts_to
  PLAN_TEMPLATES ||--o{ PLAN_SLOTS : defines
  PLAN_TEMPLATES ||--o{ PLAN_SUBSCRIPTIONS : subscribed
  PLAN_TEMPLATES ||--o{ PLAN_APPLY_RUNS : imports
  PLAN_SUBSCRIPTIONS ||--o{ PLAN_APPLY_RUNS : generates
  PLAN_APPLY_RUNS }o--|| WORKSPACES : targets
  PLAN_APPLY_RUNS }o--|| PROJECTS : targets
  ITEMS }o--o| PLAN_TEMPLATES : source_plan
  ITEMS }o--o| PLAN_APPLY_RUNS : source_run
  USERS ||--o| HEALTH_PROFILES : profile
  USERS ||--o{ HEALTH_METRICS_DAILY : daily
  USERS ||--o{ HEALTH_WORKOUT_SESSION : workouts
  USERS ||--o| HEALTH_SYNC_STATE : sync_cursor`;

export const DATABASE_DOMAINS: DatabaseDomain[] = [
  {
    id: "auth",
    title: "身份与会话",
    description: "用户账号、第三方身份、设备与会话令牌。",
    borderClass: "border-indigo-300",
    labelClass: "bg-indigo-100 text-indigo-800",
    tables: [
      "users",
      "auth_identities",
      "auth_challenges",
      "web_sessions",
      "mobile_devices",
      "mobile_sessions",
    ],
    diagram: `erDiagram
      USERS {
        uuid id PK
        datetime created_at
        datetime updated_at
        string email "UNIQUE"
        string password_hash
        string display_name "UNIQUE"
        string status "active | disabled"
        string system_role "admin | user"
      }
      AUTH_IDENTITIES {
        uuid id PK
        uuid user_id FK
        string provider
        string provider_subject
        bool email_verified
        datetime last_login_at
      }
      AUTH_CHALLENGES {
        uuid id PK
        string purpose
        string installation_id
        uuid session_id
        string nonce_hash "UNIQUE"
        datetime expires_at
        datetime consumed_at
      }
      MOBILE_DEVICES {
        uuid id PK
        string installation_id "UNIQUE"
        text public_key
        string platform
        datetime last_seen_at
      }
      MOBILE_SESSIONS {
        uuid id PK
        uuid user_id FK
        uuid device_id FK
        string refresh_token_hash "UNIQUE"
        datetime idle_expires_at
        datetime absolute_expires_at
        datetime revoked_at
      }
      WEB_SESSIONS {
        uuid id PK
        uuid user_id FK
        string refresh_token_hash "UNIQUE"
        datetime idle_expires_at
        datetime absolute_expires_at
        datetime revoked_at
      }
      USERS ||--o{ AUTH_IDENTITIES : has
      USERS ||--o{ WEB_SESSIONS : holds
      USERS ||--o{ MOBILE_SESSIONS : holds
      MOBILE_DEVICES ||--o{ MOBILE_SESSIONS : hosts
      USERS ||--o{ AUTH_CHALLENGES : triggers
      MOBILE_DEVICES ||--o{ AUTH_CHALLENGES : scoped_to`,
  },
  {
    id: "workspace",
    title: "工作空间与项目",
    description: "空间、项目及成员与收藏关系。",
    borderClass: "border-emerald-300",
    labelClass: "bg-emerald-100 text-emerald-800",
    tables: [
      "workspaces",
      "workspace_members",
      "projects",
      "project_members",
      "project_favorites",
    ],
    diagram: `erDiagram
      WORKSPACES {
        uuid id PK
        string name
        string description
        string color
        uuid created_by_user_id FK
      }
      WORKSPACE_MEMBERS {
        uuid id PK
        uuid workspace_id FK
        uuid user_id FK
        string role "owner | member"
        string status "active | removed"
        bool is_favorite
        datetime last_active_at
      }
      PROJECTS {
        uuid id PK
        uuid workspace_id FK
        uuid created_by_user_id FK
        string name
        string color
        bool archived
      }
      PROJECT_MEMBERS {
        uuid id PK
        uuid workspace_id FK
        uuid project_id FK
        uuid user_id FK
        string role "owner | member"
        string status "active | removed"
      }
      PROJECT_FAVORITES {
        uuid id PK
        uuid workspace_id FK
        uuid project_id FK
        uuid user_id FK
      }
      WORKSPACES ||--o{ WORKSPACE_MEMBERS : has
      WORKSPACES ||--o{ PROJECTS : contains
      PROJECTS ||--o{ PROJECT_MEMBERS : has
      PROJECTS ||--o{ PROJECT_FAVORITES : starred`,
  },
  {
    id: "tasks",
    title: "任务与协作",
    description: "项目任务、评论与活动日志；任务可关联规划导入来源。",
    borderClass: "border-amber-300",
    labelClass: "bg-amber-100 text-amber-800",
    tables: ["items", "comments", "activity_log"],
    diagram: `erDiagram
      ITEMS {
        uuid id PK
        uuid workspace_id FK
        uuid project_id FK
        string title
        string status "todo | doing | done | archived"
        string priority
        datetime start_at
        datetime end_at
        uuid created_by_user_id FK
        uuid assignee_user_id FK
        uuid_array participant_user_ids
        uuid source_plan_template_id FK
        uuid source_plan_slot_id FK
        uuid source_plan_apply_run_id FK
        int version
      }
      COMMENTS {
        uuid id PK
        uuid workspace_id FK
        uuid item_id FK
        uuid author_user_id FK
        string body
        uuid parent_comment_id FK
        string completion_status "pending | done"
      }
      ACTIVITY_LOG {
        uuid id PK
        uuid workspace_id FK
        uuid actor_user_id FK
        string entity_type
        uuid entity_id
        string action
        jsonb metadata
      }
      ITEMS ||--o{ COMMENTS : has
      COMMENTS ||--o{ COMMENTS : threads`,
  },
  {
    id: "sticky",
    title: "便利贴",
    description: "个人便利贴、附件与 AI 解析草稿。",
    borderClass: "border-violet-300",
    labelClass: "bg-violet-100 text-violet-800",
    tables: ["sticky_notes", "sticky_note_attachments", "sticky_note_ai_parses"],
    diagram: `erDiagram
      STICKY_NOTES {
        uuid id PK
        uuid owner_user_id FK
        string title
        text content
        datetime recorded_at
        string timezone
        datetime archived_at
        int converted_count
      }
      STICKY_NOTE_ATTACHMENTS {
        uuid id PK
        uuid sticky_note_id FK
        string attachment_type
        string storage_url
        string mime_type
      }
      STICKY_NOTE_AI_PARSES {
        uuid id PK
        uuid sticky_note_id FK
        string parse_status
        jsonb draft_json
        uuid converted_item_id FK
        datetime converted_at
      }
      STICKY_NOTES ||--o{ STICKY_NOTE_ATTACHMENTS : carries
      STICKY_NOTES ||--o{ STICKY_NOTE_AI_PARSES : parses`,
  },
  {
    id: "plans",
    title: "规划",
    description: "规划模板、订阅、导入运行、评论、收藏与通知。",
    borderClass: "border-sky-300",
    labelClass: "bg-sky-100 text-sky-800",
    tables: [
      "plan_templates",
      "plan_slots",
      "plan_tags",
      "plan_template_tags",
      "plan_favorites",
      "plan_subscriptions",
      "plan_subscription_segments",
      "plan_apply_runs",
      "plan_comments",
      "plan_notifications",
    ],
    diagram: `erDiagram
      PLAN_TEMPLATES {
        uuid id PK
        uuid created_by_user_id FK
        string title
        string usage_kind "plan_mode | subscription_mode"
        string period_kind "day | week | month | year"
        string visibility "private | public"
        int use_count
        int version
      }
      PLAN_SLOTS {
        uuid id PK
        uuid template_id FK
        int rel_day
        int start_minute
        int end_minute
        bool all_day
        string title
        int sort_index
      }
      PLAN_TAGS {
        uuid id PK
        string name "UNIQUE"
      }
      PLAN_TEMPLATE_TAGS {
        uuid id PK
        uuid template_id FK
        uuid tag_id FK
      }
      PLAN_FAVORITES {
        uuid id PK
        uuid user_id FK
        uuid template_id FK
      }
      PLAN_SUBSCRIPTIONS {
        uuid id PK
        uuid template_id FK
        uuid subscriber_user_id FK
        uuid workspace_id FK
        uuid project_id FK
        string timezone
      }
      PLAN_SUBSCRIPTION_SEGMENTS {
        uuid id PK
        uuid subscription_id FK
        datetime started_at
        datetime ended_at
      }
      PLAN_APPLY_RUNS {
        uuid id PK
        uuid template_id FK
        uuid actor_user_id FK
        uuid workspace_id FK
        uuid project_id FK
        string source "plan_mode | subscription_mode"
        uuid subscription_id FK
        uuid segment_id FK
        date period_start
        string status "applied | pending | skipped | expired | canceled"
        datetime applied_at
      }
      PLAN_COMMENTS {
        uuid id PK
        uuid template_id FK
        uuid author_user_id FK
        uuid parent_comment_id FK
        string body
      }
      PLAN_NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        string kind "upcoming_period | template_updated | comment_reply"
        uuid template_id FK
        uuid subscription_id FK
        uuid apply_run_id FK
        datetime read_at
      }
      PLAN_TEMPLATES ||--o{ PLAN_SLOTS : defines
      PLAN_TEMPLATES ||--o{ PLAN_TEMPLATE_TAGS : tagged
      PLAN_TAGS ||--o{ PLAN_TEMPLATE_TAGS : used_by
      PLAN_TEMPLATES ||--o{ PLAN_FAVORITES : favorited
      PLAN_TEMPLATES ||--o{ PLAN_SUBSCRIPTIONS : subscribed
      PLAN_SUBSCRIPTIONS ||--o{ PLAN_SUBSCRIPTION_SEGMENTS : segments
      PLAN_SUBSCRIPTIONS ||--o{ PLAN_APPLY_RUNS : runs
      PLAN_SUBSCRIPTION_SEGMENTS ||--o{ PLAN_APPLY_RUNS : scoped
      PLAN_TEMPLATES ||--o{ PLAN_APPLY_RUNS : materializes
      PLAN_TEMPLATES ||--o{ PLAN_COMMENTS : discussed
      PLAN_TEMPLATES ||--o{ PLAN_NOTIFICATIONS : notifies`,
  },
  {
    id: "health",
    title: "健康与健身",
    description:
      "个人 HealthKit 样本、训练、日汇总与同步游标；仅挂 owner_user_id，不进工作空间。",
    borderClass: "border-rose-300",
    labelClass: "bg-rose-100 text-rose-800",
    tables: [
      "health_profiles",
      "health_sample_quantity",
      "health_sample_sleep",
      "health_sample_stand_hour",
      "health_series_heartbeat",
      "health_workout_session",
      "health_workout_route",
      "health_metrics_daily",
      "health_insight_daily",
      "health_metrics_layout",
      "health_sync_run",
      "health_sync_state",
    ],
    diagram: `erDiagram
      HEALTH_PROFILES {
        uuid id PK
        uuid owner_user_id FK
        string sex
        int age_years
        float height_cm
        int max_hr_bpm
      }
      HEALTH_SAMPLE_QUANTITY {
        uuid id PK
        uuid owner_user_id FK
        uuid hk_uuid
        string metric_type
        datetime start_at
        float value
        string unit
        datetime deleted_at
      }
      HEALTH_SAMPLE_SLEEP {
        uuid id PK
        uuid owner_user_id FK
        uuid hk_uuid
        datetime start_at
        string stage "in_bed | awake | core | deep | rem"
        datetime deleted_at
      }
      HEALTH_SAMPLE_STAND_HOUR {
        uuid id PK
        uuid owner_user_id FK
        uuid hk_uuid
        datetime start_at
        bool stood
        datetime deleted_at
      }
      HEALTH_SERIES_HEARTBEAT {
        uuid id PK
        uuid owner_user_id FK
        uuid hk_uuid
        datetime start_at
        int interval_count
        jsonb intervals
        datetime deleted_at
      }
      HEALTH_WORKOUT_SESSION {
        uuid id PK
        uuid owner_user_id FK
        uuid hk_uuid
        string activity_type
        datetime start_at
        int duration_seconds
        float distance_m
        float avg_hr_bpm
        datetime deleted_at
      }
      HEALTH_WORKOUT_ROUTE {
        uuid id PK
        uuid owner_user_id FK
        uuid workout_hk_uuid
        jsonb points
        int point_count
        datetime deleted_at
      }
      HEALTH_METRICS_DAILY {
        uuid id PK
        uuid owner_user_id FK
        date local_date
        float steps
        float active_energy_kcal
        float resting_hr_bpm
        float sleep_asleep_minutes
      }
      HEALTH_INSIGHT_DAILY {
        uuid id PK
        uuid owner_user_id FK
        date local_date
        string status "pending | success | failed"
        string summary
      }
      HEALTH_METRICS_LAYOUT {
        uuid id PK
        uuid owner_user_id FK
        jsonb card_order
      }
      HEALTH_SYNC_RUN {
        uuid id PK
        uuid owner_user_id FK
        string source "manual | background"
        string status "success | failed"
        datetime started_at
        datetime from_at
        datetime to_at
        int upserted
      }
      HEALTH_SYNC_STATE {
        uuid id PK
        uuid owner_user_id FK
        datetime last_health_synced_at
        datetime last_workout_synced_at
      }
      HEALTH_WORKOUT_SESSION ||--o| HEALTH_WORKOUT_ROUTE : by_hk_uuid
      HEALTH_SYNC_STATE }o--o| HEALTH_SYNC_RUN : last_run`,
  },
];

export const TABLE_DOMAIN_MAP = new Map(
  DATABASE_DOMAINS.flatMap((domain) => domain.tables.map((table) => [table, domain] as const)),
);
