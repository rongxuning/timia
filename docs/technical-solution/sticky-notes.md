# Timia 便利贴（Sticky Notes）— 技术方案

> 用户在 web 浮动按钮 / iOS 底部 toolbar 入口打开便利贴页，页内**上区输入**（标题 + 内容 + 附件 + 地点） / **下区列表**（卡片：标题 / 内容 / 时间 / 地点 / 附件 / 状态），AI 解析为正式任务（复用现有任务创建页）。

---

## 一、现状（已摸清）

| 关注点 | 当前实现 | 文件 / 行号 |
|--------|---------|------------|
| 任务模型（items） | workspace + project 双层归属，权限走 `require_project_content_access` | `core-service/app/models/item.py:12-46` |
| 任务创建 API | `POST /workspaces/{wid}/projects/{pid}/items`，强制要 project | `core-service/app/routes/items.py:55-113` |
| 任务创建 UI | `TaskDrawerWithComments` 支持 `variant: "create" \| "edit"`，提交走 items API | `web/src/components/TaskDrawerWithComments.tsx:754-773` |
| 自然语言解析 | `parse_natural_language_task`，调 MiniMax，返回 `NaturalLanguageTaskDraft` | `core-service/app/services/natural_language_schedule.py:152-173` |
| 解析 HTTP 端点 | `POST /views/schedule/natural-language/parse` | `core-service/app/routes/views/schedule.py:107-123` |
| 解析请求 schema | 强制 `selected_date` + `reference_time` + `timezone` | `core-service/app/schemas/views/schedule.py:109-114` |
| 解析输出 schema | `title/body/start_at/end_at/all_day/status/priority/location/workspace_name/project_name/assignee_name/participant_names/recurrence_text` | `core-service/app/schemas/views/schedule.py:116-130` |
| 鉴权 | Bearer AT（内存）+ RT（HttpOnly cookie），web/mobile 两套 JWT audience | `core-service/app/api/deps.py:14-60` |
| 数据库迁移 | Alembic，目前到 `0009_workspace_creator_owner_role` | `core-service/app/migrations/versions/` |
| 活动日志 | `ActivityLog` 强制 `workspace_id`（便利贴不属于任何 workspace，需要单独处理） | `core-service/app/models/activity.py:14` |
| 浮动按钮组件 | `FloatingDraggableButton` 已就绪 | `web/src/components/FloatingDraggableButton.tsx` |
| 模态框范式 | `ProjectModal` 是干净的本地状态 + `apiFetch` 模式 | `web/src/components/ProjectModal.tsx` |
| nginx | dev 走 Next.js `rewrites`，prod 走 `deploy/nginx.conf` 里的 `location /core-service/` 转发 | `web/next.config.js`、`deploy/nginx.conf` |
| iOS app | `Timia.xcodeproj` 已存在，目录结构预留 | `codes/mobile/ios/` |
| iOS 底部 toolbar | `ScheduleHomeView` 的 `bottomControls`：`modeButton(.todo, ...)` + `modeButton(.calendar, ...)` + `+` 按钮 + 自然语言输入 | `codes/mobile/ios/Timia/Features/Schedule/ScheduleHomeView.swift:366-449` |
| iOS 内容区模式 | `contentMode: ContentMode = .todo \| .calendar` 切换主内容 | `ScheduleHomeView.swift:32-35, 80-126` |

### 关键发现

1. **便利贴不能放进 `items` 表**：`items.workspace_id` / `project_id` 是 `nullable=False`，且权限是 workspace/project 维度的，便利贴要求"个人数据，仅自己看到"，强行塞进去会让"无 workspace 任务"成为反模式，长期污染数据模型。
2. **AI 解析已经能用，但绑死在 schedule view**：现有端点要求 `selected_date`（用户当前在看哪一天），便利贴场景没有"当前选中日期"——必须新开一个无选中日期的解析端点（或扩展现有端点）。底层 `parse_natural_language_task` 函数本身可复用。
3. **任务创建 UI 的"复用"路径已经现成**：`TaskDrawerWithComments` 支持 `variant: "create"`，由 props 注入预填字段（title/body/start_at/end_at/priority/location/assignee/participants/workspace/project），提交还是走原 `POST /workspaces/{wid}/projects/{pid}/items`。这意味着 AI → 任务的转换**不需要在便利贴侧自己实现一个创建表单**，只要把 AI draft 转成 drawer 的 initial 即可。
4. **AI 解析里的 `workspace_name` / `project_name` 是字符串不是 ID**：草稿阶段没绑定到具体 workspace，转换前要二次解析成 ID（用 `fetchMyWorkspaces` / `fetchMyProjects` 在前端 match），匹配失败需要用户手动选。
5. **活动日志设计要决策**：`ActivityLog.workspace_id` 是非空，便利贴不属于任何 workspace。要么 `workspace_id` 改成 nullable + 新增 `entity_scope`（`workspace` / `personal`），要么便利贴的活动**不写日志**（行为更轻）。我倾向后者：便利贴是个人速记，写活动日志没有跨用户可观测价值。
6. **附件扩展性的关键决策**：便利贴输入"文本，后续会扩展添加附件包括图片、音频、视频等"——第一天就把 `sticky_note_attachments` 表做出来，**用多态设计**（`attachment_type: text/image/audio/video` + `content_ref` 指向不同存储），避免后续迁表。

---

## 二、目标与核心约束

### 功能目标
1. **快记**：在任何页面、任何时间，1 次点击 + 1 次提交，沉淀一段文字 + 当时的时间地点。
2. **时序化**：按创建时间倒序展示，UI 上能看到完整的"时间线"。
3. **隐私**：用户 A 的便利贴对用户 B 完全不可见（API 端按 `owner_user_id` 强制隔离）。
4. **AI 转化**：单条便利贴 → 1 个或多个任务草稿；用户确认后调现有任务 API 落库。

### 非目标（v1 不做）
- 便利贴共享、协作（v1 个人）
- 富文本编辑（v1 纯文本 + 附件）
- 便利贴搜索全文索引（v1 仅按时间/地点筛选 + 简单 substring）
- 离线创建（v1 必须联网）

### 核心约束（不可妥协）
1. **便利贴数据所有权 = 用户本人**。任何 API 路径都不能让便利贴带 `workspace_id` / `project_id`。
2. **AI 解析失败不阻塞保存**。AI 是便利贴的"增值功能"，不是输入的前提。
3. **任务创建路径必须复用现有 items API**。不能在便利贴侧自建一个"task-create-but-personal" 旁路。
4. **后端鉴权沿用现有 Bearer AT**。`get_current_user` 已经能正确区分 web/mobile，便利贴接口不引入新鉴权。
5. **iOS 与 web 端便利贴页布局必须一致**：上 = 输入区（标题/内容/附件），下 = 列表区（卡片：标题/内容/时间/地点/附件）。仅承载形式不同（iOS 是页面切换，web 是弹窗）。

---

## 三、数据模型设计

### 3.1 `sticky_notes` 表

```sql
CREATE TABLE sticky_notes (
  id              UUID PRIMARY KEY,
  owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 内容（用户明确要求"输入框包括标题、内容"）
  title           VARCHAR(200),                -- 可选，v1 允许空
  content         TEXT NOT NULL,               -- 必填，对应 UI 里的"内容"多行输入框
  
  -- 时间地点
  recorded_at     TIMESTAMPTZ NOT NULL,        -- 设备记录的真实时间（client 提供）
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),  -- 服务端入库时间
  timezone        VARCHAR(64) NOT NULL,        -- 客户端时区（用于 UI 友好显示）
  
  -- 地点（结构化 + 人类可读）
  location_lat    DOUBLE PRECISION,
  location_lng    DOUBLE PRECISION,
  location_accuracy_m  REAL,                   -- GPS 精度
  location_name   VARCHAR(500),                -- 反向地理编码（高德/Google 后可空）
  location_source VARCHAR(20),                 -- 'gps' / 'ip' / 'manual' / null
  
  -- 设备上下文（轻量，用于审计和后续推荐）
  device_kind     VARCHAR(20),                 -- 'web' / 'ios' / 'android'
  user_agent      VARCHAR(500),
  
  -- 状态
  archived_at     TIMESTAMPTZ,                 -- 软删除
  converted_count INTEGER NOT NULL DEFAULT 0,  -- 已成功转化为任务的次数（v1 通常 0/1）
  
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sticky_notes_owner_recorded
  ON sticky_notes (owner_user_id, recorded_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX idx_sticky_notes_owner_archived
  ON sticky_notes (owner_user_id, archived_at DESC)
  WHERE archived_at IS NULL;
```

