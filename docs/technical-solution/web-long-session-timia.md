# Timia Web 端长登录保持 — 改动方案

> 配套 `web-long-session.md`（通用技术原理）。本文件是**结合 Timia 当前架构**的可落地版本。

---

## 一、现状（已摸清）

| 关注点 | 当前实现 | 文件 / 行号 |
|--------|---------|------------|
| Web 登录 | `POST /auth/login` 只返 `access_token` | `codes/core-service/app/routes/auth.py:14-23` |
| Web Token 存储 | `localStorage["timia_access_token"]` | `codes/web/src/lib/auth.ts:1, 105-118` |
| 401 处理 | 立即 `clearToken()` + 跳转 login | `codes/web/src/lib/api.ts:23-29` |
| AT 有效期 | 30 min | `core-service/app/core/config.py:19` |
| RT 有效期 | 配置已有 14 天但**未被使用** | `config.py:20` |
| Audience | Web `timia-web` / Mobile `timia-ios` | `config.py:17-18` |
| 移动端会话 | 已有完整方案：旋转 RT + family + 复用检测 | `core-service/app/services/mobile_auth.py` + `models/mobile_auth.py` |
| CORS | `allow_credentials=True`，跨子域需要正确配置 | `core-service/app/main.py:24-30` |
| 登录后跳转 | `router.push("/my/schedule")` | `codes/web/app/login/page.tsx:92` |
| 路由保护 | `sessionExpiredHandled` 标记控制重定向 | `web/src/lib/auth.ts:79-96` |
| 已有 migration | 编号到 0019，Alembic 标准格式 | `core-service/app/migrations/versions/` |
| 已有测试 | `tests/test_auth.py`、`tests/test_mobile_auth.py` | `core-service/tests/` |

### 关键发现

1. **移动端已经实现了完整的双 Token 方案**（`MobileSession` 表 + RT 旋转 + 复用检测）。Web 端只需要"抄"一份简化版。
2. **配置已预留**：`refresh_token_expires_days=14`，但 web 路由没读它 —— 说明这个方向之前就规划过。
3. **Web 401 处理是"踢人即返回 login"，没有任何续期逻辑**。这就是用户被频繁踢下线的根因。
4. **AT 存 `localStorage` 有 XSS 风险**（虽然现在 SPA 是 Next.js 客户端组件、风险可控，但 RT 改成 HttpOnly Cookie 后整体安全模型更干净）。

---

## 二、目标

| 目标 | 验收标准 |
|------|---------|
| 用户登录后长期不掉线 | 30 天内活跃用户无需重新输入密码 |
| 透明续期 | AT 过期前自动换新，用户无感 |
| 安全防窃取 | RT 一次性，复用即吊销整家族 |
| 多设备/多标签页 | 各标签页独立刷新，互不干扰 |
| 与移动端解耦 | 移动端流程不动 |
| 可逐步上线 | 旧 token 平滑过渡到新会话 |

---

## 三、整体设计

**完全镜像 `MobileSession` 的会话模型**，但去掉设备密钥对这一层（浏览器本身没有可信硬件密钥，改用 User-Agent + IP 弱绑定 + Cookie 强保护）。

```
┌──────────┐                            ┌──────────────────────┐
│ Browser  │  POST /auth/login (pwd)    │  FastAPI             │
│  Tab A   │ ────────────────────────►  │                      │
│  Tab B   │ ◄── Set-Cookie: rt=xxx ── │  1. create WebSession │
│          │     Body: { access_token,  │  2. store rt_hash     │
│          │             expires_in,    │  3. set HttpOnly      │
│          │             session_id }   │     Secure Cookie     │
│          │                            └──────────────────────┘
│          │  GET /api/... (Bearer AT)
│          │ ── 401 (AT expired) ──►
│          │  POST /auth/refresh (Cookie rt)
│          │ ──────────────────────►  4. rotate RT, 旧 RT 失效
│          │ ◄── Body: { access_token,   5. Set-Cookie: 新 rt
│          │             expires_in }    6. 标记旧 rt used
│          │  GET /api/... (新 AT) [重发原请求]
```

**Token 分工**：
- **Access Token**：放**内存**（React 单例 / Zustand / Context），15-30 分钟
- **Refresh Token**：HttpOnly + Secure + SameSite=Lax Cookie，30 天（idle），硬上限 90 天（absolute）

**与 `MobileSession` 的差异**：

