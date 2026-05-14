# Timia (MVP-1) — Workspace 协作管理 Web 规格说明

**目标**：在一个 Workspace 内，多用户登录后可进行日常管理（项目/条目）并协作（评论 + 活动流），管理员可手动管理成员。

**非目标（第一期不做）**：
- 邀请链接/邮件邀请、自助注册闭环（可保留注册但不做邀请流程）
- 实时推送（WebSocket/SSE）、离线、全文搜索
- 多人同时编辑同一字段（CRDT）
- 复杂项目级例外权限（先以 Workspace 角色为主）

---

## 1. 信息架构与路由

**层级**：Workspace → Project → Item → Comment

**推荐路由**（前端 Next.js）：
- `/login`
- `/w/[workspaceId]`（workspace 概览）
- `/w/[workspaceId]/projects`
- `/w/[workspaceId]/projects/[projectId]`
- `/w/[workspaceId]/projects/[projectId]/items/[itemId]`（详情 + 评论）
- `/w/[workspaceId]/settings/members`（成员管理：仅 Owner/Admin）

---

## 2. 角色与权限（RBAC）

### 2.1 Workspace 角色
- **Owner**：全权限；可转让（第一期可不做转让 UI，但后端保留角色）
- **Admin**：成员管理、项目/条目管理
- **Member**：默认可创建/编辑自己有权限的项目/条目；第一期简化为“可读写 Workspace 内资源”
- **Guest**：只读（第一期可选：若实现成本过高可延后）

### 2.2 权限规则（第一期简化版）
- Workspace 成员才能访问该 Workspace 的任何资源。
- Owner/Admin：
  - 增加成员、移除成员、调整成员角色
  - 创建/编辑/删除 Project、Item
- Member：
  - 创建/编辑/删除 Project、Item（第一期简化：不做更细粒度限制）
  - 创建/删除自己发布的 Comment（删除他人评论仅 Owner/Admin）
- Guest（若做）：
  - 读取 Project/Item/Comment
  - 不可写

> 注：后续如需“项目级例外权限”，新增 `project_members` 覆盖规则即可，不破坏现有模型。

---

## 3. 核心实体与数据模型（Postgres）

> 这里描述字段语义，不强行限定 ORM 细节；但要求所有表具备 `id`, `created_at`, `updated_at`。

### 3.1 User
- `id` (uuid)
- `email` (unique)
- `password_hash`
- `display_name`
- `status`（active/disabled）

### 3.2 Workspace
- `id` (uuid)
- `name`
- `created_by_user_id`

### 3.3 WorkspaceMember
- `id` (uuid)
- `workspace_id`
- `user_id`
- `role`（owner/admin/member/guest）
- `status`（active/removed）
- unique(workspace_id, user_id)

### 3.4 Project
- `id` (uuid)
- `workspace_id`
- `name`
- `description`（可空）
- `archived`（bool）

### 3.5 Item（统一条目：任务/日程/习惯记录的 MVP 抽象）
- `id` (uuid)
- `workspace_id`（冗余便于权限与查询）
- `project_id`
- `title`
- `body`（纯文本，可空）
- `status`（todo/doing/done/archived）
- `priority`（low/medium/high，可选）
- `due_at`（可空）
- `version`（int，用于乐观锁；更新时 +1）

### 3.6 Comment
- `id` (uuid)
- `workspace_id`（冗余便于权限与查询）
- `item_id`
- `author_user_id`
- `body`（纯文本）
- `deleted_at`（软删除，便于审计与引用）

### 3.7 ActivityLog（活动流/审计）
- `id` (uuid)
- `workspace_id`
- `actor_user_id`
- `entity_type`（workspace/project/item/comment/member）
- `entity_id`
- `action`（create/update/delete/add_member/remove_member/change_role/add_comment/delete_comment）
- `metadata`（json：差异字段、旧值新值、上下文）

---

## 4. API 设计（FastAPI，REST）

### 4.1 认证
- `POST /auth/login`：邮箱+密码 → 设置 refresh cookie + 返回 access token（或同样用 cookie）
- `POST /auth/logout`
- `POST /auth/refresh`：刷新 access
- `GET /me`

### 4.2 Workspace
- `GET /workspaces`：返回当前用户加入的 workspaces
- `POST /workspaces`：创建 workspace（创建者默认为 owner）
- `GET /workspaces/{workspaceId}`

### 4.3 成员管理（手动）
- `GET /workspaces/{workspaceId}/members`
- `POST /workspaces/{workspaceId}/members`：管理员通过 email 添加成员 + 角色
- `PATCH /workspaces/{workspaceId}/members/{memberId}`：改角色
- `DELETE /workspaces/{workspaceId}/members/{memberId}`：移除

### 4.4 Project
- `GET /workspaces/{workspaceId}/projects`
- `POST /workspaces/{workspaceId}/projects`
- `PATCH /workspaces/{workspaceId}/projects/{projectId}`
- `DELETE /workspaces/{workspaceId}/projects/{projectId}`

### 4.5 Item
- `GET /workspaces/{workspaceId}/projects/{projectId}/items`（支持简单筛选：status）
- `POST /workspaces/{workspaceId}/projects/{projectId}/items`
- `GET /workspaces/{workspaceId}/projects/{projectId}/items/{itemId}`
- `PATCH /workspaces/{workspaceId}/projects/{projectId}/items/{itemId}`（携带 `version`；不匹配返回 409）
- `DELETE /workspaces/{workspaceId}/projects/{projectId}/items/{itemId}`

### 4.6 Comment
- `GET /workspaces/{workspaceId}/projects/{projectId}/items/{itemId}/comments`
- `POST /workspaces/{workspaceId}/projects/{projectId}/items/{itemId}/comments`
- `DELETE /workspaces/{workspaceId}/projects/{projectId}/items/{itemId}/comments/{commentId}`（作者或 Owner/Admin）

### 4.7 Activity
- `GET /workspaces/{workspaceId}/activity`（分页）

---

## 5. 前端页面（MVP-1 必做）

- 登录页：邮箱/密码登录
- Workspace 列表页：列出加入的 workspaces + 创建 workspace
- Workspace 项目列表：项目 CRUD
- 项目详情页：Item 列表 + 创建/编辑/状态切换
- Item 详情页：内容 + 评论列表 + 发评论
- 成员管理页：列表 + 手动添加（email）+ 改角色 + 移除

---

## 6. 质量与验收标准（MVP-1）

**权限**：
- 非成员访问任何 workspace 资源返回 403
- Member 无法进入成员管理页（前端隐藏 + 后端 403）

**审计**：
- 创建/更新/删除 Project、Item、Comment、成员变更均写入 ActivityLog

**并发**：
- Item 更新必须带 `version`，冲突返回 409（前端提示“有更新，请刷新”即可）

