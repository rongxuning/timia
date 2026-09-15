---
name: timia-web
description: Use when implementing or changing codes/web Next.js pages, components, i18n messages, apiFetch hooks, schedule/workspace/health/plans UI, or after core-service OpenAPI changes.
---

# Timia Web

**视觉/交互：** 打开 `codes/web` 文件时已自动应用 `.cursor/rules/ui-interaction-design.mdc`。

## 布局

- 路由：`codes/web/app/`（App Router）。日程 `/my/schedule`，空间 `/workspace/[workspaceId]/...`
- UI/数据：`codes/web/src/components`、`hooks`、`lib`、`types`
- 页面数据：`src/lib/api/*-views.ts` + `apiFetch`（`src/lib/api.ts`）
- **不要**新引入 TanStack Query：依赖在 package.json 里，代码里没用；沿用现有 hook/`useState`

## i18n

用户可见文案走 `next-intl`（`useTranslations` + `messages/zh.json` + `messages/en.json`）。默认 locale `zh`。产品名 Timia 不译。改文案后跑 `npm run test:i18n`。

## API

- 类型：`src/types/api/generated.ts`（不要手改）+ 视图类型 `src/types/api/views/`
- core-service 接口变了：根目录 **`make codegen`**
- Item PATCH 必须带 `version`；`401` 由 `apiFetch` 刷新 AT，不要自写 refresh
- `/auth/*` 走同源代理；其它请求用 `NEXT_PUBLIC_API_BASE_URL`

## UI 要点

主题 token（`primary`、`surface`、`text-body`…），不要单页 palettes。Material Symbols Outlined。加载 / 空 / 错误三条路径都要有 i18n。壳层 `pt-14` + `md:ml-48`，别让内容顶到固定头下面。

日历周从周日开始（`calendarNav.ts`）。空间/项目选择复用 `PinnedTagSelect`。规划只在 Web。健康页只读 views。改 `messages/*.json` 后 `npm run test:i18n`（中英 key 必须对齐）。