#### 字段设计要点
- **`owner_user_id` 非空** + 索引第一列：所有便利贴查询的强制前缀，物理上阻止跨用户读取。
- **`title` 可空 + `content` 必填**：用户明确要求"输入框包括标题、内容"；title 用于卡片列表快速扫描，content 是详细描述。AI 解析时优先用 `content`（信息量大），缺失时用 `title` 兜底。
- **`recorded_at` 分离于 `created_at`**：用户可能离线写了一堆再同步，`recorded_at` 是"真实时间"，`created_at` 是"入库时间"，二者不同对审计/排序都有意义。
- **`location_*` 字段全 nullable**：用户拒绝授权 / 设备无 GPS / web 非 HTTPS 时不阻塞保存。
- **`converted_count`**：v1 单次转化，但留口子给未来"批量转化"或"重新解析"。
- **复合 partial index**：活动数据走 `WHERE archived_at IS NULL` 路径，覆盖最热查询。

### 3.2 `sticky_note_attachments` 表（为附件扩展预留）

```sql
CREATE TABLE sticky_note_attachments (
  id              UUID PRIMARY KEY,
  sticky_note_id  UUID NOT NULL REFERENCES sticky_notes(id) ON DELETE CASCADE,
  
  attachment_type VARCHAR(20) NOT NULL,        -- 'image' | 'audio' | 'video' | 'file'
  storage_url     VARCHAR(2000) NOT NULL,      -- S3 兼容对象存储 URL（v2 实现）
  mime_type       VARCHAR(100) NOT NULL,
  byte_size       BIGINT NOT NULL,
  
  -- 媒体元数据
  duration_ms     INTEGER,                     -- 音视频时长
  width_px        INTEGER,                     -- 图片/视频宽度
  height_px       INTEGER,                     -- 图片/视频高度
  
  -- 客户端转写（v2 启用）
  transcript      TEXT,                        -- 语音转写结果
  ocr_text        TEXT,                        -- 图片 OCR 结果
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_sticky_note
  ON sticky_note_attachments (sticky_note_id, created_at);
```

**v1 不建存储**，但**建空表 + 模型类**——客户端用 `attachment_type: 'text'` 落库，避免 v2 引入媒体时改 schema。

### 3.3 `sticky_note_ai_parses` 表（AI 解析结果缓存）

```sql
CREATE TABLE sticky_note_ai_parses (
  id                  UUID PRIMARY KEY,
  sticky_note_id      UUID NOT NULL REFERENCES sticky_notes(id) ON DELETE CASCADE,
  
  parse_status        VARCHAR(20) NOT NULL,    -- 'pending' | 'success' | 'failed' | 'skipped'
  parse_provider      VARCHAR(40),             -- 'minimax-M2.7'
  parse_latency_ms    INTEGER,
  
  -- 模型输出（成功时）
  draft_json          JSONB,                   -- NaturalLanguageTaskDraft 完整 JSON
  confidence          REAL,
  assumptions         JSONB,                   -- list[str]
  missing_fields      JSONB,                   -- list[str]
  ambiguities         JSONB,                   -- list[str]
  
  -- 转化结果
  converted_item_id   UUID REFERENCES items(id) ON DELETE SET NULL,
  converted_at        TIMESTAMPTZ,
  
  -- 错误（失败时）
  error_code          VARCHAR(40),
  error_message       TEXT,
  
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_parses_sticky_note
  ON sticky_note_ai_parses (sticky_note_id, created_at DESC);

CREATE UNIQUE INDEX uniq_parses_one_active_per_note
  ON sticky_note_ai_parses (sticky_note_id)
  WHERE parse_status = 'success' AND converted_item_id IS NULL;
```

**设计要点**：
- **同一便利贴同一时间只允许 1 个未转化的 success draft**（`uniq_parses_one_active_per_note`），避免 UI 上"2 个 task draft 同时漂浮"。
- **`converted_item_id` ON DELETE SET NULL**：原始任务被删时，便利贴侧的引用清空（不影响便利贴本身）。
- **保留失败记录**：失败也存一行（含 `error_code`），方便排查"为什么 AI 没解析出来"。

### 3.4 ER 关系图

```
users ─┬─< sticky_notes ─┬─< sticky_note_attachments
       │                  └─< sticky_note_ai_parses ─> items
       └─< items (现有，不变)
```

便利贴侧**完全不触碰 `workspaces` / `projects` / `workspace_members` / `project_members`**——这是隐私边界的物理保证。

---

## 四、后端 API 设计

### 4.1 路由总览

| 方法 | 路径 | 用途 | 鉴权 |
|------|------|------|------|
| `GET` | `/sticky-notes` | 列出当前用户便利贴（分页 + 过滤） | Bearer AT |
| `POST` | `/sticky-notes` | 创建便利贴 | Bearer AT |
| `GET` | `/sticky-notes/{id}` | 便利贴详情（含附件、AI 解析历史） | Bearer AT |
| `PATCH` | `/sticky-notes/{id}` | 更新便利贴（仅 text / location_name 可编辑；其余 append-only） | Bearer AT |
| `DELETE` | `/sticky-notes/{id}` | 软删除（写 `archived_at`） | Bearer AT |
| `POST` | `/sticky-notes/{id}/ai-parse` | 触发 / 重新触发 AI 解析；返回 draft | Bearer AT |
| `POST` | `/sticky-notes/{id}/convert` | 把 AI 草稿转化为正式任务（落到 items 表） | Bearer AT |
| `GET` | `/sticky-notes/{id}/parses` | 看历史解析记录 | Bearer AT |

### 4.2 关键端点契约

#### `POST /sticky-notes`

```jsonc
// Request
{
  "title": "和张三喝咖啡",                         // 可选（v1 允许空字符串 / null）
  "content": "明天下午 3 点在南京东路 100 号",      // 必填
  "recorded_at": "2026-08-05T13:24:00+08:00",     // 可选，不传 = 服务端 now()
  "timezone": "Asia/Shanghai",                     // 必填
  "location": {                                    // 整块可选
    "lat": 31.2304,
    "lng": 121.4737,
    "accuracy_m": 12.5,
    "name": "上海市黄浦区南京东路 100 号",
    "source": "gps"                               // gps/ip/manual
  },
  "attachments": [                                 // v1：附件 metadata 跟便利贴一起 POST（前端本地存文件）
    {
      "attachment_type": "image",
      "filename": "cafe.jpg",
      "mime_type": "image/jpeg",
      "byte_size": 245678,
      "width_px": 1920,
      "height_px": 1080
    }
  ],
  "auto_parse": false                              // v1 默认 false（手动触发，见 6.6）
}

// Response 201
{
  "id": "uuid",
  "title": "和张三喝咖啡",
  "content": "明天下午 3 点在南京东路 100 号",
  "recorded_at": "...",
  "timezone": "Asia/Shanghai",
  "location": { ... },
  "attachments": [
    {
      "id": "uuid",
      "attachment_type": "image",
      "filename": "cafe.jpg",
      "storage_url": "local://{attachment_id}/cafe.jpg",  // v1 占位
      "mime_type": "image/jpeg",
      "byte_size": 245678,
      "width_px": 1920,
      "height_px": 1080
    }
  ],
  "device_kind": "web",
  "created_at": "...",
  "converted_count": 0
}
```

**服务端实现要点**：
- 取 `device_kind` 从 `payload.get("did")`（mobile JWT 存在） → `"ios"`，否则 `"web"`。
- 写库**先 INSERT sticky_notes，再 async-trigger `auto_parse`**——AI 解析失败回 201，UI 后台轮询 / 解析端点。
- `auto_parse=true` 时返回的 `id` 立即可被前端拿去轮询 `GET /sticky-notes/{id}/parses?latest=true`；`latest=true` 返回最新一次解析尝试（包括 `pending`、`success`、`failed`、`skipped`），Web 与 iOS 使用同一轮询语义。
- `attachments` 跟便利贴**同一事务** INSERT；`storage_url` 自动填占位符 `local://{attachment_id}/{filename}`。

#### `POST /sticky-notes/{id}/ai-parse`

复用 `parse_natural_language_task`，**新增**一个无 `selected_date` 的 request schema：

```python
class StickyNoteParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=100)
    reference_time: datetime
    # 注意：无 selected_date，让模型从 text 推断
```

把 `parse_natural_language_task` 重构为接受一个 `selected_date: date | None` 参数 + 一个 system prompt 微调——`selected_date` 为 `None` 时不输出"假设使用当前选中日期"的 assumption。

#### `POST /sticky-notes/{id}/convert`

```jsonc
// Request
{
  "parse_id": "uuid",                    // 用哪个 draft
  "workspace_id": "uuid",                // 必填：解析里的 workspace_name 解析成 id
  "project_id": "uuid",                  // 必填
  "field_overrides": {                   // 用户在 drawer 里手动改的字段
    "title": "...",
    "start_at": "...",
    "priority": "3",
    // ... 任意 ItemCreate 字段
  }
}

// Response 200
{
  "item": { /* ItemOut 完整结构 */ },
  "sticky_note": { /* 更新后的 sticky_note，converted_count+1 */ }
}
```