| 维度 | Mobile | Web（本方案）|
|------|--------|------------|
| 设备标识 | 公私钥对签名 | User-Agent + IP 摘要（弱标识）|
| RT 来源 | 派生自 `session_id + generation` | 派生自 `session_id + generation`（**复用**）|
| Cookie 存 RT | ❌（放 Keychain）| ✅ HttpOnly |
| 同 device 多 session | 登录即吊销旧的 | 允许多标签页共存 |

---

## 四、文件级改动清单

### 4.1 后端（`codes/core-service/`）

| # | 文件 | 改动 |
|---|------|------|
| 1 | `app/core/config.py` | 新增 `web_session_idle_days=30`、`web_session_absolute_days=90`、`web_refresh_retry_grace_seconds=60`、`web_cookie_secure=True`（dev 关掉）|
| 2 | `app/core/security.py` | 已有 `create_access_token` 接受 `session_id` 参数，**不动**。可选：加 `family_id` claim |
| 3 | `app/models/web_auth.py` ⭐NEW | 新建 `WebSession` model（结构镜像 `MobileSession` 但不带 device_id 强绑定）|
| 4 | `app/schemas/web_auth.py` ⭐NEW | `WebLoginOut`、`WebRefreshOut`、`WebSessionOut`、`WebRefreshRequest` |
| 5 | `app/services/web_auth.py` ⭐NEW | `create_web_session`、`refresh_web_session`、`revoke_web_session`；**从 `mobile_auth.py` 复制** refresh 旋转 + 复用检测逻辑（去掉 ECDSA 部分）|
| 6 | `app/routes/web_auth.py` ⭐NEW | 路由器：`/auth/login`、`/auth/refresh`、`/auth/logout`、`/auth/logout-all`、`/auth/sessions`、`DELETE /auth/sessions/{id}` |
| 7 | `app/routes/auth.py` | **删除**现有 `login` 路由（被新文件替代），保留 `register`、`me` |
| 8 | `app/api/deps.py` | `get_current_user` 增加：web audience + 校验 `WebSession`（`revoked_at` / idle / absolute）|
| 9 | `app/main.py` | `include_router(web_auth_router)` |
| 10 | `app/migrations/versions/0020_web_sessions.py` ⭐NEW | 新表 `web_sessions`（与 `mobile_sessions` 字段一致，去 `device_id`）|
| 11 | `tests/test_web_auth.py` ⭐NEW | 单元测试：登录/刷新/旋转/复用吊销/logout/多设备 |
| 12 | `app/schemas/auth.py` | 保留 `RegisterRequest` / `MeResponse`；移除 `LoginRequest` / `TokenResponse`（迁到 `web_auth.py`）|

### 4.2 前端（`codes/web/`）

| # | 文件 | 改动 |
|---|------|------|
| 1 | `src/lib/auth.ts` ⭐重写 | 移除 `localStorage`；改用**内存 + 跨标签广播**（`BroadcastChannel` + `storage` 事件）；保留 `getCachedMe` / `useCurrentMe` 不变 |
| 2 | `src/lib/api.ts` ⭐改 401 流程 | 401 时**先**调用 `/auth/refresh`（带 `credentials:include`），成功则重发原请求；只有 refresh 失败才清状态跳 login |
| 3 | `src/lib/api-catalog.ts` | 更新 `/auth/login` 响应 schema；新增 `/auth/refresh`、`/auth/logout`、`/auth/sessions` 文档条目 |
| 4 | `src/types/api/generated.ts` | 跑 `make codegen` 重生成 |
| 5 | `app/login/page.tsx` | 改 `setToken` → `publishAuth({ accessToken, sessionId })`；加可选"保持登录"复选框（默认勾选）|
| 6 | `app/register/page.tsx` | 注册后自动跳登录页（行为不变）|
| 7 | `src/components/layout/AppShell.tsx`（或 TopBar）| 用户菜单加"退出"按钮调用 `/auth/logout` |
| 8 | 新增 `src/lib/session-sync.ts` | 跨标签页同步：监听 `BroadcastChannel('timia-auth')` 和 `storage` 事件，一个标签页刷新成功 → 其他标签页也更新 |
| 9 | `src/lib/scan-web-api-usage.ts` | 鉴权使用扫描（如果有）要更新匹配规则 |

### 4.3 配置 / 文档

