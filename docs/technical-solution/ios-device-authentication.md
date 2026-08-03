# Timia iOS 设备长期登录与扩展登录技术方案

## 1. 目标

Timia iOS 使用设备绑定会话实现长期登录：设备标识只用于识别安装实例，真正认证由设备私钥、可轮换 Refresh Token、服务端设备会话和短期 Access Token 共同完成。

- Access Token 仅保存在内存，有效期 15～30 分钟。
- Refresh Token 保存在 `ThisDeviceOnly` Keychain，每次刷新后轮换。
- 设备会话 90 天无操作过期、365 天绝对过期。
- 用户退出、移除设备、账号禁用、令牌重放或设备密钥不匹配时可立即撤销。
- iOS 直接访问 FastAPI，不经过 Next.js BFF。

## 2. 凭证与设备标识

| 数据 | 保密性 | 存储位置 | 用途 |
| --- | --- | --- | --- |
| `installation_id` | 非秘密 | Keychain | 标识当前 App 安装实例 |
| P-256 设备私钥 | 秘密 | Secure Enclave/Keychain | 签名注册与刷新请求 |
| Access Token | 秘密 | App 内存 | 调用业务 API |
| Refresh Token | 秘密 | `ThisDeviceOnly` Keychain | 恢复和延长设备会话 |

`installation_id` 不使用 IDFV、硬件序列号或其他系统追踪标识。首次启动生成随机 UUID；私钥不离开设备，服务端只保存公钥。

## 3. 会话流程

### 3.1 设备注册

1. App 生成 `installation_id` 和 P-256 密钥。
2. App 请求一次性设备 Challenge。
3. App 对服务端规定的规范化消息签名。
4. 服务端校验 Challenge、签名、时间和一次性消费状态，登记设备公钥。

### 3.2 登录

所有登录方式完成身份验证后统一调用设备会话签发服务：

```text
resolve_identity → resolve_or_create_user → validate_device → issue_device_session
```

登录响应包含 `access_token`、`expires_in`、`refresh_token`、`refresh_token_expires_at` 和 `session_id`。

### 3.3 刷新

刷新请求包含会话 ID、Refresh Token、设备 ID、持久化请求 ID、服务端 Nonce 和设备签名。服务端验证通过后原子轮换 Refresh Token。客户端使用单飞刷新任务合并并发请求；同一次刷新在网络重试时复用请求 ID，业务请求收到 401 后最多刷新并重试一次。

### 3.4 恢复与退出

- App 启动、回到前台或 Access Token 临近过期时静默刷新。
- 网络错误保留 Refresh Token，不误判为退出。
- Refresh Token 确认无效、会话撤销或账号禁用时才清除本地会话。
- 退出支持当前设备、指定设备和全部设备。

## 4. 数据模型

### `auth_identities`

统一保存 `password`、`phone`、`apple`、`google`、`wechat` 等身份。唯一键为 `(provider, provider_tenant, provider_subject)`，不按邮箱自动合并账号。

### `mobile_devices`

保存安装标识、设备公钥、平台、系统/App 版本、App Attest 状态及最近活动时间。

### `mobile_sessions`

保存用户、设备、登录方式、Refresh Token 哈希、Token Family、空闲/绝对过期时间及撤销状态。数据库不得保存原始 Refresh Token。

### `auth_challenges`

保存设备注册、刷新 Nonce、短信验证码和第三方登录 State/Nonce；所有 Challenge 必须有过期时间、尝试次数和一次性消费状态。

## 5. API

```text
POST   /auth/mobile/devices/challenge
POST   /auth/mobile/devices/register
POST   /auth/mobile/login/password
POST   /auth/mobile/token/exchange
POST   /auth/mobile/token/refresh/challenge
POST   /auth/mobile/token/refresh
POST   /auth/mobile/logout
POST   /auth/mobile/logout-all
GET    /auth/mobile/sessions
DELETE /auth/mobile/sessions/{session_id}
```

