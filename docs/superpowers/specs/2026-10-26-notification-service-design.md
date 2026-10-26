# 通知服务设计（P0–P2）

**日期：** 2026-10-26  
**状态：** 已确认。本轮只实现并合并 P0。  
**不在范围内：** 不改造 `plan_notifications`、iOS `ScreenNotification`、`file_notify`。它们仍是规划提醒、系统横幅和文件绑定同步，不是通用通知。

## 目标

用户在任务参与人、空间成员、项目成员、项目内新建任务这几件事发生后，能在 Web 收件箱看到中文通知。系统管理员可以按场景关闭投递。推送只预留字段和空接口，本轮不发 APNs。

## 架构

独立进程 `codes/notification-service`，端口 **8001**，对外 `https://timia.online/notification-service/`（nginx 剥前缀，与 `/file-service/` 相同）。

- 栈与 file-service / core-service 一致：**FastAPI + Pydantic v2 + SQLAlchemy 2.0 同步会话 + Alembic + Postgres**。core 不是 async，这里也不用 async。
- 与 core **共用一个 Postgres**。通知表前缀 `notif_`。Alembic 版本表 `alembic_version_notification_service`，不写入 core 的迁移链。
- 身份表（`users`、`web_sessions`、`mobile_sessions`、空间/项目成员）只读映射，由 core 迁移。通知服务不改这些表。
- 受众解析优先由 **core 查成员后传 `user_ids`**。通知服务仍接受 `broadcast | user_ids | project_id | workspace_id`，后两者直接读共享库，避免 core ↔ notification 互相 HTTP 查成员。
- core 在主事务 **commit 成功之后** 尽力投递。失败只打日志。投递放后台线程，不把通知服务宕机变成接口 500。
- 用户 JWT 与 Web 相同（`JWT_SECRET` / issuer / `timia-web`，并接受 `timia-ios`）。服务间调用用 `X-Internal-Token`（`NOTIFICATION_INTERNAL_TOKEN`），对齐 file-service 的 `X-Internal-Token`。

## 数据

### `notif_scenarios`

| 字段 | 说明 |
|------|------|
| `key` | 主键 |
| `enabled` | 关闭则不展开投递 |
| `title_template` / `body_template` | `str.format` 占位符，缺变量当空串 |
| `push_enabled` | P0 只决定 `push_status` 是 `pending` 还是 `skipped`，不真正推送 |

种子（默认 `enabled=true`，`push_enabled=false`）：

| key | 何时 | 通知谁 | 模板变量 |
|-----|------|--------|----------|
| `task_self_join` | 操作者新出现在参与人里 | 负责人；无负责人则创建人 | `actor_name` `task_title` |
| `task_member_added` | 其他人新出现在参与人里 | 这些被加的人 | `actor_name` `task_title` |
| `workspace_member_added` | 空间加成员成功 | 被加用户 | `actor_name` `workspace_name` |
| `project_member_added` | 项目加成员成功 | 被加用户 | `actor_name` `project_name` |
| `task_created_in_project` | 项目内新建任务 | 该项目全部 active 成员 | `actor_name` `task_title` `project_name` |

文案在通知服务模板里，中文。core 传变量和 link，不在 core 写死标题。

默认模板：

- `task_self_join`：`{actor_name} 加入了任务` / `{actor_name} 将自己加入了「{task_title}」的参与人`
- `task_member_added`：`你被加入了任务` / `{actor_name} 将你加入了「{task_title}」的参与人`
- `workspace_member_added`：`你被加入了空间` / `{actor_name} 将你加入了空间「{workspace_name}」`
- `project_member_added`：`你被加入了项目` / `{actor_name} 将你加入了项目「{project_name}」`
- `task_created_in_project`：`项目有新任务` / `{actor_name} 在「{project_name}」创建了任务「{task_title}」`

### `notif_notifications`

标题、正文、`sender_user_id`、`link`、`audience_type`、`audience_params`（JSON）、`timing`（`immediate|delay|scheduled`）、`scheduled_at`、`status`（`delivered|skipped|scheduled`）、`scenario_key`。

### `notif_deliveries`

`notification_id`、`user_id`、`read_at`、`push_status`（`skipped|pending`）。同一通知对同一用户唯一。

## 规则