| # | 文件 | 改动 |
|---|------|------|
| 1 | `.env.example`（两个服务各一）| 注释新增 web session 配置项 |
| 2 | `docs/deploy/cloud.md` | 部署脚本里 `web_cookie_secure=True` 必须开；本地 dev 关闭 |
| 3 | `README.md` | 更新 verify 步骤里关于登录时长的说明（可选）|

---

## 五、实施步骤（推荐顺序）

### 阶段 0：准备（不动业务）
- [ ] **0.1** 在 `feature/web-session` 分支开发
- [ ] **0.2** 与团队对齐：本方案**会让旧 localStorage token 失效**，上线时所有用户需重新登录一次（一次性影响）

### 阶段 1：后端基础设施（可单独发版，但不暴露给前端）
- [ ] **1.1** `app/models/web_auth.py` 新建 `WebSession`
- [ ] **1.2** `app/migrations/versions/0020_web_sessions.py` 新表 + 索引
- [ ] **1.3** `app/core/config.py` 新增配置项
- [ ] **1.4** `app/services/web_auth.py` 写 `create_web_session` / `refresh_web_session`（**复制自 mobile_auth.py 的 rotation + reuse-detection，去掉 ECDSA**）
- [ ] **1.5** `app/schemas/web_auth.py` schema 定义
- [ ] **1.6** `app/routes/web_auth.py` 路由（先**只挂 `/auth/refresh` 一个端点**做内部测试）
- [ ] **1.7** `app/main.py` 挂路由
- [ ] **1.8** `tests/test_web_auth.py` 单测：覆盖 login → refresh → 旋转 → 复用吊销 → idle 过期 → absolute 过期 → logout

✅ **阶段 1 验收**：`make core-service` 起来后，用 curl 跑通 login/refresh/logout 流程，DB 看到 `web_sessions` 表里有记录。

### 阶段 2：后端切换
- [ ] **2.1** `app/api/deps.py` `get_current_user` 增加 web audience 分支：校验 `WebSession`（`revoked_at` / `idle_expires_at` / `absolute_expires_at`）
- [ ] **2.2** `app/routes/auth.py` 删除旧 `login`，挂载新 `web_auth.login`（在同一个 `/auth/login` 路径，**但**会同时设置 RT cookie + 返回 AT）
- [ ] **2.3** `app/schemas/auth.py` 移除 `LoginRequest` / `TokenResponse`（让所有引用点都报错，强制改前端）
- [ ] **2.4** 跑 `make verify` 通过
- [ ] **2.5** 跑 `make codegen` 重新生成 web types

✅ **阶段 2 验收**：`curl -X POST /auth/login` 不带 cookie 能成功；带 cookie 调用 `/auth/refresh` 能换新 AT；用旧 AT（已 rotate）请求业务接口返回 401。

### 阶段 3：前端切换
- [ ] **3.1** `src/lib/auth.ts` 改写：
  - 删 `getToken/setToken` 走 localStorage
  - 加内存 store：`let accessToken: string | null = null`
  - 暴露 `setAccessToken()` / `getAccessToken()` / `clearAuth()`
  - 加 `BroadcastChannel('timia-auth')` 用于跨标签页广播
  - 保留 `getCachedMe` / `useCurrentMe` 不变
- [ ] **3.2** `src/lib/api.ts`：
  ```ts
  // 401 流程：先尝试 refresh，失败再清状态
  if (resp.status === 401 && !path.startsWith('/auth/')) {
    const newAT = await tryRefresh()
    if (newAT) {
      config._retried = true
      config.headers.Authorization = `Bearer ${newAT}`
      return api(config)  // 重发
    }
    clearAuth()
    redirectToLoginPage({ reason: 'session-expired' })
  }
  ```
- [ ] **3.3** `src/lib/session-sync.ts` 新增：BroadcastChannel 监听 + 事件 `auth-updated` / `auth-cleared`
- [ ] **3.4** `app/login/page.tsx`：`setToken` → `publishAuth({ accessToken: res.access_token, sessionId: res.session_id })`
- [ ] **3.5** `AppShell.tsx`：用户菜单加"退出"按钮 → `POST /auth/logout`（`credentials: include`）→ `clearAuth()` → 跳 login
- [ ] **3.6** 处理 localStorage 旧 token 迁移：第一次启动时如果检测到 `timia_access_token`，调一次 `/auth/refresh`（带旧 token 是不行的 — 因为 cookie 没有），所以**简化为：直接清掉，让用户重登一次**

✅ **阶段 3 验收**：浏览器关 30 秒后重开，AT 已过期但 RT cookie 还在 → 第一个请求 401 → 透明 refresh → 用户无感。

