---
name: timia-auth
description: Use when changing Timia login, JWT, refresh cookies, iOS device challenge, Keychain sessions, Personal Access Tokens, PAT scopes, get_current_user, or mixing web/mobile/agent credentials.
---

# Timia Auth

三条鉴权平面**不能混用**。`get_current_user` 先看 `tm_pat_`，再 decode JWT。

| 平面 | Audience / 凭证 | 刷新 | 谁用 |
|------|-----------------|------|------|
| Web | JWT `aud=timia-web` | HttpOnly cookie `timia_rt`，`POST /auth/refresh` | `codes/web`，`apiFetch` 自动刷新 |
| iOS | JWT `aud=timia-ios` + `sid`/`did` | 设备密钥挑战 + refresh token（Keychain） | `codes/mobile/ios` |
| Agent | 不透明 PAT `tm_pat_…` | 无 refresh；撤销即失效 | `timia-mcp` |

## 不要做

- 不要把 Web AT 塞进 iOS 或 MCP
- 不要把 PAT 当 JWT decode（PAT **不进** `decode_access_token`）
- 不要复用 web refresh cookie 或 iOS challenge 给 agent
- MiniMax key 只在 core-service 服务端；客户端永远拿不到

## PAT

- 创建：已登录 Web/iOS 调 `POST /auth/agent-tokens`（明文只返回一次）
- 默认 scopes：`profile:read` `schedule:read/write` `workspace:read/write` `admin:tokens`
- 未在 path→scope 表里的 REST：`403 pat_path_not_allowed`
- 生产 MCP：每个 HTTP 请求自带 Bearer PAT，禁止进程级共享 PAT

Web 改 `/auth/*` 必须走同源代理（cookie SameSite）。iOS 走 `APIClient` + Keychain，401 清会话。
