# user-service：鉴权前门与微信双端

user-service 拥有对外的 `/auth`。core-service 继续拥有领域数据和这一阶段尚未搬走的登录实现。两边读写同一个 Postgres，JWT 的 `aud` 仍是 `timia-web` 与 `timia-ios`。

## 路径

| 对外路径 | 到达 |
| --- | --- |
| `https://timia.online/auth/` | user-service `/auth/`。Cookie `Path=/auth` 不变，浏览器仍把 `timia_rt` 带到这里。 |
| `https://timia.online/core-service/auth/` | 同一组 user-service 路由。iOS 的 API 基址仍是 `/core-service`。 |
| `https://timia.online/user-service/` | user-service 根路径，例如 `/user-service/health`。 |
| 其余 `/core-service/` | core-service。 |

本地 `make web` 的 Next 重写把 `/auth/*` 转到 `http://localhost:8004`。Docker nginx（8080）同样把 `/auth/` 转到 user-service。

user-service 自己处理：

- `GET /auth/wechat/web/start`
- `GET /auth/wechat/web/callback`
- `GET /health`
- `GET /internal/health`（`X-Internal-Token: USER_INTERNAL_TOKEN`）

其余 `/auth/*`（注册、邮箱登录、刷新、退出、移动端登录、PAT）由 user-service 原样转发到 core-service，包括 `Cookie`、`Authorization` 和 `Set-Cookie`。core 里的这些路由还在，单测和直连 8000 继续打得到它们。公网流量不再绕过 user-service。

## 数据库

不拆库。用户、`auth_identities`、`web_sessions`、移动会话仍由 core-service 的 Alembic 建表。user-service 只写入自己的版本表 `alembic_version_user_service`（迁移 `0001_shared_db` 是空操作），并直接读写上述业务表。

网站微信登录在 user-service 里创建用户、微信身份和 Web 会话。刷新令牌的算法与 core 相同，所以随后的 `POST /auth/refresh` 仍由 core 完成，并签发 `aud=timia-web` 的访问令牌。账号合并仍只发生在 core 的移动端绑定接口。

## 微信：网站应用与移动应用

两套应用必须挂在同一个微信开放平台账号下，开放平台才会返回同一个 `unionid`。

| 端 | 开放平台应用 | 凭证 | 授权方式 |
| --- | --- | --- | --- |
| Web | 网站应用 | `WECHAT_WEB_APP_ID` / `WECHAT_WEB_APP_SECRET` | `qrconnect`，scope `snsapi_login` |
| iOS | 移动应用 | `WECHAT_MOBILE_APP_ID` / `WECHAT_MOBILE_APP_SECRET` | OpenSDK，scope `snsapi_userinfo`，跳出微信再回来 |

某一端没有单独的 AppID 时，回落到原来的 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`。已经填了单独 AppID 时，只用它自己的 Secret，不会借另一边的密钥。

身份键：

- 有 `unionid`：`provider=wechat`，`provider_tenant=wechat`，`provider_subject=unionid`。网站和 iOS 是同一个人。
- 没有 `unionid`：`provider_tenant` 是换票用的那个 AppID，`provider_subject` 是 `openid`。两边不会自动合成一个账号。

## Web 扫码

1. 登录页进入 `/auth/wechat/web/start`。
2. 服务写短时 cookie `timia_wx_state`（`Path=/auth`），并 302 到微信二维码。
3. 微信回到 `WECHAT_WEB_REDIRECT_URI`（生产 `https://timia.online/auth/wechat/web/callback`）。
4. state 一致后，用网站应用凭证换票，写入身份和 `web_sessions`，设置 `timia_rt`。
5. 浏览器回到 `/login?wechat=1`，页面用已有的 `POST /auth/refresh` 取访问令牌。

## iOS OpenSDK

微信按钮不再打开 `ASWebAuthenticationSession`。它调用 `WXApi.registerApp` 和 `SendAuthReq`。微信回调经 URL Scheme 或 Universal Link 回到 App，`onResp` 里的 code 再交给原来的 `POST /auth/mobile/login/wechat`。Google 和手机号不变。

仓库不包含微信 XCFramework，也不包含密钥。未把 SDK 链进工程时，`WXApi` 不存在，按钮显示「未配置」或「暂不可用」。

上架前在开放平台和苹果开发者里确认：

- 网站应用与移动应用在同一个开放平台账号。
- 网站应用回调登记为 `https://timia.online/auth/wechat/web/callback`。
- 移动应用 iOS Bundle ID 为 `online.timia.ios`。
- Universal Link 为 `https://timia.online/wechat/`。`apple-app-site-association` 已放在站点 `/.well-known/` 和站点根上，路径包含 `/wechat/*`，Team ID `QTV9DUCAY7`。
- App 的 Associated Domains 增加 `applinks:timia.online`。这一项还没有写进 `Timia.entitlements`，避免现有描述文件在 TestFlight 上签名失败。描述文件带上该能力后再打开。
- `TIMIA_WECHAT_URL_SCHEME` 填移动应用 AppID 本身（`wx` 开头）。
- `Info.plist` 已声明 `weixin`、`weixinULAPI`、`weixinURLParamsAPI`。
- 把 OpenSDK XCFramework 链进 Timia target。桥接代码按类名调用 `WXApi` / `SendAuthReq`，不需要改登录按钮。

## 环境变量

不要把密钥写进仓库。`USER_INTERNAL_TOKEN` 与 notification 的内部令牌同一做法：core 与 user-service 使用同一个值，user-service 用它保护 `/internal/*`。本阶段 core 还不调用 user-service。

| 变量 | 作用 |
| --- | --- |
| `USER_SERVICE_BASE` | core 预留。生产 `http://user-service:8004`。 |
| `CORE_SERVICE_BASE` | user-service 转发尚未搬走的 `/auth/*`。生产 `http://core-service:8000`。 |
| `USER_INTERNAL_TOKEN` | `X-Internal-Token`。生产换成随机值。 |
| `JWT_SECRET` / `JWT_AUDIENCE` / `MOBILE_JWT_AUDIENCE` | 与 core 相同。audience 仍是 `timia-web` 与 `timia-ios`。 |
| `WEB_COOKIE_*` | 与 core 相同，cookie 路径固定 `/auth`。 |
| `WECHAT_WEB_*` / `WECHAT_MOBILE_*` / `WECHAT_APP_*` | 见上。空的客户端 AppID 才回落旧变量。 |
| `WECHAT_WEB_REDIRECT_URI` | 网站应用回调。 |
| `OAUTH_DEV_MODE` | 仅开发。`dev:wechat:{unionid}` 跳过微信换票。生产保持 `false`。 |
