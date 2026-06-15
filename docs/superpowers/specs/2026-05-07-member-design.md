# Member（系统用户/空间归属）页面设计稿

**Goal**

在左侧导航栏“分析”分组下新增 `Member` 入口，跳转到平级路由 `/member`，展示**全站用户列表**。点击某个用户后，展开该用户所属的所有 Workspace、Workspace 下的项目列表，并展示用户在每个 Workspace 的角色（role）。

**Scope**

- 仅做**展示**（不在此页面管理成员/改角色/禁用用户）
- 用户范围：**系统级全站所有用户**
- 展示角色粒度：**用户在每个 workspace 的 role**（owner/admin/member/guest，含 status）
- 访问权限：**任何已登录用户可访问**（A）

---

## UX / IA（信息架构）

### 左侧导航

- 将现有单条 `Analytics`（占位）调整为“分析/Analytics”分组（可折叠或静态分组标题）
- 分组下新增子项：
  - `Member` → 路由 `/member`

### `/member` 页面

**页面结构**

- 顶部：标题 `Member`，右侧可选搜索框（MVP 可先不做搜索/分页）
- 主体：系统用户列表（卡片/列表均可）

**用户行/卡片展示**

- `display_name`
- `email`
- `status`（active/disabled）
- `workspace_count`（该用户 active membership 数量）

**展开后的用户详情（点击用户）**

- 展示该用户的 Workspace 归属列表：
  - Workspace 名称
  - membership 的 `role` 与 `status`
  - Workspace 下的 Projects 列表（项目名；可带 archived 标识）

**加载与错误处理**

- 用户列表加载中 skeleton / 文案
- 展开详情加载中 spinner / 文案
- 接口失败提示（toast/inline error 均可）
- 展开详情做前端缓存：同一用户再次展开不重复请求（除非刷新页面）

---

## API 设计（方案 3：列表 + 计数；展开懒加载）

### 1) GET `/users`

**用途**

系统用户列表，用于渲染 `/member` 首屏。

**Response**

```json
[
  {
    "id": "uuid",
    "email": "a@example.com",
    "display_name": "Alice",
    "status": "active",
    "workspace_count": 2
  }
]
```

**Notes**

- `workspace_count` 统计该用户在 `workspace_members` 中 `status == "active"` 的数量

### 2) GET `/users/{user_id}/workspaces`

**用途**

点击用户展开时拉取该用户的 workspace / role / projects。

**Response**

```json
[
  {
    "workspace": { "id": "uuid", "name": "Workspace A", "description": null },
    "membership": { "id": "uuid", "role": "admin", "status": "active" },
    "projects": [
      { "id": "uuid", "name": "Project 1", "description": null, "archived": false }
    ]
  }
]
```

**Notes**

- Projects 取自 `GET /workspaces/{workspace_id}/projects` 的同源数据模型（但该接口要求“当前用户是 member”；此处是系统页，需要后端直接按 workspace_id 查询项目并返回）

---

## 数据模型与权限假设

### 数据模型（现状）

- `users`：`id/email/display_name/status`
- `workspace_members`：`workspace_id/user_id/role/status`
- `projects`：`workspace_id/...`

### 权限（A）

- 两个新接口都仅要求 `Authorization: Bearer <token>`（复用 `get_current_user`）
- 不做系统管理员 gating

---

## 实现要点（前后端）

### 后端（FastAPI）

- 新增 `routes/users.py` 并在 `app/main.py` include
- 新增 schema：
  - `UserOut`（含 workspace_count）
  - `UserWorkspaceOut`（workspace + membership + projects）
- 查询建议：
  - `/users`：`select(User, count(active memberships)) group by User.id`
  - `/users/{id}/workspaces`：
    - 先查 memberships + workspace 信息（按 membership created_at 或 workspace created_at 排序）
    - 再按 workspace_id 批量查 projects（避免 N+1）

### 前端（Next.js app router）

- 新增页面 `codes/web/app/(app)/member/page.tsx`
- 在 `AppShell` 左侧导航新增“分析”分组 + 子项 `Member`
- 页面交互：
  - 首屏 `apiFetch("/users")`
  - 点击用户：若缓存无 → `apiFetch(`/users/${id}/workspaces`)`，缓存后展开渲染

---

## 测试策略（TDD）

### API 单测（建议）

- `/users` 返回 workspace_count 正确（active vs removed）
- `/users/{id}/workspaces`：
  - 返回 memberships、workspace、projects 对应关系正确
  - projects 批量查询不丢数据

### 前端（最低保障）

- 页面能加载用户列表
- 展开某用户后渲染 workspace + role + projects