1. **不通知自己：** 展开时去掉 `sender_user_id`。
2. **去重：** 同一通知的收件人按顺序去重。
3. **场景关闭：** 仍写入通知行，`status=skipped`，**零条** delivery。
4. **未知场景 key：** `400 unknown_scenario`。
5. **无场景的自定义通知：** 允许，但必须自带 title（给以后的管理端群发留口）。
6. **`timing != immediate`：** 只落通知行，`status=scheduled`，不展开。P0 不跑调度器。
7. 收件人必须是 `users.status=active`。`project_id` / `workspace_id` 只含 `status=active` 的成员。
8. 重复任务的展开副本不各发一条；只针对创建/更新的那一行。
9. 新建任务同时满足「项目全员」和「初始参与人」时，两个场景都发。同一个人可以收到两条，因为语义不同。

Link 与现有 Web 路由一致：

- 任务 `/workspace/{workspaceId}/projects/{projectId}/items/{itemId}`
- 项目 `/workspace/{workspaceId}/projects/{projectId}`
- 空间 `/workspace/{workspaceId}`

## API

| 方法 | 路径 | 鉴权 |
|------|------|------|
| `POST` | `/v1/notifications` | `X-Internal-Token` |
| `GET` | `/v1/inbox` | 用户 JWT。返回 `items` 与 `unread_count` |
| `POST` | `/v1/inbox/{delivery_id}/read` | 用户 JWT。他人的投递 `404 not_found` |
| `POST` | `/v1/inbox/read-all` | 用户 JWT |
| `GET` | `/v1/admin/scenarios` | JWT 且 `system_role=admin`，否则 `403 admin_required` |
| `PATCH` | `/v1/admin/scenarios/{key}` | 同上。P0 UI 只改 `enabled` |
| `POST` | `/internal/push/dispatch` | 内网 token。P0 固定 `push_not_configured`，不发送 |
| `GET` | `/health` | 无 |

`POST /v1/notifications` 立即展开 `immediate` 投递，响应 `201`：`id`、`status`、`delivery_count`、`scenario_key`。

## core 钩子

成功 `commit` 之后调用：

| 位置 | 场景 |
|------|------|
| `items.create_item` | `task_created_in_project`，并把初始参与人当作从空列表新增（`task_self_join` / `task_member_added`） |
| `items.update_item` | 仅当请求带了 `participant_user_ids` 时，对比更新前列表 |
| `members.add_member` | `workspace_member_added` |
| `projects.add_project_member` | `project_member_added` |

`NOTIFICATION_SERVICE_BASE` 或 token 为空时直接返回（本地测试默认不打网络）。

## Web

- 桌面 `SideNav` 头像上方铃铛，链到 `/my/notifications`，角标为未读数。窄屏侧栏隐藏，顶栏头像旁同样放铃铛。
- 收件箱：标题、正文、发送人、时间、未读/已读、点击跳转。无发送人显示「系统」。
- 管理入口与 `/member` 同级，路由 `/admin/notifications`，`system_role=admin` 门控与 `/member` 相同（`isAdminOnlyPath`）。
- 文案走 `next-intl`（`zh.json` / `en.json`）。
- 浏览器请求基址 `NEXT_PUBLIC_NOTIFICATION_API_BASE_URL`。未设置时开发默认 `http://localhost:8001`，生产默认 `https://timia.online/notification-service`。`apiFetch` 对 `/v1/inbox` 与 `/v1/admin/scenarios` 走该基址，401 仍走现有 refresh。

## 部署

接通已有占位：`docker-compose.prod.yml`、`docker-compose.local.yml`、`Makefile`、`deploy/nginx.conf`、`deploy/nginx.local.conf`、`deploy/_common.sh`、`deploy/local.sh`、`deploy/remote.sh`、`.github/workflows/deploy.yml`、`.env*.example`、`docs/deploy/cloud.md`、`README.md`。

通知服务在 core healthy 之后做 `alembic upgrade`，保证 `users` 已存在再加外键。

## 分阶段

| 阶段 | 内容 |
|------|------|
| **P0（本轮）** | 服务、表、五场景、即时投递、收件箱、管理开关、core 钩子、Web 铃铛与两页、基础测试 |
| **P1** | `delay` / `scheduled` 调度器；APNs 设备 token 与真实推送；iOS 铃铛；失败重试与幂等键；管理端改模板 |
| **P2** | 按用户关场景、邮件/摘要、管理端写广播、未读实时通道 |

## 测试

通知服务（sqlite 内存库）：创建后展开且去重、排除发送者；场景关闭零投递；定时只落库不展开；收件箱已读与全部已读；非主人已读 404；非管理员 403。

core：纯函数覆盖五个场景的收件人；HTTP 客户端在 base 为空时不请求，连接失败不抛出。