**服务端实现要点**：
- 把 `parse_id` 对应 draft + `field_overrides` 合并成 `ItemCreate`，调内部 `create_item` 函数（或直接 `db.add`），落到 items 表——**不绕过现有 items API 逻辑**（权限校验、活动日志、completed_at 处理都自动继承）。
- `parse_id` 校验：`owner_user_id` 必须等于当前 user + `parse_status='success'` + `converted_item_id IS NULL`。
- `workspace_id` / `project_id` 校验：用户必须是 `workspace_member` 且 `project_member`（**这里例外，便利贴侧不预校验项目权限**——因为转化时就是要把它放进某项目，由项目侧权限把关）。
- 更新 `sticky_note_ai_parses.converted_item_id` + `converted_at` + `sticky_notes.converted_count`。
- 写 `ActivityLog`（`entity_type='item'` + 项目 workspace_id）——便利贴的"转化"动作以 item 视角记录，跟普通任务创建无差别。

### 4.3 错误码

| code | 含义 | HTTP |
|------|------|------|
| `sticky_note_not_found` | id 不存在或不属于当前用户 | 404 |
| `sticky_note_archived` | 便利贴已归档，不可再编辑/解析/转化 | 410 |
| `parse_already_converted` | 草稿已转化为任务，不可重复转化 | 409 |
| `parse_not_found` | parse_id 不存在或不是当前便利贴 | 404 |
| `ai_unavailable` | MiniMax 不可用 | 503 |
| `ai_invalid_response` | 模型返回无法解析 | 502 |
| `text_too_long` | text > 2000 字符 | 400 |
| `invalid_location` | lat/lng 越界 | 400 |

### 4.4 权限隔离

所有便利贴路由的**第一行**都是：

```python
note = db.get(StickyNote, id)
if not note or note.owner_user_id != user.id:
    raise HTTPException(404, "sticky_note_not_found")
```

不返回 403，统一返回 404——**不告诉攻击者"这个 id 存在但不属于你"**。

---

## 五、AI 解析与任务转化流程

### 5.1 流程图

```
[用户输入文本] 
     │
     ▼
[POST /sticky-notes]──┐
     │                 │ 后台 async
     ▼                 ▼
[DB: sticky_notes]  [POST /sticky-notes/{id}/ai-parse]
     │                 │
     │                 ▼
     │           [MiniMax API]
     │                 │
     │                 ▼
     │           [DB: sticky_note_ai_parses]
     │                 │
     ▼                 ▼
[前端轮询 parses] ◀──┘
     │
     ▼ (草稿就绪)
[打开 TaskDrawer, variant="create", initial=draft]
     │
     ▼ (用户改 workspace/project 或确认)
[POST /sticky-notes/{id}/convert]──▶ [内部 create_item]──▶ [DB: items]
                                              │
                                              ▼
                                       [ActivityLog + emit]
```

### 5.2 "复用任务创建页"的实现

**关键点**：`TaskDrawerWithComments` 已有 `variant: "create"` 模式，初始字段通过 props 注入。我们要做的不是改 drawer，而是在便利贴侧把 AI draft 转成 drawer 的 initial 形态。

```tsx
// web/src/lib/sticky-notes/ai-draft-to-item-initial.ts
import type { NaturalLanguageTaskDraft } from "@/types/api/views/schedule";
import type { TaskDrawerItem } from "@/components/TaskDrawerWithComments";

export function aiDraftToDrawerInitial(
  draft: NaturalLanguageTaskDraft,
  selectedWorkspaceId: string,
  selectedProjectId: string,
  assigneeUserId: string,
): Partial<TaskDrawerItem> & { /* drawer 需要的额外字段 */ } {
  return {
    title: draft.title,
    body: draft.body ?? null,
    status: draft.status,
    priority: draft.priority,
    start_at: draft.start_at,
    end_at: draft.end_at,
    location: draft.location,
    // 详情字段：把 assumptions/missing_fields 拼成 details 给用户看
    details: [
      draft.recurrence_text ? `重复：${draft.recurrence_text}` : null,
      draft.assumptions?.length ? `假设：${draft.assumptions.join("；")}` : null,
    ].filter(Boolean).join("\n\n") || null,
    // workspace_id / project_id 由 selectedWorkspaceId/selectedProjectId 注入
  };
}
```

**Drawer 侧需要的最小改动**：
- `TaskDrawerWithComments` 增加 props：`externalInitial?: Partial<TaskDrawerItem> & { workspace_id?: string; project_id?: string }`。
- 当 `variant === "create"` 且 `externalInitial` 存在时，用其覆盖默认 initial state。
- `onTaskCreated` 回调里增加 `onConvertedFromStickyNote?.(parseId, itemId)`，便利贴侧接住后调 `POST /sticky-notes/{id}/convert` 完成关联。

**Workspace / Project 选择**：
- 解析里 `workspace_name` / `project_name` 字符串由前端在 `fetchMyWorkspaces` / `fetchMyProjects` 里**精确匹配**（先 name 完全一致，再 case-insensitive）。
- 匹配到时，drawer 直接用匹配到的 id，**让用户仍可下拉切换**（v1 不做"自动选择且锁死"——避免模型把便利贴写进错项目）。
- **匹配不到时（2026-08-05 已确认）**：drawer 打开时**预填用户最近活跃的 workspace**（从 `workspace_members.last_active_at desc` 取第一个）+ 该 workspace 下的**第一个 project**。drawer 顶部展示一行 hint：「已为你选了最近的工作空间与项目，可下拉切换」。落库时在 `sticky_note_ai_parses.draft_json.assumptions` 里加 `"auto_fallback_workspace_id": "<uuid>"` 标志，方便 v2 引入"项目选择" UI 时追溯。

### 5.3 异步 vs 同步

**选择异步**。理由：
1. 便利贴创建是"快记"操作，必须 200ms 内 201 返回。AI 调用 2-5s，串起来体验差。
2. 失败重试不需要用户重新输文本。
3. 同一便利贴后续可以重新解析（"换个 prompt 试试"），异步模型天然支持。

**客户端轮询**：
```ts
// 30s 内每 2s 轮询一次
const poll = usePollUntil(
  () => apiFetch(`/sticky-notes/${id}/parses?latest=true`), // 返回最新一次解析尝试
  (parse) => ["success", "failed", "skipped"].includes(parse?.parse_status),
  { interval: 2000, timeout: 30000 }
);
```

**失败兜底**：30s 超时后展示"AI 解析超时，稍后重试"按钮 + 手动重试入口（点 → `POST /sticky-notes/{id}/ai-parse`，幂等，会插入新 parse 行覆盖旧 success 解析——但保留 converted_item_id 关联的旧解析，避免破坏已完成转化）。

---

## 六、前端 UI 设计

### 6.1 入口位置

#### iOS 端

在 `ScheduleHomeView.bottomControls` 的 `modeButton(.todo, ...)` **右侧新增第三个 mode 按钮**：`modeButton(.stickyNote, symbol: "note.text")`。

- 复用现有 `ContentMode` 枚举，新增 `.stickyNote` case。
- 选中态：主内容区由 `TodoScheduleView` / 日历视图切换为 `StickyNoteView`（见 6.2）。
- 选中后（2026-08-05 调整）：底部 toolbar 的右侧 `+` 按钮**隐藏**，自然语言输入框**隐藏**；**新增一个语音按钮 `VoiceInputButton`**（详见第十二节）替代它们的位置。保留 mode toggle 区域可见。
- iOS 端**没有"独立便利贴路由"**，便利贴就是 ScheduleHomeView 的一个 mode。

#### Web 端

在 `AppShell` 内、SideNav 之外的**右下角固定位置**渲染一个 `FloatingDraggableButton`：

- icon: `sticky_note_2`
- 位置：距底 24px、距右 24px（用 `FloatingDraggableButton` 默认值）
- 始终可见：登录后所有 `(app)` 路由下都显示（不影响登录/注册页）
- 点击 → 打开 `StickyNoteModal`（见 6.3）
- 浮动按钮**不**放在 SideNav 里（侧栏纵向空间有限，且浮动在右下角更符合"随时速记"的心智）

#### 不做
- ❌ TopBar `+` 菜单入口（便利贴入口是发现成本最低的浮动按钮，加菜单反而绕路）
- ❌ 右键弹出 / 全局快捷键（避免误触 + 快捷键容易和系统冲突）
- ❌ web 端独立 `/sticky-notes` 页面（弹窗就够，强制占满屏幕会打断上下文）

### 6.2 iOS 端便利贴视图（`StickyNoteView`）

布局：**上下两区**（VStack，各占主内容区的 50%，输入区可压缩到 40%，列表区占 60%）。

