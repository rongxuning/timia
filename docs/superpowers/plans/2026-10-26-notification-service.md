# Notification Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可合并的通知 P0：独立 notification-service、core 五个场景钩子、Web 收件箱与管理员开关。

**Architecture:** FastAPI 服务与 core 共用 Postgres（表前缀 `notif_`，独立 Alembic 版本表）。core 在 commit 之后把已经解析好的 `user_ids` 和模板变量 POST 到 `/v1/notifications`。Web 用用户 JWT 读收件箱，管理员用同一 JWT 改场景开关。推送与定时调度只留字段和 stub。

**Tech Stack:** Python ≥3.11，uv，FastAPI，Pydantic v2，SQLAlchemy 2.0 同步会话，Alembic，Postgres，Next.js，next-intl。

## Global Constraints

- 端口 8001；nginx 前缀 `/notification-service/`（剥前缀）
- 表名 `notif_notifications` / `notif_deliveries` / `notif_scenarios`；版本表 `alembic_version_notification_service`
- 不通知发送者；同一通知收件人去重；场景 `enabled=false` 不写 delivery
- 文案中文，来自场景模板；link 用现有 Web 路径
- core 钩子失败只记日志，不回滚主事务
- P0 不实现 APNs 证书、生产推送、iOS 铃铛、定时调度循环
- 不改 `plan_notifications`、iOS ScreenNotification、`file_notify`
- 鉴权：内网 `X-Internal-Token`；用户 JWT audience `timia-web` 或 `timia-ios`；管理接口 `system_role=admin`，否则 `403 admin_required`

规格：`docs/superpowers/specs/2026-10-26-notification-service-design.md`

---

### Task 1: 通知服务脚手架与表

**Files:**
- Create: `codes/notification-service/**`
- Test: `codes/notification-service/tests/test_notifications.py`

**Interfaces:**
- Produces: `POST /v1/notifications`、`GET /health`、模型 `Notification` / `NotificationDelivery` / `NotificationScenario`

- [x] **Step 1:** 按 file-service 建 uv 工程、Dockerfile、Alembic、`/health`
- [x] **Step 2:** 迁移三张 `notif_` 表并种子 5 个场景；运行时 `ensure_default_scenarios` 补齐（测试走 `create_all`，不跑迁移）
- [x] **Step 3:** `uv run pytest -q` 与 `uv run ruff check .`

### Task 2: 创建、收件箱、管理、推送 stub

**Files:**
- Create: `app/services/notifications.py`、`app/services/audience.py`、`app/services/scenarios.py`、`app/services/push.py`
- Create: `app/routes/notifications.py`、`inbox.py`、`admin.py`、`internal.py`
- Test: `tests/test_notifications.py`

**Interfaces:**
- Consumes: Task 1 的表与 JWT / internal token 依赖
- Produces:
  - `create_notification(db, payload) -> {id, status, delivery_count, scenario_key}`
  - `list_inbox(db, user, limit) -> {items, unread_count}`
  - `mark_read` / `mark_all_read`
  - `POST /internal/push/dispatch` 返回 `push_not_configured`

- [x] **Step 1:** 写失败测试：展开 deliveries、排除自己、去重、场景关闭零投递、scheduled 不展开、已读、全部已读、越权 404、非管理员 403
- [x] **Step 2:** 实现到测试通过
- [x] **Step 3:** 导出 `codes/notification-service/openapi.json`

### Task 3: 接通部署占位

**Files:**
- Modify: `docker-compose.prod.yml`、`docker-compose.local.yml`、`Makefile`、`deploy/nginx.conf`、`deploy/nginx.local.conf`、`deploy/_common.sh`、`deploy/local.sh`、`deploy/remote.sh`、`.github/workflows/deploy.yml`、`.env.example`、`.env.prod.example`、`.env.docker`、`.env.pack.example`、`README.md`、`docs/deploy/cloud.md`、`codes/web/Dockerfile`、`codes/web/next.config.js`