### 阶段 4：测试 + 灰度
- [ ] **4.1** 完整跑 `make verify` + `pytest` + `npm run build`
- [ ] **4.2** 手动 E2E：
  - 登录 → 关浏览器 → 重开 → 仍在登录态 ✅
  - 登录 → 30 分钟 → 操作 → 透明刷新（看 Network 应该有 2 个请求）✅
  - 同一账号多标签页 → 一处登出 → 其他标签页下次请求会重定向 ✅
  - 复制 RT cookie 到另一台设备 → 调用 refresh → 第一次成功，第二次即被吊销 ✅
- [ ] **4.3** 性能：`/auth/refresh` 平均 < 50ms（只查 1 行 DB + 1 次哈希）
- [ ] **4.4** 部署到 staging，观察 24h 日志：401 → 200 的比例

### 阶段 5：上线
- [ ] **5.1** alembic upgrade head
- [ ] **5.2** 后端先发版（前端还没改，会报 401，但旧 AT 还能用直到过期）
- [ ] **5.3** 前端紧接着发版
- [ ] **5.4** 监控：登录转化率、401 比例、refresh QPS

---

## 六、安全检查清单

| 风险 | 应对 |
|------|------|
| RT cookie 被 XSS 读取 | HttpOnly ✅ |
| RT cookie 被 CSRF 滥用 | SameSite=Lax + RT 路径限制 `/auth/refresh`（Future: 加 Origin 校验）|
| RT 被拷走 | 旋转 + 复用检测 → 全家族吊销 |
| AT 被偷 | 短 TTL（30 min）；可选：把 `jti` 存 Redis 黑名单，登出时加入 |
| 设备丢失 | "踢出所有设备"接口 → `revoke_reason='logout_all'` |
| 用户改密码 | 现有 mobile 实现 `user_id` 维度吊销，可复用逻辑 |
| Dev 误开 Secure cookie | `web_cookie_secure=settings.env == "prod"` 自动控制 |
| 多标签页竞争刷新 | 单一 in-flight `Promise<accessToken>` 锁（参考通用方案里的 `refreshing` 变量）|

---

## 七、配置参考

```python
# app/core/config.py 新增
web_access_token_expires_minutes: int = 30    # AT 寿命
web_session_idle_days: int = 30              # RT 滑动窗口
web_session_absolute_days: int = 90           # RT 硬上限
web_refresh_retry_grace_seconds: int = 60     # refresh 重试宽限（应对网络抖动）
web_cookie_secure: bool = False               # prod 部署时改 True
web_cookie_samesite: str = "lax"
```

```bash
# core-service/.env
WEB_SESSION_IDLE_DAYS=30
WEB_SESSION_ABSOLUTE_DAYS=90
WEB_COOKIE_SECURE=false  # prod 改 true
```

---

## 八、可选项 / 后续优化

- [ ] **多设备列表 UI**（账号设置页面展示活跃 WebSession 列表，仿移动端 `GET /auth/sessions`）
- [ ] **敏感操作二次确认**：改密、转账前要求最近 5 分钟内做过 refresh（用 AT 签发时间校验）
- [ ] **AT 主动吊销**（登出时把当前 AT 的 jti 加 Redis 黑名单，TTL=AT 剩余寿命）
- [ ] **设备指纹**：登录时记录 UA+IP+屏幕分辨率哈希，refresh 时弱校验，差异大则要求重新登录
- [ ] **预刷新**（Proactive Refresh）：AT 过期前 60s 在后台悄悄 refresh，避免关键点击时的延迟

---

## 九、文件改动工作量估算

| 类别 | 数量 | 难度 | 说明 |
|------|------|------|------|
| 后端 NEW | 4 个文件 | 中 | web_auth model / service / schema / route — 80% 抄 mobile |
| 后端 MOD | 4 个文件 | 低 | deps / auth / config / main |
| 后端 migration | 1 个 | 低 | 仿 0019 |
| 后端测试 NEW | 1 个 | 中 | 覆盖 6-7 个场景 |
| 前端重写 | 2 个文件 | 中 | auth.ts + api.ts |
| 前端 NEW | 1 个 | 低 | session-sync.ts |
| 前端 MOD | 3 个 | 低 | login / register / AppShell |
| 文档 | 1 个 | 低 | deploy 文档 |

总计：**约 1.5 - 2 人天**（不含 E2E 联调）。