```
┌────────────────────────────────────┐
│  Header（同 ScheduleHomeView）       │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ 上：输入区（StickyNoteInputView）│ │
│ │  ┌──────────────────────────┐  │ │
│ │  │ 标题（可选）               │  │ │
│ │  └──────────────────────────┘  │ │
│ │  ┌──────────────────────────┐  │ │
│ │  │ 内容（必填，多行）         │  │ │
│ │  │                           │  │ │
│ │  └──────────────────────────┘  │ │
│ │  📎 附件 (3)  [+]              │ │  ← 上传按钮 + 已传附件横向 chip
│ │  📍 上海市黄浦区...    🔄       │ │  ← 当前位置 chip（可点击重定位）
│ │  [保存]  [AI 解析]             │ │  ← 保存触发创建 + 后台解析
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ 下：列表区（StickyNoteListView）│ │
│ │ ┌────────────────────────────┐ │ │
│ │ │ 标题：和张三喝咖啡           │ │ │  ← 卡片 1
│ │ │ 内容：明天下午 3 点 ...      │ │ │
│ │ │ 🕐 08-05 13:24  📍 上海      │ │ │
│ │ │ 📎 咖啡馆地图.jpg 菜单.pdf   │ │ │  ← 附件名称，点击下载
│ │ │ [未解析] [解析] [→ 任务] [×] │ │ │
│ │ └────────────────────────────┘ │ │
│ │ ┌────────────────────────────┐ │ │
│ │ │ ...                         │ │ │
│ │ └────────────────────────────┘ │ │
│ │  ... (无限滚动)                │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│  bottomControls（mode toggle）       │
└────────────────────────────────────┘
```

#### `StickyNoteInputView` 关键实现

```swift
struct StickyNoteInputView: View {
    @Binding var title: String
    @Binding var body: String
    @Binding var attachments: [PendingAttachment]
    @Binding var location: LocationData?
    let onSubmit: (Bool /* autoParse */) -> Void
    let isSaving: Bool

    var body: some View {
        VStack(spacing: 12) {
            TextField("标题（可选）", text: $title)
            TextField("内容", text: $body, axis: .vertical)
                .lineLimit(3...8)

            // 附件行
            HStack {
                Button { /* 调 PHPicker / UIDocumentPicker */ } label: {
                    Label("附件 (\(attachments.count))", systemImage: "paperclip")
                }
                if !attachments.isEmpty {
                    ScrollView(.horizontal) {
                        HStack {
                            ForEach(attachments) { a in
                                AttachmentChip(attachment: a, onRemove: { ... })
                            }
                        }
                    }
                }
            }

            // 位置行
            LocationChip(location: $location)  // 内部封装 CoreLocation

            HStack {
                Toggle("AI 自动解析", isOn: $autoParse)
                Spacer()
                Button("保存", action: { onSubmit(autoParse) })
                    .disabled(body.isEmpty || isSaving)
            }
        }
    }
}
```

#### `StickyNoteListView` 关键实现

```swift
struct StickyNoteListView: View {
    let notes: [StickyNote]
    let parseStatusByNoteId: [UUID: ParseStatus]
    let onTapConvert: (StickyNote, StickyNoteParse) -> Void
    let onArchive: (StickyNote) -> Void

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(notes) { note in
                    StickyNoteCard(
                        note: note,
                        parseStatus: parseStatusByNoteId[note.id],
                        onConvert: { parse in onTapConvert(note, parse) },
                        onArchive: { onArchive(note) }
                    )
                }
            }
            .padding(.horizontal, 16)
        }
    }
}
```

#### 卡片（`StickyNoteCard`）布局

- **第一行**：标题（粗体） + 状态 chip（右上角）
- **第二行**：内容（前 200 字符，多行截断）
- **第三行**：时间 + 地点（icon + 文本，单行省略）
- **第四行**：附件列表（每条：`📎 文件名.ext` + 点击触发下载）
- **第五行**：操作按钮
  - 未解析：`[AI 解析]`
  - 解析成功未转化：`[预览任务] [转化]`
  - 已转化：`[查看任务] [×]`
  - 解析失败：`[重试]`

**附件展示**：
- v1 仅显示文件名 + 点击下载（点击 → `URLSession.download` 到 `~/Documents/Timia/sticky-notes/{id}/`）
- v1 不做缩略图（图片/视频缩略图要等对象存储接入，v2 一起做）
- 附件的 `storage_url` 在 v1 用本地相对路径（`/sticky-notes/{id}/attachments/{attachment_id}/filename`）—— 见 6.5

#### 数据加载

```swift
@State private var notes: [StickyNote] = []
@State private var parseStatus: [UUID: ParseStatus] = [:]
@State private var nextCursor: String?

// 进入 stickyNote mode 时加载第一页
.task(id: contentMode) {
    if contentMode == .stickyNote {
        await loadNotes()
    }
}

// 保存新便利贴后：插到列表头（乐观更新）
// AI 解析完成：通过轮询 /parses 端点更新对应 note 的状态 chip
```

### 6.3 Web 端便利贴弹窗（`StickyNoteModal`）

**弹窗形态**：右下角弹出（非全屏 modal，非中心 modal）—— 位置和浮动按钮同侧，作为"浮动按钮的展开态"。

```
                                    ┌────────────────────────────┐
                                    │ 便利贴          [最小化] [×] │ ← 标题栏
                                    ├────────────────────────────┤
                                    │ ┌────────────────────────┐ │
                                    │ │ 上：输入区               │ │
                                    │ │ [标题]                  │ │
                                    │ │ [内容 多行]             │ │
                                    │ │ 📎 附件 (0) [上传]      │ │
                                    │ │ 📍 获取位置   🕐 Asia... │ │
                                    │ │ ☐ 保存后 AI 解析  [保存] │ │
                                    │ └────────────────────────┘ │
                                    │ ┌────────────────────────┐ │
                                    │ │ 下：列表                 │ │
                                    │ │ ┌────────────────────┐ │ │
                                    │ │ │ 卡片 ...            │ │ │
                                    │ │ └────────────────────┘ │ │
                                    │ │ ...                     │ │
                                    │ └────────────────────────┘ │
                                    └────────────────────────────┘
                                                       ↑
                                            浮动按钮收起时弹窗从同位置展开
```

**关键决策**：
- **弹窗而非新页面**：便利贴是"上下文不打断"的速记行为，新页面会让用户丢失当前工作上下文
- **弹窗尺寸**：宽 480px、高 640px，移动端响应式（窄屏改全屏 sheet）
- **滚动**：输入区不滚动（高度自适应），列表区独立滚动
- **快捷键**：
  - `Cmd/Ctrl + Enter`：保存
  - `Esc`：关闭（用 `useEscapeDismiss`）
  - `Cmd/Ctrl + K`：弹窗已关时打开 / 已开时聚焦到内容输入框
- **拖动**：弹窗标题栏可拖动（用户能挪到不挡内容的位置），复用 `FloatingDraggableButton` 的拖动逻辑（可抽 `useDraggable` hook）

#### StickyNoteModal 关键实现

```tsx
// web/src/components/sticky-notes/StickyNoteModal.tsx
export function StickyNoteModal({ open, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [autoParse, setAutoParse] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  return (
    <DraggablePanel open={open} anchor="bottom-right" size="md" onClose={onClose}>
      <header>便利贴</header>
      <div className="grid grid-rows-[auto_1fr] gap-2 h-full">
        <StickyNoteInputForm {...formProps} />
        <StickyNoteListPane onConvert={...} onArchive={...} />
      </div>
    </DraggablePanel>
  );
}
```

**输入区**（`<StickyNoteInputForm />`）：
- 字段：标题（可选，1 行）/ 内容（必填，1-8 行）/ 附件上传按钮 / 附件 chip 横向列表 / 位置 chip / AI 解析开关 / 保存按钮
- 上传按钮：`<input type="file" multiple>` 触发本地选择；v1 文件不入对象存储，先存 IndexedDB（`idb-keyval`），后端只收元数据
- 保存按钮 disabled 条件：`body.trim() === "" || isSaving`

**列表区**（`<StickyNoteListPane />`）：
- 用 `useInfiniteQuery` 拉分页（cursor 模式）
- 卡片结构与 iOS 一致（标题/内容/时间/地点/附件/操作）

**入口挂载**：
```tsx
// codes/web/src/components/layout/AppShell.tsx
export function AppShell({ children }: Props) {
  const [stickyNoteOpen, setStickyNoteOpen] = useState(false);
  return (
    <div className="...">
      <SideNav />
      {children}
      <FloatingDraggableButton
        onClick={() => setStickyNoteOpen(true)}
        ariaLabel="打开便利贴"
      >
        <NoteIcon />
      </FloatingDraggableButton>
      <StickyNoteModal
        open={stickyNoteOpen}
        onClose={() => setStickyNoteOpen(false)}
      />
    </div>
  );
}
```

### 6.4 附件上传与展示

#### v1 存储策略（无对象存储）

v1 **不接 S3 / OSS**。附件走**前端临时存储 + 后端 metadata 落库**：

| 角色 | 存储位置 | 用途 |
|------|---------|------|
| iOS 端 | `~/Documents/Timia/sticky-notes/{noteId}/` 本地文件系统 | 用户原文件保留，下载/预览用 |
| Web 端 | IndexedDB（`idb-keyval`，key = `attachment:{noteId}:{attachmentId}`） | 浏览器内持久化，跨刷新保留 |
| 后端 | 仅存 metadata（filename, mime_type, byte_size, duration_ms, etc.），`storage_url` 字段用占位符 `local://{attachment_id}/{filename}` | 不做文件同步，跨设备读取 v1 不支持 |

