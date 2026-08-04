# Web 端长时间保持登录状态 — 技术方案

> 目标：让合法用户在不频繁重新登录的前提下，保持登录状态尽可能长，同时兼顾安全性。
> 适用：传统 Web 页面、Vue/React SPA、移动端 H5。

---

## 一、问题本质

为什么用户总是被踢下线？

| 触发场景 | 原因 |
|---------|------|
| 几小时没操作 | Access Token 过期 |
| 关浏览器再开 | Cookie 失效 / Session 失效 |
| 切换设备 | 服务端只识别首次登录设备 |
| 跨域/隐私模式 | localStorage / Cookie 被隔离 |
| 主动登出 | 正常行为 |

**核心矛盾**：安全要求短 TTL，体验要求长 TTL。解法是**分层 Token + 自动续期**。

---

## 二、主流方案对比

| 方案 | 保持时长 | 安全性 | 复杂度 | 推荐度 |
|------|---------|-------|-------|-------|
| 短 Cookie + 滑动过期 | 数天～数月 | ★★★ | 低 | 传统 Web 站点 |
| JWT 单 Token（长 TTL） | 数月 | ★ | 低 | 不推荐 |
| **Access + Refresh 双 Token** | **数月～数年** | **★★★★** | **中** | **推荐** |
| OAuth 2.0 / OIDC | 由 IdP 决定 | ★★★★★ | 高 | 第三方登录 |
| 设备绑定 + 静默续签 | 长期 | ★★★★ | 高 | 高安全业务 |

---

## 三、推荐方案：双 Token + 滑动刷新

### 3.1 架构

```
┌──────────┐                ┌──────────┐                ┌──────────┐
│  Browser │ ── login ────► │   API    │ ── verify ───► │  IdP/DB  │
│          │ ◄─ AT+RT ──── │          │ ◄──── ok ────── │          │
│          │                │          │                │          │
│  业务请求  │ ── AT ──────► │          │                │          │
│          │ ◄── 401 ────── │          │                │          │
│          │ ── RT ──────► │          │ ── issue new ─► │          │
│          │ ◄─ 新 AT+RT ── │          │ ◄───── AT+RT ── │          │
└──────────┘                └──────────┘                └──────────┘
```

### 3.2 Token 设计

| 字段 | Access Token (AT) | Refresh Token (RT) |
|------|------------------|--------------------|
| 用途 | 访问业务 API | 换取新 AT |
| TTL | 15 min ~ 2 h | 7 d ~ 30 d（可滑动到数月）|
| 存储 | 内存（不落地）| HttpOnly Secure Cookie |
| 可撤销 | 难（需黑名单）| 易（服务端可吊销）|
| 暴露给 JS | 是 | **否** |

### 3.3 滑动过期策略

- 用户每次使用 RT 换 AT 时，**同时签发新的 RT**，旧的 RT 立即失效（**Token Rotation**）
- 这样从用户最近一次活跃算起，登录态能保持 ≈ RT TTL
- 如果 RT 长期不用才真正过期

### 3.4 关键：Token 复用检测（防窃取）

```
正常路径：RT₁ → RT₂ → RT₃ ...
异常路径：RT₁ 已被使用，又出现 RT₁  → 整个 family 全吊销，强制重新登录
```

原理：每个 RT 只能使用一次。如果出现第二次使用同 RT，说明 RT 已被盗，
攻击者和服务端在"赛跑"，此时果断吊销该用户所有会话，让用户重新登录。

---

## 四、实现细节

### 4.1 Cookie 设置（防 XSS / CSRF）

```nginx
Set-Cookie: refresh_token=<jwt>;
  HttpOnly;                    # JS 读不到，防 XSS
  Secure;                      # 仅 HTTPS
  SameSite=Lax;                # 或 Strict，防 CSRF
  Path=/api/auth;
  Max-Age=2592000;             # 30 天
```

Access Token **不**放 Cookie，放在**内存**（JS 变量/Pinia/Redux）。

### 4.2 前端：Axios 自动续期（Vue/React 通用）

```typescript
// axios 自动刷新拦截器
let refreshing: Promise<string> | null = null

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const { config, response } = err
    if (response?.status !== 401 || config._retried) {
      return Promise.reject(err)
    }

    // 多个 401 并发时，只刷一次
    refreshing ??= refreshAccessToken().finally(() => { refreshing = null })
    const newAT = await refreshing

    config._retried = true
    config.headers.Authorization = `Bearer ${newAT}`
    return api(config)
  }
)
```

### 4.3 前端：定时静默刷新（可选）

```typescript
// 每次启动时根据 AT 的 exp 倒计时，到期前 60s 自动刷新
function scheduleRefresh(at: string) {
  const exp = jwtDecode<{ exp: number }>(at).exp * 1000
  const delay = exp - Date.now() - 60_000
  setTimeout(() => refreshAccessToken().then(scheduleRefresh), Math.max(delay, 0))
}
```

### 4.4 后端：登录接口

```python
# 伪代码（任意语言同理）
@router.post("/auth/login")
def login(credentials):
    user = verify(credentials)
    at, at_exp = issue_access_token(user.id, ttl=1800)              # 30 min
    rt, rt_exp = issue_refresh_token(user.id, family=family_id)     # 30 d

    resp.set_cookie(
        "refresh_token", rt,
        httponly=True, secure=True, samesite="lax",
        max_age=30*86400,
    )
    return {"access_token": at, "expires_in": 1800}
```

### 4.5 后端：刷新接口（核心）

