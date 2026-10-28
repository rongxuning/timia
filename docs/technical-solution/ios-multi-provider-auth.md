# iOS 多身份登录与账号合并

登录页只保留三条入口：本手机号、微信、Google。邮箱密码接口仍留给 Web，iOS 登录页不再展示。

身份继续落在已有的 `auth_identities`。唯一键是 `(provider, provider_tenant, provider_subject)`。`users.email` 与 `users.password_hash` 改为可空，手机号用户和纯 OAuth 用户可以没有邮箱、没有密码。

## 登录

未登录时：

- 身份已存在：进入该身份所属的仍有效账号。若原账号已被合并，沿 `merged_into_user_id` 找到留下的账号。
- 身份不存在：新建用户和身份，并签发与密码登录相同的移动设备会话。

已登录时调用绑定接口：

- `POST /auth/mobile/identities/phone`
- `POST /auth/mobile/identities/google`
- `POST /auth/mobile/identities/wechat`

身份无人占用时挂到当前用户。身份属于另一个用户时合并。

## 合并规则

留下 `created_at` 更早的用户。时间相同则留下 id 字典序更小的一个。被合并账号 `status=merged`，`merged_into_user_id` 指向留下的账号，邮箱和密码清空，移动会话与 Web 会话撤销。

同一事务内把引用 `users.id` 的外键改到留下的账号。唯一约束冲突时留下原账号上的那一行，并在删除冲突行之前处理这些特例：

- 同一工作空间或项目两边都是成员：留下的成员若任一方是 owner，则升为 owner；收藏和最近活跃时间取并集。
- 健康档案、资产档案这类一人一行的数据：留下原账号已有的行。
- 资产编号序列取两边较大的 `next_value`。
- `items.participant_user_ids` 里的用户 id 会改写并去重。

重复调用是幂等的：被合并账号会解析到留下的账号，不会再搬一次。

### 边界

- 不因 Google / 微信返回相同邮箱而自动合并。OAuth 邮箱只写在 `auth_identities.normalized_email`，不写入 `users.email`，因此不会占用密码登录邮箱。
- 两边都有邮箱时，留下较早账号的邮箱和密码。被合并邮箱不能再走密码登录；它带过来的手机号或第三方身份仍然可以登录留下的账号。
- 只有被合并账号有邮箱时，邮箱和密码会拷到留下的账号，密码登录继续可用。
- 被合并账号其他设备上的会话会撤销，需要重新登录。当前这次绑定会为留下的账号重新签发移动会话。
- 合并发生在同一 Postgres 库。文件服务和通知服务如果引用了 `users.id`，同一次外键扫描会一并改写。

## 环境变量

不要把密钥写进仓库。本地不设置短信网关时，验证码写入服务日志，并在响应字段 `dev_code` 里返回，方便开发。生产必须设置 `SMS_PROVIDER`，否则接口会把验证码交回客户端。

| 变量 | 作用 |
| --- | --- |
| `SMS_PROVIDER` | 空：开发桩，记录并返回验证码。`http`：POST 到 `SMS_HTTP_URL`。 |
| `SMS_HTTP_URL` | 短信网关地址。`SMS_PROVIDER=http` 但地址为空时，发码返回 `sms_not_configured`，不返回验证码。 |
| `SMS_HTTP_TOKEN` | 可选，作为 `Authorization: Bearer`。 |
| `SMS_SIGN_NAME` | 随 JSON 发给网关的签名。 |
| `SMS_TEMPLATE_CODE` | 随 JSON 发给网关的模板号。 |
| `GOOGLE_CLIENT_IDS` | 逗号分隔的 Google client id，用来校验 id token 的 audience，交换 code 时用第一个。 |
| `GOOGLE_CLIENT_SECRET` | 授权码交换用。只放服务端。 |
| `GOOGLE_REDIRECT_URI` | 可选。与 iOS `TIMIA_GOOGLE_REDIRECT_URI` 一致。未设置时仍允许生产回调 `https://timia.online/core-service/auth/mobile/oauth/google/callback`。 |
| `WECHAT_APP_ID` | 微信开放平台应用 id。 |
| `WECHAT_APP_SECRET` | 只放服务端，用来换 access token。优先用 `unionid`，没有则用 `(appid, openid)`。 |
| `OAUTH_DEV_MODE` | 仅开发。`true` 时接受 `dev:google:{sub}`、`dev:google:{sub}:{email}`、`dev:wechat:{unionid}`。生产必须为 `false`。 |

iOS 对应键放在 xcconfig，不放密钥：

- `TIMIA_GOOGLE_CLIENT_ID`
- `TIMIA_GOOGLE_REDIRECT_URI`
- `TIMIA_WECHAT_APP_ID`
- `TIMIA_WECHAT_REDIRECT_URI`

未填写时按钮不崩溃。Debug 显示「未配置」，Release 显示「暂不可用」。服务端未配置时返回 `provider_not_configured`，客户端按同样规则显示。

手机号接口：

- `POST /auth/mobile/login/phone/code`
- `POST /auth/mobile/login/phone/verify`

验证码 6 位、5 分钟、60 秒内不可重发、单码最多 5 次，手机号和设备各有每日上限。验证码只存哈希。

微信和 Google 在 iOS 上走 `ASWebAuthenticationSession`，回调到 `timia://oauth/...`。真正换票在服务端完成。