**为什么不接对象存储**：v1 范围控制，先验证功能闭环；对象存储是**单独的工程**（bucket 选型 / 权限 / presigned URL / CDN），不该和便利贴功能耦合。

**v2 接入对象存储时的迁移**：
1. `storage_url` 字段含义从 `local://` 改为 `https://cdn.timia.online/...`（带签名 URL）
2. 一次性的"上传"脚本：把客户端本地文件批量上传到对象存储，更新 `storage_url`
3. 客户端下载逻辑加 fallback：先尝试 `storage_url`，失败/未授权时回落到本地缓存

#### 附件展示一致性

iOS 和 web 卡片都展示：
- 文件名（截断保留扩展名）
- 文件大小（KB / MB 自动单位）
- 文件类型 icon（image / audio / video / generic，按 mime 前缀判断）
- **点击**：触发下载/预览
  - iOS：`UIDocumentInteractionController`（图片直接预览，其他文件"存储到文件"）
  - web：`<a download>` 触发，文件从 IndexedDB 读 `Blob` 后用 `URL.createObjectURL`

#### 附件上限

- 单便利贴 ≤ 9 个附件（iOS 一次选 9 张图的上限）
- 单附件 ≤ 50 MB（防 IndexedDB / 本地磁盘爆炸）
- 后端在 `POST /sticky-notes/{id}/attachments` 时校验（**v1 附件暂不走单独 API**，见 6.5）

### 6.5 API 端点的 v1 简化

v1 阶段，**附件 metadata 跟便利贴一起 POST，不开独立 attachment API**：

```jsonc
// POST /sticky-notes（v1 扩展）
{
  "content": "和咖啡馆店员聊了下菜单",  // 多行内容
  "title": "咖啡馆菜单",              // 短标题
  "recorded_at": "...",
  "timezone": "...",
  "location": { ... },
  "auto_parse": true,
  "attachments": [                    // 新增（v1 仅前端本地存储，metadata 上报）
    {
      "attachment_type": "image",
      "filename": "menu.jpg",
      "mime_type": "image/jpeg",
      "byte_size": 245678,
      "width_px": 1920,
      "height_px": 1080
    }
  ]
}
```

**为什么不开独立 attachment API**：
- 便利贴和附件原子性强（一起保存），分开反而要做事务
- v1 没有真存储，attachment 端点没价值
- 客户端失败重试友好：保存失败重试时附件 metadata 还在前端本地，丢不了

**v2 拆分的触发条件**：对象存储接入时，`storage_url` 字段从占位符变成真实 URL，那时候 attachment 才需要"先上传拿 URL，再关联到 note"的两步流程。

### 6.6 AI 解析与草稿预览

#### 触发时机

v1 **不默认 auto_parse**。理由：
- 输入区持久在顶部，自动解析会触发频率太高，浪费 MiniMax 配额
- 用户可能连续输入多条"非任务"碎片（灵感、日记），触发 AI 反而打扰
- AI 解析作为**显式动作**：用户保存后，**卡片上点"AI 解析"按钮**触发

v1.1 之后再根据使用数据决定是否默认开启。

#### 草稿预览

- AI 解析成功后，卡片右上角 chip 变 `已生成草稿`，点 chip → **在卡片内部**展开预览（不再开新 modal）：
  ```
  ┌──────────────────────────────┐
  │ 标题：和咖啡馆店员聊菜单     │
  │ 内容：...                     │
  │ 🕐 ...  📍 ...               │
  │ [已生成草稿] ← 点开           │
  │ ┌──────────────────────────┐ │
  │ │ 任务预览：                 │ │
  │ │  标题：咖啡馆菜单           │ │
  │ │  时间：—                    │ │
  │ │  项目：[工作空间/项目 ▼]    │ │
  │ │  假设：...                  │ │
  │ │ [转化] [重新解析] [关闭]     │ │
  │ └──────────────────────────┘ │
  └──────────────────────────────┘
  ```
- 点 `[转化]` → 复用 TaskDrawer 的 create 模式（见第五节"复用任务创建页"）→ drawer 关闭后回写便利贴 chip 状态为"已转化"

#### 为什么草稿预览嵌入卡片而非 modal

- 便利贴列表里**同屏可能有多张"已生成草稿"卡片**，嵌入展开支持并排比较
- modal 强焦点会打断"扫一眼所有草稿"的心智
- 草稿信息量小（5-7 个字段），卡片内展开不挤

### 6.7 状态机

```
[新建中(输入框有未保存内容)] ── [保存] ──▶ saved
[saved, no parse]  ── [AI 解析] ──▶ parsing
[parsing]  ── (success) ──▶ parsed
[parsing]  ── (failed) ──▶ parse_failed
[parse_failed] ── [重试] ──▶ parsing
[parsed] ── [转化] ──▶ converted
[converted] ── (item 删除) ──▶ parsed (回到草稿态)
[saved | parsed | converted | parse_failed] ── [×] ──▶ archived
[archived] ── [恢复(7 天内)] ──▶ saved
```

**关键点**：
- 状态在**卡片**上展示，不存在独立"状态页"
- `converted` 态保留"查看任务"操作（点 → 跳到该 item 的 `TaskDrawer`）
- 归档是软删除，物理删除由后台 job 跑（`created_at < now() - 30 days AND archived_at IS NOT NULL`）


---

## 七、地点获取方案

### 7.1 Web 端

```ts
async function getCurrentLocation(): Promise<LocationData | null> {
  if (!("geolocation" in navigator)) return null;
  // 1. 先看 localStorage 里的"用户偏好"：denied / prompt / always
  // 2. 默认 'prompt'：第一次请求时浏览器自动弹
  // 3. 用户拒绝过 → 返回 null，不重弹
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
        source: "gps",
      }),
      () => resolve(null),  // 失败静默
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  });
}
```

**反向地理编码**：v1 不做（只存 lat/lng），UI 上展示 `"📍 (31.23, 121.47)"`。v2 接高德/Google 一次性 batch 反查。

**HTTPS 限制**：`navigator.geolocation` 必须 HTTPS 或 localhost。生产环境 nginx 已经是 HTTPS（`deploy/nginx.conf`），dev 走 localhost 都满足。

### 7.2 iOS 端（v2 阶段）

```swift
import CoreLocation

let manager = CLLocationManager()
manager.requestWhenInUseAuthorization()  // 'When in use' 而非 'Always'
manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
```

POST `/sticky-notes` 时带上 `location` 字段，结构与 web 相同。

### 7.3 隐私

- 便利贴列表页默认**不在卡片上直接展示精确坐标**（只展示 `location_name` 或 `📍 已记录位置`）。
- 卡片"展开"后才显示 lat/lng（带"复制坐标"按钮，方便分享给他人）。

---

## 八、扩展性检查清单

| 维度 | v1 设计 | 未来扩展点 |
|------|---------|-----------|
| 附件 | `sticky_note_attachments` 表已建，v1 不存对象 | v2 接 S3 兼容存储 + presigned URL |
| 分享 | `owner_user_id` 单一 | 加 `shared_with_user_ids UUID[]` + 权限中间件 |
| 全文搜索 | 无 | v2 接 PostgreSQL `tsvector` 列 + GIN 索引 |
| 语音输入 | 无 | iOS `Speech` framework / Web `MediaRecorder` + `sticky_note_attachments.attachment_type='audio'` |
| 批量 AI 解析 | 无 | `POST /sticky-notes/batch-ai-parse`，按 `ids[]` 串行调 |
| 富文本 | 纯 `text` 字段 | 加 `format` 字段 + 解析 markdown |
| 提醒 | 无 | 加 `remind_at` + 后台 scheduler |
| 多设备同步 | 单设备 | `device_id` + `recorded_at` 已有，离线合并方案独立 |

---

## 九、迁移与部署

### 9.1 Alembic 迁移

新增 `0010_add_sticky_notes.py`：
- `op.create_table("sticky_notes", ...)`
- `op.create_index(...)` × 2
- `op.create_table("sticky_note_attachments", ...)`
- `op.create_index(...)` × 1
- `op.create_table("sticky_note_ai_parses", ...)`
- `op.create_index(...)` × 1
- `op.create_index(...)` × 1（unique partial）

### 9.2 部署顺序
1. 跑 Alembic 迁移（不破坏现有数据）
2. 部署新后端（新增路由，**不修改**任何现有路由）
3. 部署新前端（新增页面 / 组件，**不修改** drawer / 任务侧逻辑）
4. nginx 不需要改（API 走 `/core-service/`，新路由在同一个前缀下）

### 9.3 配置
- **MiniMax 配置已就绪**（`minimax_api_key` / `minimax_model` / `minimax_base_url`），无需新增环境变量。
- 便利贴侧 AI 解析共用 `parse_natural_language_task`，流量在原有 MiniMax 配额内消化。