旧版 Access Token 可在有效期内通过 `token/exchange` 一次性迁移为设备会话，避免新版本上线后全部用户同时重新登录。

## 6. 扩展登录

### 手机验证码

- 6 位验证码、5 分钟过期、60 秒重发、最多 5 次尝试。
- 按手机号、设备、IP 和日总量限流。
- 验证码只保存 HMAC/哈希，日志不得记录明文。
- iOS 使用 `.textContentType(.oneTimeCode)`。

### Sign in with Apple

- 使用 `AuthenticationServices`、服务端 Nonce 和 Apple Identity Token。
- 后端验证签名、`iss`、`aud`、`exp`、`nonce` 和 Authorization Code。
- 使用 Apple `sub` 作为身份主键；姓名和邮箱首次授权时立即保存。

### Google

- iOS 使用 Google Sign-In SDK，向后端提交 ID Token。
- 后端验证签名、Issuer、Audience 和有效期，使用 `sub` 作为身份主键。
- 仅用于登录时不保存 Google Access/Refresh Token，也不申请额外 Scope。

### 微信

- iOS 使用微信 OpenSDK 与 Universal Links 获取授权 Code。
- AppSecret 只保存在后端，由后端交换微信 Token。
- 优先使用 `unionid`，不可用时使用 `(appid, openid)` 作为身份主键。
- 登录 State 必须与设备和一次性 Challenge 绑定。

## 7. 账号绑定规则

- 不因 Apple/Google 返回相同邮箱而自动合并账号。
- 已登录用户绑定新身份时要求近期重新认证。
- 第三方身份已绑定其他用户时拒绝重复绑定。
- 解绑后至少保留一种可登录方式。
- 手机号更换、账号合并和全部设备退出属于高风险操作，需要独立确认和审计。

## 8. 第一阶段范围

第一阶段交付：

1. 设备、身份、移动会话和 Challenge 数据模型与迁移。
2. 设备密钥注册。
3. 邮箱密码设备登录。
4. Refresh Token 轮换和并发单飞刷新。
5. iOS `CredentialManager actor`，Access Token 改为仅内存。
6. 设备会话列表、当前设备退出、指定设备撤销和全部设备退出接口。
7. 旧 Access Token 一次性交换设备会话。
8. 网络失败不误退出、确认会话无效才清理 Keychain。

手机验证码、Apple、Google、微信和 App Attest 在后续阶段接入，共享本方案的身份解析和设备会话签发基础。

## 9. 安全与验证要求

- 全链路 TLS，Token、验证码、设备签名和密码不得进入日志。
- Refresh Token 使用高熵随机值，数据库仅保存 SHA-256 哈希。
- Refresh Token 每次成功使用后轮换；刷新请求支持幂等请求 ID，避免网络丢包造成误撤销。
- Access Token 使用移动端 Audience，不与 Web Token 混用。
- 自动化测试覆盖并发刷新、旧 Token 重放、断网恢复、设备撤销、账号禁用、旧 Token 迁移和 Keychain 异常。

## 10. 第一阶段实现与上线顺序

本阶段已实现数据库迁移 `0019_mobile_device_sessions`、移动认证 API、OpenAPI 契约、iOS 设备签名与 `CredentialManager actor`。iOS 会自动迁移仍在有效期内的旧 Access Token；迁移失败但属于网络错误时不会删除旧凭证。

上线按以下顺序执行：

1. 备份数据库并执行 `alembic upgrade head`，确认当前版本为 `0019_mobile_device_sessions`。
2. 发布 core-service，并验证 `/auth/mobile/devices/challenge`、注册、密码登录和刷新接口。
3. 发布 iOS 新版本；观察登录成功率、刷新失败原因、会话撤销和重放告警。
4. 旧版 Access Token 的迁移窗口结束后，再按独立版本计划关闭 `token/exchange`，不能在本阶段立即移除。

回滚 App/API 时保留新增表与数据，不对生产库例行执行 downgrade；旧 Web 登录接口与旧 iOS Access Token 在迁移窗口内继续可用。
