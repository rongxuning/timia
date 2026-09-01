# Web 中英双语（第一期）设计

**Date:** 2026-08-31  
**Scope:** `codes/web` 的 i18n 脚手架、应用壳层、登录与注册。  
**Out of scope:** 日程 / 工作空间 / 规划 / 健康 / 分析等内容页；`users.locale`；iOS；API 按语言返回句子；公开页 SEO / `hreflang`；`/en` 路径前缀。

## Goal

用户可以在 **中文** 和 **English** 之间切换界面语言。URL 不变。从未选过语言时一律中文。第一期先让壳层和未登录页随语言切换；其余页面允许暂时中英混排。

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| 语言 | `zh`（简体中文）、`en`（英文） |
| 默认 | 没有选择记录时用 `zh`，**不**跟 `Accept-Language` |
| URL | 无 locale 前缀；`/login`、`/my/schedule` 等路径中英文相同 |
| 存储（第一期） | cookie `locale`，值 `zh` 或 `en`；不写数据库 |
| 库 | `next-intl`，`localePrefix: 'never'`（官方 without-i18n-routing） |
| 格式化 | `zh` → `Intl` `zh-CN`；`en` → `en-US`（第一期壳层几乎不用到日期数字） |
| 品牌名 | 两套文案都写 `Timia` |
| 第一期页面 | 脚手架 + 壳层 + `/login` + `/register`（注册与登录是同一未登录流程） |

---

## 1. 语言如何决定

每次请求只按下面顺序取，命中即停：

1. cookie `locale` 为 `zh` 或 `en`
2. 否则 `zh`

非法 cookie（空、`zh-CN`、`en-US`）视为不存在，回退 `zh`。

**不**根据浏览器 `Accept-Language`、时区或 IP 猜语言。健康数据时区（如 `Asia/Shanghai`）与 UI 语言无关。

切换时：server action 把 cookie 写成 `zh` 或 `en`，然后 `router.refresh()`。

cookie 属性：

| 属性 | 值 |
|------|-----|
| Name | `locale` |
| Path | `/` |
| Max-Age | 31536000（一年） |
| SameSite | `Lax` |
| Secure | 生产 HTTPS 为 true；本地 http 为 false |
| HttpOnly | false（允许客户端与 server action 读写） |

`<html lang>`：`zh` → `zh-CN`，`en` → `en`。  
文档标题：中文 `Timia · 协作管理`，英文 `Timia · Collaboration`。

---

## 2. 第一期范围

### 2.1 做

**脚手架**

- 安装 `next-intl`，`next.config.js` 用其 plugin 包一层（现有 `rewrites` / `output: "standalone"` 保留）
- `messages/zh.json`、`messages/en.json`
- `src/i18n/routing.ts`、`src/i18n/request.ts`
- 根 layout：`NextIntlClientProvider` + 动态 `lang`
- 改语言的 server action
- 开发时缺 key 要能看出来；`zh.json` 与 `en.json` 的 key 集合必须一致

**壳层**（登录后所有页都看得到）

- `SideNav` 导航 label 与 hover tooltip
- `NavItem` 的 `aria-label`（含「N 条提醒」）
- `TopBar` / 侧栏头像菜单：退出登录、语言切换
- 头像 `title` 回退「用户」
- `Breadcrumbs` 的固定段名与 `aria-label`（工作空间名称等用户数据不译）
- `AppShell` 浮动按钮 `aria-label`：新建任务、打开便利贴

**未登录**

- `/login` 全部用户可见文案（含错误、过期提示、页脚）
- `/register` 全部用户可见文案（含校验与 API 错误码映射）
- 登录 / 注册页的语言切换（此时没有头像菜单）

### 2.2 明确不做

- 不改 `app/` 为 `app/[locale]/...`，不增加 `/en/...` 路由
- 不迁日程、工作空间、规划、健康、成员、文档等内容页（切到英文后，导航英文、页面正文仍可中文）
- 不改 core-service；错误码仍是 `invalid_credentials`、`email_taken` 等，由前端映射
- 不翻译用户输入（显示名、任务标题、评论）
- 不改 iOS
- 不把语言写入 `users` 表
- 不翻译代码文档、API catalog
- 第一期不对内容页的 `toLocaleString("zh-CN")` 做替换

### 2.3 过渡期混排

第一期完成后，英文用户看到：英文导航 + 英文登录，点进日程仍是中文。这是预期，不是缺陷。后续按模块迁（日程 → 工作空间 → 规划 → 健康 → 分析）。

---

## 3. 架构

Timia 是登录后的协作工具，不是靠 URL 分语言的营销站。cookie 决定语言，路径保持现有书签和 iOS 跳转。

```
请求
  → getRequestConfig 读 cookie `locale`（非法或缺失 → zh）
  → 加载 messages/{locale}.json
  → RootLayout：<html lang> + NextIntlClientProvider
  → 客户端 useTranslations('nav') / useTranslations('auth')
切换
  → changeLocaleAction(next)
  → Set-Cookie: locale
  → router.refresh()
```

**不**引入 `middleware.ts` 做 locale 探测（第一期没有 Accept-Language 逻辑，cookie 在 `getRequestConfig` 里读即可）。