### 9.4 监控
- 新增 metric：便利贴创建速率、AI 解析成功率、AI 解析 P50/P95 latency、转化率（parse → convert）。
- 现有 `ActivityLog` 看板不变（便利贴活动不写日志，无噪音）。

---

## 十、风险与决策记录

| 决策 | 备选 | 选择理由 |
|------|------|---------|
| 便利贴独立表 vs 复用 items | 复用（加 `workspace_id` nullable） | 个人数据与项目数据混表会污染模型；隐私边界物理隔离 |
| 解析异步 vs 同步 | 同步 | 便利贴是"快记"；AI 失败不应阻塞保存 |
| 活动日志是否记录便利贴 | 记录 / 不记录 | 不记录（个人速记无跨用户价值；且 `workspace_id` 非空约束要改） |
| 转化路径走 drawer vs 直接 API | 两者 | drawer 路径（用户最终能在熟悉 UI 里微调） |
| 附件表 v1 建空 vs 等 v2 | v2 | schema 兼容 + 避免未来 7 天迁表 |
| 一次便利贴是否可生成多任务 | 否 | v1 单任务（草稿 1:1）；schema 用 `converted_count` 留口子 |
| 地点反查 v1 | v1 不做 | 第三方 API 配额 / 隐私合规待评估；lat/lng 已足够应用层用 |
| 离线创建 | v1 不做 | PWA 同步逻辑复杂度高，等 v2 看用户量 |
| 草稿匹配不到 workspace | 静默失败 | 强制用户在 drawer 里选（避免模型把便利贴写错地方） |
| **iOS 入口：mode toggle vs 独立 tab** | 独立 tab / 浮窗 / mode toggle | mode toggle（在 todo 按钮旁）。现有底部 toolbar 只有两个 mode，加一个变 3 个仍可接受；独立 tab 改动太大，浮窗在 iOS 上是反模式 |
| **web 入口：浮动按钮 vs 独立页面 vs 弹窗** | 浮动按钮 + 弹窗（采用）/ 独立页面 / 中心 modal | 浮动按钮 + 弹窗。便利贴是"上下文不打断"的速记，独立页面会丢失上下文；中心 modal 占满屏幕过大 |
| **便利贴布局：上输入下列表 vs 列表内联输入** | 上输入下列表（采用）/ 列表内联输入 / 独立两个页 | 上输入下列表。要求输入区持久可见（连续速记），列表区独立滚动；iOS 一个页面就能承载 |
| **附件存储 v1：本地 vs 对象存储** | 客户端本地 + 后端 metadata（采用）/ 接入 S3-兼容存储 | v1 范围控制；对象存储是独立工程，不该耦合进便利贴功能 |
| **附件上传 v1：独立 attachment API vs 跟便利贴一起 POST** | 跟便利贴一起 POST（采用）/ 独立 API | 便利贴和附件原子性强；v1 没有真存储，独立端点没价值 |
| **AI 解析触发：auto vs 手动按钮** | 手动按钮（采用）/ auto by default | 防止连续输入非任务文本时浪费 MiniMax 配额；用户主动触发更可控 |
| **草稿预览：嵌入卡片 vs 独立 modal** | 嵌入卡片（采用）/ 独立 modal | 列表里可能多张"已生成草稿"，嵌入展开支持并排比较；modal 强焦点打断"扫一眼"心智 |
| **标题字段** | 有（采用）/ 无 | 用户明确要求"输入框包括标题、内容"，加 title 字段 |
| **AI 解析匹配 workspace/project 失败时** | 自动用最近活跃 workspace（采用，2026-08-05 确认）/ 强制用户在 drawer 里选 | 用户已确认自动 fallback；metadata 记录 `auto_fallback_workspace_id` 标志方便追溯 |
| **iOS 语音转文字 v1：本地 vs 云端** | 强制本地（采用，2026-08-05 确认）/ 本地优先 + 云端 fallback | 用户明确要求"app 端本地的语音转换文字能力" |
| **语音识别最低 iOS 版本** | iOS 17（采用）/ iOS 13 | 2026 年 iOS 17+ 覆盖率 99%+；on-device 在 iOS 13+ 都支持但 iOS 17 生态最稳定 |
| **语音支持语言** | 仅中文（采用）/ 多语言 | v1 用户场景是中文；多语言留 v2 |
| **录音时长** | 上限 60s（采用）/ 无上限 | 防止长时间占用 + Speech framework 长 session 不稳定 |
| **音频文件存不存** | 不存（采用）/ 存本地 | v1 流式识别即用即弃；v2 接对象存储时一起做 |

### 待用户确认
1. **便利贴的"workspace 归属"**——已确认（2026-08-05）：**失败时自动用最近活跃 workspace**。实现：从 `workspace_members.last_active_at desc` 取最近一个，AI 解析匹配失败时直接用。落库时在便利贴 metadata 里记 `auto_fallback_workspace_id=true` 标志（写到 `sticky_note_ai_parses` 的 `draft_json.assumptions` 里），方便 v2 引入"项目选择" UI 时追溯。
2. **批量 AI 解析**——已确认（2026-08-05）：**v1 不做**。
3. **iOS mode 切换交互**——已确认（2026-08-05）：**便利贴模式下隐藏 `+` 按钮和自然语言输入框，改为新增一个语音按钮**。语音按钮支持按住说话 → 本地识别成文字 → 填入便利贴 `content` 字段。详见第十二节"语音转文字便利贴"。

### 语音功能决策（基于用户 2026-08-05 反馈）
- **v1 强制本地**：`SFSpeechRecognizer.requiresOnDeviceRecognition = true`，**不 fallback 到云端**。用户明确要求"app 端本地的语音转换文字能力"。
- **最低 iOS 版本**：iOS 17（A9+ 芯片 + iOS 13+ 即支持 on-device，覆盖 2026 年几乎全部在用 iOS 设备）
- **v1 仅支持中文**（用户场景；后续可扩展 `Locale.preferredLanguages.first`）
- **录音时长上限 60s**：超过自动停止；防长时间占用麦克风 + Speech framework 长 session 不稳定
- **不存音频文件**：v1 走流式识别（`SFSpeechAudioBufferRecognitionRequest`），识别完即丢弃音频 buffer
- **离线语音包缺失时的处理**：检测 `SFSpeechRecognizer(locale: "zh-CN").supportsOnDeviceRecognition == false` → 弹窗引导用户到"设置 → 通用 → 键盘 → 听写语言"下载

---

## 十一、相关文件路径速查

### iOS 端（新增）
- `codes/mobile/ios/Timia/Features/StickyNotes/StickyNoteView.swift` — iOS 便利贴主视图（VStack：输入 + 列表）
- `codes/mobile/ios/Timia/Features/StickyNotes/StickyNoteInputView.swift` — 上半区输入表单
- `codes/mobile/ios/Timia/Features/StickyNotes/StickyNoteListView.swift` — 下半区卡片列表
- `codes/mobile/ios/Timia/Features/StickyNotes/StickyNoteCard.swift` — 单条便利贴卡片（含状态 chip + 操作按钮 + 草稿预览展开）
- `codes/mobile/ios/Timia/Features/StickyNotes/StickyNoteDraftPreview.swift` — 卡片内 AI 草稿预览
- `codes/mobile/ios/Timia/Features/StickyNotes/AttachmentChip.swift` — 附件 chip 组件
- `codes/mobile/ios/Timia/Features/StickyNotes/LocationChip.swift` — 位置 chip 组件
- `codes/mobile/ios/Timia/Features/StickyNotes/VoiceInputButton.swift` — 语音按钮（长按手势 + 弹层）
- `codes/mobile/ios/Timia/Features/StickyNotes/RecordingOverlay.swift` — 录音中弹层
- `codes/mobile/ios/Timia/Core/API/StickyNotesAPI.swift` — 便利贴 API 客户端
- `codes/mobile/ios/Timia/Core/Storage/StickyNoteLocalStore.swift` — 附件本地文件管理（`~/Documents/Timia/sticky-notes/{noteId}/`）
- `codes/mobile/ios/Timia/Core/Speech/StickyNoteSpeechRecognizer.swift` — Speech framework 包装（强制 on-device）
- `codes/mobile/ios/Timia/Core/Speech/SpeechPermissionManager.swift` — 权限管理
- `codes/mobile/ios/Timia/Core/Speech/OnDeviceSupportChecker.swift` — 离线包检测 + 设置跳转
- `codes/mobile/ios/Timia/Resources/Info.plist` — 增加 `NSSpeechRecognitionUsageDescription` + `NSMicrophoneUsageDescription`

### iOS 端（修改）
- `codes/mobile/ios/Timia/Features/Schedule/ScheduleHomeView.swift`
  - `ContentMode` 枚举新增 `.stickyNote` case（行 32-35）
  - `bottomControls` 新增 `modeButton(.stickyNote, symbol: "note.text")`（行 366-449）
  - `body` 内 `Group` 新增 `contentMode == .stickyNote` 分支（行 87-113）
  - 进入 stickyNote 模式时：隐藏 `+` 按钮和自然语言输入框，**渲染 `VoiceInputButton`**（行 390-449，2026-08-05 调整）
  - 退出 stickyNote 模式时：停止 `audioEngine` + 清理 `recognitionTask`（防止后台录音）