- [x] **Step 1:** compose 服务 `notification-service:8001`，core 增加 `NOTIFICATION_SERVICE_BASE`
- [x] **Step 2:** nginx upstream 与 `/notification-service/`
- [x] **Step 3:** Makefile `notification-service`（8001）；deploy smart/full 识别该服务
- [x] **Step 4:** 文档与 env 示例写上 token 与公网基址

### Task 4: core-service 钩子

**Files:**
- Create: `app/services/notification_audience.py`、`notification_notify.py`、`notification_hooks.py`
- Modify: `app/core/config.py`、`app/routes/items.py`、`members.py`、`projects.py`
- Test: `tests/test_notification_audience.py`、`tests/test_notification_notify.py`

**Interfaces:**
- Produces:
  - `plan_task_created(...) -> list[NotificationIntent]`
  - `plan_participant_changes(...) -> list[NotificationIntent]`
  - `plan_membership_added(...) -> NotificationIntent | None`
  - `dispatch_notifications(intents, *, background=True) -> None`

- [x] **Step 1:** 纯函数测试五个场景的收件人（含不通知自己、无负责人回退创建人、负责人是自己则不发）
- [x] **Step 2:** HTTP 客户端测试：base 为空不请求；`ConnectError` 不抛
- [x] **Step 3:** `create_item` / `update_item`（参与人 diff）/ `add_member` / `add_project_member` 在 commit 后调用

### Task 5: Web 收件箱与通知管理

**Files:**
- Modify: `src/lib/api.ts`、`src/lib/system-role.ts`、`src/components/layout/SideNav.tsx`、`TopBar.tsx`、`Breadcrumbs.tsx`、`messages/zh.json`、`messages/en.json`
- Create: `app/(app)/my/notifications/page.tsx`、`app/(app)/admin/notifications/page.tsx`、`src/lib/use-unread-notifications.ts`、`src/types/notification.ts`

- [x] **Step 1:** 头像上方铃铛 + 未读角标；窄屏顶栏补入口（侧栏 `md` 以下隐藏）
- [x] **Step 2:** 收件箱展示标题、正文、发送人、时间、已读状态，点击跳转并标已读；可全部已读
- [x] **Step 3:** `/admin/notifications` 五张场景卡，只切换 `enabled`；`/admin` 纳入 admin 路径
- [x] **Step 4:** `npm run test:i18n`；新图标 `notifications` 更新 Material Symbols 子集

---

### P1

- [x] **调度器：** 扫描 `status=scheduled` 且 `timing` 为 `delay` 或 `scheduled`、`scheduled_at <= now` 的通知，按当时场景开关展开 deliveries（不通知自己、去重）。`delay` 与 `scheduled` 都把到期时间放在 `scheduled_at`（delay 即 now + delay）。服务进程按 `NOTIFICATION_DISPATCH_INTERVAL_SECONDS`（默认 30，设为 0 关闭）跑后台循环；同一逻辑可单次执行 `python -m app.jobs.dispatch_scheduled`。
- [x] **iOS 铃铛与收件箱 UI**（调用已有 `/v1/inbox`，audience `timia-ios` 已可鉴权）。日程首页铃铛在空间按钮和头像之间，带未读角标。本环境无 Xcode，需在 Mac 上编译验证。
- [ ] **APNs：** 设备 token 表、`push_enabled` 为真时把 `pending` 发给 APNs，回写 `sent|failed`。证书只来自环境变量。本轮不做。
- [ ] **幂等键：** `POST /v1/notifications` 接受 `idempotency_key`，core 重试不重复投递。
- [ ] **管理端编辑** `title_template` / `body_template`（API 已接受 PATCH，P0 页面不暴露）。

### P2（本 PR 不做）

- [ ] 用户级偏好：按场景静音，覆盖全局 `enabled`。
- [ ] 邮件与每日摘要。
- [ ] 管理端编写 `broadcast` / 指定用户的通知。
- [ ] 未读数的实时通道（SSE 或 websocket）；P0 用进入页面、窗口 focus、本地 `timia:notifications-changed` 事件刷新。