组件用法（客户端为主，与现有 `"use client"` 一致）：

```tsx
const t = useTranslations("nav");
t("schedule"); // 我的日程 / My schedule
```

不要为 i18n 把页面改成 Server Component。

---

## 4. 文件

| 路径 | 职责 |
|------|------|
| `codes/web/messages/zh.json` | 简体中文 |
| `codes/web/messages/en.json` | 英文；key 与 zh 完全相同 |
| `codes/web/src/i18n/routing.ts` | `locales: ['zh','en']`，`defaultLocale: 'zh'`，`localePrefix: 'never'` |
| `codes/web/src/i18n/request.ts` | 读 cookie、校验、加载 json |
| `codes/web/src/components/layout/LocaleSwitcher.tsx` | 语言切换控件，登录页与头像菜单共用 |
| `codes/web/app/layout.tsx` | Provider、`lang`、metadata、`changeLocaleAction` |
| `codes/web/next.config.js` | `createNextIntlPlugin()` 包现有 config |
| `.cursor/rules/ui-interaction-design.mdc` | 「界面文案语言」改为走 i18n，默认中文 |

不新增 `app/[locale]`。现有路由文件路径全部不动。

---

## 5. 切换入口

语言名称自身不翻译：选项永远是 **中文** 和 **English**。当前项用 `aria-checked` 或对勾标出。

**已登录：** 头像菜单里，「退出登录」上方加语言两项。桌面侧栏菜单与窄屏顶栏菜单同一套，不要做成顶栏 segmented control。菜单宽度不够则改为 `w-40`。

**未登录：** 登录、注册页脚，`Copyright` 与「隐私」之间放 `中文 · English`。当前语言用 `text-text-primary`，另一项用现有页脚灰色，可点。

点当前语言：不写 cookie、不 refresh。  
点另一语言：写 cookie 并 refresh，停在本页（登录页切语言不得跳到日程）。

---

## 6. 文案目录（第一期）

两套 json 结构相同。下面中文是 `zh` 的值；`en` 用本节对照表。

### 6.1 `meta`

| key | zh | en |
|-----|----|----|
| `title` | Timia · 协作管理 | Timia · Collaboration |

### 6.2 `nav`

| key | zh | en |
|-----|----|----|
| `schedule` | 我的日程 | My schedule |
| `workspaces` | 工作空间 | Workspaces |
| `health` | 健康 | Health |
| `plans` | 规划 | Plans |
| `analytics` | 数据分析 | Analytics |
| `members` | 成员 | Members |
| `codeDocs` | 代码文档 | Code docs |
| `guide` | 使用指南 | Guide |
| `newTask` | 新建任务 | New task |
| `openStickyNote` | 打开便利贴 | Open sticky notes |
| `logOut` | 退出登录 | Log out |
| `userFallback` | 用户 | User |
| `badgeAria` | `{label}，{count} 条提醒` | `{label}, {count, plural, one {# alert} other {# alerts}}` |

`NavItem`：无 badge 时 `aria-label` 用 `label`；有 badge 时用 `badgeAria`。中文没有复数变化，仍用「N 条提醒」。

### 6.3 `crumb`

| key | zh | en |
|-----|----|----|
| `navAria` | 面包屑导航 | Breadcrumb |
| `refreshAria` | 刷新 {label} | Refresh {label} |
| `workspaces` | 工作空间 | Workspaces |
| `projects` | 项目 | Projects |
| `items` | 任务 | Tasks |
| `activity` | 活动 | Activity |
| `settings` | 设置 | Settings |
| `members` | 成员 | Members |
| `documents` | 文档 | Docs |
| `code` | 代码文档 | Code docs |
| `guide` | 使用指南 | Guide |
| `database` | 数据库结构 | Database |
| `api` | 后端 API | API |
| `my` | 我的 | My |
| `schedule` | 日程 | Schedule |
| `analytics` | 数据分析 | Analytics |
| `health` | 健康 | Health |
| `plans` | 规划 | Plans |
| `new` | 新建 | New |
| `edit` | 编辑 | Edit |
| `period` | 周期详情 | Period |
| `mySchedule` | 我的日程 | My schedule |

`Breadcrumbs.tsx` 里 `defaultLabelBySegment` 改为 `t('crumb.workspaces')` 这类查找。`/my/schedule`、`/my/analytics`、`/my/health` 的合并项继续用 `mySchedule` / `analytics` / `health`，不要把用户或工作空间的名字放进 json。

### 6.4 `locale`

| key | zh | en |
|-----|----|----|
| `zh` | 中文 | 中文 |
| `en` | English | English |
| `switchAria` | 界面语言 | Language |

`locale.zh` / `locale.en` 两套文件里的值必须相同（语言名不随 UI 语言改变）。

### 6.5 `auth`（登录 + 注册）