- `codes/mobile/ios/Timia/Core/API/APIModels.swift` — 新增 `StickyNote` / `StickyNoteAttachment` / `StickyNoteParse` / `NaturalLanguageTaskDraft` Swift models

### Web 端（新增）
- `codes/web/src/components/sticky-notes/StickyNoteModal.tsx` — 弹窗主组件（浮动按钮的展开态）
- `codes/web/src/components/sticky-notes/StickyNoteInputForm.tsx` — 输入表单
- `codes/web/src/components/sticky-notes/StickyNoteListPane.tsx` — 列表区
- `codes/web/src/components/sticky-notes/StickyNoteCard.tsx` — 卡片
- `codes/web/src/components/sticky-notes/StickyNoteDraftPreview.tsx` — 卡片内 AI 草稿预览
- `codes/web/src/components/sticky-notes/AttachmentChip.tsx` — 附件 chip
- `codes/web/src/components/sticky-notes/LocationChip.tsx` — 位置 chip
- `codes/web/src/components/sticky-notes/DraggablePanel.tsx` — 弹窗拖动容器（抽出 useDraggable hook）
- `codes/web/src/hooks/useStickyNotePolling.ts` — 解析状态轮询
- `codes/web/src/hooks/useDraggable.ts` — 通用拖动 hook（给 FloatingDraggableButton + DraggablePanel 共用）
- `codes/web/src/lib/api/sticky-notes.ts` — API 封装
- `codes/web/src/lib/sticky-notes/ai-draft-to-item-initial.ts` — AI draft → TaskDrawer initial 转换
- `codes/web/src/lib/sticky-notes/attachment-store.ts` — IndexedDB 附件存储（`idb-keyval`）
- `codes/web/src/lib/sticky-notes/geolocation.ts` — `navigator.geolocation` 封装

### Web 端（修改）
- `codes/web/src/components/layout/AppShell.tsx` — 挂载 `FloatingDraggableButton` + `StickyNoteModal`
- `codes/web/src/components/TaskDrawerWithComments.tsx` — 增加 `externalInitial` prop + `onConvertedFromStickyNote` 回调

### 后端（新增）
- `codes/core-service/app/models/sticky_note.py` — 三个模型
- `codes/core-service/app/schemas/sticky_note.py` — 请求 / 响应
- `codes/core-service/app/routes/sticky_notes.py` — 8 个端点
- `codes/core-service/app/services/sticky_note_api.py` — 业务逻辑（创建、解析触发、convert）
- `codes/core-service/app/services/sticky_note_ai.py` — 复用 + 扩展 `natural_language_schedule`
- `codes/core-service/app/migrations/versions/0010_add_sticky_notes.py`

### 后端（修改）
- `codes/core-service/app/main.py` — 注册新 router
- `codes/core-service/app/services/natural_language_schedule.py` — `parse_natural_language_task` 接受 `selected_date: date | None`
- `codes/core-service/app/schemas/item.py` — 给 `ItemCreate` 增加 `text` 字段以外的便利贴专用变体（如果 convert 路径不复用 `ItemCreate`）

### 跨端共享决策
- **iOS / web 卡片结构必须完全一致**（标题/内容/时间/地点/附件/操作），防止用户跨设备体验割裂
- **iOS 附件 = 本地文件系统，web 附件 = IndexedDB**：v1 不做跨设备同步；同步是 v2 对象存储的副产品
- **API 协议双方对齐**：iOS `StickyNote` Swift model 和 web `StickyNote` TS type 都从后端 OpenAPI codegen 出来（**沿用 `make codegen`** 流程）

---

## 十二、语音转文字便利贴（iOS 专属子功能）

### 12.1 目标

iOS 端便利贴模式新增**语音按钮**，按住说话 → **本地识别**成中文 → 文字填入便利贴 `content` 字段。**不依赖任何服务器 / 云端**——纯 `SFSpeechRecognizer` on-device 模式。

**不做什么**：
- ❌ 不做云端 fallback（用户明确要求"本地"）
- ❌ 不做声波动画（v1 简化）
- ❌ 不存音频文件（v1 流式识别即用即弃）
- ❌ 不支持多语言（v1 仅中文）
- ❌ web 端暂不做（`Web Speech API` 强制走云端 Google 服务，不满足"本地"要求）

### 12.2 入口与交互

**位置**：`ScheduleHomeView.bottomControls` 内部。便利贴模式下：
- 移走 `+` 按钮和自然语言输入框
- 替换为**单个语音按钮 `VoiceInputButton`**

**交互流程**（按下 → 说话 → 松开 → 自动填字）：

```
┌────────────────────────────────────────┐
│  bottomControls（stickyNote 模式）       │
│ ┌─────────┐                            │
│ │ [todo]  │                            │
│ │ [日历]  │                            │
│ │ [便利贴✓]│ ← 当前 mode                │
│ └─────────┘                            │
│                              ┌──────┐  │
│                              │ 🎤   │  │ ← VoiceInputButton
│                              │ 说话 │  │
│                              └──────┘  │
└────────────────────────────────────────┘

按住 🎤 后：
┌────────────────────────────────────────┐
│              ┌──────────────┐           │
│              │   🎤 收听中…  │           │
│              │              │           │
│              │ "和咖啡馆店员"│ ← 实时显示│
│              │  聊了下菜单…" │           │
│              │              │           │
│              │ 松开结束 / 上滑取消│       │
│              └──────────────┘           │
└────────────────────────────────────────┘

松手后：
- 文字填入便利贴 content 输入框
- 弹层消失
- 麦克风释放
```

**详细手势**：
- **按下**：`UILongPressGestureRecognizer`（minimumPressDuration 0.1s）触发开始录音
- **说话中**：实时回调识别结果，弹层显示累积文字
- **松开（普通位置）**：停止录音，识别走 `recognitionTask.finish()`，文字填入 content
- **上滑取消**（`translation.y < -60`）：停止录音并丢弃识别结果，content 不变
- **超时 60s**：自动停止，防止长 session
- **权限拒绝 / 不支持**：按钮直接置灰，下方展示一行 hint（"需要麦克风权限" / "请在设置中开启听写"）

### 12.3 权限与离线语音包

#### Info.plist 必须配置

```xml
<key>NSSpeechRecognitionUsageDescription</key>
<string>Timia 用本地语音识别把您说的话转成便利贴文字，识别在设备上完成，不会上传到任何服务器。</string>

<key>NSMicrophoneUsageDescription</key>
<string>Timia 需要使用麦克风录制您说的便利贴内容。</string>
```

#### 权限检查时序

```swift
// 进入便利贴模式时（懒检查，不阻塞 UI）
func enterStickyNoteMode() {
    SpeechPermissionManager.shared.refreshStatus { status in
        // 仅记录状态，不弹窗。第一次按 🎤 时才弹
    }
}

// 用户按 🎤 时（触发检查）
func handleVoiceButtonPress() {
    Task {
        let status = await SpeechPermissionManager.shared.requestIfNeeded()
        switch status {
        case .authorized:
            startRecording()
        case .denied:
            showAlert("请在「设置 → Timia → 麦克风 / 语音识别」中开启权限")
        case .restricted:
            showAlert("设备已限制语音识别")
        case .notDetermined:
            // 第一次进入时系统弹窗
            break
        }
    }
}
```

#### 离线语音包缺失

```swift
let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
if recognizer?.supportsOnDeviceRecognition == false {
    // 引导用户去下载离线包
    showAlert(
        title: "需要下载中文离线语音包",
        message: "在「设置 → 通用 → 键盘 → 听写语言」中下载「中文（中国）」，\n下载后即可离线使用语音转文字功能。",
        primaryAction: "去设置"
    ) { openSettings() }
}
```

**为什么强制走 on-device**：用户明确要求"app 端本地的语音转换文字能力"。iOS 的云端识别（`requiresOnDeviceRecognition = false`）会发送音频到 Apple 服务器，违背本地原则。

### 12.4 核心实现

#### 12.4.1 录音与识别