```python
@router.post("/auth/refresh")
def refresh(req):
    rt = req.cookies.get("refresh_token")
    claims = verify_jwt(rt)

    # 1. 是否已被使用？
    if is_used(claims.jti):
        revoke_family(claims.family)   # 全家桶吊销
        raise 401

    # 2. 是否在白名单（如果用 DB 存 RT）
    if not in_whitelist(claims.jti):
        raise 401

    # 3. 标记旧的已用，签发新的
    mark_used(claims.jti)
    new_at, _ = issue_access_token(claims.sub, ttl=1800)
    new_rt, _ = issue_refresh_token(claims.sub, family=claims.family)

    resp.set_cookie("refresh_token", new_rt, ...)
    return {"access_token": new_at, "expires_in": 1800}
```

### 4.6 后端：访问接口

```python
@router.get("/api/me")
def me(authorization: str = Header(None)):
    if not authorization.startswith("Bearer "):
        raise 401
    claims = verify_jwt(authorization[7:])
    if claims.exp < now():
        raise 401
    return get_user(claims.sub)
```

---

## 五、安全加固清单

| 风险 | 应对 |
|------|------|
| **XSS 偷 AT** | AT 不进 localStorage，存内存；CSP 严格 |
| **XSS 偷 RT** | RT 走 HttpOnly Cookie，JS 读不到 |
| **CSRF 用 RT** | RT 路径限制在 `/api/auth/*`；加 SameSite；服务端校验 Origin |
| **RT 被拷走** | Token Rotation + 复用检测 → 吊销整个家族 |
| **同设备多账号** | RT family 隔离；登出时精确吊销 |
| **异地登录** | 登录时记录 device fingerprint，刷新时校验 |
| **AT 永久泄露** | AT 短 TTL；可选 AT 黑名单（Redis 存 jti） |
| **设备丢失** | 提供"踢出所有设备"接口（按 user_id 吊销） |

---

## 六、Remember Me（备选/增强）

如果不想用双 Token，传统的「记住我」也可以：

1. 登录成功后下发一个 **long-lived token**（如 90 天），存 Cookie
2. 该 token 不直接访问业务 API，只用于"续命"短 session
3. 每次请求触发 session 滑动续期

```python
# 伪代码
if not session.get("user_id") and remember_token:
    user = verify_remember_token(remember_token)  # DB 校验
    if user and remember_token.exp > now():
        login_session(user)                        # 建立新 session
        rotate_remember_token(user)                # 换新 token
```

**注意**：此方案下，remember_token 一旦泄露等于账号被盗，必须用一次一换 + 复用检测。

---

## 七、Session 模式（传统服务端渲染）

如果是 PHP/JSP/Rails 之类的服务端渲染：

1. Session ID 存 Cookie（HttpOnly + SameSite=Lax + Secure）
2. 服务端 Session TTL 设为 30 天
3. **每次请求把 TTL 续到 30 天**（滑动过期）
4. Redis 存 session，`EXPIRE` 在每次访问时重置

```python
# 伪代码
def on_request(req):
    sid = req.cookies.get("sid")
    sess = redis.get(f"sess:{sid}")
    if not sess:
        return login_redirect()
    redis.expire(f"sess:{sid}", 30*86400)   # 滑动
    req.user = sess["user"]
```

Cookie 本身可以 `Max-Age=一年`，但实际寿命由 Redis 决定。Cookie 永不过期也无妨。

---

## 八、特殊场景

### 8.1 多标签页 / 多设备
- 每个标签页独立持 AT，但共享 RT Cookie
- 一个标签页刷新 AT，其他标签页下一次请求 401 → 也会走 refresh 流程
- 建议：刷新结果**写回 cookie 或 localStorage**，让其他标签页监听 storage 事件同步

### 8.2 移动端 H5
- 同 Web，但 AT 可放 `sessionStorage`（关 App 即清，相对安全）
- RT 仍走 HttpOnly Cookie
- iOS Safari ITP 限制第三方 Cookie → 自有域问题不大；嵌入第三方 WebView 需注意

### 8.3 单点登录（SSO）
- 接入 OIDC / OAuth 2.0
- AT 短 + RT 长，由 IdP 统一管理
- 业务侧只校验 AT，业务登出通知 IdP 撤销 RT

### 8.4 强制重新登录场景
- 改密码 / 改手机号 → 全家族吊销
- 高危操作（转账/删账号）→ 单独校验最近一次密码 / 短期 RT
- 异地/异常设备 → 短信验证后放行

---

## 九、推荐落地配置

```yaml
# 业务常用默认
access_token_ttl:        1800       # 30 min
refresh_token_ttl:       2592000    # 30 天
refresh_token_rotation:  true       # 每次刷新换新
reuse_detection:         true       # 复用即全家族吊销
cookie:
  refresh_token:
    httpOnly: true
    secure: true
    sameSite: Lax
    path: /api/auth
    maxAge: 2592000

# 进阶
at_blacklist: redis      # 可选，登出/改密时把 jti 加进黑名单
multi_device: allow       # 或 max_devices: 5
geo_anomaly: alert        # 异地刷新时告警
```

---

## 十、TL;DR（一句话版）

> **Access Token 短（30 分钟）+ Refresh Token 长（30 天）+ HttpOnly Cookie + 滑动续期 + 一次一换 + 复用检测**，是当下 Web 端兼顾安全与"长登录"的事实标准方案。

---

## 附录：参考实现

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [Auth0: Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- [OWASP JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