| key | zh | en |
|-----|----|----|
| `login` | 登录 | Log in |
| `loggingIn` | 登录中… | Signing in… |
| `register` | 注册 | Sign up |
| `createAccount` | 创建账号 | Create account |
| `registering` | 注册中… | Creating account… |
| `email` | 邮箱 | Email |
| `password` | 密码 | Password |
| `displayName` | 显示名称 | Display name |
| `confirmPassword` | 确认密码 | Confirm password |
| `tagline` | 合抱之木，生于毫末；九层之台，起于累土；千里之行，始于足下 | A huge tree grows from a tiny shoot; a nine-story tower rises from a heap of earth; a journey of a thousand miles begins with a single step |
| `noAccount` | 还没有账号？ | No account yet? |
| `hasAccount` | 已有账号？ | Already have an account? |
| `goLogin` | 去登录 | Log in |
| `privacy` | 隐私 | Privacy |
| `copyright` | Copyright © 2026 Timia | Copyright © 2026 Timia |
| `emailPlaceholder` | Email | Email |
| `passwordPlaceholder` | Password | Password |
| `registerEmailPlaceholder` | name@company.com | name@company.com |
| `displayNamePlaceholder` | 例如：王伟 | e.g. Alex |
| `newPasswordPlaceholder` | 至少 8 位字符 | At least 8 characters |
| `confirmPasswordPlaceholder` | 再次输入密码 | Enter password again |
| `needEmailAndPassword` | 请输入邮箱和密码 | Enter email and password |
| `needEmail` | 请输入邮箱 | Enter your email |
| `needPassword` | 请输入密码 | Enter your password |
| `needDisplayName` | 请输入显示名 | Enter a display name |
| `invalidEmail` | 请输入有效的邮箱地址 | Enter a valid email address |
| `passwordTooShort` | 密码至少 8 位 | Password must be at least 8 characters |
| `passwordMismatch` | 两次输入的密码不一致 | Passwords do not match |
| `sessionExpired` | 登录已过期，请重新登录。 | Your session expired. Please log in again. |
| `loginFailed` | 登录失败，请稍后重试 | Sign-in failed. Try again later. |
| `invalidCredentials` | 邮箱或密码错误，请重新输入 | Incorrect email or password |
| `invalidLoginFormat` | 登录信息格式有误，请检查后重试 | Check the form and try again |
| `serverUnavailable` | 服务器暂时不可用，请稍后重试 | Server is temporarily unavailable |
| `networkError` | 无法连接服务器，请检查网络后重试 | Cannot reach the server. Check your network |
| `registerFailed` | 注册失败 | Could not create account |
| `emailTaken` | 该邮箱已被注册 | That email is already registered |
| `displayNameTaken` | 该显示名称已被使用 | That display name is already taken |
| `displayNameRequired` | 请输入显示名称 | Enter a display name |
| `displayNameTooLong` | 显示名称过长 | Display name is too long |

登录页现在 label 写死 `Email` / `Password`：第一期改为走 `auth.email` / `auth.password`，中文界面显示「邮箱」「密码」。

API 仍返回 `invalid_credentials`、`email_taken` 等。前端 `switch` 映射到上表 key，**禁止**把后端 `detail` 原文（除非已是用户文案）直接上屏。未知码：登录用 `loginFailed`，注册用 `registerFailed`。不要再出现「响应里带汉字就原样展示」——语言切换后会串台。

页脚 `Copyright © 2026 Timia` 两套语言相同。

---

## 7. 规范

`.cursor/rules/ui-interaction-design.mdc` 的「界面文案语言」改为：

- 用户可见文案不得在组件里新写死某一种语言，必须 `useTranslations`（或后加的模块 json）
- 默认语言简体中文；产品名 `Timia` 不译
- API 枚举在界面上用 `enums.*`（第一期还没有该命名空间；内容模块迁过来时再建）
- `html lang` 与日期格式跟当前 locale，不再写死 `zh-CN`

第一期未迁的内容页仍允许暂时硬编码中文，直到该模块进入后续期。

---

## 8. 验收

1. 无 cookie 打开 `/login`：中文；`html[lang]=zh-CN`；标题为「Timia · 协作管理」。
2. 页脚点 English：本页变成英文，URL 仍是 `/login`，cookie `locale=en`。刷新仍是英文。
3. 再点 中文：回到中文，URL 仍无前缀。
4. 英文登录成功后：侧栏 tooltip、面包屑固定段、退出登录、浮动按钮 `aria-label` 为英文；日程等页面正文可以仍是中文。
5. 窄屏顶栏头像菜单也能切换语言。
6. `/register` 的标签、校验、`email_taken` 等随语言变。
7. 点当前语言：无整页 refresh 闪烁。
8. `zh.json` 与 `en.json` 的 key 集合一致（可用测试或小脚本比）。

---

## 9. 后续（不在第一期实现）

记在这里只为避免第一期把门做窄，实现时不要做这些。

1. 按模块迁文案：日程 → 工作空间 → 规划 → 健康 → 分析 → 成员。每模块一次 PR。
2. `useFormatter()` 替换写死的 `zh-CN` 日期数字；`planLabels.ts` 一类对照表迁到 `enums.*` / `apiErrors.*`。
3. `users.locale` 与 iOS String Catalog 对齐同一偏好。
4. 若将来做公开营销站，再单独考虑 `/en` 或独立域名，与 App 路由拆开。