```swift
final class StickyNoteSpeechRecognizer {
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    var onPartialResult: ((String) -> Void)?
    var onFinalResult: ((String) -> Void)?
    var onError: ((Error) -> Void)?

    func start(locale: Locale = Locale(identifier: "zh-CN")) throws {
        // 1. 取消旧任务
        recognitionTask?.cancel()
        recognitionTask = nil

        // 2. 配置音频会话
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        // 3. 创建识别请求（强制本地）
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true  // ← 关键：强制本地
        if #available(iOS 16, *) {
            request.addsPunctuation = true  // iOS 16+ 自动加标点
        }
        recognitionRequest = request

        // 4. 安装音频 tap
        let inputNode = audioEngine.inputNode
        inputNode.removeTap(onBus: 0)
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        // 5. 创建识别任务
        guard let recognizer = SFSpeechRecognizer(locale: locale),
              recognizer.supportsOnDeviceRecognition else {
            throw SpeechError.onDeviceNotSupported
        }
        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            if let result = result {
                self?.onPartialResult?(result.bestTranscription.formattedString)
            }
            if let error = error {
                self?.onError?(error)
                self?.cleanup()
            } else if result?.isFinal == true {
                self?.onFinalResult?(result!.bestTranscription.formattedString)
                self?.cleanup()
            }
        }
    }

    func stop() {
        recognitionRequest?.endAudio()  // 触发 isFinal 回调
        audioEngine.stop()
        cleanup()
    }

    func cancel() {
        recognitionTask?.cancel()
        recognitionRequest = nil
        cleanup()
    }

    private func cleanup() {
        audioEngine.inputNode.removeTap(onBus: 0)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        recognitionRequest = nil
        recognitionTask = nil
    }
}
```

#### 12.4.2 按钮 + 手势

```swift
struct VoiceInputButton: View {
    @Binding var content: String
    @State private var isRecording = false
    @State private var partialText = ""
    @State private var showCancelHint = false
    @State private var permissionStatus: SpeechPermissionStatus = .unknown
    private let recognizer = StickyNoteSpeechRecognizer()
    private let maxDurationSeconds: TimeInterval = 60

    var body: some View {
        Button(action: {}) {
            // 手势用 LongPressGestureRecognizer 不用 Button action
            Image(systemName: isRecording ? "mic.fill" : "mic")
                .font(.title3)
                .frame(width: 56, height: 44)
                .background(isRecording ? Color.red : TimiaTheme.primary, in: Circle())
                .foregroundStyle(.white)
        }
        .buttonStyle(.plain)
        .simultaneousGesture(longPressGesture)
        .overlay(alignment: .top) {
            if isRecording {
                RecordingOverlay(
                    partialText: partialText,
                    showCancelHint: showCancelHint,
                    onCancel: { recognizer.cancel(); isRecording = false }
                )
            }
        }
    }

    private var longPressGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.1)
            .onChanged { _ in handleStart() }
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onEnded { _ in handleEnd() }
    }
    // ... 详细实现见代码仓库
}
```

#### 12.4.3 文字填入策略

松手拿到最终文字后，**追加到 content 输入框**（不是替换）：

```swift
private func appendToContent(_ text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }

    if content.isEmpty {
        content = trimmed
    } else {
        // content 末尾若不是换行，先补一个空格
        let separator = content.hasSuffix("\n") || content.hasSuffix(" ") ? "" : " "
        content += separator + trimmed
    }
}
```

**为什么追加而不是替换**：
- 便利贴可能有附件 + 标题 + 已输入内容，语音只是补充
- 用户可能多次按语音（"先说第一段，再补充第二段"），符合速记心智
- 替换会让用户丢失之前的内容

### 12.5 错误处理矩阵

| 场景 | 检测 | UX |
|------|------|-----|
| 麦克风权限未授权 | `AVAudioApplication.shared.recordPermission == .denied` | 弹窗 → 引导设置 |
| 语音识别权限未授权 | `SFSpeechRecognizer.authorizationStatus() == .denied` | 弹窗 → 引导设置 |
| 离线语音包未下载 | `SFSpeechRecognizer(locale: "zh-CN").supportsOnDeviceRecognition == false` | 弹窗 → 引导设置下载 |
| 设备不支持（A8 及以下） | `supportsOnDeviceRecognition` | 按钮置灰 + hint "当前设备不支持" |
| 网络异常（理论上 on-device 不需要网络，但 iOS 偶发需要 ping） | 识别错误回调 | 显示 "识别失败，请重试" 按钮 |
| 用户沉默 ≥ 5s | 自定义 timer | 自动停止，丢弃（避免无效 session） |
| 用户说话超时 60s | 自定义 timer | 自动停止，正常落字 |
| 识别结果为空 | `result.bestTranscription.formattedString.isEmpty` | 不填入 content，提示 "没听清，请重试" |
| 用户上滑取消 | `translation.y < -60` | 丢弃，content 不变 |

### 12.6 状态机

```
[idle] ── 按下 ──▶ [preparing] (配置 audio session + request)
[preparing] ── 完成 ──▶ [recording] (实时 partial 回调)
[recording] ── 上滑 ──▶ [cancelled] ──▶ [idle]
[recording] ── 松手 ──▶ [finalizing] (等 isFinal 回调)
[finalizing] ── 拿到文字 ──▶ [idle] (填入 content)
[finalizing] ── 错误 ──▶ [error] ──▶ [idle] (展示重试)
[recording] ── 60s 超时 ──▶ [finalizing]
[recording] ── 5s 沉默 ──▶ [cancelled] (无结果)
```

**关键点**：
- 任何状态都必须 `cleanup()` 释放 `audioEngine` + `AVAudioSession`——否则麦克风会被占住
- `[preparing]` / `[finalizing]` 状态展示 spinner，避免用户误以为按钮没反应

### 12.7 不存音频的隐私保障

**v1 明确不存音频**：
- 音频流只走 `SFSpeechAudioBufferRecognitionRequest.append(buffer)`，buffer 处理完即释放
- 录音过程中**不调** `SFSpeechURLRecognitionRequest`（那是基于文件的）
- 录音结束后**不写文件**到 `~/Documents/Timia/voice/`
- 弹层消失时强制 cleanup，buffer 引用清零

**给用户的承诺**（在便利贴页底部加一行小字）：
> 🎤 语音识别在设备本地完成，不会上传音频或文字到任何服务器。

### 12.8 与现有"自然语言输入框"的关系

| 维度 | 自然语言输入框（calendar/todo 模式） | 语音按钮（stickyNote 模式） |
|------|---------|---------|
| 入口 | 底部 toolbar 输入框 | 便利贴页底部 toolbar 🎤 |
| 目标 | 创建任务（解析 → 任务草稿 → 创建） | 创建便利贴（语音 → 文字 → 便利贴） |
| 触发方式 | 键盘输入 | 按住说话 |
| 文本来源 | 用户手打 | 设备本地识别 |
| 后端交互 | 调 `/views/schedule/natural-language/parse` | 不调（识别完即填前端输入框） |

**两者独立**，不共享代码。但**权限管理 `SpeechPermissionManager` 可以共用**——语音识别权限请求逻辑独立抽出来。

### 12.9 文件清单（iOS 新增）

- `codes/mobile/ios/Timia/Features/StickyNotes/VoiceInputButton.swift` — 语音按钮（带长按手势 + 弹层）
- `codes/mobile/ios/Timia/Features/StickyNotes/RecordingOverlay.swift` — 录音中弹层（partial text + 取消提示）
- `codes/mobile/ios/Timia/Core/Speech/StickyNoteSpeechRecognizer.swift` — Speech framework 包装（流式录音 + 强制 on-device）
- `codes/mobile/ios/Timia/Core/Speech/SpeechPermissionManager.swift` — 权限管理（懒检查 + 显式请求）
- `codes/mobile/ios/Timia/Core/Speech/OnDeviceSupportChecker.swift` — 离线包检测 + 设置跳转
- `codes/mobile/ios/Timia/Resources/Info.plist` — 增加 `NSSpeechRecognitionUsageDescription` + `NSMicrophoneUsageDescription`

**iOS 端修改**：
- `codes/mobile/ios/Timia/Features/Schedule/ScheduleHomeView.swift`
  - `bottomControls` 在 `.stickyNote` 模式下渲染 `VoiceInputButton` 替代自然语言输入框
  - 监听 `contentMode` 变化，进入 stickyNote 模式时延迟 100ms 检查离线包（不阻塞 UI）

### 12.10 不影响 v1 时间线

语音按钮是**纯客户端实现**——不涉及后端 / 数据库 / 鉴权 / API 变更。可以在便利贴主功能完成后**单独迭代**：

- Phase 1：便利贴主体（无语音）
- Phase 2：语音按钮叠加（不破坏现有便利贴逻辑）

Phase 2 工作量预估：1-2 天（写 recognizer + 按钮 + 权限弹窗 + 测试）。如果 Phase 1 上线前 voice 没做完，**用户依然能用键盘输入便利贴**——v1 阶段 voice 是增量价值，不是必须。

### 12.11 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 用户没下中文离线包 | 功能不可用 | 启动便利贴模式时检测，弹窗引导 |
| A8 芯片及以下设备 | 不支持 on-device | 按钮置灰 + hint，不阻塞其他功能 |
| 60s 长 session Speech framework 不稳定 | 识别中断 | 主动 60s 截止 + 自动重试 |
| 多人说话环境识别率低 | 误识别 | 实时显示 partial，用户可手动改；不存音频，错了不会"留底" |
| 识别上传隐私担忧 | 用户不信任 | 弹层小字承诺 + 强制 on-device + 不存音频 |
